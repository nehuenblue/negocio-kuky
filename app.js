import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDoc, doc, setDoc, getDocs, GeoPoint } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { catalogoData } from './catalogo.js';
import L from 'https://esm.sh/leaflet@1.9.4';

const firebaseConfig = {
    apiKey: "AIzaSyBzhUo2XFlVTs_TeZrEI3IKiyvlWvLHaNM",
    authDomain: "emanuel-natura.firebaseapp.com",
    projectId: "emanuel-natura",
    storageBucket: "emanuel-natura.firebasestorage.app",
    messagingSenderId: "481732059058",
    appId: "1:481732059058:web:72def09409841a952d0eab"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- MAPA ---
const map = L.map('map').setView([-38.902, -70.065], 14); // Centro en Zapala
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
let marker;
let selectedCoords = null;

map.on('click', (e) => {
    selectedCoords = e.latlng;
    if (marker) map.removeLayer(marker);
    marker = L.marker(selectedCoords).addTo(map);
});

// --- BUSCADOR POR CÓDIGO ---
document.getElementById('cod-prod').addEventListener('input', async (e) => {
    const codigo = e.target.value;
    if (codigo.length >= 5) {
        const docRef = doc(db, "catalogo", codigo);
        const res = await getDoc(docRef);
        if (res.exists()) {
            const p = res.data();
            document.getElementById('nom-prod').value = p.nombre;
            document.getElementById('pre-prod').value = `$ ${p.precio.toLocaleString()}`;
            document.getElementById('pts-prod').value = `${p.puntos} pts`;
            window.currentProduct = p;
        }
    }
});

// --- GUARDAR VENTA ---
document.getElementById('btn-venta').onclick = async () => {
    const cliente = document.getElementById('cliente').value;
    if (!selectedCoords || !window.currentProduct || !cliente) {
        alert("Por favor: Marcá el mapa, ingresá el código y el nombre del cliente.");
        return;
    }

    await addDoc(collection(db, "ventas"), {
        cliente,
        producto: window.currentProduct.nombre,
        precio: window.currentProduct.precio,
        puntos: window.currentProduct.puntos,
        coords: new GeoPoint(selectedCoords.lat, selectedCoords.lng),
        fecha: new Date()
    });

    alert("¡Venta registrada con éxito!");
    location.reload();
};

// --- IMPORTAR CATÁLOGO (BOTÓN OCULTO) ---
document.getElementById('btn-importar').onclick = async () => {
    if(!confirm("¿Cargar los productos del Ciclo 07?")) return;
    for (const p of catalogoData) {
        await setDoc(doc(db, "catalogo", p.id), p);
    }
    alert("Catálogo cargado correctamente.");
};
