// =====================================================================
// Emanuel Cosméticos · Nueva venta (js/pages/ventas.js)
// =====================================================================

import { requireAuth } from "../auth.js";
import { renderLayout } from "../layout.js";
import {
  listarClientes, listarProductos, crearVenta
} from "../db.js";
import {
  $, $$, escapeHTML, toast, debounce,
  formatoMoneda, formatoMonedaPartes
} from "../utils.js";

// =====================================================================
// Captura de errores
// =====================================================================
window.addEventListener('error', (e) => {
  console.error('[ventas] error:', e.error || e.message);
  toast('Error: ' + (e.error?.message || e.message), 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[ventas] unhandled:', e.reason);
  toast('Error: ' + (e.reason?.message || String(e.reason)), 'error');
});

// =====================================================================
// Inicialización
// =====================================================================
const usuario = await requireAuth();
document.getElementById('pantalla-carga').style.display = 'none';
document.getElementById('app').style.display = 'grid';
renderLayout({ usuario, paginaActiva: "ventas" });

// =====================================================================
// Estado
// =====================================================================
let clientes        = [];
let productos       = [];
let clienteSel      = null;        // cliente seleccionado
let carrito         = [];          // [{codigo, nombre, categoria, cantidad, precioUnit, imagen}]
let productosFiltrados = [];

// =====================================================================
// Refs
// =====================================================================
const $buscarCli       = $('#buscar-cliente');
const $resultadosCli   = $('#resultados-clientes');
const $bloqueBuscarCli = $('#bloque-buscar-cliente');
const $bloqueClienteSel = $('#bloque-cliente-seleccionado');
const $btnCambiarCli   = $('#btn-cambiar-cliente');

const $buscarProd      = $('#buscar-producto');
const $filtroCatProd   = $('#filtro-categoria-prod');
const $gridProd        = $('#productos-mini-grid');
const $hintProd        = $('#hint-productos');

const $listaCarrito    = $('#lista-carrito');
const $hintPedido      = $('#hint-pedido');
const $bloqueTotales   = $('#bloque-totales');
const $bloqueDetalles  = $('#bloque-detalles');
const $bloqueAcciones  = $('#bloque-acciones');
const $totalVenta      = $('#total-venta');
const $saldoVenta      = $('#saldo-venta');
const $filaSaldo       = $('#fila-saldo');
const $inputPagado     = $('#f-pagado');
const $btnGuardar      = $('#btn-guardar');
const $btnCancelar     = $('#btn-cancelar');
const $formError       = $('#form-error');

// =====================================================================
// CARGA INICIAL
// =====================================================================
async function cargarDatos() {
  try {
    [clientes, productos] = await Promise.all([
      listarClientes({ soloActivos: false }),
      listarProductos({ soloActivos: true }),
    ]);

    // Filtrar productos válidos para vender (precio > 0)
    productos = productos.filter(p => (p.precio || 0) > 0);

    // Categorías
    const cats = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort();
    $filtroCatProd.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');

    productosFiltrados = productos;
    renderProductos();
    renderCarrito();
  } catch (e) {
    console.error(e);
    document.getElementById('aviso-inicial').innerHTML = `
      <div class="alerta alerta-error mb-md">
        Error cargando datos: ${escapeHTML(e.message)}
      </div>`;
  }
}

// =====================================================================
// BUSCADOR DE CLIENTES
// =====================================================================
$buscarCli.addEventListener('input', debounce(() => {
  const texto = $buscarCli.value.toLowerCase().trim();
  if (!texto) {
    $resultadosCli.classList.remove('visible');
    return;
  }
  const matches = clientes
    .filter(c => c.estado !== "inactivo")
    .filter(c => {
      const blob = [c.nombre, c.apellido, c.telefono, c.direccion]
        .filter(Boolean).join(' ').toLowerCase();
      return blob.includes(texto);
    })
    .slice(0, 20);

  if (matches.length === 0) {
    $resultadosCli.innerHTML = `<div class="resultado-item" style="cursor: default; color: var(--gris-suave);">Sin resultados</div>`;
  } else {
    $resultadosCli.innerHTML = matches.map(c => {
      const nombre = `${c.nombre || ''} ${c.apellido || ''}`.trim();
      const inic = nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
      const debe = (c.saldoPendiente || 0) > 0;
      return `
        <div class="resultado-item" data-id="${c.id}">
          <div class="avatar-sm">${escapeHTML(inic)}</div>
          <div class="info">
            <div class="nombre">${escapeHTML(nombre)}</div>
            <div class="meta">${escapeHTML(c.telefono || c.zona || c.direccion || 'Sin contacto')}${debe ? ` · Debe ${formatoMoneda(c.saldoPendiente, { compacto: true })}` : ''}</div>
          </div>
        </div>`;
    }).join('');
    $$('.resultado-item[data-id]').forEach($it => {
      $it.addEventListener('click', () => seleccionarCliente($it.dataset.id));
    });
  }
  $resultadosCli.classList.add('visible');
}, 200));

document.addEventListener('click', (e) => {
  if (!e.target.closest('.cliente-resultado')) {
    $resultadosCli.classList.remove('visible');
  }
});

function seleccionarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  clienteSel = c;
  const nombre = `${c.nombre || ''} ${c.apellido || ''}`.trim();
  const inic = nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const debe = (c.saldoPendiente || 0) > 0;

  $('#cli-avatar').textContent = inic;
  $('#cli-nombre').textContent = nombre;
  const $saldo = $('#cli-saldo');
  if (debe) {
    $saldo.textContent = `Saldo pendiente: ${formatoMoneda(c.saldoPendiente)}`;
    $saldo.classList.add('debe');
  } else {
    $saldo.textContent = 'Al día';
    $saldo.classList.remove('debe');
  }

  $bloqueBuscarCli.classList.add('oculto');
  $bloqueClienteSel.classList.remove('oculto');
  $resultadosCli.classList.remove('visible');

  actualizarVista();
}

