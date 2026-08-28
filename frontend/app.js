// CodeGuardian Failure Lab — Frontend Commerce Application
// Dynamic configuration & REST API client

const CONFIG_KEY_GATEWAY = 'cg_gateway_url';
const CONFIG_KEY_CODEGUARDIAN = 'cg_app_url';

// Window Configuration Support
const windowConfig = window.CONFIG || {};

// Default URLs
let gatewayUrl = windowConfig.API_BASE_URL || localStorage.getItem(CONFIG_KEY_GATEWAY) || 'http://localhost:8080';
let codeGuardianUrl = windowConfig.CODEGUARDIAN_URL || localStorage.getItem(CONFIG_KEY_CODEGUARDIAN) || 'http://localhost:5173';

// URL params override
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('backend')) {
    gatewayUrl = urlParams.get('backend');
}
if (urlParams.has('codeguardian')) {
    codeGuardianUrl = urlParams.get('codeguardian');
}

// In-Memory State
let products = [];
let cart = [];
let lastFailurePayload = null;

// DOM Elements
const healthDot = document.getElementById('health-dot');
const healthText = document.getElementById('health-text');
const productsGrid = document.getElementById('products-grid');
const searchInput = document.getElementById('product-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const ordersTbody = document.getElementById('orders-tbody');
const cartDrawer = document.getElementById('cart-drawer');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartCountBadge = document.getElementById('cart-count-badge');
const cartSubtotal = document.getElementById('cart-subtotal');
const cartTotal = document.getElementById('cart-total');
const cartToggleBtn = document.getElementById('cart-toggle-btn');
const cartCloseBtn = document.getElementById('cart-close-btn');

// Config Elements
const configModal = document.getElementById('config-modal');
const configBtn = document.getElementById('config-btn');
const configCloseBtn = document.getElementById('config-close-btn');
const gatewayUrlInput = document.getElementById('gateway-url-input');
const codeguardianUrlInput = document.getElementById('codeguardian-url-input');

// Failure Modal Elements
const failureModal = document.getElementById('failure-modal');
const failureHttpStatus = document.getElementById('failure-http-status');
const failureErrorCode = document.getElementById('failure-error-code');
const failureReqId = document.getElementById('failure-req-id');
const failureMessage = document.getElementById('failure-message');
const techDetailsContent = document.getElementById('tech-details-content');
const techAccordionIcon = document.getElementById('tech-accordion-icon');

// Success Modal Elements
const successModal = document.getElementById('success-modal');
const successOrderNum = document.getElementById('success-order-num');
const successCorrId = document.getElementById('success-corr-id');

// Toast
const toast = document.getElementById('toast');

// API Helper
async function apiFetch(path, options = {}) {
    const cleanBase = gatewayUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${cleanBase}${cleanPath}`;

    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    try {
        const res = await fetch(url, { ...options, headers });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { rawText: text };
        }
        return {
            ok: res.ok,
            status: res.status,
            requestId: res.headers.get('X-Request-ID') || data.requestId || 'req-unknown',
            data: data
        };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            requestId: 'req-network-error',
            data: {
                message: 'Failed to reach API Gateway: ' + err.message,
                errorCode: 'GATEWAY_UNREACHABLE'
            }
        };
    }
}

// Toast Helper
function showToast(msg, duration = 3000) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('visible');
    setTimeout(() => {
        toast.classList.remove('visible');
        toast.classList.add('hidden');
    }, duration);
}

// Check Backend Health
async function checkHealth() {
    if (!healthDot || !healthText) return;
    const res = await apiFetch('/health');
    if (res.ok && res.data && (res.data.status === 'UP' || res.data.status === 'HEALTHY')) {
        healthDot.className = 'health-dot online';
        healthText.textContent = 'Gateway & Mesh UP';
    } else {
        healthDot.className = 'health-dot offline';
        healthText.textContent = res.status === 0 ? 'Gateway Offline' : `Gateway Error (${res.status})`;
    }
}

// Load Products
async function loadProducts(query = '') {
    if (!productsGrid) return;
    productsGrid.innerHTML = `
        <div class="product-loading-skeleton glass-panel">Loading SecOps Catalog...</div>
    `;

    const endpoint = query ? `/products/search?q=${encodeURIComponent(query)}` : '/products';
    const res = await apiFetch(endpoint);

    if (res.ok && Array.isArray(res.data)) {
        products = res.data;
        renderProducts(products);
    } else {
        productsGrid.innerHTML = `
            <div class="product-error glass-panel">
                <p>Could not retrieve products from Gateway.</p>
                <button class="btn btn-secondary" onclick="loadProducts()">Retry</button>
            </div>
        `;
    }
}

// Render Products Grid
function renderProducts(items) {
    if (!productsGrid) return;
    if (items.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state glass-panel">
                <p>No SecOps products found matching criteria.</p>
            </div>
        `;
        return;
    }

    productsGrid.innerHTML = items.map(product => `
        <div class="product-card glass-panel" data-product-id="${product.id}">
            <div class="product-badge">${product.category || 'Security Tool'}</div>
            <h3 class="product-name">${escapeHtml(product.name)}</h3>
            <p class="product-desc">${escapeHtml(product.description || '')}</p>
            <div class="product-footer">
                <span class="product-price">$${Number(product.price).toFixed(2)}</span>
                <button class="btn btn-primary btn-sm" onclick="addToCart(${product.id})">
                    Add to Cart
                </button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

// Load Orders
async function loadOrders() {
    if (!ordersTbody) return;
    const res = await apiFetch('/orders');
    if (res.ok && Array.isArray(res.data)) {
        renderOrders(res.data);
    } else {
        ordersTbody.innerHTML = `
            <tr><td colspan="5" class="text-center text-muted">No orders synced yet</td></tr>
        `;
    }
}

function renderOrders(orders) {
    if (!ordersTbody) return;
    if (orders.length === 0) {
        ordersTbody.innerHTML = `
            <tr><td colspan="5" class="text-center text-muted">No orders found in database</td></tr>
        `;
        return;
    }

    ordersTbody.innerHTML = orders.map(order => {
        const isSuccess = order.status === 'CONFIRMED' || order.status === 'SUCCESS';
        const badgeClass = isSuccess ? 'badge-success' : 'badge-danger';
        return `
            <tr>
                <td><code>${escapeHtml(order.orderNumber || ('ORD-' + order.id))}</code></td>
                <td>User #${order.userId}</td>
                <td>$${Number(order.totalAmount || 0).toFixed(2)}</td>
                <td><span class="badge ${badgeClass}">${escapeHtml(order.status)}</span></td>
                <td><span class="text-muted">${order.merchantCode || 'MCH-STANDARD'}</span></td>
            </tr>
        `;
    }).join('');
}

// Cart Operations
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    updateCartUI();
    showToast(`Added ${product.name} to cart`);
}

function updateCartQuantity(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter(i => i.id !== productId);
    }
    updateCartUI();
}

function updateCartUI() {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    cartCountBadge.textContent = totalCount;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-msg">Your SecOps cart is currently empty.</div>
        `;
        cartSubtotal.textContent = '$0.00';
        cartTotal.textContent = '$0.00';
        return;
    }

    cartItemsContainer.innerHTML = cart.map(item => {
        return `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <div class="cart-item-title">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">$${Number(item.price).toFixed(2)} each</div>
                </div>
                <div class="cart-qty-ctrl">
                    <button class="qty-btn" onclick="updateCartQuantity(${item.id}, -1)">-</button>
                    <span class="qty-num">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartQuantity(${item.id}, 1)">+</button>
                </div>
            </div>
        `;
    }).join('');

    cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    cartTotal.textContent = `$${subtotal.toFixed(2)}`;
}

