// =====================================================================
// Emanuel Cosméticos · Importador de catálogo (js/pages/importar-catalogo.js)
// ---------------------------------------------------------------------
// Flujo:
//   1. Usuario arrastra/elige un archivo JSON
//   2. Sistema parsea y calcula el diff vs catálogo actual
//   3. Muestra vista previa (4 stats + top cambios de precio)
//   4. Usuario confirma + escribe ciclo nuevo
//   5. Sistema aplica los cambios en batches con barra de progreso
//   6. Muestra resultado final
// =====================================================================

import { requireAuth } from "../auth.js";
import { calcularDiffCatalogo, aplicarDiffCatalogo } from "../db.js";
import { $, escapeHTML, toast, formatoMoneda } from "../utils.js";

// =====================================================================
// Captura de errores globales
// =====================================================================
window.addEventListener('error', (e) => {
  console.error('[importar] error:', e.error || e.message);
  toast('Error inesperado: ' + (e.error?.message || e.message), 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[importar] unhandled:', e.reason);
  toast('Error: ' + (e.reason?.message || String(e.reason)), 'error');
});

// =====================================================================
// Auth
// =====================================================================
const usuario = await requireAuth({ requireAdmin: true });
document.getElementById('pantalla-carga').style.display = 'none';
document.getElementById('app').style.display = 'block';

// =====================================================================
// Estado
// =====================================================================
let archivoNombre = null;
let catalogoNuevo = null;
let diffActual    = null;

// =====================================================================
// Referencias DOM
// =====================================================================
const $dropzone     = $('#dropzone');
const $inputArchivo = $('#input-archivo');

const $estadoDropzone   = $('#estado-dropzone');
const $estadoPreview    = $('#estado-preview');
const $estadoAplicando  = $('#estado-aplicando');
const $estadoResultado  = $('#estado-resultado');

const $btnAplicar = $('#btn-aplicar');
const $btnVolver  = $('#btn-volver');
const $btnCambiar = $('#btn-cambiar');
const $inputCiclo = $('#input-ciclo');

const $paso1 = $('#paso-1');
const $paso2 = $('#paso-2');
const $paso3 = $('#paso-3');

// =====================================================================
// Helpers de pasos visuales
// =====================================================================
function setPaso(numero) {
  [$paso1, $paso2, $paso3].forEach(($p, i) => {
    $p.classList.remove('activo', 'completado');
    if (i + 1 < numero) $p.classList.add('completado');
    else if (i + 1 === numero) $p.classList.add('activo');
  });
}

function mostrarEstado(estado) {
  $estadoDropzone.classList.add('oculto');
  $estadoPreview.classList.add('oculto');
  $estadoAplicando.classList.add('oculto');
  $estadoResultado.classList.add('oculto');

  if (estado === 'dropzone')   $estadoDropzone.classList.remove('oculto');
  if (estado === 'preview')    $estadoPreview.classList.remove('oculto');
  if (estado === 'aplicando')  $estadoAplicando.classList.remove('oculto');
  if (estado === 'resultado')  $estadoResultado.classList.remove('oculto');
}

// =====================================================================
// Drag & drop
// =====================================================================
$dropzone.addEventListener('click', () => $inputArchivo.click());

$dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  $dropzone.classList.add('dragover');
});
$dropzone.addEventListener('dragleave', () => {
  $dropzone.classList.remove('dragover');
});
$dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  $dropzone.classList.remove('dragover');
  const archivo = e.dataTransfer.files[0];
  if (archivo) procesarArchivo(archivo);
});

$inputArchivo.addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  if (archivo) procesarArchivo(archivo);
});

