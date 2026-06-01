// =====================================================================
// Negocio Kuky · Importar productos desde Excel/CSV
// ---------------------------------------------------------------------
// Flujo:
//   1. Usuario arrastra/elige un Excel (.xlsx/.xls) o CSV
//   2. Se lee con SheetJS y se normalizan las columnas
//   3. Vista previa: nuevos a cargar / ya existentes (omitir) / sin nombre
//   4. Se crean solo los nuevos (los códigos existentes se omiten)
//   Columnas esperadas (primera fila): codigo, nombre, precio, categoria, stock
// =====================================================================

import { requireAuth } from "../auth.js";
import { listarProductos, crearProducto } from "../db.js";
import { $, escapeHTML, toast, formatoMoneda } from "../utils.js";

// ---------- Errores globales ----------
window.addEventListener('error', (e) => {
  console.error('[importar] error:', e.error || e.message);
  toast('Error inesperado: ' + (e.error?.message || e.message), 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[importar] unhandled:', e.reason);
  toast('Error: ' + (e.reason?.message || String(e.reason)), 'error');
});

// ---------- Auth ----------
const usuario = await requireAuth({ requireAdmin: true });
document.getElementById('pantalla-carga').style.display = 'none';
document.getElementById('app').style.display = 'block';

// ---------- Estado ----------
let archivoNombre = null;
let aCargar  = [];   // productos nuevos (no existen aún)
let omitidos = [];   // filas con código que ya existe
let invalidos = 0;   // filas sin nombre

// ---------- Referencias DOM ----------
const $dropzone     = $('#dropzone');
const $inputArchivo = $('#input-archivo');

const $estadoDropzone   = $('#estado-dropzone');
const $estadoPreview    = $('#estado-preview');
const $estadoAplicando  = $('#estado-aplicando');
const $estadoResultado  = $('#estado-resultado');

const $btnAplicar = $('#btn-aplicar');
const $btnVolver  = $('#btn-volver');
const $btnCambiar = $('#btn-cambiar');

const $paso1 = $('#paso-1');
const $paso2 = $('#paso-2');
const $paso3 = $('#paso-3');

// ---------- Pasos visuales ----------
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

// ---------- Plantilla de ejemplo ----------
$('#btn-plantilla')?.addEventListener('click', () => {
  if (typeof XLSX === 'undefined') { toast('No se pudo cargar el generador de Excel.', 'error'); return; }
  const filas = [
    ['codigo', 'nombre', 'precio', 'categoria', 'stock'],
    ['1001', 'Muñeca articulada', '8500', 'Juguetería', '12'],
    ['1002', 'Cuaderno tapa dura A4', '3200', 'Librería', '40'],
    ['1003', 'Auriculares inalámbricos', '15000', 'Electrónica', '7'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla-productos-kuky.xlsx');
});

// ---------- Drag & drop ----------
$dropzone.addEventListener('click', () => $inputArchivo.click());
$dropzone.addEventListener('dragover', (e) => { e.preventDefault(); $dropzone.classList.add('dragover'); });
$dropzone.addEventListener('dragleave', () => $dropzone.classList.remove('dragover'));
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

// ---------- Normalizar nombres de columna ----------
// Acepta variaciones: "código", "Codigo", "PRECIO", "Categoría", etc.
function normalizarClave(k) {
  return String(k).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // sin acentos
}
function mapearFila(filaObj) {
  const out = {};
  for (const k in filaObj) {
    const nk = normalizarClave(k);
    if (nk === 'codigo' || nk === 'cod' || nk === 'id') out.codigo = filaObj[k];
    else if (nk === 'nombre' || nk === 'producto' || nk === 'descripcion') out.nombre = filaObj[k];
    else if (nk === 'precio') out.precio = filaObj[k];
    else if (nk === 'categoria' || nk === 'rubro') out.categoria = filaObj[k];
    else if (nk === 'stock' || nk === 'cantidad') out.stock = filaObj[k];
  }
  return out;
}

// ---------- Leer y procesar el archivo ----------
async function procesarArchivo(archivo) {
  const nombre = archivo.name.toLowerCase();
  if (!/\.(xlsx|xls|csv)$/.test(nombre)) {
    toast('El archivo debe ser .xlsx, .xls o .csv', 'error');
    return;
  }
  if (typeof XLSX === 'undefined') { toast('No se pudo cargar el lector de Excel. Revisá tu conexión.', 'error'); return; }

  archivoNombre = archivo.name;

  try {
    const buf = await archivo.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

    if (!filas.length) { toast('El archivo está vacío o no tiene filas.', 'error'); return; }

    // Catálogo actual para detectar duplicados
    const actuales = await listarProductos();
    const codigosExistentes = new Set(actuales.map(p => String(p.id)));

    aCargar = [];
    omitidos = [];
    invalidos = 0;
    const codigosEnArchivo = new Set();

    for (const filaRaw of filas) {
      const f = mapearFila(filaRaw);
      const nombreProd = String(f.nombre || '').trim();
      if (!nombreProd) { invalidos++; continue; }

      let codigo = String(f.codigo || '').trim();
      // Si no trae código, generamos uno simple basado en el tiempo + índice
      if (!codigo) codigo = 'K' + Date.now().toString(36) + Math.floor(Math.random() * 1000);

      const prod = {
        id: codigo,
        nombre: nombreProd,
        precio: Number(String(f.precio).replace(/[^\d.-]/g, '')) || 0,
        categoria: String(f.categoria || 'Otros').trim() || 'Otros',
        stock: Number(String(f.stock).replace(/[^\d.-]/g, '')) || 0,
      };

      // Duplicado: ya existe en la base, o repetido dentro del mismo archivo
      if (codigosExistentes.has(codigo) || codigosEnArchivo.has(codigo)) {
        omitidos.push(prod);
      } else {
        codigosEnArchivo.add(codigo);
        aCargar.push(prod);
      }
    }

    renderVistaPrevia();
    mostrarEstado('preview');
    setPaso(2);

  } catch (err) {
    console.error(err);
    toast('Error leyendo el archivo: ' + err.message, 'error');
  }
}

// ---------- Vista previa ----------
function renderVistaPrevia() {
  $('#archivo-info').textContent = `${archivoNombre} · ${aCargar.length + omitidos.length + invalidos} filas leídas`;
  $('#stat-nuevos').textContent    = aCargar.length;
  $('#stat-omitidos').textContent  = omitidos.length;
  $('#stat-invalidos').textContent = invalidos;

  if (aCargar.length > 0) {
    $('#bloque-nuevos').style.display = 'block';
    $('#lista-nuevos').innerHTML = aCargar.slice(0, 50).map(p => itemProd(p)).join('') +
      (aCargar.length > 50 ? colita(aCargar.length - 50) : '');
  } else {
    $('#bloque-nuevos').style.display = 'none';
  }

  if (omitidos.length > 0) {
    $('#bloque-omitidos').style.display = 'block';
    $('#lista-omitidos').innerHTML = omitidos.slice(0, 30).map(p => itemProd(p)).join('') +
      (omitidos.length > 30 ? colita(omitidos.length - 30) : '');
  } else {
    $('#bloque-omitidos').style.display = 'none';
  }

  $btnAplicar.disabled = aCargar.length === 0;
}

function itemProd(p) {
  return `
    <div class="item-cambio">
      <div class="info">
        <div class="nom">${escapeHTML(p.nombre)}</div>
        <div class="cod">${escapeHTML(String(p.id))} · ${escapeHTML(p.categoria || '—')}</div>
      </div>
      <div class="precio-cambio">${formatoMoneda(p.precio || 0)}</div>
    </div>`;
}
function colita(n) {
  return `<div style="padding:10px 14px; text-align:center; color:var(--gris-suave); font-size:12px; font-style:italic;">… y ${n} más</div>`;
}

// ---------- Volver / cambiar ----------
$btnVolver.addEventListener('click', () => { if (confirm('¿Descartar el archivo y volver al inicio?')) resetear(); });
$btnCambiar.addEventListener('click', resetear);

function resetear() {
  archivoNombre = null;
  aCargar = []; omitidos = []; invalidos = 0;
  $inputArchivo.value = '';
  $('#aplicar-error').classList.add('oculto');
  mostrarEstado('dropzone');
  setPaso(1);
}

// ---------- Importar ----------
$btnAplicar.addEventListener('click', async () => {
  $('#aplicar-error').classList.add('oculto');
  if (aCargar.length === 0) { mostrarErrorAplicar('No hay productos nuevos para cargar.'); return; }

  const msg = [
    `¿Importar ${aCargar.length} producto${aCargar.length === 1 ? '' : 's'} nuevo${aCargar.length === 1 ? '' : 's'}?`,
    omitidos.length ? `\nSe omitirán ${omitidos.length} que ya existen.` : '',
  ].join('');
  if (!confirm(msg)) return;

  mostrarEstado('aplicando');
  setPaso(3);

  const total = aCargar.length;
  let ok = 0, errores = 0;
  const t0 = performance.now();

  for (let i = 0; i < total; i++) {
    try {
      await crearProducto({ ...aCargar[i], estado: 'activo', ciclo: 'C01' });
      ok++;
    } catch (err) {
      console.error('[importar] error en', aCargar[i].id, err);
      errores++;
    }
    const pct = Math.round(((i + 1) / total) * 100);
    $('#barra-progreso').style.width = pct + '%';
    $('#progreso-texto').textContent = `${i + 1} de ${total} (${pct}%)`;
  }

  const segs = ((performance.now() - t0) / 1000).toFixed(1);
  mostrarEstado('resultado');
  setPaso(3);
  $paso3.classList.remove('activo');
  $paso3.classList.add('completado');

  if (errores === 0) {
    $('#resultado-icono').textContent = '✅';
    $('#resultado-titulo').textContent = 'Productos importados';
    $('#resultado-mensaje').innerHTML = `Se cargaron <strong>${ok}</strong> productos en ${segs}s.${omitidos.length ? `<br>${omitidos.length} se omitieron por ya existir.` : ''}`;
  } else {
    $('#resultado-icono').textContent = '⚠️';
    $('#resultado-titulo').textContent = 'Importación con algunos errores';
    $('#resultado-mensaje').innerHTML = `${ok} cargados OK, ${errores} fallaron, en ${segs}s.<br>Revisá la consola para detalles.`;
  }
});

function mostrarErrorAplicar(msg) {
  const $err = $('#aplicar-error');
  $err.textContent = msg;
  $err.classList.remove('oculto');
}