// Scenario Trigger
async function runScenario(scenarioId) {
    let payload = {};
    if (scenarioId === '5001') {
        payload = {
            userId: 101,
            orderId: 5001,
            amount: 499.0,
            merchantCode: 'MCH-UNKNOWN'
        };
    } else if (scenarioId === '5002') {
        payload = {
            userId: 101,
            orderId: 5002,
            amount: 149.0,
            merchantCode: 'MCH-5002'
        };
    } else if (scenarioId === '5003') {
        payload = {
            userId: 102,
            orderId: 5003,
            amount: 299.0,
            merchantCode: 'MCH-5003'
        };
    }

    showToast(`Executing Scenario ${scenarioId}...`);
    await executeCheckout(payload);
}

// Checkout Cart
async function checkoutCart(merchantCode) {
    if (cart.length === 0) {
        showToast('Cart is empty!');
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderId = (merchantCode === 'MCH-UNKNOWN') ? 5001 : 5002;

    const payload = {
        userId: 101,
        orderId: orderId,
        amount: total,
        merchantCode: merchantCode,
        productIds: cart.map(i => i.id)
    };

    cartDrawer.classList.add('hidden');
    await executeCheckout(payload);
}

// Execute Checkout API Call
async function executeCheckout(payload) {
    const res = await apiFetch('/checkout', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    // Refresh orders list
    loadOrders();

    if (res.ok) {
        // Success 200 OK
        openSuccessModal(payload.orderId, res.requestId);
    } else {
        // Failure (e.g. 500 with NULL_OBJECT_ACCESS or controlled business error)
        openFailureModal(res, payload);
    }
}

// Open Failure Modal
function openFailureModal(res, requestPayload) {
    const data = res.data || {};
    lastFailurePayload = {
        timestamp: data.timestamp || new Date().toISOString(),
        requestId: res.requestId || data.requestId || 'req-unknown',
        endpoint: '/checkout',
        httpStatus: res.status || data.status || 500,
        errorCode: data.errorCode || 'NULL_OBJECT_ACCESS',
        message: data.message || 'Payment processing failed because merchant data was unavailable',
        service: data.service || 'payment-service',
        exception: data.exception || 'NullPointerException',
        source: data.source || {
            file: 'PaymentService.java',
            line: 24
        },
        request: requestPayload
    };

    failureHttpStatus.textContent = `HTTP ${lastFailurePayload.httpStatus}`;
    failureErrorCode.textContent = lastFailurePayload.errorCode;
    failureReqId.textContent = `Request ID: ${lastFailurePayload.requestId}`;
    failureMessage.textContent = lastFailurePayload.message;

    // Populate Technical Details
    document.getElementById('tech-timestamp').textContent = lastFailurePayload.timestamp;
    document.getElementById('tech-request-id').textContent = lastFailurePayload.requestId;
    document.getElementById('tech-endpoint').textContent = lastFailurePayload.endpoint;
    document.getElementById('tech-status').textContent = lastFailurePayload.httpStatus;
    document.getElementById('tech-code').textContent = lastFailurePayload.errorCode;
    document.getElementById('tech-service').textContent = lastFailurePayload.service;
    document.getElementById('tech-exception').textContent = lastFailurePayload.exception;
    document.getElementById('tech-file').textContent = (lastFailurePayload.source && lastFailurePayload.source.file) ? lastFailurePayload.source.file : 'PaymentService.java';
    document.getElementById('tech-line').textContent = (lastFailurePayload.source && lastFailurePayload.source.line) ? lastFailurePayload.source.line : '24';

    // Hide technical accordion by default
    techDetailsContent.classList.add('hidden');
    techAccordionIcon.style.transform = 'rotate(0deg)';

    failureModal.classList.remove('hidden');
}

function toggleTechDetails() {
    const isHidden = techDetailsContent.classList.toggle('hidden');
    techAccordionIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
}

function copyFailureDetails() {
    if (!lastFailurePayload) return;
    navigator.clipboard.writeText(JSON.stringify(lastFailurePayload, null, 2))
        .then(() => showToast('Failure details copied to clipboard!'))
        .catch(() => showToast('Failed to copy to clipboard.'));
}

function openCodeGuardianInvestigation() {
    if (!lastFailurePayload) return;
    
    // Construct incident link with query parameters targeting RaghulVarathan/JavaAPICheck
    const params = new URLSearchParams({
        repo: 'https://github.com/RaghulVarathan/JavaAPICheck',
        requestId: lastFailurePayload.requestId,
        errorCode: lastFailurePayload.errorCode,
        service: lastFailurePayload.service,
        file: (lastFailurePayload.source && lastFailurePayload.source.file) ? lastFailurePayload.source.file : 'PaymentService.java',
        line: (lastFailurePayload.source && lastFailurePayload.source.line) ? lastFailurePayload.source.line : '24'
    });

    const targetUrl = `${codeGuardianUrl.replace(/\/$/, '')}?${params.toString()}`;
    window.open(targetUrl, '_blank');
}

function closeFailureModal() {
    failureModal.classList.add('hidden');
}

// Success Modal
function openSuccessModal(orderId, requestId) {
    successOrderNum.textContent = `Order #${orderId || 5002} has been verified and confirmed.`;
    successCorrId.textContent = requestId;
    successModal.classList.remove('hidden');
}

function closeSuccessModal() {
    successModal.classList.add('hidden');
}

// Config Modal Operations
function openConfigModal() {
    gatewayUrlInput.value = gatewayUrl;
    codeguardianUrlInput.value = codeGuardianUrl;
    configModal.classList.remove('hidden');
}

function closeConfigModal() {
    configModal.classList.add('hidden');
}

function saveConfig() {
    gatewayUrl = gatewayUrlInput.value.trim() || 'http://localhost:8080';
    codeGuardianUrl = codeguardianUrlInput.value.trim() || 'http://localhost:5173';
    localStorage.setItem(CONFIG_KEY_GATEWAY, gatewayUrl);
    localStorage.setItem(CONFIG_KEY_CODEGUARDIAN, codeGuardianUrl);
    closeConfigModal();
    showToast('Saved backend configuration');
    checkHealth();
    loadProducts();
    loadOrders();
}

function resetConfig() {
    gatewayUrl = windowConfig.API_BASE_URL || 'http://localhost:8080';
    codeGuardianUrl = windowConfig.CODEGUARDIAN_URL || 'http://localhost:5173';
    localStorage.removeItem(CONFIG_KEY_GATEWAY);
    localStorage.removeItem(CONFIG_KEY_CODEGUARDIAN);
    gatewayUrlInput.value = gatewayUrl;
    codeguardianUrlInput.value = codeGuardianUrl;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial health & data fetch
    checkHealth();
    loadProducts();
    loadOrders();

    // Periodic health check every 10 seconds
    setInterval(checkHealth, 10000);

    // Search input listener
    let debounceTimer;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle('hidden', query.length === 0);
            }
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadProducts(query);
            }, 300);
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            loadProducts('');
        });
    }

    // Cart Drawer Toggle
    if (cartToggleBtn) cartToggleBtn.addEventListener('click', () => cartDrawer.classList.remove('hidden'));
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', () => cartDrawer.classList.add('hidden'));

    // Config Modal Toggle
    if (configBtn) configBtn.addEventListener('click', openConfigModal);
    if (configCloseBtn) configCloseBtn.addEventListener('click', closeConfigModal);
});
