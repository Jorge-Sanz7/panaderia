// db.js (Usando Pool de Conexiones con mysql2)

// 🔑 CORRECCIÓN #1: Se usa 'mysql2' para evitar el error de Módulos ES
const mysql = require('mysql2'); 
const util = require('util'); 

// IMPORTANTE: En producción, estos valores deben cargarse desde variables de entorno (process.env)
const pool = mysql.createPool({
    connectionLimit: 10, // Número máximo de conexiones simultáneas
    host: 'localhost',
    user: 'root',
    password: 'n0m3l0', // ¡Cambia esta contraseña!
    database: 'panaderia_db' 
    
});

// Probar la conexión al inicio y detener el proceso en caso de error CRÍTICO
pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('ERROR CRÍTICO: La conexión a la base de datos se perdió.');
        } else if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('ERROR CRÍTICO: La base de datos tiene demasiadas conexiones.');
        } else if (err.code === 'ECONNREFUSED') {
            console.error('ERROR CRÍTICO: Conexión a la base de datos rechazada. ¿Está corriendo MySQL/MariaDB?');
        } else if (err.code === 'ER_BAD_DB_ERROR') {
            console.error('ERROR CRÍTICO: La base de datos "panaderia" no existe (o el nombre es incorrecto).'); 
        } else {
            console.error('ERROR CRÍTICO DE CONEXIÓN:', err);
        }
        process.exit(1); 
    }
    
    if (connection) connection.release();
    console.log('✅ Pool de conexiones MySQL creado y conectado a panaderia.');
});

// Promisificar pool.query para usar async/await
pool.query = util.promisify(pool.query);

// Exportamos el pool con el método query promisificado
module.exports = pool;