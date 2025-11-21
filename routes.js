// routes.js - Lógica de Autenticación, Autorización, CRUD y CHECKOUT

const express = require('express');
const router = express.Router();
const db = require('./db'); 
const util = require('util'); 

// --- MÓDULOS PARA ARCHIVOS ---
const multer = require('multer');
const path = require('path');
const fs = require('fs'); 

// ----------------------------------------------------
// CONFIGURACIÓN DE MULTER
// ----------------------------------------------------

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // ASUME que 'public' está un nivel arriba de 'routes.js'
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads'); 
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath); 
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

module.exports = function() { 

// ----------------------------------------------------
// MIDDLEWARES DE AUTORIZACIÓN 
// ----------------------------------------------------

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'No autorizado. Debe iniciar sesión.' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.userId || req.session.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
    next();
}

router.get('/check-session', (req, res) => {
    res.json({ 
        isLoggedIn: !!req.session.userId, 
        rol: req.session.rol || 'guest',
        username: req.session.username || null 
    });
});

// ----------------------------------------------------
// RUTAS DE AUTENTICACIÓN Y REGISTRO
// ----------------------------------------------------

// LOGIN: Iniciar Sesión 
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (email y password).' });
    }
    
    try {
        // 🚀 CORRECCIÓN CLAVE: Tu PK en 'usuario' es 'id', no 'id_usuario'. 
        // Usamos un alias para sincronizarlo con la variable de sesión 'userId'.
        const sql = 'SELECT id AS id_usuario, rol, password_hash, nombre FROM usuario WHERE email = ?'; 
        const [results] = await db.query(sql, [email]); 
        
        if (results.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }
        
        const user = results[0];
        
        // Comparación simple de contraseña (USAR BCRYPT EN PRODUCCIÓN)
        if (password === user.password_hash) {
            req.session.userId = user.id_usuario;
            req.session.rol = user.rol;
            req.session.username = user.nombre;
            return res.status(200).json({ 
                message: 'Inicio de sesión exitoso.', 
                rol: user.rol 
            });
        } else {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }
    } catch (err) {
        console.error("Error CRÍTICO en login (DB/SQL):", err);
        return res.status(500).json({ error: 'Error interno del servidor. Verifique el log.' });
    }
});

// LOGOUT: Cerrar Sesión
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Error interno del servidor al cerrar sesión.' });
        }
        res.status(200).json({ message: 'Sesión cerrada correctamente.' });
    });
});