// =====================================================================
// Leer y procesar el archivo
// =====================================================================
async function procesarArchivo(archivo) {
  if (!archivo.name.toLowerCase().endsWith('.json')) {
    toast('El archivo debe ser .json', 'error');
    return;
  }
  if (archivo.size > 10 * 1024 * 1024) {
    toast('El archivo es demasiado grande (máx 10 MB).', 'error');
    return;
  }

  archivoNombre = archivo.name;

  try {
    const texto = await archivo.text();
    catalogoNuevo = JSON.parse(texto);

    if (!Array.isArray(catalogoNuevo)) {
      throw new Error("El JSON debe ser un array de productos (formato: [{ id, nombre, ... }]).");
    }
    if (catalogoNuevo.length === 0) {
      throw new Error("El JSON está vacío.");
    }

    toast(`Leídos ${catalogoNuevo.length} productos. Calculando diferencias…`, 'info');

    // Calcular diff
    diffActual = await calcularDiffCatalogo(catalogoNuevo);

    // Sugerir ciclo nuevo (intentar detectar del primer producto)
    const cicloSugerido = catalogoNuevo[0]?.ciclo || sugerirSiguienteCiclo();
    $inputCiclo.value = cicloSugerido;

    renderVistaPrevia();
    mostrarEstado('preview');
    setPaso(2);

  } catch (err) {
    console.error(err);
    toast('Error procesando el archivo: ' + err.message, 'error');
  }
}

// Sugerir el siguiente ciclo a partir de los productos actuales
function sugerirSiguienteCiclo() {
  // Si no tenemos info, devolvemos C08 como default
  // (en una versión más avanzada podríamos leer el ciclo actual del catálogo)
  return "C08";
}

// =====================================================================
// Render de la vista previa
// =====================================================================
function renderVistaPrevia() {
  const { resumen, topAumentos, topBajas, discontinuados } = diffActual;

  $('#archivo-info').textContent = `${archivoNombre} · ${resumen.totalNuevo} productos en el archivo`;

  $('#stat-nuevos').textContent          = resumen.nuevos;
  $('#stat-cambiados').textContent       = resumen.cambiados;
  $('#stat-sin-cambios').textContent     = resumen.sinCambios;
  $('#stat-discontinuados').textContent  = resumen.discontinuados;

  // Top aumentos
  if (topAumentos.length > 0 && topAumentos[0]._delta.precio > 0) {
    $('#bloque-aumentos').style.display = 'block';
    $('#lista-aumentos').innerHTML = topAumentos
      .filter(p => p._delta.precio > 0)
      .map(p => itemCambioPrecio(p))
      .join('');
  } else {
    $('#bloque-aumentos').style.display = 'none';
  }

  // Top bajas
  if (topBajas.length > 0) {
    $('#bloque-bajas').style.display = 'block';
    $('#lista-bajas').innerHTML = topBajas.map(p => itemCambioPrecio(p)).join('');
  } else {
    $('#bloque-bajas').style.display = 'none';
  }

  // Discontinuados (muestra primeros 20)
  if (discontinuados.length > 0) {
    $('#bloque-discontinuados').style.display = 'block';
    $('#lista-discontinuados').innerHTML = discontinuados.slice(0, 20).map(p => `
      <div class="item-cambio">
        <div class="info">
          <div class="nom">${escapeHTML(p.nombre || 'Sin nombre')}</div>
          <div class="cod">${escapeHTML(p.id)} · ${escapeHTML(p.categoria || '—')}</div>
        </div>
        <div class="precio-cambio">
          <div style="color: var(--gris-suave);">${formatoMoneda(p.precio || 0)}</div>
        </div>
      </div>
    `).join('') + (discontinuados.length > 20 ? `
      <div style="padding: 10px 14px; text-align: center; color: var(--gris-suave); font-size: 12px; font-style: italic;">
        … y ${discontinuados.length - 20} más
      </div>
    ` : '');
  } else {
    $('#bloque-discontinuados').style.display = 'none';
  }
}

function itemCambioPrecio(p) {
  const pct = Math.round(p._delta.precioPct);
  const subio = p._delta.precio > 0;
  const claseSigno = subio ? 'subio' : 'bajo';
  const signo = subio ? '+' : '';
  return `
    <div class="item-cambio">
      <div class="info">
        <div class="nom">${escapeHTML(p.nombre)}</div>
        <div class="cod">${escapeHTML(p.id)} · ${escapeHTML(p.categoria || '—')}</div>
      </div>
      <div class="precio-cambio">
        <div class="viejo">${formatoMoneda(p._anterior.precio)}</div>
        <div class="nuevo">${formatoMoneda(p.precio)}</div>
      </div>
      <div class="pct ${claseSigno}">${signo}${pct}%</div>
    </div>
  `;
}

