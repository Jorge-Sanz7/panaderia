// Nuevo archivo: server.js
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const db = require('./db'); // Importa la conexión a la base de datos
const apiRoutes = require('./routes')(); // Importa las rutas de la API
const path = require('path');

const app = express();
const PORT = 3000; // Puedes cambiar el puerto si es necesario

// --------------------------------------------------------------------
// 1. CONFIGURACIÓN DE MIDDLEWARES
// --------------------------------------------------------------------

// Sirve archivos estáticos de la carpeta 'public' (aquí debe ir tu HTML, CSS y el JS de cliente)
// **¡IMPORTANTE!** Mueve tu archivo de cliente 'server.js' a una subcarpeta 'public/js/' y renómbralo.
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de Sesión
app.use(session({
    secret: 'TuClaveSecretaMuyLarga', // ⚠️ ¡Cámbiala por una cadena aleatoria y muy larga!
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Cambiar a true si usas HTTPS (recomendado en producción)
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));

// --------------------------------------------------------------------
// 2. MONTAJE DE RUTAS
// --------------------------------------------------------------------

// Todas las rutas definidas en routes.js se montan bajo el prefijo /api
app.use('/api', apiRoutes);

// --------------------------------------------------------------------
// 3. RUTA POR DEFECTO Y ARRANQUE
// --------------------------------------------------------------------

// Si el usuario va a la raíz, sirve el index.html (asumiendo que está en /public)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicio del servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Express escuchando en http://localhost:${PORT}`);
    console.log('¡Ahora sí está corriendo el backend!');
});