$btnCambiarCli.addEventListener('click', () => {
  if (carrito.length > 0 && !confirm('Vas a cambiar de cliente. ¿Mantener los productos del carrito?')) {
    return;
  }
  clienteSel = null;
  $buscarCli.value = '';
  $bloqueBuscarCli.classList.remove('oculto');
  $bloqueClienteSel.classList.add('oculto');
  actualizarVista();
});

// =====================================================================
// SELECCIÓN DE PRODUCTOS
// =====================================================================
function filtrarProductos() {
  const texto = $buscarProd.value.toLowerCase().trim();
  const cat = $filtroCatProd.value;

  productosFiltrados = productos.filter(p => {
    if (cat && p.categoria !== cat) return false;
    if (texto) {
      const blob = `${p.id} ${p.nombre} ${p.categoria}`.toLowerCase();
      if (!blob.includes(texto)) return false;
    }
    return true;
  });
  renderProductos();
}

$buscarProd.addEventListener('input', debounce(filtrarProductos, 150));
$filtroCatProd.addEventListener('change', filtrarProductos);

function renderProductos() {
  if (productosFiltrados.length === 0) {
    $gridProd.innerHTML = '<div class="vacio"><p>Sin resultados.</p></div>';
    $hintProd.textContent = '0 productos';
    return;
  }
  $hintProd.textContent = `${productosFiltrados.length} ${productosFiltrados.length === 1 ? 'producto' : 'productos'}`;

  // Mostrar máximo 60 por performance
  const mostrar = productosFiltrados.slice(0, 60);

  $gridProd.innerHTML = mostrar.map(p => {
    const foto = p.imagen
      ? `<img src="${p.imagen}" alt="" loading="lazy" />`
      : `<div class="ph">${escapeHTML(p.id)}</div>`;
    return `
      <div class="prod-mini" data-cod="${escapeHTML(p.id)}">
        <div class="foto-mini">${foto}</div>
        <div class="nom" title="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)}</div>
        <div class="precio-mini">${formatoMoneda(p.precio, { compacto: true })}</div>
      </div>`;
  }).join('') + (productosFiltrados.length > 60 ? `
    <div style="grid-column: 1 / -1; text-align: center; padding: 12px; font-size: 11px; color: var(--gris-suave);">
      Mostrando 60 de ${productosFiltrados.length}. Buscá para filtrar más.
    </div>` : '');

  $$('.prod-mini[data-cod]').forEach($p => {
    $p.addEventListener('click', () => agregarAlCarrito($p.dataset.cod));
  });
}

