// controllers/authController.js

// 🔑 CORRECCIÓN: Se añade '.js' explícitamente a la ruta de la base de datos.
const db = require('../db.js'); 
const bcrypt = require('bcryptjs');

// Configuración de hashing (para seguridad)
const SALT_ROUNDS = 10; 

// ------------------------------------------------------------------
// 1. REGISTRO (Crear un nuevo usuario)
// ------------------------------------------------------------------
exports.register = async (req, res) => {
    const { username, password, rol } = req.body;

    if (!username || !password || !rol) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: username, password, rol.' });
    }

    try {
        // Verificar si el usuario ya existe
        const [existingUser] = await db.query('SELECT id_usuario FROM usuario WHERE username = ?', [username]);
        if (existingUser.length > 0) {
            return res.status(409).json({ error: 'El nombre de usuario ya está en uso.' });
        }

        // Hashear la contraseña antes de guardarla
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Insertar el nuevo usuario en la base de datos
        const [result] = await db.query(
            'INSERT INTO usuario (username, password, rol) VALUES (?, ?, ?)',
            [username, hashedPassword, rol]
        );

        // Iniciar sesión inmediatamente al registrarse
        req.session.userId = result.insertId;
        req.session.username = username;
        req.session.rol = rol;

        res.status(201).json({ 
            message: 'Registro exitoso y sesión iniciada.',
            userId: result.insertId,
            username: username,
            rol: rol
        });

    } catch (error) {
        console.error('Error durante el registro:', error);
        res.status(500).json({ error: 'Error interno del servidor al registrar el usuario.' });
    }
};

// ------------------------------------------------------------------
// 2. LOGIN (Iniciar Sesión)
// ------------------------------------------------------------------
exports.login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Faltan credenciales: username y password.' });
    }

    try {
        // Buscar usuario por nombre de usuario
        const [users] = await db.query('SELECT id_usuario, password, rol FROM usuario WHERE username = ?', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = users[0];
        
        // Comparar la contraseña hasheada
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Si las credenciales son correctas, crear la sesión
        req.session.userId = user.id_usuario;
        req.session.username = username;
        req.session.rol = user.rol;

        res.json({ 
            message: 'Login exitoso.',
            userId: user.id_usuario,
            username: username,
            rol: user.rol 
        });

    } catch (error) {
        console.error('Error durante el login:', error);
        res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
    }
};

// ------------------------------------------------------------------
// 3. LOGOUT (Cerrar Sesión)
// ------------------------------------------------------------------
exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar la sesión.' });
        }
        // Limpiar la cookie de la sesión
        res.clearCookie('connect.sid'); 
        res.json({ message: 'Sesión cerrada exitosamente.' });
    });
};