# Emanuel Cosméticos · Fase 0 (Seguridad + Catálogo)

Esta fase deja el sistema con **autenticación obligatoria**, **reglas de Firestore endurecidas**, **catálogo C07 completo cargado** (802 productos) y un **login profesional**. Es la base sobre la que se construyen las fases siguientes.

---

## Estructura de archivos

```
emanuel-cosmeticos/
├── index.html                    Login (raíz de la app)
├── dashboard.html                Placeholder post-login (real en F1)
├── firestore.rules               Reglas de seguridad de Firestore
├── README-F0.md                  Este archivo
├── assets/
│   └── logo.jpg                  Logo de Emanuel Cosméticos
├── js/
│   ├── firebase-config.js        Config + init de Firebase (COMPLETAR)
│   ├── auth.js                   Login/logout/guard/recupero
│   ├── db.js                     Capa de datos (crece en F1+)
│   └── utils.js                  Helpers de formato/validación
└── admin/
    ├── seed-productos.html       Página one-shot para cargar catálogo
    └── productos-seed.json       802 productos del Ciclo 07
```

---

## Paso a paso de instalación

### 1. Crear el proyecto Firebase

1. Ir a [console.firebase.google.com](https://console.firebase.google.com/) y **Add project**.
2. Nombre: `emanuel-cosmeticos`. No habilitar Google Analytics (no se usa).
3. Una vez creado, en el sidebar **Build → Authentication → Get started**.
4. Pestaña **Sign-in method → Email/Password → Enable** (solo el primer toggle, no "Email link").
5. En el sidebar **Build → Firestore Database → Create database**.
   - Modo: **Start in production mode** (importante: NO test mode).
   - Ubicación: `southamerica-east1` (São Paulo) o la más cercana disponible.

### 2. Configurar la app web

1. En **Project settings (rueda dentada) → General → Your apps → `</>` (Add web app)**.
2. Nombre: `Emanuel Cosméticos Web`. **No** activar Firebase Hosting todavía.
3. Copiar el bloque `firebaseConfig` que aparece.
4. Abrir `js/firebase-config.js` y reemplazar los valores `REEMPLAZAR`:

```js
const firebaseConfig = {
  apiKey:            "AIza...AQUI_VA_TU_KEY",
  authDomain:        "emanuel-cosmeticos.firebaseapp.com",
  projectId:         "emanuel-cosmeticos",
  storageBucket:     "emanuel-cosmeticos.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abc123def456"
};
```

### 3. Publicar las reglas de Firestore

1. En la consola: **Firestore Database → Rules**.
2. Borrar el contenido y pegar el **contenido completo** de `firestore.rules`.
3. Clic en **Publish**. Verificar que no haya errores de sintaxis.

> **Importante:** Las reglas requieren `request.auth != null` y rol `admin` en `/usuarios/{uid}` para casi todo. Hasta que no crees tu usuario admin (paso 5), **nada** funciona desde la app. Esto es a propósito.

### 4. Crear tu usuario admin

1. **Authentication → Users → Add user**. Email + contraseña. Anotá el **UID** que aparece después de crear.
2. **Firestore Database → Start collection → ID: `usuarios`**.
3. Crear documento con **Document ID = UID del usuario** (el del paso anterior, no autogenerado).
4. Campos del documento:
   - `email` (string) → tu email
   - `nombre` (string) → tu nombre
   - `rol` (string) → `admin`
   - `creadoEn` (timestamp) → click en el ícono de reloj para usar `serverTimestamp`

Si más adelante necesitás crear vendedores con menos permisos, repetís el flujo con `rol: "vendedor"` y en las reglas vamos ajustando qué pueden hacer.

### 5. Restringir la API key (paso de hardening)

1. Ir a [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Encontrar la "Browser key" del proyecto `emanuel-cosmeticos`.
3. **Application restrictions → HTTP referrers** y agregar:
   - `https://tudominio.com/*` (cuando lo tengas)
   - `http://localhost:*/*` (para desarrollo)
   - `https://emanuel-cosmeticos.web.app/*` (si usás Firebase Hosting)
4. **API restrictions → Restrict key**: dejar solo `Identity Toolkit API` y `Cloud Firestore API`.
5. **Save**.

> Esto evita que alguien que copie tu apiKey del HTML pueda usarla desde otro dominio.

### 6. Servir los archivos

Cualquier servidor estático funciona. Opciones rápidas:

**Opción A — Python local (desarrollo):**
```bash
cd emanuel-cosmeticos
python3 -m http.server 8000
# Abrir http://localhost:8000
```

**Opción B — Firebase Hosting (producción):**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # public dir: . | single-page: No | overwrite: No
firebase deploy
```

> **No abrir el `index.html` con doble click** (protocolo `file://`). Firebase requiere `http://` o `https://` para que los módulos ES y la autenticación funcionen.

### 7. Cargar el catálogo

1. Abrir `http://localhost:8000` (o tu URL de hosting).
2. Login con el usuario admin creado.
3. Te redirige a `dashboard.html`.
4. Clic en **"Cargar catálogo (one-time)"** → abre `admin/seed-productos.html`.
5. Verás: **Total 802, Listos ~294, A revisar ~508**.
6. Clic en **"Iniciar carga del catálogo"** → confirma → carga en 2 lotes de 500.
7. Al terminar verás "Carga completada". Verificá en Firebase Console → Firestore → colección `productos`.

> **Sobre los ~508 productos en "revisar":** el Excel origen tiene la cadena `"REVISAR MANUALMENTE"` en muchos precios (los marcó así quien lo armó), y el PDF de InDesign tiene nombres con maquetación compleja. Esos productos se cargan igual con `estado: "revisar"` para que en la **Fase 3** (gestión de productos) los corrijas desde la UI con buscador, edición masiva y filtro "ver solo a revisar".

---

## Checklist de verificación de la F0

Antes de pasar a la F1, confirmá uno a uno:

- [ ] El login carga sin errores en la consola del navegador.
- [ ] Con credenciales inválidas muestra mensaje claro en español (no en inglés).
- [ ] Con credenciales correctas redirige a `dashboard.html`.
- [ ] El dashboard muestra tu email y "admin" en la píldora de rol.
- [ ] **Logout** vuelve al login y borra la sesión.
- [ ] Intentando abrir `dashboard.html` directo sin sesión, redirige al login.
- [ ] El recupero de contraseña envía correctamente el mail (revisar inbox).
- [ ] La carga del catálogo deja 802 documentos en Firestore (verificar en consola).
- [ ] Las **reglas de Firestore están publicadas** (no en modo test).
- [ ] La **API key está restringida por dominio** en Google Cloud Console.
- [ ] El sitio se ve bien en móvil (la grid colapsa, el logo se centra arriba).

---

## Notas de seguridad

- Las API keys de Firebase Web son **públicas por diseño**. La seguridad real vive en las reglas de Firestore y en la restricción de la key por dominio. Eso es estándar de la industria.
- Los **clientes son PII bajo Ley 25.326** (Argentina). Las reglas ya restringen su lectura a usuarios autenticados con rol admin.
- Las **ventas y pagos no se pueden borrar** desde la app por reglas. Para anular una venta se actualiza solo `estadoPedido = "cancelado"`. Esto da trazabilidad histórica.
- Los **roles no se pueden modificar desde el cliente** ni siquiera por el propio usuario. Cambios de rol se hacen manualmente en la consola de Firestore o desde una Cloud Function privilegiada que se podría agregar más adelante.
- Si en algún momento sospechás de un acceso indebido, revocá la sesión en **Firebase Console → Authentication → seleccionar usuario → Revoke**.

---

## Cuando F0 esté verificada → F1

Avisame en el próximo mensaje "F0 OK, dale F1" y entrego:

- Dashboard real con tarjetas: total vendido / cobrado / pendiente, cantidad de clientes, pedidos pendientes, etc.
- Layout responsive con sidebar de navegación.
- Capa de datos completa para los KPIs.
- Estilos globales reutilizables (`assets/styles.css`).
- Helpers para tarjetas, modales, tablas y formularios consistentes.

Si en cualquier paso de F0 algo falla, mandame el mensaje de error de la consola del navegador y vemos.
