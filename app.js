/* ---------- Constants ---------- */
const CATEGORIES = ["Serum & Treatment","Lotions","Face Moisturizers & Cream","Facial Wash, Toner & Cleanser","Shower Gel & Soap","Scrub, Mask & Exfoliate","Sunscreen","Belgium Goods","Bundles","Other"];
const CATEGORY_ICONS = {
  "Serum & Treatment": "💧", "Lotions": "🧴", "Face Moisturizers & Cream": "🫙",
  "Facial Wash, Toner & Cleanser": "🧼", "Shower Gel & Soap": "🛁", "Scrub, Mask & Exfoliate": "✨",
  "Sunscreen": "☀️", "Belgium Goods": "🇧🇪", "Bundles": "🎁", "Other": "📦"
};
function categoryIcon(cat) { return CATEGORY_ICONS[cat] || "📦"; }
function productDisplayName(product, variant) { return variant ? `${product.name} — ${variant.label}` : (product ? product.name : ''); }
function productVariants(product) { return (product && product.variants) || []; }
function productTotalStock(product) {
  const variants = productVariants(product);
  return variants.length ? variants.reduce((a, v) => a + (Number(v.stock) || 0), 0) : (Number(product.stock) || 0);
}
function stockItemsFor(product) {
  const variants = productVariants(product);
  if (variants.length) {
    return variants.map((v) => ({ product, variant: v, displayName: productDisplayName(product, v), stock: Number(v.stock) || 0 }));
  }
  return [{ product, variant: null, displayName: productDisplayName(product, null), stock: Number(product.stock) || 0 }];
}
function allStockItems() { return S.products.flatMap(stockItemsFor); }
function findVariant(productId, variantId) {
  const product = S.products.find((p) => p.id === productId);
  if (!product) return { product: null, variant: null };
  const variant = variantId ? productVariants(product).find((v) => v.id === variantId) : null;
  return { product, variant };
}
const PLATFORMS = ["TikTok","Instagram","Facebook","WhatsApp","eBay","Website","Other"];
const EXPENSE_CATEGORIES = ["Stock Purchase","Shipping & Packaging","Subscriptions","Business Registration","Marketing","Other"];
const ORDER_STATUSES = ["Pending","Packed","Posted","Delivered","Completed"];

/* ---------- State ---------- */
const S = {
  tab: 'home',
  products: [],
  sales: [],
  expenses: [],
  customers: [],
  settings: { currency: '£', businessName: 'My Skincare Books', lowStock: 3 },
  salesFilter: 'all',
  salesSearch: '',
  salesPlatformFilter: 'All',
  salesDateFrom: '',
  salesDateTo: '',
  salesOrderStatusFilter: 'All',
  invCategory: 'All',
  invSearch: '',
  expSearch: '',
  expCategoryFilter: 'All',
  expFrequencyFilter: 'All',
  custSearch: '',
  reportRange: 'month'
};

/* ---------- Utilities ---------- */
function uid() { return DB.uid(); }
function money(n) { const v = Number(n) || 0; return S.settings.currency + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function yearBounds() {
  const now = new Date();
  return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
}
function inRange(dateStr, start, end) { return dateStr >= start && dateStr <= end; }
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', icon: '🌤' };
  if (h < 18) return { text: 'Good afternoon', icon: '☀️' };
  return { text: 'Good evening', icon: '🌙' };
}

/* ---------- Data load ---------- */
function applyLoadedData(products, sales, expenses, metaRows, customers) {
  S.products = products.sort((a, b) => a.name.localeCompare(b.name));
  S.sales = sales.sort((a, b) => (b.date + (b.createdAt||'')).localeCompare(a.date + (a.createdAt||'')));
  S.expenses = expenses.sort((a, b) => b.date.localeCompare(a.date));
  S.customers = customers.sort((a, b) => a.name.localeCompare(b.name));
  const meta = {}; metaRows.forEach((m) => meta[m.key] = m.value);
  if (meta.currency) S.settings.currency = meta.currency;
  if (meta.businessName) S.settings.businessName = meta.businessName;
  if (meta.lowStock != null) S.settings.lowStock = meta.lowStock;
  document.getElementById('business-name').textContent = S.settings.businessName;
}
async function loadAll() {
  const [products, sales, expenses, metaRows, customers] = await Promise.all([
    DB.getAll('products'), DB.getAll('sales'), DB.getAll('expenses'), DB.getAll('meta'), DB.getAll('customers')
  ]);
  applyLoadedData(products, sales, expenses, metaRows, customers);
}
// Instant paint from the on-device cache (no network wait). Returns false if nothing is cached yet
// (e.g. first sign-in on a new device), in which case the caller should fall back to loadAll().
async function loadAllFromCache() {
  const names = ['products', 'sales', 'expenses', 'meta', 'customers'];
  const rows = await Promise.all(names.map((n) => DB.getAllFromCache(n)));
  if (rows.some((r) => r === null)) return false;
  applyLoadedData(...rows);
  return true;
}
async function saveMeta(key, value) { await DB.put('meta', { key, value }); }

