// =====================================================================
// Emanuel Cosméticos · Reportes (js/pages/reportes.js)
// =====================================================================

import { requireAuth } from "../auth.js";
import { renderLayout } from "../layout.js";
import {
  rankingProductos, rankingClientes, rankingDeudores,
  distribucionPorCategoria, productosStockBajo, productosSinMovimiento,
  gananciaEstimada, obtenerKPIsDashboard,
} from "../db.js";
import {
  $, $$, escapeHTML, toast, formatoMoneda, formatoMonedaPartes, RANGOS
} from "../utils.js";

// =====================================================================
// Errores
// =====================================================================
window.addEventListener('error', (e) => {
  console.error('[reportes] error:', e.error || e.message);
  toast('Error: ' + (e.error?.message || e.message), 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[reportes] unhandled:', e.reason);
  toast('Error: ' + (e.reason?.message || String(e.reason)), 'error');
});

// =====================================================================
// Init
// =====================================================================
const usuario = await requireAuth();
document.getElementById('pantalla-carga').style.display = 'none';
document.getElementById('app').style.display = 'grid';
renderLayout({ usuario, paginaActiva: "reportes" });

// =====================================================================
// Estado
// =====================================================================
let rangoActual = "esteMes";
let chartCategoria = null;

// Definir un rango extra para "últimos 3 meses"
RANGOS.ultimosTresMeses = () => {
  const hasta = new Date();
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 3);
  desde.setHours(0, 0, 0, 0);
  hasta.setHours(23, 59, 59, 999);
  return { desde, hasta, etiqueta: "Últimos 3 meses" };
};

// =====================================================================
// LISTENERS
// =====================================================================
$$('.btn-periodo').forEach($btn => {
  $btn.addEventListener('click', () => {
    $$('.btn-periodo').forEach(b => b.classList.remove('activo'));
    $btn.classList.add('activo');
    rangoActual = $btn.dataset.rango;
    cargar();
  });
});

// =====================================================================
// CARGA PRINCIPAL
// =====================================================================
async function cargar() {
  let desde = null, hasta = null;
  if (rangoActual !== "todo" && RANGOS[rangoActual]) {
    const r = RANGOS[rangoActual]();
    desde = r.desde;
    hasta = r.hasta;
    $('#resumen-reportes').textContent = `${r.etiqueta} · ${desde.toLocaleDateString('es-AR')} – ${hasta.toLocaleDateString('es-AR')}`;
  } else {
    $('#resumen-reportes').textContent = "Todo el histórico";
  }

  // Disparar todos los reportes en paralelo
  const [topProds, topClientes, topDeudores, distCat, stockBajo, sinMov, ganancia, kpis] = await Promise.all([
    rankingProductos({ desde, hasta, topN: 10 }).catch(() => []),
    rankingClientes({ desde, hasta, topN: 10 }).catch(() => []),
    rankingDeudores(10).catch(() => []),
    distribucionPorCategoria({ desde, hasta }).catch(() => []),
    productosStockBajo(5).catch(() => []),
    productosSinMovimiento(30).catch(() => []),
    gananciaEstimada({ desde, hasta }).catch(() => null),
    obtenerKPIsDashboard({ desde, hasta }).catch(() => null),
  ]);

  renderResumenTop(kpis, ganancia);
  renderGanancia(ganancia);
  renderTopProductos(topProds);
  renderTopClientes(topClientes);
  renderTopDeudores(topDeudores);
  renderStockBajo(stockBajo);
  renderSinMovimiento(sinMov);
  renderCategoria(distCat);
}

