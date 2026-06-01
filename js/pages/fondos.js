// =====================================================================
// Negocio Kuky · Destino de fondos (js/pages/fondos.js)
// =====================================================================

import { requireAuth } from "../auth.js";
import { renderLayout } from "../layout.js";
import {
  listarMovimientosFondos, crearMovimientoFondo, eliminarMovimientoFondo,
  balanceIntegrado, DESTINOS_FONDOS
} from "../db.js";
import {
  $, $$, escapeHTML, toast, formatoMoneda, formatoFecha, fechaRelativa, RANGOS
} from "../utils.js";

// =====================================================================
// Errores
// =====================================================================
window.addEventListener('error', (e) => {
  console.error('[fondos] error:', e.error || e.message);
  toast('Error: ' + (e.error?.message || e.message), 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[fondos] unhandled:', e.reason);
  toast('Error: ' + (e.reason?.message || String(e.reason)), 'error');
});

// =====================================================================
// Init
// =====================================================================
const usuario = await requireAuth();
document.getElementById('pantalla-carga').style.display = 'none';
document.getElementById('app').style.display = 'grid';
renderLayout({ usuario, paginaActiva: "fondos" });

// Definir un rango extra "ultimosTresMeses" si no existe
if (!RANGOS.ultimosTresMeses) {
  RANGOS.ultimosTresMeses = () => {
    const hasta = new Date();
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 3);
    desde.setHours(0, 0, 0, 0);
    hasta.setHours(23, 59, 59, 999);
    return { desde, hasta, etiqueta: "Últimos 3 meses" };
  };
}

// =====================================================================
// Estado
// =====================================================================
let movimientos = [];
let balance = null;
let destinoSeleccionado = null;

// Refs
const $tbody = $('#tbody-movs');
const $filtroRango = $('#filtro-rango');
const $filtroDestino = $('#filtro-destino');
const $modalNuevo = $('#modal-nuevo');

// =====================================================================
// LLENAR SELECTORES
// =====================================================================
function llenarSelectorDestinos() {
  $filtroDestino.innerHTML = '<option value="">Todos los destinos</option>' +
    DESTINOS_FONDOS.map(d => `
      <option value="${escapeHTML(d.id)}">${d.icono} ${escapeHTML(d.nombre)}</option>
    `).join('');

  // Selector visual del modal de nuevo
  $('#destinos-selector').innerHTML = DESTINOS_FONDOS.map(d => `
    <button type="button" class="destino-btn" data-id="${escapeHTML(d.id)}">
      <span class="icono-sel">${d.icono}</span>
      <span class="nombre-sel">${escapeHTML(d.nombre)}</span>
    </button>
  `).join('');

  // Wire-up click
  $$('.destino-btn').forEach($btn => {
    $btn.addEventListener('click', () => {
      $$('.destino-btn').forEach(b => b.classList.remove('activo'));
      $btn.classList.add('activo');
      destinoSeleccionado = $btn.dataset.id;
    });
  });
}

llenarSelectorDestinos();

// =====================================================================
// CARGA
// =====================================================================
async function recargar() {
  $tbody.innerHTML = `<tr><td colspan="5"><div class="vacio"><p>Cargando…</p></div></td></tr>`;
  $('#destinos-grid').innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--gris-suave); font-size: 12px;">Cargando…</div>';

  try {
    const rangoActivo = $filtroRango.value;
    let desde = null, hasta = null;
    if (rangoActivo !== "todo" && RANGOS[rangoActivo]) {
      const r = RANGOS[rangoActivo]();
      desde = r.desde;
      hasta = r.hasta;
    }
    const destinoFiltro = $filtroDestino.value || null;

    [movimientos, balance] = await Promise.all([
      listarMovimientosFondos({ desde, hasta, destino: destinoFiltro }),
      balanceIntegrado({ desde, hasta }),  // siempre sin filtro de destino, balance es general
    ]);

    renderBalance();
    renderDestinos();
    renderTabla();
  } catch (e) {
    console.error(e);
    $tbody.innerHTML = `<tr><td colspan="5">
      <div class="alerta alerta-error" style="margin: 20px;">
        ${escapeHTML(e.message || 'Error cargando datos')}
      </div>
    </td></tr>`;
  }
}

// =====================================================================
// RENDERS
// =====================================================================
function renderBalance() {
  if (!balance) return;

  $('#bal-cobrado').textContent = formatoMoneda(balance.totalCobrado);
  $('#bal-cobrado-pie').textContent = `${balance.cantPagos} ${balance.cantPagos === 1 ? 'pago' : 'pagos'}`;

  $('#bal-gastado').textContent = formatoMoneda(balance.totalGastado);
  $('#bal-gastado-pie').textContent = `${balance.cantMovimientos} ${balance.cantMovimientos === 1 ? 'movimiento' : 'movimientos'}`;

  $('#bal-neto-monto').textContent = formatoMoneda(balance.balance);

  const $valNeto = $('#bal-neto');
  $valNeto.querySelector('.signo').textContent = balance.balance > 0 ? '+' : balance.balance < 0 ? '−' : '=';

  // Colorear según signo
  const $monto = $('#bal-neto-monto');
  $monto.style.color = '';
  if (balance.balance > 0) $monto.style.color = 'var(--estado-ok)';
  else if (balance.balance < 0) $monto.style.color = 'var(--estado-error)';

  $('#resumen-fondos').textContent = balance.cantMovimientos === 0
    ? 'Empezá registrando tu primer movimiento de fondos.'
    : `${balance.cantMovimientos} ${balance.cantMovimientos === 1 ? 'movimiento' : 'movimientos'} registrados`;
}

