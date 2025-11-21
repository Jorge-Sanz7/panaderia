// public/js/script.js - Lógica del Front-end con Autenticación, Carrito y Roles

const API_BASE_URL_INVENTARIO = '/api/inventario';
const API_BASE_URL_CARRITO = '/api/carrito';
const API_BASE_URL_AUTH = '/api';

let globalUserRole = 'guest'; // 'admin', 'cliente', o 'guest'
let globalUsername = null;
let productoModalInstance = null; // Para manejar el modal de CRUD (Inventario)
let loginRegisterModalInstance = null; // Para manejar el modal de Login/Registro

// URL de imagen de reserva (Placeholder de pan)
const DEFAULT_IMAGE_URL = 'https://placehold.co/200x150/f0e68c/333?text=Pan+No+Disponible';

// -----------------------------------------------------------------
// FUNCIÓN INICIAL: Verificar Sesión y Redirigir
// -----------------------------------------------------------------
async function checkAndSetRole() {
    try {
        const response = await fetch(API_BASE_URL_AUTH + '/check-session');
        const data = await response.json();
        
        globalUserRole = data.rol || 'guest';
        globalUsername = data.username || null;
        
        // Redirección de ADMINISTRADOR (no puede estar en el catálogo)
        if (window.location.pathname.endsWith('index.html') && globalUserRole === 'admin') {
            window.location.href = 'inventario.html';
            return;
        }

        // Redirección de CLIENTE (si intenta ir a la gestión de inventario)
        if (window.location.pathname.endsWith('inventario.html') && globalUserRole !== 'admin') {
            console.warn('Acceso denegado. Solo administradores pueden ver el inventario.');
            window.location.href = 'index.html';
            return;
        }
        
        updateNavbar(); // Actualiza el menú de navegación
        
    } catch (error) {
        // Esto puede suceder si el servidor no responde al /check-session.
        console.error('Error al verificar sesión (Servidor caído o de red):', error);
        // Si hay un error, el rol se mantiene como 'guest' (por defecto)
    }
}

// Actualiza el menú de navegación con botones según el rol
function updateNavbar() {
    const navActions = document.getElementById('nav-actions');
    if (!navActions) return;

    let html = '';

    if (globalUserRole === 'admin') {
        html = `
            <li class="nav-item"><span class="navbar-text me-3 text-warning">Admin: ${globalUsername}</span></li>
            <li class="nav-item"><a class="nav-link" href="inventario.html">Gestión de Inventario</a></li>
            <li class="nav-item"><button class="btn btn-sm btn-outline-light ms-2" id="logout-btn">Cerrar Sesión</button></li>
        `;
    } else if (globalUserRole === 'cliente') {
        html = `
            <li class="nav-item"><span class="navbar-text me-3">Hola, ${globalUsername}</span></li>
            <li class="nav-item"><button class="btn btn-sm btn-warning me-2" data-bs-toggle="modal" data-bs-target="#carritoModal" onclick="cargarCarrito()">🛒 Carrito</button></li>
            <li class="nav-item"><button class="btn btn-sm btn-outline-light" id="logout-btn">Cerrar Sesión</button></li>
        `;
    } else { // Invitado (Guest)
        html = `
            <li class="nav-item"><button class="btn btn-sm btn-success" data-bs-toggle="modal" data-bs-target="#loginRegisterModal">Ingresar / Registrarme</button></li>
        `;
    }

    navActions.innerHTML = html;
    
    // Asocia el evento de logout después de crear el botón
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
}

async function handleLogout() {
    try {
        await fetch(API_BASE_URL_AUTH + '/logout', { method: 'POST' });
        globalUserRole = 'guest';
        globalUsername = null;
        window.location.reload(); // Recarga la página y el rol
    } catch (e) {
        console.error('Error al cerrar sesión:', e);
    }
}

// -----------------------------------------------------------------
// LÓGICA DE AUTENTICACIÓN (LOGIN / REGISTER)
// -----------------------------------------------------------------

function setupAuthForms() {
    // Función auxiliar para limpiar mensajes de error
    const clearAuthError = () => {
        const errorDiv = document.getElementById('auth-error-message');
        if (errorDiv) errorDiv.innerText = '';
    };

    // 1. LOGIN
    document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearAuthError();
        await handleAuthRequest('/login', new FormData(this));
    });

    // 2. REGISTER
    document.getElementById('registerForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        clearAuthError();
        await handleAuthRequest('/register', new FormData(this));
    });
}