// =====================================================================
// CARRITO
// =====================================================================
function agregarAlCarrito(codigo) {
  const prod = productos.find(p => p.id === codigo);
  if (!prod) return;

  // Si ya está en el carrito, aumentar cantidad
  const existente = carrito.find(it => it.codigo === codigo);
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      codigo:     prod.id,
      nombre:     prod.nombre,
      categoria:  prod.categoria,
      cantidad:   1,
      precioUnit: prod.precio,
      imagen:     prod.imagen || null,
    });
  }
  renderCarrito();
  actualizarVista();
}

function quitarDelCarrito(codigo) {
  carrito = carrito.filter(it => it.codigo !== codigo);
  renderCarrito();
  actualizarVista();
}

function actualizarCantidad(codigo, nuevaCant) {
  const it = carrito.find(x => x.codigo === codigo);
  if (!it) return;
  const n = Math.max(1, Math.round(Number(nuevaCant) || 1));
  it.cantidad = n;
  renderCarrito();
  actualizarTotales();
}

function actualizarPrecio(codigo, nuevoPrecio) {
  const it = carrito.find(x => x.codigo === codigo);
  if (!it) return;
  it.precioUnit = Math.max(0, Number(nuevoPrecio) || 0);
  renderCarrito();
  actualizarTotales();
}

function renderCarrito() {
  if (carrito.length === 0) {
    $listaCarrito.innerHTML = `
      <div class="vacio" style="padding: 20px;">
        <p>Tocá un producto de la izquierda para agregarlo.</p>
      </div>`;
    $hintPedido.textContent = "Vacío";
    return;
  }

  const cantTotal = carrito.reduce((s, it) => s + it.cantidad, 0);
  $hintPedido.textContent = `${carrito.length} ${carrito.length === 1 ? 'producto' : 'productos'} · ${cantTotal} ${cantTotal === 1 ? 'unidad' : 'unidades'}`;

  $listaCarrito.innerHTML = carrito.map(it => {
    const subtotal = it.cantidad * it.precioUnit;
    const foto = it.imagen
      ? `<img src="${it.imagen}" alt="" loading="lazy" />`
      : `<div class="ph">📷</div>`;
    return `
      <div class="item-carrito" data-cod="${escapeHTML(it.codigo)}">
        <div class="item-foto">${foto}</div>
        <div class="item-info">
          <div class="nom" title="${escapeHTML(it.nombre)}">${escapeHTML(it.nombre)}</div>
          <div class="cod">${escapeHTML(it.codigo)}</div>
        </div>
        <div class="item-subtotal">${formatoMoneda(subtotal)}</div>

        <div class="item-precio-cell">
          <div class="item-controls">
            <button class="btn-cant" data-accion="restar">−</button>
            <input class="input-cant" type="number" min="1" value="${it.cantidad}" />
            <button class="btn-cant" data-accion="sumar">+</button>
          </div>
          <input class="item-precio-input" type="number" min="0" step="1" value="${it.precioUnit}" title="Precio unitario" />
          <button class="item-borrar" title="Quitar">✕</button>
        </div>
      </div>`;
  }).join('');

  // Wire-up de cada item
  $$('.item-carrito').forEach($it => {
    const cod = $it.dataset.cod;
    $it.querySelector('[data-accion="restar"]').addEventListener('click', () => {
      const item = carrito.find(x => x.codigo === cod);
      if (item && item.cantidad > 1) {
        actualizarCantidad(cod, item.cantidad - 1);
      }
    });
    $it.querySelector('[data-accion="sumar"]').addEventListener('click', () => {
      const item = carrito.find(x => x.codigo === cod);
      if (item) actualizarCantidad(cod, item.cantidad + 1);
    });
    $it.querySelector('.input-cant').addEventListener('change', (e) => {
      actualizarCantidad(cod, e.target.value);
    });
    $it.querySelector('.item-precio-input').addEventListener('change', (e) => {
      actualizarPrecio(cod, e.target.value);
    });
    $it.querySelector('.item-borrar').addEventListener('click', () => {
      if (confirm('¿Quitar este producto del pedido?')) quitarDelCarrito(cod);
    });
  });
}

// =====================================================================
// TOTALES
// =====================================================================
function calcularTotal() {
  return carrito.reduce((s, it) => s + (it.cantidad * it.precioUnit), 0);
}