/* ---------- Navigation ---------- */
function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.bottomnav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const fab = document.getElementById('fab-btn');
  if (tab === 'sales') { fab.style.display = 'flex'; fab.onclick = () => openNewOrderForm(); }
  else if (tab === 'inventory') { fab.style.display = 'flex'; fab.onclick = () => openProductForm(); }
  else if (tab === 'expenses') { fab.style.display = 'flex'; fab.onclick = () => openExpenseForm(); }
  else if (tab === 'customers') { fab.style.display = 'flex'; fab.onclick = () => openCustomerForm(); }
  else { fab.style.display = 'none'; }
  render();
}
document.querySelectorAll('.bottomnav button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.getElementById('settings-btn').addEventListener('click', openSettings);

function render() {
  const main = document.getElementById('main-content');
  if (S.tab === 'home') main.innerHTML = renderHome();
  else if (S.tab === 'sales') main.innerHTML = renderSales();
  else if (S.tab === 'inventory') main.innerHTML = renderInventory();
  else if (S.tab === 'expenses') main.innerHTML = renderExpenses();
  else if (S.tab === 'customers') main.innerHTML = renderCustomers();
  else if (S.tab === 'reports') main.innerHTML = renderReports();
  bindTabEvents();
}

/* ---------- HOME ---------- */
function renderHome() {
  const m = monthBounds(0);
  const monthSales = S.sales.filter((s) => inRange(s.date, m.start, m.end));
  const monthExpenses = S.expenses.filter((e) => inRange(e.date, m.start, m.end));
  const revenue = monthSales.reduce((a, s) => a + s.earned, 0);
  const profit = monthSales.reduce((a, s) => a + s.profit, 0);
  const expTotal = monthExpenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const net = profit - expTotal;
  const pending = S.sales.filter((s) => s.paymentStatus === 'Pending');
  const pendingTotal = pending.reduce((a, s) => a + s.earned, 0);
  const lowStock = allStockItems().filter((it) => it.stock <= Number(it.product.lowStockThreshold != null ? it.product.lowStockThreshold : S.settings.lowStock));
  const todaySales = S.sales.filter((s) => s.date === todayISO());

  const g = greeting();
  return `
    <div class="hero-banner">
      <div class="hero-icon">${g.icon}</div>
      <div><div class="hero-title">${g.text}</div><div class="hero-sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
    </div>

    <div class="section-title">This Month</div>
    <div class="stat-grid">
      <div class="stat-box" data-home-nav="reports-month" style="cursor:pointer"><div class="label">💰 Revenue</div><div class="value">${money(revenue)}</div></div>
      <div class="stat-box" data-home-nav="reports-month" style="cursor:pointer"><div class="label">📈 Profit</div><div class="value green">${money(profit)}</div></div>
      <div class="stat-box" data-home-nav="expenses" style="cursor:pointer"><div class="label">🧾 Expenses</div><div class="value red">${money(expTotal)}</div></div>
      <div class="stat-box" data-home-nav="reports-month" style="cursor:pointer"><div class="label">⚖️ Net Profit</div><div class="value ${net >= 0 ? 'green' : 'red'}">${money(net)}</div></div>
    </div>

    <div class="section-title">Today</div>
    <div class="card" data-home-nav="sales-today" style="cursor:pointer">
      <div class="row"><div class="row-main"><div class="row-title">${todaySales.length} sale${todaySales.length===1?'':'s'} logged today</div></div>
      <div class="row-end"><div class="row-amount pink">${money(todaySales.reduce((a,s)=>a+s.earned,0))}</div></div></div>
    </div>

    <div class="section-title">Needs Attention</div>
    <div class="card">
      <div class="row" data-home-nav="sales-pending" style="cursor:pointer"><div class="row-main"><div class="row-title">Pending payments</div><div class="row-sub">${pending.length} sale(s) awaiting payment</div></div>
      <div class="row-end"><div class="row-amount" style="color:var(--amber)">${money(pendingTotal)}</div></div></div>
      <div class="row" data-home-nav="inventory-low" style="cursor:pointer"><div class="row-main"><div class="row-title">Low stock items</div><div class="row-sub">${lowStock.length} product(s) running low</div></div>
      <div class="row-end"><span class="badge ${lowStock.length ? 'low' : 'ok'}">${lowStock.length ? 'Check stock' : 'All good'}</span></div></div>
    </div>

    ${lowStock.length ? `<div class="card"><h3>Low Stock</h3>${lowStock.map((it) => `
      <div class="row" data-home-product="${it.product.id}" style="cursor:pointer">
        <div class="row-icon">${categoryIcon(it.product.category)}</div>
        <div class="row-main"><div class="row-title">${esc(it.displayName)}</div><div class="row-sub">${esc(it.product.category)}</div></div>
      <div class="row-end"><span class="badge low">${it.stock} left</span></div></div>`).join('')}</div>` : ''}

    <div class="section-title">All Time</div>
    <div class="stat-grid">
      <div class="stat-box" data-home-nav="reports-all" style="cursor:pointer"><div class="label">Total Revenue</div><div class="value">${money(S.sales.reduce((a,s)=>a+s.earned,0))}</div></div>
      <div class="stat-box" data-home-nav="reports-all" style="cursor:pointer"><div class="label">Total Profit</div><div class="value green">${money(S.sales.reduce((a,s)=>a+s.profit,0))}</div></div>
    </div>
  `;
}
function bindHomeEvents() {
  document.querySelectorAll('[data-home-nav]').forEach((el) => el.addEventListener('click', () => {
    const target = el.dataset.homeNav;
    if (target === 'sales-today') { S.salesFilter = 'today'; setTab('sales'); }
    else if (target === 'sales-pending') { S.salesFilter = 'pending'; setTab('sales'); }
    else if (target === 'expenses') { setTab('expenses'); }
    else if (target === 'inventory-low') { setTab('inventory'); }
    else if (target === 'reports-month') { S.reportRange = 'month'; setTab('reports'); }
    else if (target === 'reports-all') { S.reportRange = 'all'; setTab('reports'); }
  }));
  document.querySelectorAll('[data-home-product]').forEach((el) => el.addEventListener('click', () => openProductForm(el.dataset.homeProduct)));
}

/* ---------- SALES ---------- */
function getFilteredSales() {
  let list = S.sales;
  if (S.salesFilter === 'paid') list = list.filter((s) => s.paymentStatus === 'Paid');
  if (S.salesFilter === 'pending') list = list.filter((s) => s.paymentStatus === 'Pending');
  if (S.salesFilter === 'today') list = list.filter((s) => s.date === todayISO());
  if (S.salesPlatformFilter !== 'All') list = list.filter((s) => s.platform === S.salesPlatformFilter);
  if (S.salesDateFrom) list = list.filter((s) => s.date && s.date >= S.salesDateFrom);
  if (S.salesDateTo) list = list.filter((s) => s.date && s.date <= S.salesDateTo);
  if (S.salesOrderStatusFilter !== 'All') list = list.filter((s) => (s.orderStatus || 'Pending') === S.salesOrderStatusFilter);
  const q = S.salesSearch.trim().toLowerCase();
  if (q) list = list.filter((s) => (s.productName || '').toLowerCase().includes(q) || (s.customer || '').toLowerCase().includes(q) || (s.orderNo || '').toLowerCase().includes(q));
  return list;
}
function salesRowsHtml(list) {
  const rows = list.map((s) => `
    <div class="row" data-sale="${s.id}" style="cursor:pointer">
      <div class="row-main">
        <div class="row-title">${esc(s.productName)}</div>
        <div class="row-sub">${fmtDate(s.date)} &middot; ${esc(s.customer || 'No name')} &middot; Qty ${s.qty}</div>
        <span class="badge platform">${esc(s.platform)}</span> <span class="badge ${s.paymentStatus === 'Paid' ? 'paid' : 'pending'}">${s.paymentStatus}</span> <span class="badge status-${(s.orderStatus || 'Pending').toLowerCase()}">${esc(s.orderStatus || 'Pending')}</span>
        ${s.paymentStatus === 'Pending' ? `<button type="button" class="mark-paid-btn" data-mark-paid="${s.id}">Mark Paid</button>` : ''}
      </div>
      <div class="row-end">
        <div class="row-amount">${money(s.earned)}</div>
        <div class="row-sub" style="color:${s.profit >= 0 ? 'var(--green)' : 'var(--red)'}">profit ${money(s.profit)}</div>
      </div>
    </div>`).join('');
  return rows || emptyState('No sales match', 'Try a different search or clear your filters');
}
function refreshSalesList() {
  const list = getFilteredSales();
  document.getElementById('sales-list').innerHTML = salesRowsHtml(list);
  bindSalesRowClicks();
}
function bindSalesRowClicks() {
  document.querySelectorAll('[data-sale]').forEach((el) => el.addEventListener('click', () => openSaleForm(el.dataset.sale)));
  document.querySelectorAll('[data-mark-paid]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    markSalePaid(el.dataset.markPaid);
  }));
}
async function markSalePaid(saleId) {
  const sale = S.sales.find((s) => s.id === saleId);
  if (!sale) return;
  sale.paymentStatus = 'Paid';
  sale.paymentDate = todayISO();
  await DB.put('sales', sale);
  toast('Marked as paid');
  await loadAll();
  render();
}
function salesFilterCount() {
  return (S.salesPlatformFilter !== 'All' ? 1 : 0) + (S.salesDateFrom ? 1 : 0) + (S.salesDateTo ? 1 : 0) + (S.salesOrderStatusFilter !== 'All' ? 1 : 0);
}
function renderSales() {
  const fCount = salesFilterCount();
  return `
    <div class="search-row">
      <input type="text" id="sales-search" placeholder="Search product, customer, order no..." value="${esc(S.salesSearch)}">
      <button class="filter-btn ${fCount ? 'active-filter' : ''}" id="sales-filter-btn">Filter${fCount ? `<span class="filter-badge">${fCount}</span>` : ''}</button>
    </div>
    <div class="pill-tabs">
      <button data-sfilter="all" class="${S.salesFilter==='all'?'active':''}">All (${S.sales.length})</button>
      <button data-sfilter="today" class="${S.salesFilter==='today'?'active':''}">Today</button>
      <button data-sfilter="paid" class="${S.salesFilter==='paid'?'active':''}">Paid</button>
      <button data-sfilter="pending" class="${S.salesFilter==='pending'?'active':''}">Pending</button>
    </div>
    <div class="card" id="sales-list">${salesRowsHtml(getFilteredSales())}</div>
  `;
}
function openSalesFilterSheet() {
  openSheet('Filter Sales', `
    <label>Platform</label>
    <div class="chips">${['All', ...PLATFORMS].map((p) => `<div class="chip ${S.salesPlatformFilter===p?'active':''}" data-pf="${esc(p)}">${esc(p)}</div>`).join('')}</div>
    <label>Order Status</label>
    <div class="chips">${['All', ...ORDER_STATUSES].map((s) => `<div class="chip ${S.salesOrderStatusFilter===s?'active':''}" data-osf="${esc(s)}">${esc(s)}</div>`).join('')}</div>
    <div class="field-row">
      <div><label>From date</label><input type="date" id="filter-date-from" value="${S.salesDateFrom}"></div>
      <div><label>To date</label><input type="date" id="filter-date-to" value="${S.salesDateTo}"></div>
    </div>
    <button class="btn primary" id="apply-sales-filter">Apply Filters</button>
    <button class="btn ghost" id="clear-sales-filter">Clear Filters</button>
  `);
  let pf = S.salesPlatformFilter;
  let osf = S.salesOrderStatusFilter;
  document.querySelectorAll('[data-pf]').forEach((el) => el.addEventListener('click', () => {
    pf = el.dataset.pf;
    document.querySelectorAll('[data-pf]').forEach((x) => x.classList.toggle('active', x.dataset.pf === pf));
  }));
  document.querySelectorAll('[data-osf]').forEach((el) => el.addEventListener('click', () => {
    osf = el.dataset.osf;
    document.querySelectorAll('[data-osf]').forEach((x) => x.classList.toggle('active', x.dataset.osf === osf));
  }));
  document.getElementById('apply-sales-filter').addEventListener('click', () => {
    S.salesPlatformFilter = pf;
    S.salesOrderStatusFilter = osf;
    S.salesDateFrom = document.getElementById('filter-date-from').value;
    S.salesDateTo = document.getElementById('filter-date-to').value;
    closeSheet();
    render();
  });
  document.getElementById('clear-sales-filter').addEventListener('click', () => {
    S.salesPlatformFilter = 'All'; S.salesOrderStatusFilter = 'All'; S.salesDateFrom = ''; S.salesDateTo = '';
    closeSheet();
    render();
  });
}