/**
 * Muestra un error en el modal de autenticación.
 * @param {string} message 
 */
function displayAuthError(message) {
    const errorDiv = document.getElementById('auth-error-message');
    if (errorDiv) {
        errorDiv.innerText = `Error: ${message}`;
        errorDiv.classList.add('text-danger', 'mt-3');
    }
}

async function handleAuthRequest(endpoint, formData) {
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch(API_BASE_URL_AUTH + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            console.log(`¡${result.message}! Redirigiendo...`);
            // Se oculta el modal si existe antes de la recarga
            loginRegisterModalInstance?.hide(); 
            // Recarga la página para que checkAndSetRole haga la redirección
            window.location.reload(); 
        } else {
            console.error(`Error ${response.status}: ${result.error}`);
            displayAuthError(result.error || 'Credenciales inválidas o error de servidor.');
        }
    } catch (error) {
        console.error('Error de red durante la autenticación:', error);
        displayAuthError('Error de conexión con el servidor.');
    }
}

// -----------------------------------------------------------------
// LÓGICA DE INVENTARIO (ADMIN: CRUD y READ)
// -----------------------------------------------------------------

// READ: Carga la tabla de inventario (Solo para Admin)
async function cargarInventario() {
    if (!document.getElementById('inventario-body')) return; // Solo si estamos en inventario.html

    await checkAndSetRole();
    if (globalUserRole !== 'admin') return; 

    try {
        const response = await fetch(API_BASE_URL_INVENTARIO);
        const data = await response.json();
        
        const tbody = document.getElementById('inventario-body');
        tbody.innerHTML = ''; 

        data.forEach(pan => {
            // Uso de DEFAULT_IMAGE_URL como fallback si la URL del producto es null o 'undefined'
            const imageUrl = pan.imagen_url && pan.imagen_url !== 'undefined' ? pan.imagen_url : DEFAULT_IMAGE_URL;

            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${pan.id_producto}</td>
                <td>
                    <img 
                        src="${imageUrl}" 
                        alt="${pan.nombre}" 
                        style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;"
                        onerror="this.onerror=null; this.src='${DEFAULT_IMAGE_URL}'" 
                    >
                </td>
                <td>${pan.nombre}</td>
                <td>${pan.stock}</td>
                <td>$${parseFloat(pan.precio).toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="abrirModalEdicion(${pan.id_producto}, '${pan.nombre}', ${pan.stock}, ${pan.precio}, '${pan.imagen_url}', '${pan.descripcion}')">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarProducto(${pan.id_producto})">Eliminar</button>
                </td>
            `;
        });
    } catch (error) {
        console.error('Error al cargar el inventario:', error);
    }
}

// CREATE / UPDATE: Manejar el formulario CRUD
function setupCrudForm() {
    document.getElementById('productoForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();

        const id = document.getElementById('producto-id').value;
        const data = {
            nombre: document.getElementById('nombre').value,
            stock: parseInt(document.getElementById('stock').value),
            precio: parseFloat(document.getElementById('precio').value),
            imagen_url: document.getElementById('imagen_url').value,
            descripcion: document.getElementById('descripcion').value
        };

        if (!validarDatosFormulario(data)) return; 
        
        let url = API_BASE_URL_INVENTARIO;
        let method = 'POST';

        if (id) { // Si hay ID, es una actualización (UPDATE)
            url = `${API_BASE_URL_INVENTARIO}/${id}`;
            method = 'PUT';
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                console.log(result.message);
                // Usa la instancia global del modal
                productoModalInstance?.hide(); 
                resetForm();
                cargarInventario(); 
            } else {
                console.error(`Error ${response.status}: ${result.error || 'Ocurrió un error.'}`);
                // Aquí se debería mostrar un mensaje de error en el DOM para el usuario.
            }

        } catch (error) {
            console.error('Error de conexión con el servidor (CRUD):', error);
        }
    });
}

// DELETE: Eliminar un producto (reemplazando window.confirm con una confirmación simulada)
async function eliminarProducto(id) {
    // --- REEMPLAZO DE window.confirm() con una confirmación simulada (log) ---
    // En una aplicación real, aquí se llamaría a un modal custom antes de proceder.
    const confirmed = await new Promise(resolve => {
        console.log(`[Confirmación simulada para DELETE] ¿Desea eliminar el producto ${id}? (Asumiendo SI)`);
        resolve(true); 
    });

    if (!confirmed) {
        console.log('Eliminación cancelada.');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL_INVENTARIO}/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok) {
            console.log(result.message);
            cargarInventario(); 
        } else {
            console.error(`Error ${response.status}: ${result.error || 'Ocurrió un error.'}`);
        }
    } catch (error) {
        console.error('Error de conexión con el servidor (DELETE):', error);
    }
}

// -----------------------------------------------------------------
// LÓGICA DE CATÁLOGO (CLIENTE / GUEST: READ y Carrito)
// -----------------------------------------------------------------

// READ: Carga el catálogo de productos (Solo para Cliente/Guest)
async function cargarCatalogo() {
    if (!document.getElementById('galeria-panes')) return; // Solo si estamos en index.html

    await checkAndSetRole();
    if (globalUserRole === 'admin') return; 

    try {
        const response = await fetch(API_BASE_URL_INVENTARIO);
        const panes = await response.json();
        const galeria = document.getElementById('galeria-panes');
        galeria.innerHTML = '';

        panes.forEach(pan => {
            let actionButton;
            // Deshabilita el botón si no hay stock
            const stockDisponible = pan.stock > 0;
            const disabledAttr = stockDisponible ? '' : 'disabled';
            const stockMessage = stockDisponible ? '' : ' (AGOTADO)';
            
            // Uso de DEFAULT_IMAGE_URL como fallback si la URL del producto es null o 'undefined'
            const imageUrl = pan.imagen_url && pan.imagen_url !== 'undefined' ? pan.imagen_url : DEFAULT_IMAGE_URL;


            if (globalUserRole === 'cliente') {
                // Se ajusta la llamada a una función sin parámetros para simular la cantidad
                actionButton = `<button class="btn btn-primary" onclick="handleAgregarAlCarrito(${pan.id_producto})" ${disabledAttr}>🛒 Agregar al Carrito ${stockMessage}</button>`;
            } else {
                actionButton = `<button class="btn btn-secondary" data-bs-toggle="modal" data-bs-target="#loginRegisterModal">Iniciar Sesión para Comprar</button>`;
            }
            
            const cardHtml = `
                <div class="col">
                    <div class="card h-100 shadow">
                        <img 
                            src="${imageUrl}" 
                            class="card-img-top" 
                            alt="${pan.nombre}" 
                            style="height: 200px; object-fit: cover; border-radius: 5px;"
                            onerror="this.onerror=null; this.src='${DEFAULT_IMAGE_URL}'" 
                        >
                        <div class="card-body">
                            <h5 class="card-title">${pan.nombre}</h5>
                            <p class="card-text">${pan.descripcion || '¡Delicioso pan de temporada!'}</p>
                            <p class="card-text text-success fw-bold fs-5">$${parseFloat(pan.precio).toFixed(2)}</p>
                            <p class="card-text ${stockDisponible ? 'text-muted' : 'text-danger fw-bold'}">Stock: ${pan.stock}</p>
                            ${actionButton}
                        </div>
                    </div>
                </div>
            `;
            galeria.innerHTML += cardHtml;
        });
    } catch (error) {
        console.error('Error al cargar el catálogo:', error);
    }
}

// Función auxiliar para manejar la lógica de agregar al carrito (reemplazo de prompt)
async function handleAgregarAlCarrito(id_producto) {
    // --- REEMPLAZO DE prompt() con una entrada simulada (valor por defecto 1) ---
    // En una aplicación real, se usaría un modal para pedir la cantidad.
    const cantidad = 1; // Valor predeterminado para simular la entrada del usuario

    // La función agregarAlCarrito ya tiene la validación de cantidad
    await agregarAlCarrito(id_producto, cantidad);
}

// Lógica para agregar al carrito (Solo Clientes)
async function agregarAlCarrito(id_producto, cantidad) {
    if (globalUserRole !== 'cliente') {
        console.warn("Debes iniciar sesión como cliente para agregar productos.");
        return;
    }
    
    // Validación de la cantidad
    if (isNaN(cantidad) || cantidad <= 0 || !Number.isInteger(cantidad)) {
        console.error("Cantidad inválida (simulada).");
        return;
    }
    
    try {
        const response = await fetch(API_BASE_URL_CARRITO + '/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_producto: id_producto, cantidad: cantidad }) 
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`¡${cantidad} unidad(es) de producto agregado(s) al carrito!`);
            // Se asume que el modal de carrito se abrirá después de esta acción 
            // o se recargará si ya está abierto.
            cargarCarrito(); 
            // Se añade recarga del catálogo para reflejar inmediatamente el cambio de stock
            cargarCatalogo(); 
        } else {
            console.error(`Error al agregar al carrito: ${result.error}`);
            // Aquí se debería mostrar un mensaje de error en el DOM para el usuario.
        }
    } catch (error) {
        console.error('Error de conexión al carrito:', error);
    }
}

/**
 * Carga el contenido del carrito en el modal.
 */
async function cargarCarrito() {
    if (globalUserRole !== 'cliente') return;
    
    try {
        const response = await fetch(API_BASE_URL_CARRITO);
        const items = await response.json(); 
        const carritoBody = document.getElementById('carrito-body');
        if (!carritoBody) return;

        carritoBody.innerHTML = '';
        let total = 0;
        let isStockOk = true; // Flag global para deshabilitar el checkout

        items.forEach(item => {
            const subtotal = item.precio * item.cantidad;
            total += subtotal;
            
            let stockWarning = '';
            // Validación de stock en el Front-end
            const itemHasStockIssue = item.cantidad > item.stock; // Flag local para el estilo de la fila
            
            if (itemHasStockIssue) { 
                stockWarning = `🚨 (Solo ${item.stock} en stock!)`;
                isStockOk = false; // El problema de stock afecta el botón de checkout
            }

            const row = `
                <tr class="${itemHasStockIssue ? 'table-danger' : ''}"> 
                    <td>${item.nombre} ${stockWarning}</td>
                    <td>${item.cantidad}</td>
                    <td>$${parseFloat(item.precio).toFixed(2)}</td>
                    <td>$${subtotal.toFixed(2)}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="eliminarItemCarrito(${item.id_carrito})">X</button></td>
                </tr>
            `;
            carritoBody.innerHTML += row;
        });

        document.getElementById('carrito-total').innerText = total.toFixed(2);
        
        // Habilitar/Deshabilitar el botón de checkout
        const checkoutBtn = document.getElementById('checkout-btn');
        const checkoutMsg = document.getElementById('checkout-msg');
        
        if (checkoutBtn && checkoutMsg) {
            // Deshabilita si el carrito está vacío o si hay problemas de stock
            checkoutBtn.disabled = !isStockOk || items.length === 0; 
            
            if (!isStockOk) {
                checkoutMsg.innerText = "❌ Hay productos con stock insuficiente. Por favor, ajusta las cantidades.";
            } else if (items.length === 0) {
                checkoutMsg.innerText = "El carrito está vacío.";
            } else {
                checkoutMsg.innerText = "Continúa para finalizar tu pedido.";
            }
        }
    } catch (error) {
        console.error('Error al cargar el carrito:', error);
    }
}

// Elimina un ítem del carrito (reemplazando window.confirm con una confirmación simulada)
async function eliminarItemCarrito(id_carrito) {
    // --- REEMPLAZO DE window.confirm() con una confirmación simulada (log) ---
    // En una aplicación real, aquí se llamaría a un modal custom antes de proceder.
    const confirmed = await new Promise(resolve => {
        console.log(`[Confirmación simulada para DELETE] ¿Desea eliminar el ítem ${id_carrito} del carrito? (Asumiendo SI)`);
        resolve(true); 
    });

    if (!confirmed) {
        console.log('Eliminación cancelada.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL_CARRITO}/${id_carrito}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            console.log('Ítem eliminado.');
            cargarCarrito(); // Recarga el modal
        } else {
            const result = await response.json();
            console.error(`Error al eliminar: ${result.error}`);
        }
    } catch (error) {
        console.error('Error de conexión al eliminar ítem:', error);
    }
}

// NUEVA FUNCIÓN: Finalizar el Pedido (llama a la nueva ruta de checkout)
async function finalizarPedido() {
    // Se añade esta validación para evitar enviar la petición si el botón está visiblemente deshabilitado
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn && checkoutBtn.disabled) {
        console.warn("Intento de checkout con carrito inválido o vacío.");
        return;
    }
    
    // --- REEMPLAZO DE window.confirm() con una confirmación simulada (log) ---
    // En una aplicación real, aquí se llamaría a un modal custom antes de proceder.
    const confirmed = await new Promise(resolve => {
        console.log('[Confirmación simulada para CHECKOUT] ¿Desea finalizar el pedido? (Asumiendo SI)');
        resolve(true); 
    });

    if (!confirmed) {
        console.log('Finalización de pedido cancelada.');
        return;
    }

    try {
        const response = await fetch(API_BASE_URL_CARRITO + '/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok) {
            console.log(`🎉 ${result.message}`);
            
            // Cierra el modal y actualiza el carrito y catálogo
            const modalElement = document.getElementById('carritoModal');
            // Usar getInstance() para obtener la instancia existente si está abierto
            const modal = bootstrap.Modal.getInstance(modalElement); 
            if (modal) modal.hide();
            
            // Recargar el catálogo y el carrito (el carrito quedará vacío)
            cargarCarrito(); 
            cargarCatalogo(); 
            
        } else if (response.status === 400) {
            // Error de negocio: stock insuficiente o carrito vacío
            console.error(`¡Error en el pedido! ${result.error}`);
            // Mostrar error y recargar el carrito para reflejar el estado actual (e.g., stock insuficiente)
            cargarCarrito(); 
        } else {
            // Error de servidor
            console.error(`Error ${response.status}: ${result.error || 'No se pudo completar la compra.'}`);
        }
    } catch (error) {
        console.error('Error al procesar el pedido:', error);
    }
}


// -----------------------------------------------------------------
// UTILIDADES Y SETUP
// -----------------------------------------------------------------

// VALIDACIÓN FRONT-END 
function validarDatosFormulario(data) {
    let isValid = true;

    if (!data.nombre || data.nombre.trim() === "") {
        console.error("El nombre del pan es obligatorio.");
        isValid = false;
    }
    if (isNaN(data.stock) || parseInt(data.stock) < 0 || !Number.isInteger(data.stock)) {
        console.error("El stock debe ser un número entero positivo o cero.");
        isValid = false;
    }
    if (isNaN(data.precio) || parseFloat(data.precio) <= 0) {
        console.error("El precio debe ser un número mayor a cero.");
        isValid = false;
    }

    // Se recomienda mostrar los errores de validación en el DOM cerca del formulario
    // Por ahora, se mantiene el log en consola.
    return isValid;
}

// Para editar: llena el modal con datos existentes
function abrirModalEdicion(id, nombre, stock, precio, imagen_url, descripcion) {
    document.getElementById('producto-id').value = id;
    document.getElementById('nombre').value = nombre;
    document.getElementById('stock').value = stock;
    document.getElementById('precio').value = precio;
    // Limpia si es 'undefined'
    document.getElementById('imagen_url').value = imagen_url === 'undefined' ? '' : imagen_url;
    document.getElementById('descripcion').value = descripcion === 'undefined' ? '' : descripcion;
    document.getElementById('productoModalLabel').innerText = 'Editar Producto';

    productoModalInstance?.show();
}

// Limpia el modal para una nueva creación
function resetForm() {
    document.getElementById('productoForm').reset();
    document.getElementById('producto-id').value = '';
    document.getElementById('productoModalLabel').innerText = 'Formulario de Producto';
}


// -----------------------------------------------------------------
// INICIALIZACIÓN DE LA PÁGINA
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa la instancia del modal CRUD (Inventario)
    const crudModalElement = document.getElementById('productoModal');
    if (crudModalElement) {
        productoModalInstance = new bootstrap.Modal(crudModalElement);
    }
    
    // Inicializa la instancia del modal de Login/Register
    const authModalElement = document.getElementById('loginRegisterModal');
    if (authModalElement) {
        loginRegisterModalInstance = new bootstrap.Modal(authModalElement);
    }

    // Configura los formularios de sesión (Login/Registro)
    setupAuthForms();
    
    // Configura el formulario CRUD (Inventario)
    setupCrudForm();

    // Asocia el evento de click al botón de finalizar pedido
    document.getElementById('checkout-btn')?.addEventListener('click', finalizarPedido);

    // Llama a la función de carga correcta al inicio.
    const currentPath = window.location.pathname;

    if (currentPath === '/' || currentPath.endsWith('index.html')) {
        cargarCatalogo(); // Para Clientes/Guests
    } else if (currentPath.endsWith('inventario.html')) {
        cargarInventario(); // Para Admin
    }
});