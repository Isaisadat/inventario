const API = '/api';
let TOKEN = localStorage.getItem('token');
let currentUser = null;
let cartItems = [];
let debounceTimer, chartMonthly;

function $(id) { return document.getElementById(id); }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) { logout(); throw new Error('Sesión expirada'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

function formatCurrency(n) {
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateInput(d) {
  if (!d) return '';
  const date = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ====== AUTH ======
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value.trim() })
    });
    TOKEN = data.token;
    localStorage.setItem('token', TOKEN);
    currentUser = data.user;
    showApp();
  } catch (err) {
    $('loginError').textContent = err.message;
    $('loginError').classList.add('show');
  }
});

$('logoutBtn').addEventListener('click', logout);

function logout() {
  TOKEN = null; currentUser = null; localStorage.removeItem('token');
  $('loginPage').style.display = 'flex';
  $('appPage').style.display = 'none';
  $('loginError').classList.remove('show');
  $('loginForm').reset();
}

document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const pageId = page.charAt(0).toUpperCase() + page.slice(1);
    $(`page${pageId}`).style.display = 'block';
    if (page === 'dashboard') loadDashboard();
    if (page === 'products') loadProducts();
    if (page === 'sales') loadSales();
    if (page === 'clients') loadClients();
    if (window.innerWidth <= 768) $('sidebar').classList.remove('open');
  });
});

