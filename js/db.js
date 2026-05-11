// =====================================================================
// Emanuel Cosméticos · Capa de Acceso a Datos (db.js)
// ---------------------------------------------------------------------
// Toda la interacción con Firestore vive en este archivo. Las páginas
// nunca llaman directamente a Firestore.
//
// En F1 implementamos:
//   - Lectura de catálogo
//   - Lectura de ventas/pagos/clientes para KPIs del dashboard
//   - Cálculos agregados (KPIs, ranking, evolución)
//
// En fases siguientes se agregarán los métodos de CREATE/UPDATE.
// =====================================================================

import { db, serverTimestamp, GeoPoint } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { aDate } from "./utils.js";

// =====================================================================
//  CONFIGURACIÓN
// =====================================================================
export async function obtenerConfig() {
  const snap = await getDoc(doc(db, "configuracion", "app"));
  return snap.exists() ? snap.data() : null;
}

// =====================================================================
//  PRODUCTOS
// =====================================================================
export async function listarProductos({ categoria = null, soloActivos = false } = {}) {
  const filtros = [];
  if (categoria)   filtros.push(where("categoria", "==", categoria));
  if (soloActivos) filtros.push(where("estado", "==", "activo"));
  filtros.push(orderBy("categoria"), orderBy("nombre"));
  const q = query(collection(db, "productos"), ...filtros);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function obtenerProducto(codigo) {
  const snap = await getDoc(doc(db, "productos", codigo));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function contarProductos() {
  const snap = await getDocs(collection(db, "productos"));
  return snap.size;
}

// =====================================================================
//  CLIENTES
// =====================================================================
export async function listarClientes({ soloActivos = false } = {}) {
  const filtros = [];
  if (soloActivos) filtros.push(where("estado", "==", "activo"));
  filtros.push(orderBy("apellido"), orderBy("nombre"));
  const q = query(collection(db, "clientes"), ...filtros);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function obtenerCliente(clienteId) {
  const snap = await getDoc(doc(db, "clientes", clienteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function contarClientes() {
  const snap = await getDocs(collection(db, "clientes"));
  return snap.size;
}

// =====================================================================
//  VENTAS
// =====================================================================
/**
 * Lista ventas con filtros opcionales.
 * @param {Object} opts
 * @param {Date}   opts.desde
 * @param {Date}   opts.hasta
 * @param {string} opts.clienteId
 * @param {string} opts.estadoPedido
 * @param {string} opts.estadoPago
 * @param {number} opts.maxResultados
 */
export async function listarVentas(opts = {}) {
  const filtros = [];
  if (opts.desde) filtros.push(where("fechaVenta", ">=", Timestamp.fromDate(aDate(opts.desde))));
  if (opts.hasta) filtros.push(where("fechaVenta", "<=", Timestamp.fromDate(aDate(opts.hasta))));
  if (opts.clienteId)    filtros.push(where("clienteId", "==", opts.clienteId));
  if (opts.estadoPedido) filtros.push(where("estadoPedido", "==", opts.estadoPedido));
  if (opts.estadoPago)   filtros.push(where("estadoPago", "==", opts.estadoPago));
  filtros.push(orderBy("fechaVenta", "desc"));
  if (opts.maxResultados) filtros.push(limit(opts.maxResultados));
  const q = query(collection(db, "ventas"), ...filtros);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// =====================================================================
//  PAGOS
// =====================================================================
export async function listarPagos({ desde = null, hasta = null, clienteId = null } = {}) {
  const filtros = [];
  if (desde) filtros.push(where("fecha", ">=", Timestamp.fromDate(aDate(desde))));
  if (hasta) filtros.push(where("fecha", "<=", Timestamp.fromDate(aDate(hasta))));
  if (clienteId) filtros.push(where("clienteId", "==", clienteId));
  filtros.push(orderBy("fecha", "desc"));
  const q = query(collection(db, "pagos"), ...filtros);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// =====================================================================
//  MOVIMIENTOS DE FONDOS
// =====================================================================
export async function listarMovimientosFondos({ desde = null, hasta = null, destino = null } = {}) {
  const filtros = [];
  if (desde) filtros.push(where("fecha", ">=", Timestamp.fromDate(aDate(desde))));
  if (hasta) filtros.push(where("fecha", "<=", Timestamp.fromDate(aDate(hasta))));
  if (destino) filtros.push(where("destino", "==", destino));
  filtros.push(orderBy("fecha", "desc"));
  const q = query(collection(db, "movimientosFondos"), ...filtros);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// =====================================================================
//  ESTADÍSTICAS / DASHBOARD
// ---------------------------------------------------------------------
// Como Firestore no tiene SUM/COUNT eficientes en plan gratuito,
// hacemos un fetch parcial (con filtros de fecha) y agregamos en memoria.
// Esto está bien para volúmenes esperados (<10k ventas/año en este
// negocio). Si el volumen crece, migramos a Cloud Functions con
// agregaciones materializadas en /configuracion/agregados.
// =====================================================================

/**
 * Calcula todos los KPIs del dashboard de una sola vez.
 * Hace 4 fetches en paralelo: ventas del mes, pagos del mes, clientes, productos.
 *
 * @param {Object} opts
 * @param {Date}   opts.desde   Inicio del período (default: inicio del mes actual)
 * @param {Date}   opts.hasta   Fin del período   (default: ahora)
 * @returns {Promise<Object>}   KPIs agregados
 */
export async function obtenerKPIsDashboard({ desde, hasta } = {}) {
  // Default: este mes
  if (!desde) {
    const ahora = new Date();
    desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
  }
  if (!hasta) {
    hasta = new Date();
  }

  // Para "ventas del día"
  const inicioHoy = new Date(); inicioHoy.setHours(0,0,0,0);
  const finHoy    = new Date(); finHoy.setHours(23,59,59,999);

  const [ventasMes, pagosMes, ventasHoy, clientesTodos, productosTodos] = await Promise.all([
    listarVentas({ desde, hasta }),
    listarPagos({ desde, hasta }),
    listarVentas({ desde: inicioHoy, hasta: finHoy }),
    listarClientes(),
    listarProductos(),
  ]);

  // ----- Cálculos sobre ventas del mes -----
  const totalVendidoMes  = ventasMes.reduce((sum, v) => sum + (v.total || 0), 0);
  const totalPagadoMes   = ventasMes.reduce((sum, v) => sum + (v.pagado || 0), 0);
  const totalPendiente   = ventasMes.reduce((sum, v) => sum + (v.saldo || 0), 0);

  const pedidosPendientes = ventasMes.filter(v => v.estadoPedido === "pendiente").length;
  const pedidosEntregados = ventasMes.filter(v => v.estadoPedido === "entregado").length;

  // ----- Pagos del mes (todos los pagos, no solo de ventas del mes) -----
  const totalCobradoMes = pagosMes.reduce((sum, p) => sum + (p.monto || 0), 0);

  // ----- Ventas del día -----
  const totalVendidoHoy = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);
  const cantVentasHoy   = ventasHoy.length;

  // ----- Clientes -----
  const cantClientes = clientesTodos.length;
  const clientesConDeuda = clientesTodos.filter(c => (c.saldoPendiente || 0) > 0).length;

  // ----- Deuda total (todos los clientes) -----
  const deudaTotal = clientesTodos.reduce((sum, c) => sum + (c.saldoPendiente || 0), 0);

  // ----- Productos -----
  const cantProductos = productosTodos.length;
  const productosARevisar = productosTodos.filter(p => p.estado === "revisar").length;
  const productosStockBajo = productosTodos.filter(p => (p.stock || 0) > 0 && p.stock <= 5).length;

  return {
    periodo: { desde, hasta },
    // Dinero
    totalVendidoMes,
    totalCobradoMes,
    totalPendiente,
    totalVendidoHoy,
    deudaTotal,
    // Conteos
    cantVentasMes: ventasMes.length,
    cantVentasHoy,
    pedidosPendientes,
    pedidosEntregados,
    cantClientes,
    clientesConDeuda,
    cantProductos,
    productosARevisar,
    productosStockBajo,
    // Datos crudos por si la UI los necesita para gráficos
    ventasMes,
    pagosMes,
  };
}

/**
 * Top N productos más vendidos en un período.
 * Recorre las ventas y suma cantidades por producto.
 */
export async function rankingProductos({ desde, hasta, topN = 5 } = {}) {
  const ventas = await listarVentas({ desde, hasta });
  const acumulado = {};   // codigo -> { codigo, nombre, cantidad, ingresos }
  for (const v of ventas) {
    if (!Array.isArray(v.items)) continue;
    for (const item of v.items) {
      const cod = item.codigo || "?";
      if (!acumulado[cod]) {
        acumulado[cod] = {
          codigo: cod,
          nombre: item.nombre || `Producto ${cod}`,
          cantidad: 0,
          ingresos: 0
        };
      }
      acumulado[cod].cantidad += item.cantidad || 0;
      acumulado[cod].ingresos += item.subtotal || (item.cantidad * item.precioUnit) || 0;
    }
  }
  return Object.values(acumulado)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, topN);
}

/**
 * Top N clientes con mayor deuda.
 */
export async function rankingDeudores(topN = 5) {
  const clientes = await listarClientes();
  return clientes
    .filter(c => (c.saldoPendiente || 0) > 0)
    .sort((a, b) => (b.saldoPendiente || 0) - (a.saldoPendiente || 0))
    .slice(0, topN);
}

/**
 * Evolución de ventas día a día en los últimos N días.
 * Retorna: [{ iso, etiqueta, total, cantidad }]
 */
export async function evolucionVentasUltimosDias(n = 30) {
  const desde = new Date();
  desde.setDate(desde.getDate() - (n - 1));
  desde.setHours(0,0,0,0);
  const hasta = new Date();
  hasta.setHours(23,59,59,999);

  const ventas = await listarVentas({ desde, hasta });

  // Inicializar mapa día -> { total, cantidad }
  const mapa = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().substring(0, 10);
    mapa[iso] = {
      iso,
      etiqueta: d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
      total: 0,
      cantidad: 0
    };
  }

  // Acumular
  for (const v of ventas) {
    const f = aDate(v.fechaVenta);
    if (!f) continue;
    const iso = f.toISOString().substring(0, 10);
    if (mapa[iso]) {
      mapa[iso].total    += (v.total || 0);
      mapa[iso].cantidad += 1;
    }
  }

  return Object.values(mapa);
}

/**
 * Distribución de ventas por categoría de producto (para gráfico de torta).
 */
export async function distribucionPorCategoria({ desde, hasta } = {}) {
  const ventas = await listarVentas({ desde, hasta });
  const acumulado = {};   // categoria -> ingresos
  for (const v of ventas) {
    if (!Array.isArray(v.items)) continue;
    for (const item of v.items) {
      const cat = item.categoria || "Sin categoría";
      if (!acumulado[cat]) acumulado[cat] = 0;
      acumulado[cat] += item.subtotal || (item.cantidad * item.precioUnit) || 0;
    }
  }
  return Object.entries(acumulado)
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}

// =====================================================================
//  Re-exports para uso desde páginas si hace falta acceso directo
// =====================================================================
export {
  db, serverTimestamp, GeoPoint, Timestamp,
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction
};