// REGISTRO: Crear nueva cuenta (para clientes)
router.post('/register', async (req, res) => {
    const { nombre, email, password } = req.body;
    
    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const sql = 'INSERT INTO usuario (nombre, email, password_hash, rol) VALUES (?, ?, ?, "cliente")';
    try {
        const [result] = await db.query(sql, [nombre, email, password]);
        req.session.userId = result.insertId;
        req.session.rol = 'cliente';
        req.session.username = nombre;
        res.status(201).json({ message: 'Registro exitoso.', rol: 'cliente' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El email ya está registrado.' });
        }
        console.error("Error en registro:", err);
        return res.status(500).json({ error: 'Error al registrar el usuario.' });
    }
});


// ----------------------------------------------------
// RUTAS CRUD DE INVENTARIO (CON MANEJO DE ARCHIVOS)
// ----------------------------------------------------

// READ: Obtener todos los productos (Público para el catálogo)
router.get('/inventario', async (req, res) => {
    const sql = 'SELECT id_producto, nombre, descripcion, precio, stock, imagen_url FROM producto';
    try {
        const [results] = await db.query(sql);
        res.status(200).json(results);
    } catch (err) {
        console.error('Error al obtener inventario:', err);
        return res.status(500).json({ error: 'Error interno del servidor al obtener datos.' });
    }
});

const deleteFile = (filePath) => {
    // 🚀 CORRECCIÓN: Usar path.resolve con '..' para asegurar la ruta correcta de la carpeta public/uploads
    const absolutePath = path.resolve(__dirname, '..', 'public', filePath.replace('/uploads/', 'uploads/')); 
    
    if (filePath && filePath.startsWith('/uploads/') && fs.existsSync(absolutePath)) {
        try {
            fs.unlinkSync(absolutePath);
        } catch (unlinkError) {
            console.warn(`Advertencia: No se pudo borrar la imagen en ${absolutePath}`, unlinkError);
        }
    }
};


// CREATE: Crear nuevo producto (Requiere Admin)
router.post('/inventario', requireAdmin, upload.single('imagen_file'), async (req, res) => {
    
    const uploadedImagePath = req.file ? `/uploads/${req.file.filename}` : null;
    const final_imagen_url = uploadedImagePath || req.body.imagen_url || null; 

    const { nombre, descripcion, precio, stock } = req.body;
    
    if (!nombre || !precio || !stock || isNaN(precio) || isNaN(stock) || parseFloat(precio) <= 0 || parseInt(stock) < 0) {
        if (uploadedImagePath) { deleteFile(uploadedImagePath); }
        return res.status(400).json({ error: 'Datos de producto inválidos.', mensaje: 'El nombre, precio y stock son obligatorios y deben ser válidos.' });
    }

    const nuevoPan = { nombre, descripcion, precio, stock, imagen_url: final_imagen_url };
    const sql = 'INSERT INTO producto (nombre, descripcion, precio, stock, imagen_url) VALUES (?, ?, ?, ?, ?)';

    try {
        const values = [nuevoPan.nombre, nuevoPan.descripcion, nuevoPan.precio, nuevoPan.stock, nuevoPan.imagen_url];
        const [result] = await db.query(sql, values);
        res.status(201).json({ 
            message: 'Producto creado exitosamente.', 
            id_producto: result.insertId, 
            imagen_url: final_imagen_url 
        });
    } catch (err) {
        console.error('Error al registrar el producto:', err);
        if (uploadedImagePath) { deleteFile(uploadedImagePath); }
        return res.status(500).json({ error: 'Error al registrar el producto.' });
    }
});

// UPDATE: Actualizar producto (Requiere Admin)
router.put('/inventario/:id', requireAdmin, upload.single('imagen_file'), async (req, res) => {
    const id = req.params.id;
    const { nombre, descripcion, precio, stock, imagen_url_actual } = req.body; 
    
    let imagen_url_to_save = imagen_url_actual || null; 
    let oldImagePathToDelete = null; 

    if (req.file) {
        imagen_url_to_save = `/uploads/${req.file.filename}`;
        if (imagen_url_actual && imagen_url_actual.startsWith('/uploads/')) {
            oldImagePathToDelete = imagen_url_actual;
        }
    } 

    if (!nombre || !precio || !stock) {
        if (req.file) { deleteFile(imagen_url_to_save); }
        return res.status(400).json({ error: 'Datos incompletos para actualizar.' });
    }

    const sql = 'UPDATE producto SET nombre = ?, descripcion = ?, precio = ?, stock = ?, imagen_url = ? WHERE id_producto = ?';
    const values = [nombre, descripcion, precio, stock, imagen_url_to_save, id];

    try {
        const [result] = await db.query(sql, values);
        if (result.affectedRows === 0) {
            if (req.file) { deleteFile(imagen_url_to_save); }
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }
        
        if (req.file && oldImagePathToDelete) {
             deleteFile(oldImagePathToDelete);
        }
        
        res.status(200).json({ message: 'Producto actualizado exitosamente.', imagen_url: imagen_url_to_save });
    } catch (err) {
        console.error('Error al actualizar el producto:', err);
        if (req.file) { deleteFile(imagen_url_to_save); }
        return res.status(500).json({ error: 'Error al actualizar el producto.' });
    }
});

// DELETE: Eliminar producto (Requiere Admin) - Borra la imagen física
router.delete('/inventario/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    
    let imagen_url = null;

    try {
        const [producto] = await db.query('SELECT imagen_url FROM producto WHERE id_producto = ?', [id]);
        if (producto.length > 0) {
            imagen_url = producto[0].imagen_url;
        }
    } catch (error) {
        console.error('Advertencia: Error al obtener URL de imagen antes de eliminar:', error);
    }
    
    const sql = 'DELETE FROM producto WHERE id_producto = ?';
    try {
        const [result] = await db.query(sql, [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado para eliminar.' });
        }
        
        if (imagen_url) {
            deleteFile(imagen_url);
        }
        
        res.status(200).json({ message: 'Producto eliminado exitosamente.' });
    } catch (err) {
        return res.status(500).json({ error: 'Error al eliminar producto.' });
    }
});


// ----------------------------------------------------
// RUTAS DEL CARRITO DE COMPRAS 
// ----------------------------------------------------

// 1. READ: Obtener el contenido del carrito del usuario (incluye stock)
router.get('/carrito', requireAuth, async (req, res) => {
    // ⚠️ Esta ruta requiere que la columna 'id_usuario' exista en la tabla 'carrito'.
    const userId = req.session.userId;
    const sql = `
        SELECT c.id_carrito, c.cantidad, p.id_producto, p.nombre, p.precio, p.imagen_url, p.stock
        FROM carrito c
        JOIN producto p ON c.id_producto = p.id_producto
        WHERE c.id_usuario = ?
    `;
    try {
        const [results] = await db.query(sql, [userId]);
        res.status(200).json(results);
    } catch (err) {
        console.error("Error en /carrito (READ):", err);
        return res.status(500).json({ error: 'Error al cargar el carrito. (Verifique la columna id_usuario en carrito).' });
    }
});

// 2. ADD: Agregar un producto al carrito 
router.post('/carrito/add', requireAuth, async (req, res) => {
    // ⚠️ Esta ruta requiere que la columna 'id_usuario' exista en la tabla 'carrito'.
    const { id_producto, cantidad } = req.body;
    const userId = req.session.userId;
    const qty = parseInt(cantidad) || 1; 

    if (qty <= 0 || !id_producto) {
        return res.status(400).json({ error: 'Cantidad o producto inválido.' });
    }

    const sql = `
        INSERT INTO carrito (id_usuario, id_producto, cantidad) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE cantidad = cantidad + ?;
    `;
    try {
        await db.query(sql, [userId, id_producto, qty, qty]);
        res.status(200).json({ message: 'Producto agregado al carrito.' });
    } catch (err) {
        console.error("Error en /carrito/add:", err);
        return res.status(500).json({ error: 'Error al agregar el producto al carrito. (Verifique id_producto/id_usuario en carrito).' });
    }
});

// 3. REMOVE: Eliminar un ítem del carrito (por id_carrito)
router.delete('/carrito/:id_carrito', requireAuth, async (req, res) => {
    // ⚠️ Esta ruta requiere que la columna 'id_usuario' exista en la tabla 'carrito'.
    const { id_carrito } = req.params;
    const userId = req.session.userId;
    
    const sql = 'DELETE FROM carrito WHERE id_carrito = ? AND id_usuario = ?';
    try {
        const [result] = await db.query(sql, [id_carrito, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ítem no encontrado o no pertenece al usuario.' });
        }
        res.status(200).json({ message: 'Ítem eliminado del carrito.' });
    } catch (err) {
        return res.status(500).json({ error: 'Error al eliminar del carrito.' });
    }
});

// 4. CHECKOUT: Finalizar el Pedido y Descontar Stock (TRANSACCIÓN)
router.post('/carrito/checkout', requireAuth, (req, res) => {
    // ⚠️ Esta ruta requiere que la columna 'id_usuario' exista en la tabla 'carrito'.
    const userId = req.session.userId;
    
    db.getConnection(async (err, connection) => {
        if (err) {
            console.error('Error al obtener conexión para transacción:', err);
            return res.status(500).json({ error: 'Error interno del servidor.' });
        }

        const executeQuery = util.promisify(connection.query).bind(connection);

        try {
            await executeQuery('BEGIN'); 

            // A. Obtener ítems del carrito (con stock actual)
            const [items] = await executeQuery(`
                SELECT c.id_producto, c.cantidad, p.precio, p.stock
                FROM carrito c
                JOIN producto p ON c.id_producto = p.id_producto
                WHERE c.id_usuario = ?
            `, [userId]);

            if (items.length === 0) {
                connection.release();
                return res.status(400).json({ error: 'El carrito está vacío.' });
            }

            let total = 0;
            const stockUpdatePromises = [];
            
            // B. Verificar Stock y preparar consultas de descuento
            for (const item of items) {
                if (item.cantidad > item.stock) { 
                    await executeQuery('ROLLBACK'); 
                    connection.release();
                    return res.status(400).json({ error: `Stock insuficiente para el producto ID ${item.id_producto}. Solo hay ${item.stock}.` });
                }

                total += item.precio * item.cantidad;

                // Query para descontar stock
                stockUpdatePromises.push(executeQuery(
                    'UPDATE producto SET stock = stock - ? WHERE id_producto = ?',
                    [item.cantidad, item.id_producto]
                ));
            }

            // C. Ejecutar todas las actualizaciones de stock
            await Promise.all(stockUpdatePromises); 
            
            // D. Insertar en tabla de Pedido (Encabezado)
            const [orderHeader] = await executeQuery(
                'INSERT INTO pedido (id_usuario, fecha_pedido, total, estado) VALUES (?, NOW(), ?, "pendiente")',
                [userId, total]
            );
            const orderId = orderHeader.insertId;

            // E. Insertar en Detalle de Pedido (Líneas)
            const detailPromises = [];
            for (const item of items) {
                detailPromises.push(executeQuery(
                    'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
                    [orderId, item.id_producto, item.cantidad, item.precio]
                ));
            }
            await Promise.all(detailPromises);

            // F. Vaciar el Carrito
            await executeQuery('DELETE FROM carrito WHERE id_usuario = ?', [userId]);

            await executeQuery('COMMIT'); 
            connection.release();
            
            res.status(200).json({ message: `Pedido #${orderId} finalizado y stock descontado exitosamente.`, orderId });

        } catch (error) {
            await executeQuery('ROLLBACK'); 
            connection.release();
            console.error('Error en la transacción de Checkout:', error);
            res.status(500).json({ error: 'Error interno al procesar la compra. Los cambios han sido revertidos.' });
        }
    });
});

    // DEVOLVEMOS EL OBJETO router
    return router;
};