// =====================================================================
// Volver / Cambiar archivo
// =====================================================================
$btnVolver.addEventListener('click', () => {
  if (!confirm('¿Descartar el archivo y volver al inicio?')) return;
  resetear();
});

$btnCambiar.addEventListener('click', () => {
  resetear();
});

function resetear() {
  archivoNombre = null;
  catalogoNuevo = null;
  diffActual    = null;
  $inputArchivo.value = '';
  $('#aplicar-error').classList.add('oculto');
  mostrarEstado('dropzone');
  setPaso(1);
}

// =====================================================================
// Aplicar cambios
// =====================================================================
$btnAplicar.addEventListener('click', async () => {
  $('#aplicar-error').classList.add('oculto');

  const cicloNuevo = $inputCiclo.value.trim().toUpperCase();
  if (!cicloNuevo) {
    mostrarErrorAplicar("Especificá el ciclo nuevo (ej: C08).");
    return;
  }
  if (!/^C\d{2,3}$/i.test(cicloNuevo)) {
    if (!confirm(`El formato esperado del ciclo es "C08" o "C09". Vos escribiste "${cicloNuevo}". ¿Continuar igual?`)) return;
  }

  const r = diffActual.resumen;
  const mensaje = [
    `¿Aplicar los cambios al catálogo?`,
    ``,
    `Ciclo nuevo: ${cicloNuevo}`,
    ``,
    `✓ ${r.nuevos} productos nuevos`,
    `↻ ${r.cambiados} con cambios`,
    `✗ ${r.discontinuados} se inactivarán`,
    ``,
    `Esta acción no se puede deshacer.`
  ].join('\n');

  if (!confirm(mensaje)) return;

  mostrarEstado('aplicando');
  setPaso(3);

  const t0 = performance.now();

  try {
    const reporte = await aplicarDiffCatalogo(diffActual, cicloNuevo, (procesados, total) => {
      const pct = Math.round((procesados / total) * 100);
      $('#barra-progreso').style.width = pct + '%';
      $('#progreso-texto').textContent = `${procesados} de ${total} operaciones (${pct}%)`;
    });

    const segs = ((performance.now() - t0) / 1000).toFixed(1);

    // Mostrar resultado
    mostrarEstado('resultado');
    setPaso(3);
    $paso3.classList.remove('activo');
    $paso3.classList.add('completado');

    if (reporte.errores.length === 0) {
      $('#resultado-icono').textContent = '✅';
      $('#resultado-titulo').textContent = `Catálogo ${cicloNuevo} cargado`;
      $('#resultado-mensaje').innerHTML = `
        Se aplicaron <strong>${reporte.procesados}</strong> operaciones en ${segs}s.<br>
        ${r.nuevos} nuevos · ${r.cambiados} actualizados · ${r.discontinuados} inactivados.
      `;
    } else {
      $('#resultado-icono').textContent = '⚠️';
      $('#resultado-titulo').textContent = `Catálogo cargado con algunos errores`;
      $('#resultado-mensaje').innerHTML = `
        ${reporte.procesados} operaciones OK en ${segs}s.<br>
        ${reporte.errores.length} ${reporte.errores.length === 1 ? 'lote falló' : 'lotes fallaron'}. Revisá la consola para detalles.
      `;
      console.error('[importar] errores por lote:', reporte.errores);
    }

  } catch (err) {
    console.error('[importar] error al aplicar:', err);
    mostrarEstado('preview');
    mostrarErrorAplicar(err.message || "No se pudo aplicar. Mirá la consola.");
  }
});

function mostrarErrorAplicar(msg) {
  const $err = $('#aplicar-error');
  $err.textContent = msg;
  $err.classList.remove('oculto');
}