/* ---------- INVENTORY ---------- */
function getFilteredStockItems() {
  let items = allStockItems().filter((it) => S.invCategory === 'All' || it.product.category === S.invCategory);
  const q = S.invSearch.trim().toLowerCase();
  if (q) items = items.filter((it) => it.displayName.toLowerCase().includes(q));
  return items;
}
function productRowsHtml(items) {
  const rows = items.map((it) => {
    const low = it.stock <= Number(it.product.lowStockThreshold != null ? it.product.lowStockThreshold : S.settings.lowStock);
    return `
    <div class="row" data-product="${it.product.id}" style="cursor:pointer">
      <div class="row-icon">${categoryIcon(it.product.category)}</div>
      <div class="row-main">
        <div class="row-title">${esc(it.displayName)}</div>
        <div class="row-sub">${esc(it.product.category)} &middot; cost ${money(it.product.costPrice)} &middot; sells ${money(it.product.sellingPrice)}</div>
      </div>
      <div class="row-end"><span class="badge ${low ? 'low' : 'ok'}">${it.stock} in stock</span></div>
    </div>`;
  }).join('');
  return rows || emptyState('No products match', 'Try a different search or category');
}
function refreshInventoryList() {
  const list = getFilteredStockItems();
  document.getElementById('inventory-list').innerHTML = productRowsHtml(list);
  bindInventoryRowClicks();
}
function bindInventoryRowClicks() {
  document.querySelectorAll('[data-product]').forEach((el) => el.addEventListener('click', () => openProductForm(el.dataset.product)));
}
function renderInventory() {
  const cats = ['All', ...CATEGORIES];
  return `
    <div class="search-row">
      <input type="text" id="inventory-search" placeholder="Search products..." value="${esc(S.invSearch)}">
    </div>
    <div class="chips">${cats.map((c) => `<div class="chip ${S.invCategory===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</div>`).join('')}</div>
    <div class="card" id="inventory-list">${productRowsHtml(getFilteredStockItems())}</div>
  `;
}

/* ---------- EXPENSES ---------- */
function getFilteredExpenses() {
  let list = S.expenses;
  if (S.expCategoryFilter !== 'All') list = list.filter((e) => e.category === S.expCategoryFilter);
  if (S.expFrequencyFilter !== 'All') list = list.filter((e) => e.frequency === S.expFrequencyFilter);
  const q = S.expSearch.trim().toLowerCase();
  if (q) list = list.filter((e) => (e.name || '').toLowerCase().includes(q));
  return list;
}
function expenseRowsHtml(list) {
  const rows = list.map((e) => `
    <div class="row" data-expense="${e.id}" style="cursor:pointer">
      <div class="row-main">
        <div class="row-title">${esc(e.name)}</div>
        <div class="row-sub">${fmtDate(e.date)} &middot; ${esc(e.category)} &middot; ${esc(e.frequency)}</div>
      </div>
      <div class="row-end"><div class="row-amount red">${money(e.amount)}</div></div>
    </div>`).join('');
  return rows || emptyState('No expenses match', 'Try a different search or filter');
}
function refreshExpensesList() {
  const list = getFilteredExpenses();
  document.getElementById('expenses-list').innerHTML = expenseRowsHtml(list);
  bindExpenseRowClicks();
}
function bindExpenseRowClicks() {
  document.querySelectorAll('[data-expense]').forEach((el) => el.addEventListener('click', () => openExpenseForm(el.dataset.expense)));
}
function expensesFilterCount() {
  return (S.expCategoryFilter !== 'All' ? 1 : 0) + (S.expFrequencyFilter !== 'All' ? 1 : 0);
}
function renderExpenses() {
  const total = S.expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const fCount = expensesFilterCount();
  return `
    <div class="stat-grid" style="margin-bottom:12px">
      <div class="stat-box wide"><div class="label">Total Expenses Logged</div><div class="value red">${money(total)}</div></div>
    </div>
    <div class="search-row">
      <input type="text" id="expenses-search" placeholder="Search expenses..." value="${esc(S.expSearch)}">
      <button class="filter-btn ${fCount ? 'active-filter' : ''}" id="expenses-filter-btn">Filter${fCount ? `<span class="filter-badge">${fCount}</span>` : ''}</button>
    </div>
    <div class="card" id="expenses-list">${expenseRowsHtml(getFilteredExpenses())}</div>
  `;
}
function openExpensesFilterSheet() {
  openSheet('Filter Expenses', `
    <label>Category</label>
    <div class="chips">${['All', ...EXPENSE_CATEGORIES].map((c) => `<div class="chip ${S.expCategoryFilter===c?'active':''}" data-ecf="${esc(c)}">${esc(c)}</div>`).join('')}</div>
    <label>Frequency</label>
    <div class="chips">${['All','One-time','Monthly','Yearly'].map((f) => `<div class="chip ${S.expFrequencyFilter===f?'active':''}" data-eff="${esc(f)}">${esc(f)}</div>`).join('')}</div>
    <button class="btn primary" id="apply-expenses-filter">Apply Filters</button>
    <button class="btn ghost" id="clear-expenses-filter">Clear Filters</button>
  `);
  let ecf = S.expCategoryFilter, eff = S.expFrequencyFilter;
  document.querySelectorAll('[data-ecf]').forEach((el) => el.addEventListener('click', () => {
    ecf = el.dataset.ecf;
    document.querySelectorAll('[data-ecf]').forEach((x) => x.classList.toggle('active', x.dataset.ecf === ecf));
  }));
  document.querySelectorAll('[data-eff]').forEach((el) => el.addEventListener('click', () => {
    eff = el.dataset.eff;
    document.querySelectorAll('[data-eff]').forEach((x) => x.classList.toggle('active', x.dataset.eff === eff));
  }));
  document.getElementById('apply-expenses-filter').addEventListener('click', () => {
    S.expCategoryFilter = ecf; S.expFrequencyFilter = eff;
    closeSheet();
    render();
  });
  document.getElementById('clear-expenses-filter').addEventListener('click', () => {
    S.expCategoryFilter = 'All'; S.expFrequencyFilter = 'All';
    closeSheet();
    render();
  });
}

/* ---------- CUSTOMERS ---------- */
function getCustomerStats() {
  const map = {};
  S.sales.forEach((s) => {
    const name = (s.customer || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!map[key]) map[key] = { name, totalSpent: 0, totalProfit: 0, orderCount: 0, lastOrderDate: '' };
    map[key].totalSpent += s.earned;
    map[key].totalProfit += s.profit;
    map[key].orderCount += 1;
    if (!map[key].lastOrderDate || s.date > map[key].lastOrderDate) map[key].lastOrderDate = s.date;
  });
  return Object.values(map).map((c) => {
    const record = S.customers.find((cc) => cc.name.trim().toLowerCase() === c.name.toLowerCase());
    return { ...c, id: record ? record.id : null, phone: record ? record.phone : '', notes: record ? record.notes : '' };
  }).sort((a, b) => b.totalSpent - a.totalSpent);
}
function getFilteredCustomerStats() {
  let list = getCustomerStats();
  const q = S.custSearch.trim().toLowerCase();
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
  return list;
}
function customerRowsHtml(list) {
  const rows = list.map((c) => `
    <div class="row" data-customer="${esc(c.name)}" style="cursor:pointer">
      <div class="row-main">
        <div class="row-title">${esc(c.name)}</div>
        <div class="row-sub">${c.orderCount} order(s) &middot; last ${fmtDate(c.lastOrderDate)}</div>
      </div>
      <div class="row-end"><div class="row-amount pink">${money(c.totalSpent)}</div></div>
    </div>`).join('');
  return rows || emptyState('No customers yet', 'Customers appear automatically the first time you log a sale for them');
}
function refreshCustomersList() {
  document.getElementById('customers-list').innerHTML = customerRowsHtml(getFilteredCustomerStats());
  bindCustomerRowClicks();
}
function bindCustomerRowClicks() {
  document.querySelectorAll('[data-customer]').forEach((el) => el.addEventListener('click', () => openCustomerForm(el.dataset.customer)));
}
function renderCustomers() {
  return `
    <div class="search-row">
      <input type="text" id="customers-search" placeholder="Search customers..." value="${esc(S.custSearch)}">
    </div>
    <div class="card" id="customers-list">${customerRowsHtml(getFilteredCustomerStats())}</div>
  `;
}
function openCustomerForm(name) {
  const stats = name ? getCustomerStats().find((c) => c.name === name) : null;
  const record = name ? S.customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase()) : null;
  const custSales = name ? S.sales.filter((s) => (s.customer || '').trim().toLowerCase() === name.toLowerCase()).sort((a, b) => b.date.localeCompare(a.date)) : [];

  openSheet(name ? 'Customer' : 'Add Customer', `
    <label>Name</label><input type="text" id="c-name" value="${esc((record && record.name) || name || '')}">
    <label>Phone</label><input type="text" id="c-phone" value="${esc((record && record.phone) || '')}">
    <label>Notes</label><textarea id="c-notes">${esc((record && record.notes) || '')}</textarea>

    ${stats ? `
    <div class="customer-stat-row">
      <div class="item"><div class="lab">ORDERS</div><div class="val">${stats.orderCount}</div></div>
      <div class="item"><div class="lab">TOTAL SPENT</div><div class="val">${money(stats.totalSpent)}</div></div>
      <div class="item"><div class="lab">LAST ORDER</div><div class="val">${fmtDate(stats.lastOrderDate)}</div></div>
    </div>` : ''}

    <button class="btn primary" id="save-customer-btn">Save</button>
    ${name ? '<button class="btn secondary" id="new-sale-for-customer-btn">+ New Sale for this Customer</button>' : ''}
    ${record ? '<button class="btn danger" id="delete-customer-btn">Delete Customer Record</button>' : ''}

    ${custSales.length ? `<div class="section-title">Order History</div>${custSales.map((s) => `
      <div class="row"><div class="row-main"><div class="row-title">${esc(s.productName)}</div><div class="row-sub">${fmtDate(s.date)} &middot; Qty ${s.qty}</div></div>
      <div class="row-end"><div class="row-amount">${money(s.earned)}</div></div></div>`).join('')}` : ''}
  `);

  document.getElementById('save-customer-btn').addEventListener('click', () => saveCustomer(record));
  if (name) document.getElementById('new-sale-for-customer-btn').addEventListener('click', () => {
    closeSheet();
    openNewOrderForm(name);
  });
  if (record) document.getElementById('delete-customer-btn').addEventListener('click', () => deleteCustomer(record));
}
async function saveCustomer(record) {
  const name = document.getElementById('c-name').value.trim();
  if (!name) { toast('Please enter a name'); return; }
  const customer = {
    id: record ? record.id : uid(),
    name,
    phone: document.getElementById('c-phone').value.trim(),
    notes: document.getElementById('c-notes').value.trim(),
    createdAt: record ? record.createdAt : new Date().toISOString()
  };
  await DB.put('customers', customer);
  closeSheet();
  toast('Customer saved');
  await loadAll();
  render();
}
async function deleteCustomer(record) {
  if (!confirm(`Delete saved contact info for "${record.name}"? Their past sales history will remain untouched.`)) return;
  await DB.delete('customers', record.id);
  closeSheet();
  toast('Customer record deleted');
  await loadAll();
  render();
}

/* ---------- REPORTS ---------- */
function reportRangeBounds() {
  if (S.reportRange === 'month') return monthBounds(0);
  if (S.reportRange === 'lastmonth') return monthBounds(-1);
  if (S.reportRange === 'year') return yearBounds();
  return { start: '0000-01-01', end: '9999-12-31' };
}
function barChartHtml(items) {
  if (!items.length) return emptyState('No data yet', '');
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return items.map((i) => `
    <div class="bar-row">
      <div class="bar-label">${esc(i.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (Math.abs(i.value) / max) * 100)}%"></div></div>
      <div class="bar-value">${money(i.value)}</div>
    </div>`).join('');
}
function monthlyRevenueTrend(months) {
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = monthBounds(-i);
    const label = new Date(start + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' });
    const total = S.sales.filter((s) => inRange(s.date, start, end)).reduce((a, s) => a + s.earned, 0);
    result.push({ label, value: total });
  }
  return result;
}
function renderReports() {
  const { start, end } = reportRangeBounds();
  const sales = S.sales.filter((s) => inRange(s.date, start, end));
  const expenses = S.expenses.filter((e) => inRange(e.date, start, end));
  const revenue = sales.reduce((a, s) => a + s.earned, 0);
  const productCost = sales.reduce((a, s) => a + (Number(s.productCost) * Number(s.qty)), 0);
  const fees = sales.reduce((a, s) => a + Number(s.platformFee || 0), 0);
  const shipCost = sales.reduce((a, s) => a + Number(s.shippingCost || 0), 0);
  const profit = sales.reduce((a, s) => a + s.profit, 0);
  const expTotal = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const net = profit - expTotal;

  const byPlatform = {};
  sales.forEach((s) => { byPlatform[s.platform] = byPlatform[s.platform] || { revenue: 0, profit: 0, count: 0 }; byPlatform[s.platform].revenue += s.earned; byPlatform[s.platform].profit += s.profit; byPlatform[s.platform].count += 1; });

  const byProduct = {};
  sales.forEach((s) => { byProduct[s.productName] = byProduct[s.productName] || { qty: 0, profit: 0 }; byProduct[s.productName].qty += Number(s.qty); byProduct[s.productName].profit += s.profit; });
  const topProducts = Object.entries(byProduct).sort((a, b) => b[1].profit - a[1].profit).slice(0, 8);

  return `
    <div class="pill-tabs">
      <button data-range="month" class="${S.reportRange==='month'?'active':''}">This Month</button>
      <button data-range="lastmonth" class="${S.reportRange==='lastmonth'?'active':''}">Last Month</button>
      <button data-range="year" class="${S.reportRange==='year'?'active':''}">This Year</button>
      <button data-range="all" class="${S.reportRange==='all'?'active':''}">All Time</button>
    </div>
    <div class="stat-grid">
      <div class="stat-box"><div class="label">Revenue</div><div class="value">${money(revenue)}</div></div>
      <div class="stat-box"><div class="label">Product + Ship Cost</div><div class="value">${money(productCost + shipCost)}</div></div>
      <div class="stat-box"><div class="label">Platform Fees</div><div class="value">${money(fees)}</div></div>
      <div class="stat-box"><div class="label">Sales Profit</div><div class="value green">${money(profit)}</div></div>
      <div class="stat-box"><div class="label">Expenses</div><div class="value red">${money(expTotal)}</div></div>
      <div class="stat-box"><div class="label">Net Profit</div><div class="value ${net>=0?'green':'red'}">${money(net)}</div></div>
    </div>

    <div class="chart-card">
      <h3>Revenue Trend (Last 6 Months)</h3>
      ${barChartHtml(monthlyRevenueTrend(6))}
    </div>

    <div class="chart-card">
      <h3>Revenue By Platform</h3>
      ${barChartHtml(Object.entries(byPlatform).map(([k, v]) => ({ label: k, value: v.revenue })).sort((a, b) => b.value - a.value))}
    </div>

    <div class="section-title">By Platform</div>
    <div class="card">${Object.keys(byPlatform).length ? Object.entries(byPlatform).map(([k, v]) => `
      <div class="row"><div class="row-main"><div class="row-title">${esc(k)}</div><div class="row-sub">${v.count} sale(s)</div></div>
      <div class="row-end"><div class="row-amount">${money(v.revenue)}</div><div class="row-sub" style="color:var(--green)">profit ${money(v.profit)}</div></div></div>`).join('') : emptyState('No sales in this range', '')}</div>

    <div class="section-title">Top Products (by profit)</div>
    <div class="card">${topProducts.length ? topProducts.map(([name, v]) => `
      <div class="row"><div class="row-main"><div class="row-title">${esc(name)}</div><div class="row-sub">${v.qty} sold</div></div>
      <div class="row-end"><div class="row-amount green">${money(v.profit)}</div></div></div>`).join('') : emptyState('No sales in this range', '')}</div>

    <button class="btn secondary" id="export-csv-btn">Export sales (CSV for Excel)</button>
  `;
}

function emptyState(title, sub) {
  return `<div class="empty-state"><div class="big">&#127800;</div><div style="font-weight:700">${esc(title)}</div><div style="font-size:12.5px;margin-top:4px">${esc(sub)}</div></div>`;
}

