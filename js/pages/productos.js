// =====================================================================
// Emanuel Cosméticos · Productos (js/pages/productos.js)
// ---------------------------------------------------------------------
// Funcionalidad:
//   - Listado del catálogo con vista tarjetas o tabla (toggle)
//   - Buscador por código/nombre/categoría
//   - Filtros: categoría, estado (activo/revisar/inactivo), stock
//   - Edición individual (precio, costo, stock, nombre, categoría)
//   - Edición masiva de precios (porcentaje / sumar / fijo)
//   - Crear producto nuevo
//   - Eliminar producto (desde edición, con confirmación)
//   - Indicador de ganancia estimada al editar
// =====================================================================

import { requireAuth } from "../auth.js";
import { renderLayout } from "../layout.js";
import {
  listarProductos, obtenerProducto, crearProducto, actualizarProducto,
  eliminarProducto, actualizarPreciosEnLote
} from "../db.js";
import {
  $, $$, escapeHTML, toast, debounce,
  formatoMoneda, formatoMonedaPartes
} from "../utils.js";

// =====================================================================
// Captura de errores
// =====================================================================
window.addEventListener('error', (e) => {
  console.error('[productos] error:', e.error || e.message);
  mostrarErrorFatal(e.error?.message || e.message || 'Error', e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[productos] unhandled:', e.reason);
  mostrarErrorFatal(e.reason?.message || String(e.reason), e.reason?.stack);
});

function mostrarErrorFatal(mensaje, stack) {
  const $carga = document.getElementById('pantalla-carga');
  if ($carga) $carga.style.display = 'none';
  const $app = document.getElementById('app');
  if ($app) $app.style.display = 'grid';

  let $aviso = document.getElementById('aviso-inicial');
  if (!$aviso) {
    $aviso = document.createElement('div');
    $aviso.id = 'aviso-inicial';
    $aviso.style.cssText = 'padding: 40px; max-width: 720px; margin: 40px auto;';
    document.body.appendChild($aviso);
  }
  $aviso.innerHTML = `
    <div class="alerta alerta-error">
      <strong>Error al cargar productos</strong><br>
      ${escapeHTML(mensaje)}
      ${stack ? `<details style="margin-top:10px;"><summary style="cursor:pointer; font-size:12px;">Detalles</summary><pre style="font-size:11px; margin-top:8px; background:#fdf8f3; padding:10px; border-radius:6px; overflow:auto; max-height:200px;">${escapeHTML(stack)}</pre></details>` : ''}
    </div>`;
}

// =====================================================================
// Inicialización
// =====================================================================
const usuario = await requireAuth();
document.getElementById('pantalla-carga').style.display = 'none';
document.getElementById('app').style.display = 'grid';
renderLayout({ usuario, paginaActiva: "productos" });

// =====================================================================
// Estado
// =====================================================================
let productosData    = [];
let productosFiltrados = [];
let seleccionados    = new Set();
let vistaActual      = 'cards';   // 'cards' o 'tabla'
let modoEdicion      = false;
let tipoAjusteMasivo = 'porcentaje';

const $buscador        = $('#buscador');
const $filtroCat       = $('#filtro-categoria');
const $filtroEstado    = $('#filtro-estado');
const $filtroStock     = $('#filtro-stock');
const $btnLimpiar      = $('#btn-limpiar-filtros');
const $btnNuevo        = $('#btn-nuevo');
const $contenedor      = $('#contenedor-productos');
const $resumen         = $('#resumen-productos');
const $barraSeleccion  = $('#barra-seleccion');
const $contSeleccion   = $('#contador-seleccion');
const $totalMostrados  = $('#total-mostrados');
const $btnSelAll       = $('#btn-seleccionar-todos');
const $btnQuitarSel    = $('#btn-quitar-seleccion');
const $btnCambioMasivo = $('#btn-cambio-masivo');
const $vistaCards      = $('#vista-cards');
const $vistaTabla      = $('#vista-tabla');

// =====================================================================
// CARGA INICIAL
// =====================================================================
async function recargar() {
  // Skeletons
  $contenedor.innerHTML = `
    <div class="productos-grid">
      ${Array(8).fill(0).map(() => `
        <div class="producto-card">
          <div class="skeleton skeleton-text" style="width: 30%; margin-bottom: 6px; height: 11px;"></div>
          <div class="skeleton skeleton-text" style="width: 90%; margin-bottom: 4px; height: 16px;"></div>
          <div class="skeleton skeleton-text" style="width: 60%; height: 11px;"></div>
          <div class="skeleton skeleton-num" style="width: 50%; height: 24px; margin-top: 16px;"></div>
        </div>`).join('')}
    </div>`;

  try {
    productosData = await listarProductos();

    // Categorías para el filtro
    const cats = [...new Set(productosData.map(p => p.categoria).filter(Boolean))].sort();
    $filtroCat.innerHTML = '<option value="">Todas las categorías</option>' +
      cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)} (${productosData.filter(p => p.categoria === c).length})</option>`).join('');

    const $datalist = document.getElementById('categorias-existentes');
    if ($datalist) {
      $datalist.innerHTML = cats.map(c => `<option value="${escapeHTML(c)}">`).join('');
    }

    aplicarFiltros();
  } catch (e) {
    mostrarErrorFatal(e.message || String(e), e.stack);
  }
}

// =====================================================================
// FILTROS + BUSCADOR
// =====================================================================
function aplicarFiltros() {
  const texto       = ($buscador.value || '').toLowerCase().trim();
  const filtroCat   = $filtroCat.value;
  const filtroEst   = $filtroEstado.value;
  const filtroStock = $filtroStock.value;

  productosFiltrados = productosData.filter(p => {
    if (filtroCat && p.categoria !== filtroCat) return false;
    if (filtroEst && p.estado !== filtroEst) return false;

    if (filtroStock === "con-stock"  && !((p.stock || 0) > 0)) return false;
    if (filtroStock === "bajo"       && !((p.stock || 0) > 0 && p.stock <= 5)) return false;
    if (filtroStock === "sin-stock"  && (p.stock || 0) > 0) return false;

    if (texto) {
      const blob = [p.id, p.nombre, p.categoria, p.observaciones]
        .filter(Boolean).join(' ').toLowerCase();
      if (!blob.includes(texto)) return false;
    }
    return true;
  });

  renderListado();
}

$buscador.addEventListener('input', debounce(aplicarFiltros, 200));
$filtroCat.addEventListener('change', aplicarFiltros);
$filtroEstado.addEventListener('change', aplicarFiltros);
$filtroStock.addEventListener('change', aplicarFiltros);
$btnLimpiar.addEventListener('click', () => {
  $buscador.value = '';
  $filtroCat.value = '';
  $filtroEstado.value = '';
  $filtroStock.value = '';
  aplicarFiltros();
});

// =====================================================================
// RENDER LISTADO
// =====================================================================
function renderListado() {
  const total     = productosData.length;
  const visibles  = productosFiltrados.length;
  const aRevisar  = productosData.filter(p => p.estado === "revisar").length;
  const stockBajo = productosData.filter(p => (p.stock || 0) > 0 && p.stock <= 5).length;

  $resumen.textContent = total === 0
    ? "Todavía no cargaste productos. Tocá 'Importar catálogo' para subir el JSON."
    : `${total} productos en total · ${aRevisar} a revisar · ${stockBajo} con stock bajo · mostrando ${visibles}`;

  $totalMostrados.textContent = visibles;

  if (visibles === 0) {
    $contenedor.innerHTML = `
      <div class="card">
        <div class="vacio">
          <h3>${total === 0 ? 'Sin productos' : 'Sin resultados'}</h3>
          <p>${total === 0
            ? 'Cargá el catálogo desde "Importar catálogo" o creá uno nuevo.'
            : 'Probá cambiar los filtros o limpiar la búsqueda.'}</p>
        </div>
      </div>`;
    return;
  }

  if (vistaActual === 'cards') renderCards();
  else renderTabla();
}

function renderCards() {
  $contenedor.innerHTML = `
    <div class="productos-grid">
      ${productosFiltrados.map(p => cardProducto(p)).join('')}
    </div>`;

  $$('.producto-card').forEach($card => {
    const cod = $card.dataset.cod;
    $card.querySelector('.check-card')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSeleccion(cod);
    });
    $card.addEventListener('click', () => abrirModalForm(cod));
  });
}

function cardProducto(p) {
  const checked    = seleccionados.has(p.id);
  const stockBajo  = (p.stock || 0) > 0 && p.stock <= 5;
  const sinStock   = (p.stock || 0) === 0;
  const precioOk   = (p.precio || 0) > 0;
  const claseCard  = `producto-card ${checked ? 'seleccionado' : ''} ${p.estado === 'revisar' ? 'revisar' : ''} ${p.estado === 'inactivo' ? 'inactivo' : ''}`;

  return `
    <div class="${claseCard}" data-cod="${escapeHTML(p.id)}">
      <div class="check-card">
        ${checked ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>

      <div class="cod">${escapeHTML(p.id)}</div>
      <div class="nombre" title="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)}</div>
      <div class="categoria">${escapeHTML(p.categoria || '—')}</div>

      <div class="precios">
        <div>
          ${precioOk ? `
            <div class="precio"><span class="moneda">$</span>${(p.precio).toLocaleString('es-AR')}</div>
          ` : `
            <div class="precio vacio">⚠ Sin precio</div>
          `}
          ${p.puntos ? `<div style="font-size: 10px; color: var(--rose-profundo); letter-spacing: 0.08em; margin-top: 2px;">${p.puntos} PTS</div>` : ''}
        </div>
        <div class="stock ${sinStock ? 'cero' : stockBajo ? 'bajo' : ''}">
          ${typeof p.stock === 'number' ? `Stock: ${p.stock}` : ''}
        </div>
      </div>

      ${p.estado === 'revisar' ? '<div style="position: absolute; top: 8px; left: 8px; font-size: 9px; padding: 2px 6px; background: var(--estado-warn); color: white; border-radius: 4px; font-weight: 500; letter-spacing: 0.08em;">REVISAR</div>' : ''}
      ${p.estado === 'inactivo' ? '<div style="position: absolute; top: 8px; left: 8px; font-size: 9px; padding: 2px 6px; background: var(--gris-suave); color: white; border-radius: 4px; font-weight: 500; letter-spacing: 0.08em;">INACTIVO</div>' : ''}
    </div>`;
}

function renderTabla() {
  $contenedor.innerHTML = `
    <div class="tabla-wrapper">
      <table class="tabla tabla-productos">
        <thead>
          <tr>
            <th class="check-cell"></th>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th class="alinear-derecha">Precio</th>
            <th class="alinear-derecha">Stock</th>
            <th class="alinear-centro">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${productosFiltrados.map(p => filaTabla(p)).join('')}
        </tbody>
      </table>
    </div>`;

  $$('.tabla-productos tbody tr').forEach($tr => {
    const cod = $tr.dataset.cod;
    $tr.querySelector('.check-cell')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSeleccion(cod);
    });
    $tr.addEventListener('click', () => abrirModalForm(cod));
  });
}

function filaTabla(p) {
  const checked = seleccionados.has(p.id);
  const precio  = (p.precio || 0) > 0
    ? `<span style="font-weight: 500;">${formatoMoneda(p.precio)}</span>`
    : '<span style="color: var(--estado-warn); font-size: 11px;">⚠ Sin precio</span>';

  const estadoBadge = {
    activo:   '<span class="badge badge-ok">Activo</span>',
    revisar:  '<span class="badge badge-warn">Revisar</span>',
    inactivo: '<span class="badge badge-neutral">Inactivo</span>'
  }[p.estado] || '';

  const stockCss = (p.stock || 0) === 0 ? 'color: var(--estado-error);' :
                   (p.stock <= 5) ? 'color: var(--estado-warn);' : '';

  return `
    <tr data-cod="${escapeHTML(p.id)}" class="${checked ? 'seleccionada' : ''}">
      <td class="check-cell">
        <div style="width:18px; height:18px; border-radius:4px; border: 2px solid ${checked ? 'var(--terracota)' : 'var(--gris-suave)'}; background: ${checked ? 'var(--terracota)' : 'transparent'}; display: flex; align-items: center; justify-content: center;">
          ${checked ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </div>
      </td>
      <td><span class="mono">${escapeHTML(p.id)}</span></td>
      <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(p.nombre)}">${escapeHTML(p.nombre)}</td>
      <td style="font-size: 11px; color: var(--rose-profundo); letter-spacing: 0.05em; text-transform: uppercase;">${escapeHTML(p.categoria || '—')}</td>
      <td class="alinear-derecha">${precio}</td>
      <td class="alinear-derecha" style="${stockCss}">${typeof p.stock === 'number' ? p.stock : '—'}</td>
      <td class="alinear-centro">${estadoBadge}</td>
    </tr>`;
}

// =====================================================================
// TOGGLE VISTA
// =====================================================================
$vistaCards.addEventListener('click', () => {
  vistaActual = 'cards';
  $vistaCards.classList.add('activo');
  $vistaTabla.classList.remove('activo');
  renderListado();
});
$vistaTabla.addEventListener('click', () => {
  vistaActual = 'tabla';
  $vistaTabla.classList.add('activo');
  $vistaCards.classList.remove('activo');
  renderListado();
});

// =====================================================================
// SELECCIÓN
// =====================================================================
function toggleSeleccion(cod) {
  if (seleccionados.has(cod)) seleccionados.delete(cod);
  else seleccionados.add(cod);
  actualizarBarraSeleccion();
  renderListado();
}

function actualizarBarraSeleccion() {
  const n = seleccionados.size;
  if (n === 0) $barraSeleccion.classList.add('oculto');
  else {
    $barraSeleccion.classList.remove('oculto');
    $contSeleccion.textContent = `${n} ${n === 1 ? 'seleccionado' : 'seleccionados'}`;
  }
}

$btnSelAll.addEventListener('click', () => {
  const codsVisibles = productosFiltrados.map(p => p.id);
  const todosYa = codsVisibles.every(c => seleccionados.has(c));
  if (todosYa) codsVisibles.forEach(c => seleccionados.delete(c));
  else codsVisibles.forEach(c => seleccionados.add(c));
  actualizarBarraSeleccion();
  renderListado();
});

$btnQuitarSel.addEventListener('click', () => {
  seleccionados.clear();
  actualizarBarraSeleccion();
  renderListado();
});

// =====================================================================
// MODAL ALTA / EDICIÓN
// =====================================================================
const $modalForm  = $('#modal-form');
const $formProd   = $('#form-producto');
const $tituloForm = $('#titulo-form');
const $btnGuardar = $('#btn-guardar');
const $btnEliminar = $('#btn-eliminar');
const $formError  = $('#form-error');

async function abrirModalForm(codigo = null) {
  modoEdicion = !!codigo;
  $tituloForm.textContent = modoEdicion ? "Editar producto" : "Nuevo producto";
  $formError.classList.add('oculto');
  $formProd.reset();

  if (modoEdicion) {
    const p = productosData.find(x => x.id === codigo) || await obtenerProducto(codigo);
    if (!p) { toast('Producto no encontrado.', 'error'); return; }

    $('#f-codigo').value         = p.id || '';
    $('#f-codigo').readOnly      = true;
    $('#f-nombre').value         = p.nombre || '';
    $('#f-categoria').value      = p.categoria || '';
    $('#f-precio').value         = p.precio || '';
    $('#f-costo').value          = p.costo || '';
    $('#f-puntos').value         = p.puntos || '';
    $('#f-stock').value          = p.stock ?? '';
    $('#f-estado').value         = p.estado || 'activo';
    $('#f-observaciones').value  = p.observaciones || '';
    $btnEliminar.classList.remove('oculto');
    $btnEliminar.dataset.codigo  = p.id;
  } else {
    $('#f-codigo').readOnly = false;
    $('#f-estado').value    = 'activo';
    $btnEliminar.classList.add('oculto');
  }

  actualizarGanancia();
  $modalForm.classList.add('abierto');
  setTimeout(() => $('#f-nombre').focus(), 100);
}

function cerrarModalForm() { $modalForm.classList.remove('abierto'); }

// Cálculo en vivo de ganancia
function actualizarGanancia() {
  const precio = parseFloat($('#f-precio').value) || 0;
  const costo  = parseFloat($('#f-costo').value) || 0;
  const $info  = $('#ganancia-info');
  if (precio > 0 && costo > 0) {
    const ganancia = precio - costo;
    const pct = costo > 0 ? Math.round((ganancia / costo) * 100) : 0;
    $('#ganancia-monto').textContent = formatoMoneda(ganancia);
    $('#ganancia-pct').textContent = pct;
    $info.style.display = 'block';
    $info.className = ganancia >= 0 ? 'alerta alerta-ok mb-md' : 'alerta alerta-error mb-md';
  } else {
    $info.style.display = 'none';
  }
}
$('#f-precio').addEventListener('input', actualizarGanancia);
$('#f-costo').addEventListener('input', actualizarGanancia);

$('#cerrar-form').addEventListener('click', cerrarModalForm);
$('#btn-cancelar').addEventListener('click', cerrarModalForm);
$modalForm.addEventListener('click', (e) => {
  if (e.target === $modalForm) cerrarModalForm();
});

$btnNuevo.addEventListener('click', () => abrirModalForm(null));

$formProd.addEventListener('submit', async (e) => {
  e.preventDefault();
  $formError.classList.add('oculto');

  const datos = {
    id:            $('#f-codigo').value.trim(),
    nombre:        $('#f-nombre').value.trim(),
    categoria:     $('#f-categoria').value.trim(),
    precio:        $('#f-precio').value,
    costo:         $('#f-costo').value,
    puntos:        $('#f-puntos').value,
    stock:         $('#f-stock').value,
    estado:        $('#f-estado').value,
    observaciones: $('#f-observaciones').value.trim(),
  };

  if (!datos.id)        return mostrarFormError("El código es obligatorio.");
  if (!datos.nombre)    return mostrarFormError("El nombre es obligatorio.");
  if (!datos.categoria) return mostrarFormError("La categoría es obligatoria.");

  $btnGuardar.disabled = true;
  $btnGuardar.innerHTML = '<span class="cargando-spinner"></span> Guardando…';

  try {
    if (modoEdicion) {
      await actualizarProducto(datos.id, datos);
      toast('Producto actualizado.', 'ok');
    } else {
      // Verificar que el código no exista
      const existente = await obtenerProducto(datos.id);
      if (existente) {
        return mostrarFormError(`Ya existe un producto con código ${datos.id}.`);
      }
      await crearProducto(datos);
      toast('Producto creado.', 'ok');
    }
    cerrarModalForm();
    await recargar();
  } catch (err) {
    console.error('[productos] error al guardar:', err);
    mostrarFormError(err.message || "No se pudo guardar.");
  } finally {
    $btnGuardar.disabled = false;
    $btnGuardar.textContent = 'Guardar';
  }
});

$btnEliminar.addEventListener('click', async () => {
  const cod = $btnEliminar.dataset.codigo;
  if (!confirm(`¿Eliminar definitivamente el producto ${cod}?\n\nEsta acción NO se puede deshacer. Las ventas históricas que lo incluyan mantienen el detalle, pero el producto deja de existir.\n\nSi solo querés discontinuarlo, mejor cambiá su estado a "Inactivo".`)) return;

  try {
    await eliminarProducto(cod);
    toast('Producto eliminado.', 'ok');
    cerrarModalForm();
    await recargar();
  } catch (err) {
    toast('No se pudo eliminar: ' + err.message, 'error');
  }
});

function mostrarFormError(msg) {
  $formError.textContent = msg;
  $formError.classList.remove('oculto');
}

// =====================================================================
// MODAL CAMBIO MASIVO DE PRECIOS
// =====================================================================
const $modalMasivo = $('#modal-masivo');
const $masivoValor = $('#masivo-valor');
const $masivoLabel = $('#masivo-label');
const $masivoHint  = $('#masivo-hint');
const $masivoError = $('#masivo-error');

function abrirModalMasivo() {
  if (seleccionados.size === 0) {
    toast('Seleccioná al menos un producto.', 'warn');
    return;
  }
  $('#masivo-cantidad').textContent = seleccionados.size;
  $masivoValor.value = '';
  $masivoError.classList.add('oculto');
  // Default: porcentaje
  $$('.ajuste-opcion').forEach(el => el.classList.remove('activo'));
  $$('.ajuste-opcion[data-tipo="porcentaje"]').forEach(el => el.classList.add('activo'));
  tipoAjusteMasivo = 'porcentaje';
  actualizarLabelMasivo();
  $modalMasivo.classList.add('abierto');
  setTimeout(() => $masivoValor.focus(), 100);
}
function cerrarModalMasivo() { $modalMasivo.classList.remove('abierto'); }

function actualizarLabelMasivo() {
  const labels = {
    porcentaje: { label: 'Porcentaje (% sobre precio actual)', hint: 'Valor positivo aumenta. Negativo descuenta. Ej: 15 = +15%, -10 = -10%' },
    sumar:      { label: 'Cantidad a sumar al precio actual ($)', hint: 'Positivo suma, negativo resta. Ej: 5000 suma $5000 a cada precio.' },
    fijo:       { label: 'Precio fijo nuevo ($)', hint: 'Todos los productos seleccionados quedarán con este precio exacto.' }
  };
  const cfg = labels[tipoAjusteMasivo];
  $masivoLabel.textContent = cfg.label;
  $masivoHint.textContent  = cfg.hint;
}

$$('.ajuste-opcion').forEach($op => {
  $op.addEventListener('click', () => {
    $$('.ajuste-opcion').forEach(el => el.classList.remove('activo'));
    $op.classList.add('activo');
    tipoAjusteMasivo = $op.dataset.tipo;
    actualizarLabelMasivo();
    $masivoValor.focus();
  });
});

$btnCambioMasivo.addEventListener('click', abrirModalMasivo);
$('#cerrar-masivo').addEventListener('click', cerrarModalMasivo);
$('#btn-cancelar-masivo').addEventListener('click', cerrarModalMasivo);
$modalMasivo.addEventListener('click', (e) => {
  if (e.target === $modalMasivo) cerrarModalMasivo();
});

$('#btn-aplicar-masivo').addEventListener('click', async () => {
  $masivoError.classList.add('oculto');
  const valor = parseFloat($masivoValor.value);
  if (isNaN(valor)) {
    $masivoError.textContent = "Ingresá un número válido.";
    $masivoError.classList.remove('oculto');
    return;
  }
  if (tipoAjusteMasivo === "fijo" && valor < 0) {
    $masivoError.textContent = "El precio fijo no puede ser negativo.";
    $masivoError.classList.remove('oculto');
    return;
  }

  const codigos = Array.from(seleccionados);
  const $btn = $('#btn-aplicar-masivo');
  $btn.disabled = true;
  $btn.innerHTML = '<span class="cargando-spinner"></span> Aplicando…';

  try {
    const n = await actualizarPreciosEnLote(codigos, { tipo: tipoAjusteMasivo, valor });
    toast(`${n} ${n === 1 ? 'producto actualizado' : 'productos actualizados'}.`, 'ok');
    cerrarModalMasivo();
    seleccionados.clear();
    actualizarBarraSeleccion();
    await recargar();
  } catch (err) {
    console.error('[productos] cambio masivo:', err);
    $masivoError.textContent = err.message || "No se pudo aplicar.";
    $masivoError.classList.remove('oculto');
  } finally {
    $btn.disabled = false;
    $btn.textContent = 'Aplicar';
  }
});

// Cerrar con Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($modalForm.classList.contains('abierto')) cerrarModalForm();
    else if ($modalMasivo.classList.contains('abierto')) cerrarModalMasivo();
  }
});

// Carga inicial
await recargar();
