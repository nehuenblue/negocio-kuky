// =====================================================================
// Negocio Kuky — Firebase Config
//
// Proyecto Firebase: negocio-kuky (base de datos propia, separada de
// Emanuel Cosméticos).
//
// IMPORTANTE:
//   - Estas keys son PÚBLICAS por diseño en Firebase Web. La seguridad
//     real está en firestore.rules y en la restricción de la API key
//     por dominio HTTP Referrer (Google Cloud Console → Credentials).
//   - Antes de subir a producción, restringir la API key a tu dominio.
// =====================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, serverTimestamp, GeoPoint }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Config del proyecto Firebase "negocio-kuky"
const firebaseConfig = {
  apiKey:            "AIzaSyDRpzVj80kSwpFdIhFGk5d7UIimzD5-Dkw",
  authDomain:        "negocio-kuky.firebaseapp.com",
  projectId:         "negocio-kuky",
  storageBucket:     "negocio-kuky.firebasestorage.app",
  messagingSenderId: "851583077941",
  appId:             "1:851583077941:web:e3e31d28eb5801f5bceb7c"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export { serverTimestamp, GeoPoint };

// Persistencia local: el usuario queda logueado entre recargas/cierres
// del navegador hasta que haga logout explícito.
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.error("[firebase-config] No se pudo establecer persistencia:", err);
});

// Metadatos de la app (constantes globales)
export const APP_INFO = Object.freeze({
  nombre:     "Negocio Kuky",
  cicloActual: "C01",
  moneda:     "ARS",
  simbolo:    "$",
  zonaHoraria: "America/Argentina/Buenos_Aires"
});