/* ---------- Event binding per tab ---------- */
function bindTabEvents() {
  bindHomeEvents();
  bindSalesRowClicks();
  bindInventoryRowClicks();
  bindExpenseRowClicks();
  bindCustomerRowClicks();
  document.querySelectorAll('[data-sfilter]').forEach((el) => el.addEventListener('click', () => { S.salesFilter = el.dataset.sfilter; render(); }));
  document.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => { S.invCategory = el.dataset.cat; render(); }));
  document.querySelectorAll('[data-range]').forEach((el) => el.addEventListener('click', () => { S.reportRange = el.dataset.range; render(); }));
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportSalesCSV);

  const salesSearch = document.getElementById('sales-search');
  if (salesSearch) salesSearch.addEventListener('input', () => { S.salesSearch = salesSearch.value; refreshSalesList(); });
  const salesFilterBtn = document.getElementById('sales-filter-btn');
  if (salesFilterBtn) salesFilterBtn.addEventListener('click', openSalesFilterSheet);

  const invSearch = document.getElementById('inventory-search');
  if (invSearch) invSearch.addEventListener('input', () => { S.invSearch = invSearch.value; refreshInventoryList(); });

  const expSearch = document.getElementById('expenses-search');
  if (expSearch) expSearch.addEventListener('input', () => { S.expSearch = expSearch.value; refreshExpensesList(); });
  const expFilterBtn = document.getElementById('expenses-filter-btn');
  if (expFilterBtn) expFilterBtn.addEventListener('click', openExpensesFilterSheet);

  const custSearch = document.getElementById('customers-search');
  if (custSearch) custSearch.addEventListener('input', () => { S.custSearch = custSearch.value; refreshCustomersList(); });
}