function renderDestinos() {
  const $grid = $('#destinos-grid');
  if (!balance || balance.porDestino.length === 0) {
    $grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--gris-suave); font-size: 12px; font-style: italic;">Sin movimientos en este período.</div>';
    return;
  }

  $grid.innerHTML = balance.porDestino.map(d => `
    <div class="destino-card">
      <div class="icono-d">${d.icono}</div>
      <div class="nombre-d">${escapeHTML(d.nombre)}</div>
      <div class="total-d">${formatoMoneda(d.total, { compacto: true })}</div>
      <div class="cant-d">${d.cantidad} ${d.cantidad === 1 ? 'movimiento' : 'movimientos'}</div>
    </div>
  `).join('');
}

function renderTabla() {
  if (movimientos.length === 0) {
    $tbody.innerHTML = `<tr><td colspan="5">
      <div class="vacio">
        <h3>Sin movimientos</h3>
        <p>${balance && balance.totalCobrado > 0
          ? 'Cobraste plata pero todavía no registraste a dónde fue. Tocá "+ Nuevo movimiento" para empezar.'
          : 'Cuando registres a dónde va tu plata, aparecerá acá.'}</p>
      </div>
    </td></tr>`;
    return;
  }

  $tbody.innerHTML = movimientos.map(filaMovimiento).join('');

  // Wire-up botones de eliminar
  $$('.btn-eliminar-mov[data-id]').forEach($btn => {
    $btn.addEventListener('click', () => eliminarMov($btn.dataset.id));
  });
}

function filaMovimiento(m) {
  const destino = DESTINOS_FONDOS.find(d => d.id === m.destino) || { icono: '📝', nombre: m.destino || 'Otros' };
  return `
    <tr>
      <td>
        <div style="font-size: 12px; color: var(--tinta);">${escapeHTML(formatoFecha(m.fecha, { corta: true }))}</div>
        <div style="font-size: 10px; color: var(--gris-suave);">${escapeHTML(fechaRelativa(m.fecha))}</div>
      </td>
      <td>
        <span class="destino-badge">
          <span>${destino.icono}</span>
          <span>${escapeHTML(destino.nombre)}</span>
        </span>
      </td>
      <td class="alinear-derecha" style="font-weight: 500; font-family: var(--font-serif); font-size: 16px;">
        ${formatoMoneda(m.monto)}
      </td>
      <td style="font-size: 12px; color: var(--gris-suave); max-width: 300px;">
        ${escapeHTML(m.descripcion || '—')}
      </td>
      <td class="alinear-derecha">
        <button class="btn-eliminar-mov" data-id="${escapeHTML(m.id)}">Eliminar</button>
      </td>
    </tr>
  `;
}

// =====================================================================
// CREAR / ELIMINAR
// =====================================================================
function abrirModalNuevo() {
  // Reset
  destinoSeleccionado = null;
  $$('.destino-btn').forEach(b => b.classList.remove('activo'));
  $('#input-monto').value = '';
  $('#input-fecha').value = new Date().toISOString().substring(0, 10);
  $('#input-descripcion').value = '';
  $('#error-nuevo').classList.add('oculto');

  $modalNuevo.classList.add('abierto');
  setTimeout(() => $('#input-monto').focus(), 100);
}

function cerrarModalNuevo() {
  $modalNuevo.classList.remove('abierto');
}

$('#btn-nuevo').addEventListener('click', abrirModalNuevo);
$('#cerrar-nuevo').addEventListener('click', cerrarModalNuevo);
$('#btn-cancelar-nuevo').addEventListener('click', cerrarModalNuevo);
$modalNuevo.addEventListener('click', (e) => {
  if (e.target === $modalNuevo) cerrarModalNuevo();
});

$('#btn-guardar-nuevo').addEventListener('click', async () => {
  $('#error-nuevo').classList.add('oculto');

  const monto = Number($('#input-monto').value);
  const fechaStr = $('#input-fecha').value;
  const descripcion = $('#input-descripcion').value;

  if (!destinoSeleccionado) {
    $('#error-nuevo').textContent = 'Tenés que elegir un destino.';
    $('#error-nuevo').classList.remove('oculto');
    return;
  }
  if (!monto || monto <= 0) {
    $('#error-nuevo').textContent = 'Ingresá un monto válido mayor a 0.';
    $('#error-nuevo').classList.remove('oculto');
    return;
  }

  const $btn = $('#btn-guardar-nuevo');
  $btn.disabled = true;
  $btn.innerHTML = '<span class="cargando-spinner"></span> Guardando…';

  try {
    const fecha = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
    await crearMovimientoFondo({
      monto,
      destino: destinoSeleccionado,
      descripcion,
      fecha,
    });
    toast('Movimiento registrado.', 'ok');
    cerrarModalNuevo();
    await recargar();
  } catch (err) {
    console.error(err);
    $('#error-nuevo').textContent = err.message || 'No se pudo guardar.';
    $('#error-nuevo').classList.remove('oculto');
  } finally {
    $btn.disabled = false;
    $btn.textContent = 'Guardar movimiento';
  }
});

async function eliminarMov(movId) {
  const mov = movimientos.find(m => m.id === movId);
  if (!mov) return;

  if (!confirm(`¿Eliminar este movimiento de ${formatoMoneda(mov.monto)}?\n\nEsta acción no se puede deshacer.`)) return;

  try {
    await eliminarMovimientoFondo(movId);
    toast('Movimiento eliminado.', 'ok');
    await recargar();
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar: ' + err.message, 'error');
  }
}

// =====================================================================
// LISTENERS
// =====================================================================
$filtroRango.addEventListener('change', recargar);
$filtroDestino.addEventListener('change', recargar);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $modalNuevo.classList.contains('abierto')) cerrarModalNuevo();
});

// =====================================================================
// CARGA INICIAL
// =====================================================================
await recargar();