// =====================================================================
// RENDERS
// =====================================================================
function renderResumenTop(kpis, ganancia) {
  const $cont = $('#resumen-top');
  if (!kpis) { $cont.innerHTML = ''; return; }

  const moneda = (n) => {
    const { simbolo, valor } = formatoMonedaPartes(n);
    return `<span class="moneda">${simbolo}</span>${valor}`;
  };

  $cont.innerHTML = `
    <div class="kpi">
      <div class="kpi-etiqueta">Vendido</div>
      <div class="kpi-valor">${moneda(kpis.totalVendidoMes || 0)}</div>
      <div class="kpi-pie">${kpis.cantVentasMes || 0} ${(kpis.cantVentasMes || 0) === 1 ? 'venta' : 'ventas'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-acento ok"></div>
      <div class="kpi-etiqueta">Cobrado</div>
      <div class="kpi-valor">${moneda(kpis.totalCobradoMes || 0)}</div>
      <div class="kpi-pie">${kpis.totalVendidoMes > 0 ? Math.round((kpis.totalCobradoMes / kpis.totalVendidoMes) * 100) : 0}% de lo vendido</div>
    </div>
    <div class="kpi">
      <div class="kpi-acento ${(kpis.totalPendiente || 0) > 0 ? 'warn' : ''}"></div>
      <div class="kpi-etiqueta">Por cobrar</div>
      <div class="kpi-valor">${moneda(kpis.totalPendiente || 0)}</div>
      <div class="kpi-pie">${kpis.clientesConDeuda || 0} ${(kpis.clientesConDeuda || 0) === 1 ? 'cliente' : 'clientes'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-acento ${ganancia && ganancia.gananciaBruta > 0 ? 'ok' : ''}"></div>
      <div class="kpi-etiqueta">Ganancia estimada</div>
      <div class="kpi-valor">${ganancia ? moneda(ganancia.gananciaBruta) : '—'}</div>
      <div class="kpi-pie">${ganancia ? Math.round(ganancia.margenPct) + '% margen' : 'sin datos'}</div>
    </div>
  `;
}

function renderGanancia(g) {
  const $c = $('#ganancia-contenido');
  if (!g) { $c.innerHTML = '<div class="vacio-mini">Sin datos.</div>'; return; }

  const moneda = (n) => {
    const { simbolo, valor } = formatoMonedaPartes(n);
    return `<span class="moneda">${simbolo}</span>${valor}`;
  };

  const claseGanancia = g.gananciaBruta > 0 ? 'ok' : g.gananciaBruta < 0 ? 'error' : '';

  let aviso = '';
  if (g.itemsSinCosto > g.itemsConCosto) {
    aviso = `
      <div class="alerta alerta-warn" style="margin-top: 10px; font-size: 12px;">
        <strong>Datos parciales:</strong> ${g.itemsSinCosto} items vendidos no tienen costo cargado. La ganancia real puede ser distinta. Cargá costos desde Productos.
      </div>
    `;
  }

  $c.innerHTML = `
    <div class="ganancia-grid">
      <div class="ganancia-kpi">
        <div class="lbl-g">Ingresos</div>
        <div class="val-g">${moneda(g.ingresoTotal)}</div>
      </div>
      <div class="ganancia-kpi">
        <div class="lbl-g">Costo total</div>
        <div class="val-g">${moneda(g.costoTotal)}</div>
      </div>
    </div>
    <div class="ganancia-kpi" style="grid-column: 1 / -1;">
      <div class="lbl-g">Ganancia bruta</div>
      <div class="val-g ${claseGanancia}">${moneda(g.gananciaBruta)}</div>
      <div class="lbl-g" style="margin-top: 6px;">Margen: ${Math.round(g.margenPct)}%</div>
    </div>
    ${aviso}
  `;
}

function renderTopProductos(productos) {
  const $lista = $('#top-productos');
  if (productos.length === 0) {
    $lista.innerHTML = '<li class="vacio-mini">No hubo ventas en este período.</li>';
    return;
  }
  $lista.innerHTML = productos.map(p => `
    <li class="ranking-item">
      <div class="info-r">
        <div class="nombre-r" title="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)}</div>
        <div class="meta-r">Código ${escapeHTML(p.codigo)} · ${p.cantidad} ${p.cantidad === 1 ? 'unidad' : 'unidades'}</div>
      </div>
      <div class="valor-r ingreso">${formatoMoneda(p.ingresos, { compacto: true })}</div>
    </li>
  `).join('');
}

function renderTopClientes(clientes) {
  const $lista = $('#top-clientes');
  if (clientes.length === 0) {
    $lista.innerHTML = '<li class="vacio-mini">No hubo ventas en este período.</li>';
    return;
  }
  $lista.innerHTML = clientes.map(c => `
    <li class="ranking-item">
      <div class="info-r">
        <a href="clientes.html?id=${encodeURIComponent(c.clienteId)}" style="text-decoration: none;">
          <div class="nombre-r" title="${escapeHTML(c.clienteNombre)}">${escapeHTML(c.clienteNombre)}</div>
        </a>
        <div class="meta-r">${c.cantidadCompras} ${c.cantidadCompras === 1 ? 'compra' : 'compras'}${c.totalSaldo > 0 ? ` · debe ${formatoMoneda(c.totalSaldo, { compacto: true })}` : ''}</div>
      </div>
      <div class="valor-r ingreso">${formatoMoneda(c.totalComprado, { compacto: true })}</div>
    </li>
  `).join('');
}