/* ---------- Modal sheet helper ---------- */
function openSheet(title, bodyHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="sheet-overlay" id="sheet-overlay">
      <div class="sheet" id="sheet-body">
        <div class="sheet-header"><h2>${esc(title)}</h2><button class="sheet-close" id="sheet-close">&times;</button></div>
        ${bodyHtml}
      </div>
    </div>`;
  document.getElementById('sheet-overlay').addEventListener('click', (e) => { if (e.target.id === 'sheet-overlay') closeSheet(); });
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
}
function closeSheet() { document.getElementById('modal-root').innerHTML = ''; }

/* ---------- Sale form ---------- */
// A searchable product picker: a text input that filters S.products as you type, a suggestions
// dropdown, and a clear (x) button. hiddenEl holds the resolved productId, same as a <select> would.
// Closes any open combo-list on a tap/click outside its combo-wrap. A single delegated listener
// (rather than a blur-timeout race) so selection is reliable on touch devices, not just mouse.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.combo-list').forEach((listEl) => {
    if (listEl.style.display !== 'none' && !listEl.closest('.combo-wrap').contains(e.target)) {
      listEl.style.display = 'none';
    }
  });
});

function setupProductCombo(inputEl, clearEl, listEl, hiddenEl, onChosen) {
  function renderList(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    const matches = q ? S.products.filter((p) => p.name.toLowerCase().includes(q)) : S.products;
    listEl.innerHTML = matches.length
      ? matches.slice(0, 30).map((p) => `<div class="combo-item" data-pid="${p.id}">${esc(p.name)} <span class="combo-item-stock">${productTotalStock(p)} in stock</span></div>`).join('')
      : `<div class="combo-empty">No matching products</div>`;
    listEl.style.display = 'block';
    listEl.querySelectorAll('.combo-item').forEach((el) => {
      el.onclick = () => selectProduct(S.products.find((x) => x.id === el.dataset.pid));
    });
  }
  function selectProduct(p) {
    hiddenEl.value = p ? p.id : '';
    inputEl.value = p ? p.name : '';
    clearEl.style.display = inputEl.value ? '' : 'none';
    listEl.style.display = 'none';
    onChosen(p);
  }
  inputEl.onfocus = () => renderList(inputEl.value);
  inputEl.oninput = () => {
    hiddenEl.value = '';
    clearEl.style.display = inputEl.value ? '' : 'none';
    renderList(inputEl.value);
    onChosen(null);
  };
  clearEl.onclick = () => { inputEl.value = ''; selectProduct(null); inputEl.focus(); };
}

function openSaleForm(saleId) {
  const editing = saleId ? S.sales.find((s) => s.id === saleId) : null;
  const editingProduct = editing && editing.productId ? S.products.find((p) => p.id === editing.productId) : null;
  const platformOptions = PLATFORMS.map((p) => `<option value="${p}" ${editing && editing.platform === p ? 'selected' : ''}>${p}</option>`).join('');

  openSheet(editing ? 'Edit Sale' : 'Log a Sale', `
    <label>Date</label><input type="date" id="f-date" value="${editing ? editing.date : todayISO()}">
    <label>Platform</label><select id="f-platform">${platformOptions}</select>
    <div class="field-row">
      <div><label>Customer name</label><input type="text" id="f-customer" list="customer-datalist" placeholder="e.g. Sue" value="${editing ? esc(editing.customer) : ''}">
      <datalist id="customer-datalist">${S.customers.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></div>
      <div><label>Order No (optional)</label><input type="text" id="f-orderno" value="${editing ? esc(editing.orderNo || '') : ''}"></div>
    </div>
    <label>Product</label>
    <div class="combo-wrap">
      <input type="text" id="f-product-search" class="combo-input" placeholder="Search products..." autocomplete="off" value="${editingProduct ? esc(editingProduct.name) : ''}">
      <button type="button" class="combo-clear" id="f-product-clear" style="${editingProduct ? '' : 'display:none'}">&times;</button>
      <div class="combo-list" id="f-product-list"></div>
    </div>
    <input type="hidden" id="f-product" value="${editingProduct ? editingProduct.id : ''}">
    <div id="f-variant-wrap" style="display:none">
      <label>Variant</label>
      <select id="f-variant"></select>
    </div>
    <label>Product name (if custom)</label><input type="text" id="f-customname" value="${editing && !editing.productId ? esc(editing.productName) : ''}" placeholder="Type product name">
    <div class="field-row">
      <div><label>Qty</label><input type="number" id="f-qty" min="1" value="${editing ? editing.qty : 1}"></div>
      <div><label>Selling price / unit</label><input type="number" step="0.01" id="f-sellingprice" value="${editing ? editing.sellingPrice : ''}"></div>
    </div>
    <div class="field-row">
      <div><label>Shipping charged to customer</label><input type="number" step="0.01" id="f-shipcharged" value="${editing ? editing.shippingCharged : 0}"></div>
      <div><label>Platform / payment fee</label><input type="number" step="0.01" id="f-fee" value="${editing ? editing.platformFee : 0}"></div>
    </div>
    <div class="field-row">
      <div><label>Product cost / unit</label><input type="number" step="0.01" id="f-cost" value="${editing ? editing.productCost : ''}"></div>
      <div><label>Shipping cost (what you paid)</label><input type="number" step="0.01" id="f-shipcost" value="${editing ? editing.shippingCost : 0}"></div>
    </div>
    <div class="field-row">
      <div><label>Payment status</label><select id="f-status"><option ${editing && editing.paymentStatus==='Paid'?'selected':''}>Paid</option><option ${editing && editing.paymentStatus==='Pending'?'selected':''}>Pending</option></select></div>
      <div><label>Payment date</label><input type="date" id="f-paydate" value="${editing ? editing.paymentDate || '' : ''}"></div>
    </div>
    <label>Order status</label>
    <select id="f-orderstatus">${ORDER_STATUSES.map((s) => `<option ${editing && (editing.orderStatus || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label>Notes</label><textarea id="f-notes">${editing ? esc(editing.notes || '') : ''}</textarea>

    <div class="computed-box">
      <div class="item"><div class="lab">EARNED</div><div class="val" id="calc-earned">${S.settings.currency}0.00</div></div>
      <div class="item"><div class="lab">PROFIT</div><div class="val" id="calc-profit">${S.settings.currency}0.00</div></div>
    </div>

    <button class="btn primary" id="save-sale-btn">${editing ? 'Save Changes' : 'Save Sale'}</button>
    ${editing ? '<button class="btn secondary" id="share-receipt-btn">Share Receipt</button>' : ''}
    ${editing ? '<button class="btn secondary" id="duplicate-sale-btn">Duplicate as New Sale</button>' : ''}
    ${editing ? '<button class="btn danger" id="delete-sale-btn">Delete Sale</button>' : ''}
  `);

  function populateSaleVariantSelect(product, selectedVariantId) {
    const wrap = document.getElementById('f-variant-wrap');
    const sel = document.getElementById('f-variant');
    const variants = productVariants(product);
    if (!product || !variants.length) { wrap.style.display = 'none'; sel.innerHTML = ''; return; }
    sel.innerHTML = variants.map((v) => `<option value="${v.id}" ${v.id === selectedVariantId ? 'selected' : ''}>${esc(v.label)} (${v.stock} in stock)</option>`).join('');
    wrap.style.display = '';
  }
  const productHidden = document.getElementById('f-product');
  setupProductCombo(
    document.getElementById('f-product-search'),
    document.getElementById('f-product-clear'),
    document.getElementById('f-product-list'),
    productHidden,
    (p) => {
      populateSaleVariantSelect(p, null);
      if (p) { document.getElementById('f-sellingprice').value = p.sellingPrice; document.getElementById('f-cost').value = p.costPrice; }
      recalcSaleForm();
    }
  );
  document.getElementById('f-variant').addEventListener('change', recalcSaleForm);
  if (productHidden.value) {
    populateSaleVariantSelect(S.products.find((x) => x.id === productHidden.value), editing ? editing.variantId : null);
  }
  ['f-qty', 'f-sellingprice', 'f-shipcharged', 'f-fee', 'f-cost', 'f-shipcost'].forEach((id) => document.getElementById(id).addEventListener('input', recalcSaleForm));
  recalcSaleForm();

  document.getElementById('save-sale-btn').addEventListener('click', () => saveSale(editing));
  if (editing) document.getElementById('delete-sale-btn').addEventListener('click', () => deleteSale(editing));
  if (editing) document.getElementById('share-receipt-btn').addEventListener('click', () => shareReceipt(editing));
  if (editing) document.getElementById('duplicate-sale-btn').addEventListener('click', () => duplicateSaleAsOrder(editing));
}

let orderItemNextIdx = 0;

function orderItemHtml(idx) {
  return `
    <div class="sale-item-block" data-idx="${idx}">
      <div class="sale-item-header">
        <span>Item</span>
        <button type="button" class="remove-item-btn" data-remove-item="${idx}" style="${idx === 0 ? 'display:none' : ''}">Remove</button>
      </div>
      <label>Product</label>
      <div class="combo-wrap">
        <input type="text" class="oi-product-search combo-input" data-idx="${idx}" placeholder="Search products..." autocomplete="off">
        <button type="button" class="combo-clear oi-product-clear" data-idx="${idx}" style="display:none">&times;</button>
        <div class="combo-list oi-product-list" data-idx="${idx}"></div>
      </div>
      <input type="hidden" class="oi-product" data-idx="${idx}">
      <div class="oi-variant-wrap" data-idx="${idx}" style="display:none">
        <label>Variant</label>
        <select class="oi-variant" data-idx="${idx}"></select>
      </div>
      <label>Product name (if custom)</label><input type="text" class="oi-customname" data-idx="${idx}" placeholder="Type product name">
      <div class="field-row">
        <div><label>Qty</label><input type="number" class="oi-qty" data-idx="${idx}" min="1" value="1"></div>
        <div><label>Selling price / unit</label><input type="number" step="0.01" class="oi-sellingprice" data-idx="${idx}"></div>
      </div>
      <label>Product cost / unit</label><input type="number" step="0.01" class="oi-cost" data-idx="${idx}">
    </div>
  `;
}

function openNewOrderForm(prefillCustomer) {
  orderItemNextIdx = 1;
  const platformOptions = PLATFORMS.map((p) => `<option value="${p}">${p}</option>`).join('');

  openSheet('Log an Order', `
    <label>Date</label><input type="date" id="f-date" value="${todayISO()}">
    <label>Platform</label><select id="f-platform">${platformOptions}</select>
    <div class="field-row">
      <div><label>Customer name</label><input type="text" id="f-customer" list="customer-datalist" placeholder="e.g. Sue" value="${esc(prefillCustomer || '')}">
      <datalist id="customer-datalist">${S.customers.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></div>
      <div><label>Order No (optional)</label><input type="text" id="f-orderno"></div>
    </div>

    <div class="section-title">Items</div>
    <div id="order-items">${orderItemHtml(0)}</div>
    <button type="button" class="link-btn" id="add-item-btn">+ Add another item</button>

    <div class="section-title">Shipping &amp; Fees (whole order)</div>
    <div class="field-row">
      <div><label>Shipping charged to customer</label><input type="number" step="0.01" id="f-shipcharged" value="0"></div>
      <div><label>Platform / payment fee</label><input type="number" step="0.01" id="f-fee" value="0"></div>
    </div>
    <label>Shipping cost (what you paid)</label><input type="number" step="0.01" id="f-shipcost" value="0">

    <div class="field-row">
      <div><label>Payment status</label><select id="f-status"><option>Paid</option><option>Pending</option></select></div>
      <div><label>Payment date</label><input type="date" id="f-paydate"></div>
    </div>
    <label>Order status</label>
    <select id="f-orderstatus">${ORDER_STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
    <label>Notes</label><textarea id="f-notes"></textarea>

    <div class="computed-box">
      <div class="item"><div class="lab">TOTAL EARNED</div><div class="val" id="calc-earned">${S.settings.currency}0.00</div></div>
      <div class="item"><div class="lab">TOTAL PROFIT</div><div class="val" id="calc-profit">${S.settings.currency}0.00</div></div>
    </div>

    <button class="btn primary" id="save-order-btn">Save Order</button>
  `);

  bindOrderItemsContainer();
  ['f-shipcharged', 'f-fee', 'f-shipcost'].forEach((id) => document.getElementById(id).addEventListener('input', recalcOrderTotals));
  document.getElementById('add-item-btn').addEventListener('click', () => {
    document.getElementById('order-items').insertAdjacentHTML('beforeend', orderItemHtml(orderItemNextIdx));
    orderItemNextIdx++;
    bindOrderItemsContainer();
    recalcOrderTotals();
  });
  document.getElementById('save-order-btn').addEventListener('click', saveNewOrder);
  recalcOrderTotals();
}

function duplicateSaleAsOrder(sale) {
  closeSheet();
  openNewOrderForm(sale.customer);
  document.getElementById('f-platform').value = sale.platform;
  const block = document.querySelector('#order-items .sale-item-block');
  if (sale.productId && S.products.some((p) => p.id === sale.productId)) {
    const p = S.products.find((x) => x.id === sale.productId);
    block.querySelector('.oi-product').value = sale.productId;
    block.querySelector('.oi-product-search').value = p.name;
    block.querySelector('.oi-product-clear').style.display = '';
    populateOiVariantSelect(block, p, sale.variantId);
  } else {
    block.querySelector('.oi-customname').value = sale.productName;
  }
  block.querySelector('.oi-qty').value = sale.qty;
  block.querySelector('.oi-sellingprice').value = sale.sellingPrice;
  block.querySelector('.oi-cost').value = sale.productCost;
  recalcOrderTotals();
  toast('Review the details and tap Save Order');
}

function populateOiVariantSelect(block, product, selectedVariantId) {
  const wrap = block.querySelector('.oi-variant-wrap');
  const sel = block.querySelector('.oi-variant');
  const variants = productVariants(product);
  if (!product || !variants.length) { wrap.style.display = 'none'; sel.innerHTML = ''; return; }
  sel.innerHTML = variants.map((v) => `<option value="${v.id}" ${v.id === selectedVariantId ? 'selected' : ''}>${esc(v.label)} (${v.stock} in stock)</option>`).join('');
  wrap.style.display = '';
}
function bindOrderItemsContainer() {
  const container = document.getElementById('order-items');
  container.querySelectorAll('.sale-item-block').forEach((block) => {
    setupProductCombo(
      block.querySelector('.oi-product-search'),
      block.querySelector('.oi-product-clear'),
      block.querySelector('.oi-product-list'),
      block.querySelector('.oi-product'),
      (p) => {
        populateOiVariantSelect(block, p, null);
        if (p) {
          block.querySelector('.oi-sellingprice').value = p.sellingPrice;
          block.querySelector('.oi-cost').value = p.costPrice;
        }
        recalcOrderTotals();
      }
    );
  });
  container.querySelectorAll('.oi-variant').forEach((sel) => { sel.onchange = recalcOrderTotals; });
  container.querySelectorAll('.oi-qty, .oi-sellingprice, .oi-cost').forEach((el) => { el.oninput = recalcOrderTotals; });
  container.querySelectorAll('[data-remove-item]').forEach((btn) => {
    btn.onclick = () => { btn.closest('.sale-item-block').remove(); recalcOrderTotals(); };
  });
}

function getOrderItemsData() {
  return [...document.querySelectorAll('#order-items .sale-item-block')].map((block) => {
    const productSel = block.querySelector('.oi-product');
    const productId = productSel.value || null;
    const product = productId ? S.products.find((p) => p.id === productId) : null;
    const hasVariants = product && productVariants(product).length > 0;
    const variantSel = block.querySelector('.oi-variant');
    const variantId = hasVariants ? (variantSel.value || null) : null;
    const variant = hasVariants && variantId ? productVariants(product).find((v) => v.id === variantId) : null;
    const customName = block.querySelector('.oi-customname').value.trim();
    const productName = product ? productDisplayName(product, variant) : customName;
    return {
      productId, variantId, productName,
      qty: Number(block.querySelector('.oi-qty').value) || 0,
      sellingPrice: Number(block.querySelector('.oi-sellingprice').value) || 0,
      productCost: Number(block.querySelector('.oi-cost').value) || 0
    };
  });
}

function recalcOrderTotals() {
  const items = getOrderItemsData();
  const shipCharged = Number(document.getElementById('f-shipcharged').value) || 0;
  const fee = Number(document.getElementById('f-fee').value) || 0;
  const shipCost = Number(document.getElementById('f-shipcost').value) || 0;
  const grossSales = items.reduce((a, i) => a + (i.sellingPrice * i.qty), 0);
  const totalCost = items.reduce((a, i) => a + (i.productCost * i.qty), 0);
  const earned = grossSales + shipCharged - fee - shipCost;
  const profit = earned - totalCost;
  document.getElementById('calc-earned').textContent = money(earned);
  document.getElementById('calc-profit').textContent = money(profit);
}

async function saveNewOrder() {
  const items = getOrderItemsData();
  if (!items.length || items.some((i) => !i.productName)) { toast('Please select or type a product name for every item'); return; }
  if (items.some((i) => i.qty <= 0)) { toast('Quantity must be at least 1 for every item'); return; }

  const date = document.getElementById('f-date').value || todayISO();
  const platform = document.getElementById('f-platform').value;
  const customer = document.getElementById('f-customer').value.trim();
  const orderNo = document.getElementById('f-orderno').value.trim();
  const shippingCharged = Number(document.getElementById('f-shipcharged').value) || 0;
  const platformFee = Number(document.getElementById('f-fee').value) || 0;
  const shippingCost = Number(document.getElementById('f-shipcost').value) || 0;
  const paymentStatus = document.getElementById('f-status').value;
  const paymentDate = document.getElementById('f-paydate').value || '';
  const orderStatus = document.getElementById('f-orderstatus').value;
  const notes = document.getElementById('f-notes').value.trim();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const isFirst = i === 0;
    const earned = (it.sellingPrice * it.qty) + (isFirst ? shippingCharged - platformFee - shippingCost : 0);
    const profit = earned - (it.productCost * it.qty);
    const sale = {
      id: uid(), date, platform, customer, orderNo,
      productId: it.productId, variantId: it.variantId, productName: it.productName, qty: it.qty,
      sellingPrice: it.sellingPrice,
      shippingCharged: isFirst ? shippingCharged : 0,
      platformFee: isFirst ? platformFee : 0,
      productCost: it.productCost,
      shippingCost: isFirst ? shippingCost : 0,
      earned, profit, paymentStatus, paymentDate, orderStatus, notes,
      createdAt: new Date().toISOString()
    };
    await DB.put('sales', sale);
    if (it.productId) {
      const { product: p, variant: v } = findVariant(it.productId, it.variantId);
      if (v) { v.stock = Number(v.stock) - it.qty; await DB.put('products', p); }
      else if (p) { p.stock = Number(p.stock) - it.qty; await DB.put('products', p); }
    }
  }

  if (customer) {
    const existingCust = S.customers.find((c) => c.name.trim().toLowerCase() === customer.toLowerCase());
    if (!existingCust) {
      await DB.put('customers', { id: uid(), name: customer, phone: '', notes: '', createdAt: new Date().toISOString() });
    }
  }

  closeSheet();
  toast(items.length > 1 ? `Order with ${items.length} items logged` : 'Sale logged');
  await loadAll();
  render();
}

async function shareReceipt(sale) {
  const total = (Number(sale.sellingPrice) * Number(sale.qty)) + Number(sale.shippingCharged || 0);
  const lines = [
    S.settings.businessName,
    '------------------------------',
    `Date: ${fmtDate(sale.date)}`,
    sale.customer ? `Customer: ${sale.customer}` : null,
    `Item: ${sale.productName} x${sale.qty}`,
    `Price: ${money(sale.sellingPrice)} each`,
    sale.shippingCharged ? `Shipping: ${money(sale.shippingCharged)}` : null,
    `Total: ${money(total)}`,
    `Payment: ${sale.paymentStatus}`,
    '------------------------------',
    'Thank you for your order!'
  ].filter(Boolean);
  const text = lines.join('\n');
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { /* user cancelled or unsupported, fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Receipt copied — paste it to send');
  } catch (err) {
    prompt('Copy this receipt:', text);
  }
}

function recalcSaleForm() {
  const qty = Number(document.getElementById('f-qty').value) || 0;
  const sp = Number(document.getElementById('f-sellingprice').value) || 0;
  const ship = Number(document.getElementById('f-shipcharged').value) || 0;
  const fee = Number(document.getElementById('f-fee').value) || 0;
  const cost = Number(document.getElementById('f-cost').value) || 0;
  const shipCost = Number(document.getElementById('f-shipcost').value) || 0;
  const earned = (sp * qty) + ship - fee - shipCost;
  const profit = earned - (cost * qty);
  document.getElementById('calc-earned').textContent = money(earned);
  document.getElementById('calc-profit').textContent = money(profit);
}

async function saveSale(editing) {
  const productId = document.getElementById('f-product').value || null;
  const product = productId ? S.products.find((p) => p.id === productId) : null;
  const hasVariants = product && productVariants(product).length > 0;
  const variantId = hasVariants ? (document.getElementById('f-variant').value || null) : null;
  const variant = hasVariants && variantId ? productVariants(product).find((v) => v.id === variantId) : null;
  if (hasVariants && !variant) { toast('Please pick a variant'); return; }
  const customName = document.getElementById('f-customname').value.trim();
  const productName = product ? productDisplayName(product, variant) : customName;
  if (!productName) { toast('Please select or type a product name'); return; }
  const qty = Number(document.getElementById('f-qty').value) || 0;
  if (qty <= 0) { toast('Quantity must be at least 1'); return; }
  const sellingPrice = Number(document.getElementById('f-sellingprice').value) || 0;
  const shippingCharged = Number(document.getElementById('f-shipcharged').value) || 0;
  const platformFee = Number(document.getElementById('f-fee').value) || 0;
  const productCost = Number(document.getElementById('f-cost').value) || 0;
  const shippingCost = Number(document.getElementById('f-shipcost').value) || 0;
  const earned = (sellingPrice * qty) + shippingCharged - platformFee - shippingCost;
  const profit = earned - (productCost * qty);

  const sale = {
    id: editing ? editing.id : uid(),
    date: document.getElementById('f-date').value || todayISO(),
    platform: document.getElementById('f-platform').value,
    customer: document.getElementById('f-customer').value.trim(),
    orderNo: document.getElementById('f-orderno').value.trim(),
    productId, variantId, productName, qty, sellingPrice, shippingCharged, platformFee, productCost, shippingCost, earned, profit,
    paymentStatus: document.getElementById('f-status').value,
    paymentDate: document.getElementById('f-paydate').value || '',
    orderStatus: document.getElementById('f-orderstatus').value,
    notes: document.getElementById('f-notes').value.trim(),
    createdAt: editing ? editing.createdAt : new Date().toISOString()
  };

  // Adjust stock: restore old product/variant's stock (if editing), then deduct from new selection
  if (editing && editing.productId) {
    const { product: oldProduct, variant: oldVariant } = findVariant(editing.productId, editing.variantId);
    if (oldVariant) { oldVariant.stock = Number(oldVariant.stock) + Number(editing.qty); await DB.put('products', oldProduct); }
    else if (oldProduct) { oldProduct.stock = Number(oldProduct.stock) + Number(editing.qty); await DB.put('products', oldProduct); }
  }
  if (productId) {
    const { product: p, variant: v } = findVariant(productId, variantId);
    if (v) { v.stock = Number(v.stock) - qty; await DB.put('products', p); }
    else if (p) { p.stock = Number(p.stock) - qty; await DB.put('products', p); }
  }

  await DB.put('sales', sale);
  if (sale.customer) {
    const existingCust = S.customers.find((c) => c.name.trim().toLowerCase() === sale.customer.toLowerCase());
    if (!existingCust) {
      await DB.put('customers', { id: uid(), name: sale.customer, phone: '', notes: '', createdAt: new Date().toISOString() });
    }
  }
  closeSheet();
  toast(editing ? 'Sale updated' : 'Sale logged');
  await loadAll();
  render();
}

async function deleteSale(sale) {
  if (!confirm('Delete this sale? This cannot be undone.')) return;
  if (sale.productId) {
    const { product: p, variant: v } = findVariant(sale.productId, sale.variantId);
    if (v) { v.stock = Number(v.stock) + Number(sale.qty); await DB.put('products', p); }
    else if (p) { p.stock = Number(p.stock) + Number(sale.qty); await DB.put('products', p); }
  }
  await DB.delete('sales', sale.id);
  closeSheet();
  toast('Sale deleted');
  await loadAll();
  render();
}

/* ---------- Product form ---------- */
let variantRowNextIdx = 0;
function variantRowHtml(idx, variant) {
  const vid = variant ? variant.id : uid();
  return `
    <div class="variant-row" data-vidx="${idx}" data-vid="${vid}">
      <input type="text" class="v-label" placeholder="e.g. 30ml, Rose, Pink" value="${variant ? esc(variant.label) : ''}">
      <input type="number" class="v-stock" placeholder="Stock" value="${variant ? variant.stock : 0}">
      <button type="button" class="remove-variant-btn" data-remove-variant="1">&times;</button>
    </div>`;
}
function toggleSimpleStockVisibility() {
  const wrap = document.getElementById('simple-stock-wrap');
  if (!wrap) return;
  const hasRows = document.querySelectorAll('#variant-list .variant-row').length > 0;
  wrap.style.display = hasRows ? 'none' : '';
}
function bindVariantRows() {
  document.querySelectorAll('[data-remove-variant]').forEach((btn) => {
    btn.onclick = () => { btn.closest('.variant-row').remove(); toggleSimpleStockVisibility(); };
  });
}
function openProductForm(productId) {
  const editing = productId ? S.products.find((p) => p.id === productId) : null;
  const catOptions = CATEGORIES.map((c) => `<option ${editing && editing.category === c ? 'selected' : ''}>${c}</option>`).join('');
  const existingVariants = editing ? productVariants(editing) : [];
  variantRowNextIdx = existingVariants.length;
  const hasVariants = existingVariants.length > 0;
  openSheet(editing ? 'Edit Product' : 'Add Product', `
    <label>Product name</label><input type="text" id="p-name" value="${editing ? esc(editing.name) : ''}">
    <label>Category</label><select id="p-category">${catOptions}</select>
    <div class="field-row">
      <div><label>Cost price / unit</label><input type="number" step="0.01" id="p-cost" value="${editing ? editing.costPrice : ''}"></div>
      <div><label>Selling price / unit</label><input type="number" step="0.01" id="p-price" value="${editing ? editing.sellingPrice : ''}"></div>
    </div>

    <div class="section-title">Variants (optional)</div>
    <p style="font-size:12px;color:var(--muted);margin:0 0 8px">Add a row per size, shade or scent, each with its own stock count. Leave empty for a single simple product.</p>
    <div id="variant-list">${existingVariants.map((v, i) => variantRowHtml(i, v)).join('')}</div>
    <button type="button" class="link-btn" id="add-variant-btn">+ Add Variant</button>

    <div id="simple-stock-wrap" style="${hasVariants ? 'display:none' : ''}">
      <div class="field-row">
        <div><label>Current stock</label><input type="number" id="p-stock" value="${editing ? editing.stock : 0}"></div>
      </div>
    </div>
    <label>Low stock alert below</label><input type="number" id="p-lowstock" value="${editing ? (editing.lowStockThreshold != null ? editing.lowStockThreshold : S.settings.lowStock) : S.settings.lowStock}">

    <button class="btn primary" id="save-product-btn">${editing ? 'Save Changes' : 'Add Product'}</button>
    ${editing && !hasVariants ? '<button class="btn secondary" id="restock-btn">+ Add Stock (restock)</button>' : ''}
    ${editing ? '<button class="btn danger" id="delete-product-btn">Delete Product</button>' : ''}
  `);
  bindVariantRows();
  document.getElementById('add-variant-btn').addEventListener('click', () => {
    document.getElementById('variant-list').insertAdjacentHTML('beforeend', variantRowHtml(variantRowNextIdx, null));
    variantRowNextIdx++;
    bindVariantRows();
    toggleSimpleStockVisibility();
  });
  document.getElementById('save-product-btn').addEventListener('click', () => saveProduct(editing));
  if (editing) {
    document.getElementById('delete-product-btn').addEventListener('click', () => deleteProduct(editing));
    const restockBtn = document.getElementById('restock-btn');
    if (restockBtn) restockBtn.addEventListener('click', () => restockProduct(editing));
  }
}

async function saveProduct(editing) {
  const name = document.getElementById('p-name').value.trim();
  if (!name) { toast('Please enter a product name'); return; }
  const variantRows = [...document.querySelectorAll('#variant-list .variant-row')].map((row) => ({
    id: row.dataset.vid,
    label: row.querySelector('.v-label').value.trim(),
    stock: Number(row.querySelector('.v-stock').value) || 0
  })).filter((v) => v.label);

  const product = {
    id: editing ? editing.id : uid(),
    name,
    category: document.getElementById('p-category').value,
    costPrice: Number(document.getElementById('p-cost').value) || 0,
    sellingPrice: Number(document.getElementById('p-price').value) || 0,
    variants: variantRows,
    stock: variantRows.length ? variantRows.reduce((a, v) => a + v.stock, 0) : (Number(document.getElementById('p-stock').value) || 0),
    lowStockThreshold: Number(document.getElementById('p-lowstock').value) || 0,
    createdAt: editing ? editing.createdAt : new Date().toISOString()
  };
  await DB.put('products', product);
  closeSheet();
  toast(editing ? 'Product updated' : 'Product added');
  await loadAll();
  render();
}

async function restockProduct(product) {
  const qty = prompt(`How many units of "${product.name}" are you adding to stock?`, '10');
  if (qty === null) return;
  const n = Number(qty);
  if (!n || n <= 0) { toast('Enter a valid quantity'); return; }
  product.stock = Number(product.stock) + n;
  await DB.put('products', product);
  closeSheet();
  toast(`Added ${n} to stock`);
  await loadAll();
  render();
}

async function deleteProduct(product) {
  if (!confirm(`Delete "${product.name}"? Past sales records will keep the product name but no longer link to it.`)) return;
  await DB.delete('products', product.id);
  closeSheet();
  toast('Product deleted');
  await loadAll();
  render();
}

/* ---------- Expense form ---------- */
function openExpenseForm(expenseId) {
  const editing = expenseId ? S.expenses.find((e) => e.id === expenseId) : null;
  const catOptions = EXPENSE_CATEGORIES.map((c) => `<option ${editing && editing.category === c ? 'selected' : ''}>${c}</option>`).join('');
  openSheet(editing ? 'Edit Expense' : 'Log an Expense', `
    <label>Expense name</label><input type="text" id="e-name" value="${editing ? esc(editing.name) : ''}" placeholder="e.g. Squarespace subscription">
    <label>Category</label><select id="e-category">${catOptions}</select>
    <div class="field-row">
      <div><label>Amount</label><input type="number" step="0.01" id="e-amount" value="${editing ? editing.amount : ''}"></div>
      <div><label>Date</label><input type="date" id="e-date" value="${editing ? editing.date : todayISO()}"></div>
    </div>
    <label>Frequency</label>
    <select id="e-frequency">
      <option ${editing && editing.frequency==='One-time'?'selected':''}>One-time</option>
      <option ${editing && editing.frequency==='Monthly'?'selected':''}>Monthly</option>
      <option ${editing && editing.frequency==='Yearly'?'selected':''}>Yearly</option>
    </select>
    <label>Notes</label><textarea id="e-notes">${editing ? esc(editing.notes || '') : ''}</textarea>
    <button class="btn primary" id="save-expense-btn">${editing ? 'Save Changes' : 'Save Expense'}</button>
    ${editing ? '<button class="btn secondary" id="dup-expense-btn">Duplicate for today</button><button class="btn danger" id="delete-expense-btn">Delete Expense</button>' : ''}
  `);
  document.getElementById('save-expense-btn').addEventListener('click', () => saveExpense(editing));
  if (editing) {
    document.getElementById('delete-expense-btn').addEventListener('click', () => deleteExpense(editing));
    document.getElementById('dup-expense-btn').addEventListener('click', () => duplicateExpense(editing));
  }
}

async function saveExpense(editing) {
  const name = document.getElementById('e-name').value.trim();
  if (!name) { toast('Please enter an expense name'); return; }
  const expense = {
    id: editing ? editing.id : uid(),
    name,
    category: document.getElementById('e-category').value,
    amount: Number(document.getElementById('e-amount').value) || 0,
    date: document.getElementById('e-date').value || todayISO(),
    frequency: document.getElementById('e-frequency').value,
    notes: document.getElementById('e-notes').value.trim(),
    createdAt: editing ? editing.createdAt : new Date().toISOString()
  };
  await DB.put('expenses', expense);
  closeSheet();
  toast(editing ? 'Expense updated' : 'Expense saved');
  await loadAll();
  render();
}
async function duplicateExpense(expense) {
  const copy = { ...expense, id: uid(), date: todayISO(), createdAt: new Date().toISOString() };
  await DB.put('expenses', copy);
  closeSheet();
  toast('Expense duplicated for today');
  await loadAll();
  render();
}
async function deleteExpense(expense) {
  if (!confirm('Delete this expense?')) return;
  await DB.delete('expenses', expense.id);
  closeSheet();
  toast('Expense deleted');
  await loadAll();
  render();
}

/* ---------- Settings ---------- */
function openSettings() {
  openSheet('Settings', `
    <label>Business name</label><input type="text" id="s-bizname" value="${esc(S.settings.businessName)}">
    <label>Currency symbol</label>
    <select id="s-currency">
      <option value="£" ${S.settings.currency==='£'?'selected':''}>&#163; British Pound</option>
      <option value="$" ${S.settings.currency==='$'?'selected':''}>$ US Dollar</option>
      <option value="€" ${S.settings.currency==='€'?'selected':''}>&#8364; Euro</option>
      <option value="₦" ${S.settings.currency==='₦'?'selected':''}>&#8358; Naira</option>
    </select>
    <label>Default low stock alert level</label><input type="number" id="s-lowstock" value="${S.settings.lowStock}">
    <button class="btn primary" id="save-settings-btn">Save Settings</button>

    <div class="section-title">Restore My Data</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin-top:0">Restore your products, sales and expenses from your latest saved backup. Useful if you reinstall the app or set it up on a new phone.</p>
      <button class="btn primary" id="import-excel-btn">Restore My Data</button>
    </div>

    <div class="section-title">Update Stock From Excel</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin-top:0">Refresh stock levels, cost prices and selling prices for your products from your latest Excel sheet. Existing products are matched by name and updated; anything new is added. Sales and expenses are not touched.</p>
      <button class="btn primary" id="update-stock-btn">Update Stock From Excel</button>
    </div>

    <div class="section-title">Add New Products</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin-top:0">Adds only the new products from your latest cost breakdown that are not already in your Stock. Existing products, sales and expenses are never changed. Selling prices are left at £0 for you to set.</p>
      <button class="btn primary" id="add-new-products-btn">Add New Products</button>
    </div>

    <div class="section-title">Backup &amp; Data</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin-top:0">Your data syncs automatically to your account, but it's still smart to keep an occasional backup file saved somewhere safe (email, Google Drive) as extra insurance.</p>
      <button class="btn secondary" id="backup-btn">Download Full Backup</button>
      <label>Restore from backup file</label><input type="file" id="restore-file" accept=".json">
      <button class="btn secondary" id="export-sales-btn">Export Sales as CSV (Excel)</button>
      <button class="btn secondary" id="export-stock-btn">Export Stock as CSV (Excel)</button>
      <button class="btn secondary" id="export-expenses-btn">Export Expenses as CSV (Excel)</button>
    </div>

    <div class="section-title">Account</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin-top:0">Signed in as <b>${esc((window.FB.auth.currentUser && window.FB.auth.currentUser.email) || '')}</b>. Your data syncs automatically to any device you sign in on.</p>
      <button class="btn ghost" id="logout-btn">Log Out</button>
    </div>

    <div class="section-title">Danger Zone</div>
    <div class="card">
      <button class="btn danger" id="clear-data-btn">Erase All Data</button>
    </div>

    <div class="section-title">Install App</div>
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin-top:0"><b>iPhone:</b> open this page in Safari &rarr; tap Share &rarr; "Add to Home Screen".<br><br><b>Android:</b> open this page in Chrome &rarr; tap the menu (&#8942;) &rarr; "Add to Home screen" / "Install app".</p>
    </div>
  `);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('import-excel-btn').addEventListener('click', importExcelData);
  document.getElementById('update-stock-btn').addEventListener('click', updateStockFromExcel);
  document.getElementById('add-new-products-btn').addEventListener('click', addNewProductsOnly);
  document.getElementById('backup-btn').addEventListener('click', downloadBackup);
  document.getElementById('export-sales-btn').addEventListener('click', exportSalesCSV);
  document.getElementById('export-stock-btn').addEventListener('click', exportProductsCSV);
  document.getElementById('logout-btn').addEventListener('click', () => { closeSheet(); window.FB.signOutUser(); });
  document.getElementById('export-expenses-btn').addEventListener('click', exportExpensesCSV);
  document.getElementById('restore-file').addEventListener('change', restoreBackup);
  document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
}

async function saveSettings() {
  S.settings.businessName = document.getElementById('s-bizname').value.trim() || 'My Skincare Books';
  S.settings.currency = document.getElementById('s-currency').value;
  S.settings.lowStock = Number(document.getElementById('s-lowstock').value) || 0;
  await saveMeta('businessName', S.settings.businessName);
  await saveMeta('currency', S.settings.currency);
  await saveMeta('lowStock', S.settings.lowStock);
  document.getElementById('business-name').textContent = S.settings.businessName;
  closeSheet();
  toast('Settings saved');
  render();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function downloadBackup() {
  const data = await DB.exportAll();
  downloadFile(`skincare-books-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Backup downloaded');
}

async function importExcelData() {
  if (!confirm('Import your products, sales and expenses from your old Excel sheet into the app now?')) return;
  toast('Restoring your data… this may take a moment');
  try {
    const res = await fetch('excel-import-backup.json');
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    await DB.importAll(data);
    toast('Excel data imported');
    closeSheet();
    await loadAll();
    render();
  } catch (err) {
    toast('Could not find the Excel import file');
  }
}

async function updateStockFromExcel() {
  if (!confirm('Update stock levels and prices from your latest Excel sheet now?')) return;
  toast('Updating stock… this may take a moment');
  try {
    const res = await fetch('stock-update.json?t=' + Date.now());
    if (!res.ok) throw new Error('not found');
    const entries = await res.json();
    const updatedProducts = [];
    let updated = 0, added = 0;
    for (const e of entries) {
      const existing = S.products.find((p) => p.name.trim().toLowerCase() === e.name.trim().toLowerCase());
      if (existing) {
        existing.stock = e.stock;
        existing.costPrice = e.costPrice;
        existing.sellingPrice = e.sellingPrice;
        updatedProducts.push(existing);
        updated++;
      } else {
        updatedProducts.push({ id: uid(), name: e.name, category: e.category, costPrice: e.costPrice, sellingPrice: e.sellingPrice, stock: e.stock, lowStockThreshold: S.settings.lowStock, createdAt: new Date().toISOString() });
        added++;
      }
    }
    await DB.importAll({ products: updatedProducts });
    toast(`Updated ${updated}, added ${added} new products`);
    closeSheet();
    await loadAll();
    render();
  } catch (err) {
    toast('Could not find the stock update file');
  }
}

function normProductName(s) {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
async function addNewProductsOnly() {
  if (!confirm('Add the new products from your latest list? Existing products will not be changed.')) return;
  toast('Adding new products…');
  try {
    const res = await fetch('new-products.json?t=' + Date.now());
    if (!res.ok) throw new Error('not found');
    const entries = await res.json();
    const have = new Set(S.products.map((p) => normProductName(p.name)));
    const toAdd = [];
    let skipped = 0;
    for (const e of entries) {
      if (have.has(normProductName(e.name))) { skipped++; continue; }
      toAdd.push({ id: uid(), name: e.name, category: e.category, costPrice: e.costPrice, sellingPrice: e.sellingPrice, stock: e.stock, lowStockThreshold: S.settings.lowStock, createdAt: new Date().toISOString() });
    }
    if (toAdd.length) await DB.importAll({ products: toAdd });
    toast(`Added ${toAdd.length} new product${toAdd.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already in Stock` : ''}`);
    closeSheet();
    await loadAll();
    render();
  } catch (err) {
    toast('Could not add the new products');
  }
}

function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('This will add/overwrite records from the backup file. Continue?')) { e.target.value = ''; return; }
  toast('Restoring backup… this may take a moment');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      await DB.importAll(data);
      toast('Backup restored');
      closeSheet();
      await loadAll();
      render();
    } catch (err) { toast('Could not read that file'); }
  };
  reader.readAsText(file);
}