$('mobileToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));

async function showApp() {
  $('loginPage').style.display = 'none';
  $('appPage').style.display = 'flex';
  $('userAvatar').textContent = currentUser.nombre.charAt(0).toUpperCase();
  $('userName').textContent = currentUser.nombre;
  $('userRole').textContent = currentUser.rol === 'fleure' ? '💍 Fleure · Joyería' : '💄 Maquillaje';
  loadDashboard();
}

(async () => {
  if (TOKEN) {
    try { const data = await api('/auth/me'); currentUser = data.user; showApp(); }
    catch { logout(); }
  }
})();

// ====== DASHBOARD ======
async function loadDashboard() {
  try {
    const [stats, salesStats, ventasStats] = await Promise.all([
      api('/products/stats'), api('/sales/stats'), api('/products/stats/ventas')
    ]);
    $('statProductos').textContent = stats.totalProductos;
    $('statUnidades').textContent = stats.totalUnidades;
    $('statInversion').textContent = formatCurrency(stats.totalInversion);
    $('statVentaPotencial').textContent = formatCurrency(stats.totalVentaPotencial);
    $('statGanancia').textContent = formatCurrency(stats.gananciaPotencial);
    $('statBajoStock').textContent = stats.productosBajoStock;
    $('statProveedores').textContent = stats.proveedoresUnicos;
    $('statVentasRealizadas').textContent = salesStats.totalVentas;
    $('statIngresos').textContent = formatCurrency(salesStats.totalIngresos);
    $('statGananciaReal').textContent = formatCurrency(salesStats.totalGananciaReal);
    loadLowStock();
    renderBestSellers(ventasStats.bestSellers);
    renderMonthlyChart(ventasStats.monthly);
  } catch (err) { console.error('Dashboard error:', err); }
}

async function loadLowStock() {
  try {
    const products = await api('/products?activo=true');
    const low = products.filter(p => p.cantidad <= 5);
    const container = $('lowStockContainer');
    if (!low.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><h3>Todo en orden</h3><p>No hay productos con bajo stock</p></div>'; return; }
    let html = '<table class="data-table"><thead><tr><th>Producto</th><th>Stock</th><th>Proveedor</th><th></th></tr></thead><tbody>';
    low.forEach(p => { html += `<tr><td><strong>${escHtml(p.nombre)}</strong></td><td class="text-danger"><strong>${p.cantidad}</strong></td><td>${escHtml(p.proveedor)}</td><td><button class="btn btn-sm btn-primary" onclick="switchPage(\'products\')">Ir</button></td></tr>`; });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {}
}

function renderBestSellers(bestSellers) {
  const container = $('bestSellersContainer');
  if (!bestSellers || !bestSellers.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><h3>Sin datos</h3><p>No hay ventas registradas</p></div>'; return; }
  let html = '<table class="data-table"><thead><tr><th>#</th><th>Producto</th><th>Proveedor</th><th>Vendidos</th><th>Total</th><th>Ganancia</th></tr></thead><tbody>';
  bestSellers.slice(0, 5).forEach((p, i) => {
    html += `<tr><td>${i + 1}</td><td><strong>${escHtml(p.nombre)}</strong></td><td>${escHtml(p.proveedor)}</td><td>${p.cantidad}</td><td>${formatCurrency(p.total)}</td><td class="text-success">${formatCurrency(p.ganancia)}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderMonthlyChart(monthly) {
  if (!monthly || !monthly.length) return;
  const labels = monthly.map(m => m.mes);
  const ingresos = monthly.map(m => m.ingresos);
  const ganancias = monthly.map(m => m.ganancia);
  if (chartMonthly) chartMonthly.destroy();
  const ctx = document.getElementById('chartMonthly').getContext('2d');
  chartMonthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos', data: ingresos, backgroundColor: '#6C5CE7', borderRadius: 6 },
        { label: 'Ganancia', data: ganancias, backgroundColor: '#00B894', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } }
    }
  });
}

function switchPage(page) {
  document.querySelector(`.sidebar-nav a[data-page="${page}"]`).click();
}
window.switchPage = switchPage;

// ====== PRODUCTS ======
$('searchInput').addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(loadProducts, 300); });
$('filterProveedor').addEventListener('change', loadProducts);
$('filterColor').addEventListener('change', loadProducts);
$('filterMaterial').addEventListener('change', loadProducts);
$('filterEstado').addEventListener('change', loadProducts);
$('addProductBtn').addEventListener('click', () => openProductModal());

async function loadProducts() {
  try {
    const params = new URLSearchParams();
    ['searchInput', 'filterProveedor', 'filterColor', 'filterMaterial', 'filterEstado'].forEach(id => {
      const v = $(id).value.trim();
      const key = id === 'searchInput' ? 'search' : id.replace('filter', '').toLowerCase();
      if (v) params.set(key, v);
    });
    const products = await api(`/products?${params.toString()}`);
    renderProducts(products);
    loadProductFilters();
  } catch (err) { console.error(err); }
}

async function loadProductFilters() {
  try {
    const [proveedores, colores, materiales] = await Promise.all([
      api('/products/proveedores'), api('/products/colores'), api('/products/materiales')
    ]);
    ['filterProveedor', 'filterColor', 'filterMaterial'].forEach((id, i) => {
      const data = [proveedores, colores, materiales][i];
      const sel = $(id); const cur = sel.value;
      const labels = ['Todos los proveedores', 'Todos los colores', 'Todos los materiales'];
      sel.innerHTML = `<option value="">${labels[i]}</option>`;
      data.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
      sel.value = cur;
    });
  } catch (err) {}
}

function renderProducts(products) {
  const container = $('productsContainer');
  if (!products.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><h3>No hay productos</h3><p>Agrega tu primer producto para comenzar</p></div>'; return; }
  let html = `<table class="data-table"><thead><tr>
    <th>Producto</th><th>Proveedor</th><th>Stock</th><th>Color</th><th>Material</th>
    <th>Compra</th><th>Venta</th><th>Ganancia</th><th>Acciones</th>
  </tr></thead><tbody>`;
  products.forEach(p => {
    const g = p.precioVenta - p.precioCompra;
    const mg = p.precioCompra > 0 ? ((g / p.precioCompra) * 100).toFixed(0) : 0;
    const sc = p.cantidad <= 5 ? 'text-danger' : (p.cantidad <= 15 ? 'text-warning' : '');
    const imgSrc = p.url && (p.url.startsWith('/uploads/') || p.url.startsWith('http'));
    const colorStyle = p.color ? `style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color.toLowerCase()};border:1px solid #ddd;margin-right:4px;vertical-align:middle"` : '';
    html += `<tr>
      <td>${imgSrc ? `<img src="${escHtml(p.url)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:6px">` : ''}<strong>${escHtml(p.nombre)}</strong>${p.url && !p.url.startsWith('/uploads/') ? `<br><a href="${escHtml(p.url)}" target="_blank" style="font-size:11px;color:var(--primary)">🔗 URL</a>` : ''}</td>
      <td>${escHtml(p.proveedor)}</td>
      <td class="${sc}"><strong>${p.cantidad}</strong></td>
      <td>${p.color ? `<span ${colorStyle}></span>${escHtml(p.color)}` : '—'}</td>
      <td>${escHtml(p.material || '—')}</td>
      <td>${formatCurrency(p.precioCompra)}</td>
      <td>${formatCurrency(p.precioVenta)}</td>
      <td class="${g > 0 ? 'text-success' : 'text-danger'}">${formatCurrency(g)} <small>(${mg}%)</small></td>
      <td class="actions">
        <button class="btn-icon" onclick="editProduct('${p._id}')" title="Editar">✏️</button>
        <button class="btn-icon" onclick="deleteProduct('${p._id}')" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ====== PRODUCT MODAL ======
function openProductModal(product) {
  const isFleure = currentUser && currentUser.rol === 'fleure';
  $('productId').value = product ? product._id : '';
  $('modalTitle').textContent = product ? 'Editar Producto' : 'Nuevo Producto';
  $('pNombre').value = product ? product.nombre : '';
  $('pNombre').placeholder = isFleure ? 'Ej: Anillo de oro, Pulsera plata' : 'Ej: Base de maquillaje';
  $('pProveedor').value = product ? product.proveedor : '';
  $('pProveedor').placeholder = isFleure ? 'Ej: Joyería Lux' : 'Ej: Proveedor S.A.';
  $('pCantidad').value = product ? product.cantidad : '';
  $('pCategoria').value = product ? (product.categoria || '') : '';
  $('pCategoria').placeholder = isFleure ? 'Ej: Anillos, Pulseras, Collares' : 'Ej: Bases, Labiales';
  $('pPrecioCompra').value = product ? product.precioCompra : '';
  $('pPrecioVenta').value = product ? product.precioVenta : '';
  $('pColor').value = product ? (product.color || '') : '';
  $('pMaterial').value = product ? (product.material || '') : '';
  $('pUrl').value = product ? (product.url || '') : '';
  $('pImagen').value = '';
  $('pFechaCompra').value = formatDateInput(product ? product.fechaCompra : new Date());
  $('pFechaPublicacion').value = formatDateInput(product ? product.fechaPublicacion : '');
  $('pNotas').value = product ? (product.notas || '') : '';
  $('productModal').classList.add('show');
  $('modalSave').textContent = product ? 'Actualizar' : 'Guardar';
}

function closeProductModal() { $('productModal').classList.remove('show'); $('productForm').reset(); $('productId').value = ''; }

$('modalClose').addEventListener('click', closeProductModal);
$('modalCancel').addEventListener('click', closeProductModal);
$('productModal').addEventListener('click', e => { if (e.target === $('productModal')) closeProductModal(); });

$('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('productId').value;
  const fileInput = $('pImagen');
  let url = $('pUrl').value.trim();
  if (fileInput.files && fileInput.files[0]) {
    try {
      const formData = new FormData();
      formData.append('imagen', fileInput.files[0]);
      const token = localStorage.getItem('token');
      const uploadRes = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.url) url = uploadData.url;
    } catch (err) { alert('Error al subir imagen'); return; }
  }
  const data = {
    nombre: $('pNombre').value.trim(), proveedor: $('pProveedor').value.trim(),
    cantidad: Number($('pCantidad').value), categoria: $('pCategoria').value.trim(),
    precioCompra: Number($('pPrecioCompra').value), precioVenta: Number($('pPrecioVenta').value),
    color: $('pColor').value.trim(), material: $('pMaterial').value.trim(),
    url,
    fechaCompra: $('pFechaCompra').value || undefined, fechaPublicacion: $('pFechaPublicacion').value || undefined,
    notas: $('pNotas').value.trim()
  };
  try {
    if (id) await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/products', { method: 'POST', body: JSON.stringify(data) });
    closeProductModal(); loadProducts();
    if ($('pageDashboard').style.display !== 'none') loadDashboard();
  } catch (err) { alert('Error: ' + err.message); }
});

async function editProduct(id) { try { openProductModal(await api(`/products/${id}`)); } catch (err) { alert('Error al cargar producto'); } }
window.editProduct = editProduct;

async function deleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try { await api(`/products/${id}`, { method: 'DELETE' }); loadProducts(); } catch (err) { alert('Error al eliminar'); }
}
window.deleteProduct = deleteProduct;

function exportProducts(fmt) {
  const url = fmt === 'pdf' ? `${API}/export/productos/pdf?token=${TOKEN}` : `${API}/export/productos?token=${TOKEN}`;
  window.open(url, '_blank');
}
window.exportProducts = exportProducts;

// ====== SALES ======
$('addSaleBtn').addEventListener('click', openSaleModal);
$('saleSearchInput').addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(loadSales, 300); });
$('saleFilterDesde').addEventListener('change', loadSales);
$('saleFilterHasta').addEventListener('change', loadSales);

async function loadSales() {
  try {
    const params = new URLSearchParams();
    const s = $('saleSearchInput').value.trim(); if (s) params.set('search', s);
    const d = $('saleFilterDesde').value; if (d) params.set('desde', d);
    const h = $('saleFilterHasta').value; if (h) params.set('hasta', h);
    renderSales(await api(`/sales?${params.toString()}`));
  } catch (err) { console.error(err); }
}

function renderSales(sales) {
  const container = $('salesContainer');
  if (!sales.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><h3>No hay ventas registradas</h3><p>Registra tu primera venta</p></div>'; return; }
  let html = `<table class="data-table"><thead><tr>
    <th>Folio</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Ganancia</th><th>Acciones</th>
  </tr></thead><tbody>`;
  sales.forEach(s => {
    const folio = `V-${s._id.toString().slice(-6).toUpperCase()}`;
    const itemsTxt = s.items.map(i => `${i.cantidad}x ${escHtml(i.nombreProducto)}`).join('<br>');
    const itemsCount = s.items.reduce((sum, i) => sum + i.cantidad, 0);
    html += `<tr>
      <td style="font-size:12px;font-weight:600">${folio}</td>
      <td>${formatDate(s.fecha)}</td>
      <td>${s.cliente ? escHtml(s.cliente.nombre) : '—'}</td>
      <td style="font-size:13px">${itemsTxt}</td>
      <td><strong>${formatCurrency(s.total)}</strong></td>
      <td class="${s.gananciaTotal >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(s.gananciaTotal)}</td>
      <td class="actions">
        <button class="btn-icon" onclick="showTicket('${s._id}')" title="Ver ticket">🧾</button>
        <button class="btn-icon" onclick="cancelSale('${s._id}')" title="Cancelar">↩️</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

async function cancelSale(id) {
  if (!confirm('¿Cancelar esta venta? El stock se restaurará automáticamente.')) return;
  try { await api(`/sales/${id}`, { method: 'DELETE' }); loadSales(); if ($('pageDashboard').style.display !== 'none') loadDashboard(); } catch (err) { alert('Error: ' + err.message); }
}
window.cancelSale = cancelSale;

// ====== SALE MODAL (CART) ======
async function openSaleModal() {
  cartItems = [];
  $('saleForm').reset();
  $('sFecha').value = formatDateInput(new Date());
  await Promise.all([loadSaleProducts(), loadSaleClients()]);
  renderCart();
  $('saleModal').classList.add('show');
}

function closeSaleModal() { $('saleModal').classList.remove('show'); $('saleForm').reset(); cartItems = []; }

$('saleModalClose').addEventListener('click', closeSaleModal);
$('saleModalCancel').addEventListener('click', closeSaleModal);
$('saleModal').addEventListener('click', e => { if (e.target === $('saleModal')) closeSaleModal(); });

async function loadSaleProducts() {
  try {
    const products = await api('/products?activo=true');
    const sel = $('sProducto');
    sel.innerHTML = '<option value="">Seleccionar producto...</option>';
    products.forEach(p => {
      const o = document.createElement('option');
      o.value = p._id;
      o.textContent = `${p.nombre} (Stock: ${p.cantidad} · $${p.precioVenta})`;
      o.dataset.stock = p.cantidad;
      o.dataset.precio = p.precioVenta;
      o.dataset.precioCompra = p.precioCompra;
      sel.appendChild(o);
    });
  } catch (err) { console.error(err); }
}

async function loadSaleClients() {
  try {
    const clients = await api('/clients');
    const sel = $('sCliente');
    sel.innerHTML = '<option value="">— Cliente ocasional —</option>';
    clients.forEach(c => {
      const o = document.createElement('option');
      o.value = c._id; o.textContent = c.nombre;
      sel.appendChild(o);
    });
  } catch (err) { console.error(err); }
}

$('sProducto').addEventListener('change', function() {
  if (this.value) {
    const opt = this.options[this.selectedIndex];
    $('sPrecioVenta').value = opt.dataset.precio;
    $('sCantidad').value = 1;
  }
});

$('sAddToCart').addEventListener('click', () => {
  const sel = $('sProducto');
  if (!sel.value) { alert('Selecciona un producto'); return; }
  const opt = sel.options[sel.selectedIndex];
  const cantidad = parseInt($('sCantidad').value) || 1;
  const precioVenta = parseFloat($('sPrecioVenta').value) || 0;
  const stock = parseInt(opt.dataset.stock);
  const cantidadEnCarrito = cartItems.filter(i => i.productoId === sel.value).reduce((s, i) => s + i.cantidad, 0);
  if (cantidadEnCarrito + cantidad > stock) { alert(`Stock insuficiente. Disponible: ${stock - cantidadEnCarrito}`); return; }
  const exist = cartItems.find(i => i.productoId === sel.value);
  if (exist) { exist.cantidad += cantidad; } else {
    cartItems.push({ productoId: sel.value, nombre: opt.textContent.split(' (')[0], precioCompra: parseFloat(opt.dataset.precioCompra), cantidad, precioVenta });
  }
  renderCart();
  sel.value = '';
  $('sCantidad').value = 1;
  $('sPrecioVenta').value = '';
});

function removeFromCart(idx) { cartItems.splice(idx, 1); renderCart(); }
window.removeFromCart = removeFromCart;

function renderCart() {
  const container = $('cartContainer');
  const summary = $('cartSummary');
  const count = $('saleCartCount');
  count.textContent = `${cartItems.reduce((s, i) => s + i.cantidad, 0)} productos en carrito`;
  if (!cartItems.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray);border:2px dashed var(--light-gray);border-radius:8px">🛒 Carrito vacío — agrega productos</div>';
    summary.style.display = 'none';
    return;
  }
  let html = '<table class="data-table"><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Total</th><th></th></tr></thead><tbody>';
  let total = 0, costo = 0;
  cartItems.forEach((item, i) => {
    const t = item.cantidad * item.precioVenta;
    const c = item.cantidad * item.precioCompra;
    total += t; costo += c;
    html += `<tr>
      <td>${escHtml(item.nombre)}</td>
      <td>${item.cantidad}</td>
      <td>${formatCurrency(item.precioVenta)}</td>
      <td>${formatCurrency(t)}</td>
      <td><button class="btn-icon" onclick="removeFromCart(${i})" title="Quitar">✕</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  summary.style.display = 'block';
  $('cartTotal').textContent = formatCurrency(total);
  $('cartCosto').textContent = formatCurrency(costo);
  $('cartGanancia').textContent = formatCurrency(total - costo);
}

$('saleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!cartItems.length) { alert('Agrega al menos un producto al carrito'); return; }
  const clienteOpt = $('sCliente');
  const cliente = clienteOpt.value ? { id: clienteOpt.value, nombre: clienteOpt.options[clienteOpt.selectedIndex].textContent } : undefined;
  const items = cartItems.map(i => ({ productoId: i.productoId, cantidad: i.cantidad, precioVenta: i.precioVenta }));
  try {
    const sale = await api('/sales', {
      method: 'POST',
      body: JSON.stringify({ items, cliente, fecha: $('sFecha').value ? new Date($('sFecha').value).toISOString() : undefined, notas: $('sNotas').value.trim() })
    });
    closeSaleModal();
    loadSales();
    if ($('pageDashboard').style.display !== 'none') loadDashboard();
    setTimeout(() => showTicket(sale._id), 500);
  } catch (err) { alert('Error: ' + err.message); }
});

// ====== TICKET ======
let lastTicketId = null;

async function showTicket(saleId) {
  try {
    const sales = await api(`/sales`);
    const sale = sales.find(s => s._id === saleId);
    if (!sale) { alert('Venta no encontrada'); return; }
    lastTicketId = saleId;
    const folio = `V-${sale._id.toString().slice(-6).toUpperCase()}`;
    const fecha = new Date(sale.fecha).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' });
    const rol = currentUser && currentUser.rol === 'fleure' ? 'Fleure Joyería' : 'Maquillaje';
    let itemsHtml = '';
    sale.items.forEach(i => {
      itemsHtml += `<tr><td>${i.cantidad}x ${escHtml(i.nombreProducto)}</td><td style="text-align:right">${formatCurrency(i.precioVenta)}</td><td style="text-align:right">${formatCurrency(i.total)}</td></tr>`;
    });
    $('ticketContent').innerHTML = `
      <div style="text-align:center;margin-bottom:12px">
        <strong style="font-size:16px">🧾 Ticket de Venta</strong><br>
        ${rol}<br>
        <small>${fecha}</small><br>
        <small>Folio: ${folio}</small>
      </div>
      <hr style="border-top:1px dashed #ccc">
      <table style="width:100%;border-collapse:collapse;margin:8px 0">
        ${itemsHtml}
      </table>
      <hr style="border-top:1px dashed #ccc">
      <div style="font-size:14px">
        ${sale.cliente ? `<div>Cliente: <strong>${escHtml(sale.cliente.nombre)}</strong></div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span>Total:</span><strong>${formatCurrency(sale.total)}</strong>
        </div>

        ${sale.notas ? `<div style="margin-top:8px;color:var(--gray)">📝 ${escHtml(sale.notas)}</div>` : ''}
      </div>
      <hr style="border-top:1px dashed #ccc">
      <div style="text-align:center;color:#6C5CE7;font-size:16px;font-weight:bold;margin:12px 0">~ ¡Gracias por tu compra! ~</div>
      <div style="text-align:center;color:var(--gray);font-size:11px">Te esperamos pronto</div>
    `;
    $('ticketModal').classList.add('show');
  } catch (err) { alert('Error al cargar ticket'); }
}
window.showTicket = showTicket;

function closeTicket() { $('ticketModal').classList.remove('show'); }
window.closeTicket = closeTicket;
$('ticketClose').addEventListener('click', closeTicket);

function printTicket() {
  const content = $('ticketContent').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Ticket</title><style>body{font-family:monospace;font-size:13px;padding:20px;max-width:350px;margin:auto}table{width:100%;border-collapse:collapse}td{padding:2px 0}hr{border-top:1px dashed #ccc}</style></head><body>${content}</body></html>`);
  win.document.close();
  win.print();
}
window.printTicket = printTicket;

function downloadTicketPDF() {
  if (lastTicketId) window.open(`${API}/export/ticket/${lastTicketId}?token=${TOKEN}`, '_blank');
}
window.downloadTicketPDF = downloadTicketPDF;

function exportSales(fmt) {
  const d = $('saleFilterDesde').value;
  const h = $('saleFilterHasta').value;
  let url = fmt === 'pdf' ? `${API}/export/ventas/pdf?token=${TOKEN}` : `${API}/export/ventas?token=${TOKEN}`;
  if (d) url += `&desde=${d}`;
  if (h) url += `&hasta=${h}`;
  window.open(url, '_blank');
}
window.exportSales = exportSales;

// ====== CLIENTS ======
$('addClientBtn').addEventListener('click', () => openClientModal());
$('clientSearchInput').addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(loadClients, 300); });

async function loadClients() {
  try {
    const search = $('clientSearchInput').value.trim();
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    renderClients(await api(`/clients${params}`));
  } catch (err) { console.error(err); }
}

function renderClients(clients) {
  const container = $('clientsContainer');
  if (!clients.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No hay clientes</h3><p>Registra tu primer cliente</p></div>'; return; }
  let html = `<table class="data-table"><thead><tr>
    <th>Nombre</th><th>Teléfono</th><th>Email</th><th>Compras</th><th>Total gastado</th><th>Acciones</th>
  </tr></thead><tbody>`;
  clients.forEach(c => {
    html += `<tr>
      <td><strong>${escHtml(c.nombre)}</strong></td>
      <td>${c.telefono || '—'}</td>
      <td>${c.email || '—'}</td>
      <td>${c.totalCompras || 0}</td>
      <td>${formatCurrency(c.totalGastado || 0)}</td>
      <td class="actions">
        <button class="btn-icon" onclick="editClient('${c._id}')" title="Editar">✏️</button>
        <button class="btn-icon" onclick="deleteClient('${c._id}')" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ====== CLIENT MODAL ======
function openClientModal(client) {
  $('clientId').value = client ? client._id : '';
  $('clientModalTitle').textContent = client ? 'Editar Cliente' : 'Nuevo Cliente';
  $('cNombre').value = client ? client.nombre : '';
  $('cTelefono').value = client ? (client.telefono || '') : '';
  $('cEmail').value = client ? (client.email || '') : '';
  $('cNotas').value = client ? (client.notas || '') : '';
  $('clientModal').classList.add('show');
  $('clientModalSave').textContent = client ? 'Actualizar' : 'Guardar';
}

function closeClientModal() { $('clientModal').classList.remove('show'); $('clientForm').reset(); $('clientId').value = ''; }

$('clientModalClose').addEventListener('click', closeClientModal);
$('clientModalCancel').addEventListener('click', closeClientModal);
$('clientModal').addEventListener('click', e => { if (e.target === $('clientModal')) closeClientModal(); });

$('clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('clientId').value;
  const data = { nombre: $('cNombre').value.trim(), telefono: $('cTelefono').value.trim(), email: $('cEmail').value.trim(), notas: $('cNotas').value.trim() };
  try {
    if (id) await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/clients', { method: 'POST', body: JSON.stringify(data) });
    closeClientModal(); loadClients();
  } catch (err) { alert('Error: ' + err.message); }
});

async function editClient(id) { try { const r = await api(`/clients/${id}`); openClientModal(r.client || r); } catch (err) { alert('Error al cargar cliente'); } }
window.editClient = editClient;

async function deleteClient(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  try { await api(`/clients/${id}`, { method: 'DELETE' }); loadClients(); } catch (err) { alert('Error al eliminar'); }
}
window.deleteClient = deleteClient;