function renderTopDeudores(deudores) {
  const $lista = $('#top-deudores');
  if (deudores.length === 0) {
    $lista.innerHTML = '<li class="vacio-mini">🎉 ¡Nadie te debe nada!</li>';
    return;
  }
  $lista.innerHTML = deudores.map(d => {
    const nombre = `${d.nombre || ''} ${d.apellido || ''}`.trim() || 'Sin nombre';
    return `
      <li class="ranking-item">
        <div class="info-r">
          <a href="clientes.html?id=${encodeURIComponent(d.id)}" style="text-decoration: none;">
            <div class="nombre-r" title="${escapeHTML(nombre)}">${escapeHTML(nombre)}</div>
          </a>
          <div class="meta-r">${d.telefono ? escapeHTML(d.telefono) : 'Sin teléfono'} · ${d.cantidadCompras || 0} ${(d.cantidadCompras || 0) === 1 ? 'compra' : 'compras'}</div>
        </div>
        <div class="valor-r deuda">${formatoMoneda(d.saldoPendiente, { compacto: true })}</div>
      </li>
    `;
  }).join('');
}

function renderStockBajo(productos) {
  const $cont = $('#stock-bajo');
  if (productos.length === 0) {
    $cont.innerHTML = '<div class="vacio-mini">✓ Todos los productos con stock OK.</div>';
    return;
  }
  $cont.innerHTML = productos.map(p => `
    <div class="producto-item">
      <span class="cod-p">${escapeHTML(p.id)}</span>
      <a href="productos.html?buscar=${encodeURIComponent(p.id)}" style="text-decoration: none; flex: 1; min-width: 0;">
        <span class="nombre-p" title="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)}</span>
      </a>
      <span class="badge-p ${p.stock === 0 ? 'cero' : ''}">${p.stock === 0 ? 'SIN STOCK' : `${p.stock} u`}</span>
    </div>
  `).join('');
}

function renderSinMovimiento(productos) {
  const $cont = $('#sin-movimiento');
  if (productos.length === 0) {
    $cont.innerHTML = '<div class="vacio-mini">Todos los productos tuvieron movimiento.</div>';
    return;
  }
  // Mostrar primeros 50, hay potencialmente muchos
  const mostrar = productos.slice(0, 50);
  $cont.innerHTML = mostrar.map(p => `
    <div class="producto-item">
      <span class="cod-p">${escapeHTML(p.id)}</span>
      <a href="productos.html?buscar=${encodeURIComponent(p.id)}" style="text-decoration: none; flex: 1; min-width: 0;">
        <span class="nombre-p" title="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)}</span>
      </a>
      <span style="font-size: 11px; color: var(--gris-suave); white-space: nowrap;">${formatoMoneda(p.precio || 0, { compacto: true })}</span>
    </div>
  `).join('') + (productos.length > 50 ? `
    <div class="vacio-mini" style="padding: 10px;">… y ${productos.length - 50} más</div>
  ` : '');
}

function renderCategoria(dist) {
  if (chartCategoria) {
    chartCategoria.destroy();
    chartCategoria = null;
  }
  const ctx = document.getElementById('chart-categoria');
  if (!ctx) return;

  if (dist.length === 0) {
    ctx.parentElement.innerHTML = '<div class="vacio-mini" style="padding: 80px 20px;">Sin datos en este período.</div>';
    return;
  }

  const colores = [
    '#a8786b', '#8a5448', '#d4a89a', '#7a5d52', '#c4a594',
    '#9a7569', '#6b4c42', '#b89180', '#d6b8a8', '#866558'
  ];

  chartCategoria = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: dist.map(d => d.categoria),
      datasets: [{
        data: dist.map(d => d.total),
        backgroundColor: dist.map((_, i) => colores[i % colores.length]),
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#3a2a25',
            font: { family: 'Outfit', size: 11 },
            padding: 10,
            usePointStyle: true,
            pointStyle: 'circle',
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatoMoneda(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// =====================================================================
// CARGAR
// =====================================================================
await cargar();