function csvFromRows(headers, rows) {
  return [headers, ...rows].map((r) => r.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
function exportSalesCSV() {
  const headers = ['Date','Platform','Customer','Order No','Product','Qty','Selling Price','Shipping Charged','Platform Fee','Product Cost','Shipping Cost','Earned','Profit','Payment Status','Payment Date','Order Status','Notes'];
  const rows = S.sales.map((s) => [s.date, s.platform, s.customer, s.orderNo, s.productName, s.qty, s.sellingPrice, s.shippingCharged, s.platformFee, s.productCost, s.shippingCost, s.earned.toFixed(2), s.profit.toFixed(2), s.paymentStatus, s.paymentDate, s.orderStatus || 'Pending', s.notes]);
  downloadFile(`sales-export-${todayISO()}.csv`, csvFromRows(headers, rows), 'text/csv');
  toast('Sales exported');
}
function exportProductsCSV() {
  const headers = ['Name','Variant','Category','Cost Price','Selling Price','Stock','Low Stock Alert'];
  const rows = allStockItems().map((it) => [it.product.name, it.variant ? it.variant.label : '', it.product.category, it.product.costPrice, it.product.sellingPrice, it.stock, it.product.lowStockThreshold]);
  downloadFile(`stock-export-${todayISO()}.csv`, csvFromRows(headers, rows), 'text/csv');
  toast('Stock exported');
}
function exportExpensesCSV() {
  const headers = ['Date','Name','Category','Amount','Frequency','Notes'];
  const rows = S.expenses.map((e) => [e.date, e.name, e.category, e.amount, e.frequency, e.notes]);
  downloadFile(`expenses-export-${todayISO()}.csv`, csvFromRows(headers, rows), 'text/csv');
  toast('Expenses exported');
}

async function clearAllData() {
  if (!confirm('This will permanently erase ALL products, sales, expenses and customers from your account (on every synced device). This cannot be undone. Are you sure?')) return;
  if (!confirm('Really sure? Consider downloading a backup first.')) return;
  toast('Erasing…');
  await DB.clearAll();
  closeSheet();
  toast('All data erased');
  await loadAll();
  render();
}

/* ---------- Auth ---------- */
let authMode = 'signin';

function hideBootScreen() {
  const boot = document.getElementById('boot-screen');
  if (boot) boot.remove();
}
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('app').style.display = 'none';
  hideBootScreen();
}
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  hideBootScreen();
}
function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password';
  if (code.includes('user-not-found')) return 'No account with that email — try Sign Up instead';
  if (code.includes('email-already-in-use')) return 'That email already has an account — try Sign In instead';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters';
  if (code.includes('invalid-email')) return 'Please enter a valid email address';
  if (code.includes('network')) return 'No internet connection — check your network and try again';
  return 'Something went wrong. Please try again.';
}
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-title').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-submit-btn').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-toggle-btn').textContent = mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in';
  document.getElementById('auth-error').textContent = '';
}
function setupAuthScreenHandlers() {
  document.getElementById('auth-toggle-btn').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
  document.getElementById('auth-submit-btn').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = '';
    if (!email || !password) { errEl.textContent = 'Please enter your email and password'; return; }
    try {
      if (authMode === 'signin') await window.FB.signIn(email, password);
      else await window.FB.signUp(email, password);
    } catch (err) {
      errEl.textContent = friendlyAuthError(err);
    }
  });
}

/* ---------- Init ---------- */
async function init() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* ignore */ }
  }
  setupAuthScreenHandlers();
  window.FB.onAuthStateChanged(async (user) => {
    if (user) {
      const paintedFromCache = await loadAllFromCache();
      if (paintedFromCache) {
        showApp();
        setTab(S.tab || 'home');
        loadAll().then(() => render()).catch(() => {}); // quiet refresh from the server
      } else {
        await loadAll();
        showApp();
        setTab(S.tab || 'home');
      }
    } else {
      showAuthScreen();
    }
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && window.FB.auth.currentUser) {
      await loadAll();
      render();
    }
  });
}
if (window.FB) init(); else window.addEventListener('firebase-ready', init, { once: true });