function actualizarTotales() {
  const total = calcularTotal();
  $totalVenta.textContent = formatoMoneda(total);
  const pagado = Number($inputPagado.value) || 0;
  const saldo = Math.max(0, total - pagado);

  $saldoVenta.textContent = formatoMoneda(saldo);
  $filaSaldo.classList.remove('debe', 'pagado');
  if (saldo === 0 && total > 0)        $filaSaldo.classList.add('pagado');
  else if (saldo > 0 && pagado > 0)    $filaSaldo.classList.add('debe');
  else if (saldo > 0)                  $filaSaldo.classList.add('debe');
}

$inputPagado.addEventListener('input', actualizarTotales);

// =====================================================================
// VISTA: mostrar/ocultar bloques según el estado
// =====================================================================
function actualizarVista() {
  const hayProductos = carrito.length > 0;
  $bloqueTotales.style.display  = hayProductos ? 'block' : 'none';
  $bloqueDetalles.style.display = hayProductos ? 'block' : 'none';
  $bloqueAcciones.style.display = hayProductos ? 'flex' : 'none';
  if (hayProductos) actualizarTotales();
}

// =====================================================================
// CANCELAR
// =====================================================================
$btnCancelar.addEventListener('click', () => {
  if (!confirm('¿Cancelar esta venta y volver a empezar?')) return;
  carrito = [];
  clienteSel = null;
  $inputPagado.value = '0';
  $('#f-observaciones').value = '';
  $('#f-fecha-entrega').value = '';
  $('#f-estado-pedido').value = 'pendiente';
  $('#f-forma-pago').value = 'efectivo';
  $buscarCli.value = '';
  $bloqueBuscarCli.classList.remove('oculto');
  $bloqueClienteSel.classList.add('oculto');
  renderCarrito();
  actualizarVista();
});

// =====================================================================
// GUARDAR
// =====================================================================
$btnGuardar.addEventListener('click', async () => {
  $formError.classList.add('oculto');

  // Validaciones
  if (!clienteSel) {
    return mostrarError('Seleccioná un cliente primero.');
  }
  if (carrito.length === 0) {
    return mostrarError('Agregá al menos un producto.');
  }
  const total = calcularTotal();
  if (total <= 0) {
    return mostrarError('El total no puede ser cero. Revisá los precios.');
  }
  const pagado = Number($inputPagado.value) || 0;
  if (pagado < 0) {
    return mostrarError('El monto pagado no puede ser negativo.');
  }
  if (pagado > total) {
    return mostrarError('El pagado no puede ser mayor al total.');
  }

  // Construir items con subtotales
  const items = carrito.map(it => ({
    codigo:     it.codigo,
    nombre:     it.nombre,
    categoria:  it.categoria,
    cantidad:   it.cantidad,
    precioUnit: it.precioUnit,
    subtotal:   it.cantidad * it.precioUnit,
  }));

  const fechaEntregaStr = $('#f-fecha-entrega').value;
  const fechaEntrega = fechaEntregaStr ? new Date(fechaEntregaStr + 'T12:00:00') : null;

  const venta = {
    clienteId:      clienteSel.id,
    clienteNombre:  `${clienteSel.nombre || ''} ${clienteSel.apellido || ''}`.trim(),
    items,
    total,
    pagado,
    formaPago:      $('#f-forma-pago').value,
    estadoPedido:   $('#f-estado-pedido').value,
    fechaEntrega,
    observaciones:  $('#f-observaciones').value.trim(),
    ubicacion:      clienteSel.ubicacion || null,
  };

  $btnGuardar.disabled = true;
  $btnGuardar.innerHTML = '<span class="cargando-spinner"></span> Guardando…';

  try {
    const ventaId = await crearVenta(venta);
    toast(`Venta registrada (${ventaId.substring(0, 6)}…)`, 'ok');

    // Redirigir al detalle o a pedidos
    setTimeout(() => {
      location.href = 'pedidos.html?id=' + ventaId;
    }, 500);

  } catch (err) {
    console.error('[ventas] error guardando:', err);
    mostrarError(err.message || 'No se pudo guardar la venta.');
    $btnGuardar.disabled = false;
    $btnGuardar.textContent = 'Guardar venta';
  }
});

function mostrarError(msg) {
  $formError.textContent = msg;
  $formError.classList.remove('oculto');
  $formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// =====================================================================
// SOPORTE: ?cliente=ID para preseleccionar
// =====================================================================
const params = new URLSearchParams(location.search);
const clienteQS = params.get('cliente');

// Carga inicial
await cargarDatos();
if (clienteQS) {
  setTimeout(() => seleccionarCliente(clienteQS), 100);
}
