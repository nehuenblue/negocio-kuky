// =====================================================================
// Negocio Kuky · Componente Layout (sidebar + topbar)
// ---------------------------------------------------------------------
// Renderiza la estructura común a TODAS las páginas internas:
//   - Sidebar con marca, navegación, info de usuario y logout
//   - Topbar mobile con menú hamburguesa
//   - Overlay para cerrar sidebar en mobile
//
// Uso desde cualquier página:
//   import { renderLayout } from "./js/layout.js";
//   const usuario = await requireAuth();
//   renderLayout({ usuario, paginaActiva: "dashboard" });
// =====================================================================

import { logout } from "./auth.js";

// ---------- Definición del menú ----------
// Cada item: { id, titulo, href, icono (SVG path d) }
const NAV = [
  {
    grupo: "Principal",
    items: [
      { id: "dashboard", titulo: "Dashboard", href: "dashboard.html",
        icono: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    ]
  },
  {
    grupo: "Operación",
    items: [
      { id: "ventas",    titulo: "Nueva venta",    href: "ventas.html",
        icono: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
      { id: "pedidos",   titulo: "Pedidos",        href: "pedidos.html",
        icono: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
      { id: "pagos",     titulo: "Pagos",          href: "pagos.html",
        icono: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
    ]
  },
  {
    grupo: "Gestión",
    items: [
      { id: "clientes",  titulo: "Clientes",       href: "clientes.html",
        icono: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
      { id: "productos", titulo: "Productos",      href: "productos.html",
        icono: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
      { id: "mapa",      titulo: "Mapa",           href: "mapa.html",
        icono: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
    ]
  },
  {
    grupo: "Análisis",
    items: [
      { id: "reportes",  titulo: "Reportes",       href: "reportes.html",
        icono: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { id: "fondos",    titulo: "Destino fondos", href: "fondos.html",
        icono: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    ]
  }
];

// ---------- Render del sidebar ----------
function generarSidebarHTML(paginaActiva, usuario) {
  const iniciales = (usuario.nombre || usuario.email || "?")
    .split(/[\s@]/)[0]
    .substring(0, 2)
    .toUpperCase();
  const nombreMostrar = usuario.nombre || usuario.email.split("@")[0];

  const gruposHTML = NAV.map(grupo => {
    const itemsHTML = grupo.items.map(item => `
      <a href="${item.href}" class="sidebar-link ${item.id === paginaActiva ? 'activo' : ''}">
        <svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="${item.icono}"></path>
        </svg>
        <span>${item.titulo}</span>
      </a>
    `).join('');
    return `
      <div class="sidebar-grupo">
        <div class="sidebar-grupo-titulo">${grupo.grupo}</div>
        ${itemsHTML}
      </div>
    `;
  }).join('');

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-marca">
        <img src="assets/logo.jpg" alt="Negocio Kuky" />
        <div>
          <div class="marca-texto">Negocio</div>
          <div class="marca-sub">Kuky</div>
        </div>
      </div>

      ${gruposHTML}

      <div class="sidebar-pie">
        <div class="sidebar-usuario">
          <div class="avatar">${iniciales}</div>
          <div style="flex:1; min-width:0;">
            <div class="nombre" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${nombreMostrar}</div>
            <div class="rol">${usuario.rol || 'sin rol'}</div>
          </div>
        </div>
        <button class="btn btn-fantasma btn-sm" id="btn-logout" style="width:100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  `;
}

function generarTopbarMobileHTML(tituloPagina) {
  return `
    <div class="topbar-mobile">
      <button class="menu-toggle" id="abrir-menu" aria-label="Abrir menú">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="titulo">${tituloPagina}</div>
      <div style="width:40px;"></div>
    </div>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;
}

// ---------- API pública ----------
/**
 * Renderiza el layout en la página actual.
 * Espera que el body tenga la estructura:
 *   <div class="app">
 *     <!-- aquí se inserta el sidebar -->
 *     <div class="main-wrapper">
 *       <!-- aquí se inserta el topbar mobile -->
 *       <main class="main">...contenido de la página...</main>
 *     </div>
 *   </div>
 *
 * @param {Object} opts
 * @param {Object} opts.usuario       Usuario actual (de requireAuth)
 * @param {string} opts.paginaActiva  ID del item activo (dashboard, ventas, etc)
 * @param {string} opts.titulo        Título para el topbar mobile (default = primer link activo)
 */
export function renderLayout({ usuario, paginaActiva, titulo }) {
  const app = document.querySelector(".app");
  if (!app) {
    console.error("[layout] No se encontró .app en el DOM");
    return;
  }

  // Insertar sidebar al inicio del app
  app.insertAdjacentHTML("afterbegin", generarSidebarHTML(paginaActiva, usuario));

  // Insertar topbar mobile + overlay antes del main
  const mainWrapper = app.querySelector(".main-wrapper") || app;
  const main = mainWrapper.querySelector(".main") || document.querySelector(".main");
  const tituloFinal = titulo || NAV.flatMap(g => g.items).find(i => i.id === paginaActiva)?.titulo || "Negocio Kuky";
  if (main) {
    main.insertAdjacentHTML("beforebegin", generarTopbarMobileHTML(tituloFinal));
  }

  // ----- Event listeners -----
  const $sidebar = document.getElementById("sidebar");
  const $overlay = document.getElementById("sidebar-overlay");
  const $abrir   = document.getElementById("abrir-menu");
  const $logout  = document.getElementById("btn-logout");

  function abrirMenu() {
    $sidebar.classList.add("abierto");
    $overlay.classList.add("visible");
    document.body.classList.add("menu-abierto");
  }
  function cerrarMenu() {
    $sidebar.classList.remove("abierto");
    $overlay.classList.remove("visible");
    document.body.classList.remove("menu-abierto");
  }

  $abrir?.addEventListener("click", abrirMenu);
  $overlay?.addEventListener("click", cerrarMenu);

  $logout?.addEventListener("click", async () => {
    if (!confirm("¿Cerrar la sesión?")) return;
    await logout();
    location.replace("index.html");
  });

  // Cerrar menú al navegar (mobile)
  $sidebar.querySelectorAll(".sidebar-link").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 900) cerrarMenu();
    });
  });
}
