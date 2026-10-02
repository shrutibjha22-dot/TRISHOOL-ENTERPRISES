/* ============================================================
   TRISHOOL ENTERPRISES — admin dashboard
   Talks to the Express API. The session is an HttpOnly cookie set by
   the server on sign-in, so no token is ever handled in JavaScript.

   This one file serves two places:
     - admin.html, where the dashboard is the whole page
     - index.html, where the same markup sits inside #adminPanel, a
       full-screen overlay opened from the website's Admin link

   IN_PANEL tells the two apart. The only difference is that on the
   website the panel starts closed and waits to be opened, so no session
   is checked until an admin actually asks for it.

   The whole file is wrapped in an IIFE. app.js and admin.js now load into
   the same page, and both declare names like BACKEND, api, $ and $$ at the
   top level. Without the wrapper the second script to load dies with
   "Identifier 'BACKEND' has already been declared".
   ============================================================ */

(() => {

/**
 * Keep in step with BACKEND in app.js - see the long comment there for the
 * three ways this site can be run.
 *
 * adminUrl is where the dashboard lives when this page cannot host it, which
 * is what happens on a static host such as GitHub Pages.
 */
const BACKEND = {
  apiBase: '',
  adminUrl: 'http://127.0.0.1:3000/admin.html'
};

const api = (path) => BACKEND.apiBase + '/api' + path;

/**
 * Send the browser to the real dashboard if this page cannot reach an API.
 *
 * On GitHub Pages the page loads but /api is a 404, so the sign-in form would
 * sit there failing. Redirecting is honest: the dashboard either opens where
 * it actually runs, or the browser reports the host is unreachable.
 *
 * The href check prevents a redirect loop if adminUrl ever points back here.
 */
async function redirectIfNoApi() {
  if (location.protocol === 'file:') return;

  let ok = false;
  try {
    const res = await fetch(api('/health'), { cache: 'no-store' });
    ok = !!(res.ok && res.status === 200);
  } catch { ok = false; }

  if (ok || !BACKEND.adminUrl) return;
  if (location.href === BACKEND.adminUrl) return;

  // Only move the browser if that host is actually up. Navigating to a
  // machine that is switched off just produces a dead end.
  let reachable = false;
  try {
    await fetch(BACKEND.adminUrl, { mode: 'no-cors', cache: 'no-store' });
    reachable = true;
  } catch { reachable = false; }

  if (reachable) {
    location.replace(BACKEND.adminUrl);
    return;
  }

  // Say so on this page instead, where it can be explained.
  const box = $('#gateError');
  if (box) {
    box.hidden = false;
    box.textContent =
      'The admin dashboard is not running. Start it with START-WEBSITE.bat ' +
      '(or deploy the backend), then reload this page.';
  }
}

const ORDER_STATUSES   = ['New', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'];
const INQUIRY_STATUSES = ['New', 'Contacted', 'Quoted', 'Booked', 'Closed'];
const BOOKING_STATUSES = ['New', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'];
const REVIEW_STATUSES  = ['Pending', 'Approved', 'Hidden'];
const MESSAGE_STATUSES = ['New', 'Read', 'Replied', 'Archived'];

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/** True when this dashboard is the overlay inside the website page. */
const IN_PANEL = !!document.getElementById('adminPanel');

const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

/**
 * Where the real server lives.
 *
 * Browsers forbid a page opened from disk (file://) from calling an API, so a
 * dashboard opened that way could never sign in - it would just sit on
 * "Failed to fetch". Rather than show that, hand the browser over to the server
 * copy of this same page, which works normally. Kept in step with SERVER_URL in
 * app.js.
 */
const SERVER_URL = 'http://127.0.0.1:3000';

if (location.protocol === 'file:') {
  location.replace(`${SERVER_URL}/admin.html`);
  throw new Error('redirecting to the server');
}

/**
 * The API sends ISO timestamps. Render them as "01 Oct 2026, 09:26 am" so the
 * tables stay readable instead of showing raw ISO text.
 */
function fmtDate(value, withTime = true) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '—';

  const day = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const base = `${day} ${d.getFullYear()}`;
  if (!withTime) return base;

  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
  return `${base}, ${time}`;
}

/** Everything the dashboard renders, refreshed together after any change. */
const state = {
  admin: null,
  stats: null,
  orders: [],
  inquiries: [],
  bookings: [],
  reviews: [],
  services: [],
  messages: [],
  customers: [],
  tab: 'orders'
};

/* ---------------------------------------------------------
   TOAST
   --------------------------------------------------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------------------------------------------------------
   API
   --------------------------------------------------------- */
/**
 * The one message a staff member needs when the API cannot be reached at all.
 *
 * "Failed to fetch" means the browser never got a reply. Almost always that is
 * the page being opened straight off disk (a file:// page cannot call an API at
 * all), or the server not running. Saying so is far more useful than passing
 * the raw browser error through.
 */
function unreachableError(err) {
  if (location.protocol === 'file:') {
    return new Error(
      'This page was opened as a file, so it cannot reach the database. ' +
      'Start the server (double-click START-WEBSITE.bat) and open ' +
      'http://127.0.0.1:3000/ instead.'
    );
  }
  return new Error(
    'Could not reach the server. Make sure it is running - double-click ' +
    'START-WEBSITE.bat, then reload http://127.0.0.1:3000/'
  );
}

/**
 * Call the API.
 *
 * `opts.ownAuth` is set by the sign-in call only: a 401 there means "those
 * credentials are wrong", not "your session ended", so the server's own
 * message is passed through instead of bouncing the user back to the gate.
 */
async function req(method, path, body, opts = {}) {
  let res;
  try {
    res = await fetch(api(path), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw unreachableError(err);
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  // A reply that is not our API at all - e.g. some other static server.
  if (!data || typeof data.ok !== 'boolean') {
    throw new Error(
      'Reached a server, but not the Trishool API. Start it with ' +
      'START-WEBSITE.bat and open http://127.0.0.1:3000/'
    );
  }

  if (res.status === 401 && !opts.ownAuth) {
    // Session expired or never existed.
    showGate('Your session has ended. Please sign in again.');
    throw Object.assign(new Error('Unauthenticated'), { handled: true });
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/* ---------------------------------------------------------
   LOAD EVERYTHING
   --------------------------------------------------------- */
async function refresh() {
  try {
    const [stats, orders, inquiries, bookings, reviews, services, messages, customers] =
      await Promise.all([
        req('GET', '/admin/stats'),
        req('GET', '/admin/orders'),
        req('GET', '/admin/inquiries'),
        req('GET', '/admin/bookings'),
        req('GET', '/admin/reviews'),
        req('GET', '/admin/services?all=1'),
        req('GET', '/admin/contact'),
        req('GET', '/admin/customers')
      ]);

    state.stats      = stats.stats;
    state.orders     = orders.orders;
    state.inquiries  = inquiries.inquiries;
    state.bookings   = bookings.bookings;
    state.reviews    = reviews.reviews;
    state.services   = services.services;
    state.messages   = messages.messages;
    state.customers  = customers.customers;

    render();

    // Say when the data was actually read, so the line never sits on
    // "Loading…" after the load has finished.
    $('#status').textContent =
      `Updated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}` +
      ` \u00b7 ${state.orders.length} order(s)` +
      ` \u00b7 ${state.inquiries.length} inquiry(ies)` +
      ` \u00b7 ${state.bookings.length} booking(s)`;
    return true;

  } catch (err) {
    if (!err.handled) $('#status').textContent = `Could not load: ${err.message}`;
    return false;
  }
}

/* ---------------------------------------------------------
   LOGIN / LOGOUT
   --------------------------------------------------------- */
function showGate(message) {
  state.admin = null;
  $('#app').hidden = true;
  $('#gate').hidden = false;
  if (message) {
    const box = $('#gateError');
    box.hidden = false;
    box.textContent = message;
  }
  $('#gateEmail').focus();
}

async function login(email, password) {
  const data = await req('POST', '/auth/login', { email, password }, { ownAuth: true });
  state.admin = data.admin;
  $('#gateError').hidden = true;
  $('#gate').hidden = true;
  $('#app').hidden = false;

  $('#adminName').textContent = state.admin.name;
  $('#adminEmail').textContent = state.admin.email;

  await refresh();
  toast('Signed in');
}

async function logout() {
  try { await req('POST', '/auth/logout'); } catch { /* already gone */ }
  state.admin = null;
  state.orders = []; state.inquiries = []; state.bookings = [];
  state.reviews = []; state.services = []; state.messages = []; state.customers = [];
  showGate();
  toast('Signed out');
}

/* ---------------------------------------------------------
   RENDER
   --------------------------------------------------------- */
function render() {
  renderStats();
  renderBadges();
  renderOrders();
  renderInquiries();
  renderBookings();
  renderReviews();
  renderServices();
  renderMessages();
  renderCustomers();
}

function renderStats() {
  const s = state.stats || {};
  $('#sOrders').textContent   = s.orders ?? 0;
  $('#sRevenue').textContent  = money(s.revenue);
  $('#sGst').textContent      = money(s.gst);
  $('#sNew').textContent      = s.newOrders ?? 0;
  $('#sInquiries').textContent   = s.newInquiries ?? 0;
  $('#sBookings').textContent   = s.openBookings ?? 0;
  $('#sReviews').textContent    = s.pendingReviews ?? 0;
  $('#sMessages').textContent   = s.newMessages ?? 0;
  $('#sCustomers').textContent  = s.customers ?? 0;
  $('#sMonth').textContent      = money(s.monthRevenue);
}

function renderBadges() {
  const set = (id, n) => {
    const el = $(id);
    el.textContent = n;
    el.dataset.zero = String(n === 0);
  };
  set('#tabOrdersCount',    state.stats?.newOrders ?? 0);
  set('#tabInquiryCount',   state.inquiries.filter((i) => i.status === 'New').length);
  set('#tabBookingCount',   state.bookings.filter((b) => b.status === 'New').length);
  set('#tabReviewCount',    state.reviews.filter((r) => r.status === 'Pending').length);
  set('#tabMessageCount',   state.messages.filter((m) => m.status === 'New').length);
}

/** Shared "no rows" placeholder. */
const emptyRow = (cols, text) =>
  `<tr class="empty-row"><td colspan="${cols}">${esc(text)}</td></tr>`;

/** Build a <select> of statuses. */
function statusSelect(statuses, current, attrs) {
  return `<select class="status-select st-${esc(current)}" ${attrs}>
    ${statuses.map((s) => `<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`).join('')}
  </select>`;
}

function renderOrders() {
  const q = ($('#searchOrders')?.value || '').toLowerCase().trim();
  const rows = state.orders.filter((o) => !q ||
    [o.orderRef, o.name, o.phone, o.items].join(' ').toLowerCase().includes(q));

  $('#ordersBody').innerHTML = rows.length ? rows.map((o) => `
    <tr>
      <td class="ref">${esc(o.orderRef)}</td>
      <td class="date">${esc(fmtDate(o.date))}</td>
      <td class="cname">${esc(o.name)}</td>
      <td>${esc(o.phone)}</td>
      <td class="items">${esc(o.items)}${o.hasEnquiry ? ' <em class="tiny">(+ quoted)</em>' : ''}</td>
      <td class="num">${money(o.total)}</td>
      <td>${esc(o.payment)}</td>
      <td>${statusSelect(ORDER_STATUSES, o.status,
        `data-order-status="${esc(o.orderRef)}" aria-label="Status for ${esc(o.orderRef)}"`)}</td>
    </tr>
  `).join('') : emptyRow(8, q
    ? `No orders match "${$('#searchOrders').value.trim()}".`
    : 'No orders yet. They appear here as soon as a customer checks out.');
}

function renderInquiries() {
  $('#inquiriesBody').innerHTML = state.inquiries.length ? state.inquiries.map((i) => `
    <tr>
      <td class="ref">${esc(i.inquiry_ref)}</td>
      <td class="date">${esc(fmtDate(i.created_at))}</td>
      <td class="cname">${esc(i.customer_name)}</td>
      <td>${esc(i.phone)}</td>
      <td>${esc(i.service_name || '—')}</td>
      <td class="items">${esc(i.message || '')}</td>
      <td>${statusSelect(INQUIRY_STATUSES, i.status,
        `data-inquiry-status="${esc(i.inquiry_ref)}" aria-label="Status for ${esc(i.inquiry_ref)}"`)}</td>
    </tr>
  `).join('') : emptyRow(7, 'No inquiries yet.');
}

function renderBookings() {
  $('#bookingsBody').innerHTML = state.bookings.length ? state.bookings.map((b) => `
    <tr>
      <td class="ref">${esc(b.booking_ref)}</td>
      <td class="date">${esc(fmtDate(b.created_at))}</td>
      <td class="cname">${esc(b.customer_name)}</td>
      <td>${esc(b.phone)}</td>
      <td>${esc(b.service_name || '—')}</td>
      <td class="date">${esc(b.preferred_date || '—')}${esc(b.address ? `<br><span class="tiny">${esc(b.address)}</span>` : '')}</td>
      <td>${statusSelect(BOOKING_STATUSES, b.status,
        `data-booking-status="${esc(b.booking_ref)}" aria-label="Status for ${esc(b.booking_ref)}"`)}</td>
    </tr>
  `).join('') : emptyRow(7, 'No bookings yet.');
}

function renderReviews() {
  const sorted = [...state.reviews].sort((a, b) => b.id - a.id);

  $('#reviewsBody').innerHTML = sorted.length ? sorted.map((r) => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    return `
      <tr>
        <td class="date">${esc(fmtDate(r.date))}</td>
        <td class="cname">${esc(r.name)}</td>
        <td class="rating" aria-label="${r.rating} out of 5">${stars}</td>
        <td>${esc(r.service || '—')}</td>
        <td class="rev-text">${esc(r.text)}</td>
        <td><span class="pill st-${esc(r.status)}">${esc(r.status)}</span></td>
        <td><div class="row-actions">
          ${r.status !== 'Approved' ? `<button class="mini-btn approve" data-review-approve="${r.id}">Approve</button>` : ''}
          ${r.status !== 'Hidden' ? `<button class="mini-btn hide" data-review-status="${r.id}" data-to="Hidden">Hide</button>` : ''}
          <button class="mini-btn del" data-review-del="${r.id}">Delete</button>
        </div></td>
      </tr>`;
  }).join('') : emptyRow(7, 'No reviews submitted yet.');
}

function renderServices() {
  $('#servicesBody').innerHTML = state.services.length ? state.services.map((s) => `
    <tr${s.isActive ? '' : ' class="inactive-row"'}>
      <td class="cname">${esc(s.icon)} ${esc(s.title)}</td>
      <td>${esc(s.category)}</td>
      <td class="num">${s.price === null ? 'On request' : money(s.price)}</td>
      <td class="tiny">${esc((s.desc || '').slice(0, 70))}</td>
      <td><span class="pill ${s.isActive ? 'st-Completed' : 'st-Hidden'}">${s.isActive ? 'Active' : 'Hidden'}</span></td>
      <td><div class="row-actions">
        <button class="mini-btn" data-service-edit="${s.id}">Edit</button>
        <button class="mini-btn ${s.isActive ? 'hide' : 'approve'}" data-service-toggle="${s.id}" data-next="${!s.isActive}">
          ${s.isActive ? 'Hide' : 'Show'}
        </button>
        <button class="mini-btn del" data-service-del="${s.id}">Delete</button>
      </div></td>
    </tr>
  `).join('') : emptyRow(6, 'No services in the database.');

  // Keep the edit form in sync when a row is picked.
  const editing = $('#serviceId').value;
  if (editing) {
    const s = state.services.find((x) => String(x.id) === String(editing));
    if (s) {
      $('#svcTitle').value = s.title;
      $('#svcPrice').value = s.price === null ? '' : s.price;
      $('#svcDesc').value = s.desc || '';
      $('#svcIcon').value = s.icon || '';
      $('#svcEnquiry').checked = s.price === null;
    }
  }
}

function renderMessages() {
  $('#messagesBody').innerHTML = state.messages.length ? state.messages.map((m) => `
    <tr>
      <td class="date">${esc(fmtDate(m.created_at))}</td>
      <td class="cname">${esc(m.name)}</td>
      <td>${esc(m.phone || '—')}</td>
      <td>${esc(m.subject || '—')}</td>
      <td class="rev-text">${esc(m.message)}</td>
      <td>${statusSelect(MESSAGE_STATUSES, m.status,
        `data-message-status="${m.id}" aria-label="Status for message ${m.id}"`)}</td>
    </tr>
  `).join('') : emptyRow(6, 'No contact messages yet.');
}

function renderCustomers() {
  $('#customersBody').innerHTML = state.customers.length ? state.customers.map((c) => `
    <tr>
      <td class="cname">${esc(c.name)}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.email || '—')}</td>
      <td class="num">${c.orders}</td>
      <td class="num">${c.inquiries}</td>
      <td class="num">${money(c.spent)}</td>
      <td class="date">${esc(fmtDate(c.createdAt, false))}</td>
    </tr>
  `).join('') : emptyRow(7, 'No customers yet.');
}

/* ---------------------------------------------------------
   ACTIONS
   --------------------------------------------------------- */
async function patch(path, body, okMsg) {
  try {
    await req('PATCH', path, body);
    await refresh();
    if (okMsg) toast(okMsg);
  } catch (err) {
    if (!err.handled) toast('Could not update: ' + err.message);
  }
}

async function saveService(event) {
  event.preventDefault();
  const id = $('#serviceId').value;

  const payload = {
    title: $('#svcTitle').value.trim(),
    price: $('#svcEnquiry').checked ? null : $('#svcPrice').value,
    desc: $('#svcDesc').value.trim(),
    icon: $('#svcIcon').value.trim()
  };

  if (!payload.title) { toast('Enter a service name'); return; }

  try {
    if (id) {
      await req('PUT', `/admin/services/${id}`, payload);
      toast('Service updated');
    } else {
      await req('POST', '/admin/services', payload);
      toast('Service added');
    }
    resetServiceForm();
    await refresh();
  } catch (err) {
    toast('Could not save: ' + err.message);
  }
}

function resetServiceForm() {
  $('#serviceId').value = '';
  $('#svcTitle').value = '';
  $('#svcPrice').value = '';
  $('#svcDesc').value = '';
  $('#svcIcon').value = '';
  $('#svcEnquiry').checked = false;
  $('#serviceFormTitle').textContent = 'Add a service';
  $('#cancelServiceEdit').hidden = true;
}

/* ---------------------------------------------------------
   TABS
   --------------------------------------------------------- */
function showTab(which) {
  state.tab = which;
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === which;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== which; });
}

/* ---------------------------------------------------------
   INIT
   ---------------------------------------------------------
   admin.html loads this file with a normal <script> tag, so DOMContentLoaded
   has not fired yet and we wait for it.

   index.html loads it on demand, long after the page has finished loading, so
   that event has already been and gone - waiting for it would leave every
   button unwired. Hence the readyState check.
   --------------------------------------------------------- */
function initAdmin() {
  /* --- sign in --- */
  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#gateError');
    err.hidden = true;
    const email = $('#gateEmail').value.trim();
    const password = $('#gatePassword').value;
    if (!email || !password) {
      err.hidden = false;
      err.textContent = 'Enter your email and password';
      return;
    }
    try {
      await login(email, password);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message || 'Could not sign in';
    }
  });

  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', () => refresh().then((ok) => ok && toast('Refreshed')));

  /* --- destructive actions --- */

  /**
   * Ask for confirmation without a browser dialog.
   *
   * The two deletes used the browser's own confirm(), which looked nothing like
   * the rest of the dashboard and could be suppressed by the browser - when
   * that happens it returns false silently and the delete simply appears not
   * to work, with nothing on screen to say why.
   *
   * Instead the button the admin already clicked becomes the confirmation: it
   * asks to be tapped again and reverts by itself after a few seconds. There is
   * no dialog to dismiss, and no way to be left sitting in a confirming state
   * if the row is re-rendered underneath.
   *
   * Returns true only on that second tap, so the caller reads naturally.
   */
  function confirmDestructive(btn, question) {
    // A second tap on this button means go ahead.
    if (btn.dataset.armed === '1') {
      disarmDestructive(btn);
      return true;
    }

    // Only one button is ever armed, so an earlier click on a different row
    // cannot leave two rows waiting for confirmation. Done *after* the check
    // above, otherwise it would disarm the very button being tested.
    $$('[data-armed="1"]').forEach(disarmDestructive);

    btn.dataset.label = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = question;
    btn.title = 'Click again to confirm';
    // Held outside the dataset so a re-rendered button cannot leave it armed.
    btn._disarmTimer = setTimeout(() => disarmDestructive(btn), 4000);
    return false;
  }

  /** Return an armed button to its normal label and appearance. */
  function disarmDestructive(btn) {
    clearTimeout(btn._disarmTimer);
    delete btn._disarmTimer;
    delete btn.dataset.armed;
    btn.removeAttribute('title');
    if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
      delete btn.dataset.label;
    }
  }

  /* --- tabs --- */
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  /* --- filters --- */
  $('#searchOrders')?.addEventListener('input', renderOrders);

  /* --- status changes (delegated) --- */
  document.addEventListener('change', async (e) => {
    const el = e.target;

    if (el.matches('[data-order-status]')) {
      return patch(`/admin/orders/${encodeURIComponent(el.dataset.orderStatus)}`,
        { status: el.value }, `Order marked ${el.value}`);
    }
    if (el.matches('[data-inquiry-status]')) {
      return patch(`/admin/inquiries/${encodeURIComponent(el.dataset.inquiryStatus)}`,
        { status: el.value }, `Inquiry marked ${el.value}`);
    }
    if (el.matches('[data-booking-status]')) {
      return patch(`/admin/bookings/${encodeURIComponent(el.dataset.bookingStatus)}`,
        { status: el.value }, `Booking marked ${el.value}`);
    }
    if (el.matches('[data-message-status]')) {
      return patch(`/admin/contact/${el.dataset.messageStatus}`,
        { status: el.value }, `Message marked ${el.value}`);
    }

    /* service visibility toggle */
    if (el.matches('[data-service-toggle]')) {
      try {
        await req('PUT', `/admin/services/${el.dataset.serviceToggle}`, { isActive: el.dataset.next === 'true' });
        await refresh();
        toast(el.dataset.next === 'true' ? 'Service shown' : 'Service hidden');
      } catch (err) { toast('Could not update: ' + err.message); }
    }
  });

  /* --- review + service buttons (delegated) --- */
  document.addEventListener('click', async (e) => {
    const approve = e.target.closest('[data-review-approve]');
    if (approve) {
      return patch(`/admin/reviews/${approve.dataset.reviewApprove}`,
        { status: 'Approved' }, 'Review published to the website');
    }

    const hide = e.target.closest('[data-review-status]');
    if (hide) {
      return patch(`/admin/reviews/${hide.dataset.reviewStatus}`,
        { status: hide.dataset.to }, `Review set to ${hide.dataset.to}`);
    }

    const del = e.target.closest('[data-review-del]');
    if (del && confirmDestructive(del, 'Tap again to delete')) {
      try {
        await req('DELETE', `/admin/reviews/${del.dataset.reviewDel}`);
        await refresh();
        toast('Review deleted');
      } catch (err) { toast('Could not delete: ' + err.message); }
    }

    const edit = e.target.closest('[data-service-edit]');
    if (edit) {
      const s = state.services.find((x) => String(x.id) === edit.dataset.serviceEdit);
      if (!s) return;
      $('#serviceId').value = s.id;
      $('#svcTitle').value = s.title;
      $('#svcPrice').value = s.price === null ? '' : s.price;
      $('#svcDesc').value = s.desc || '';
      $('#svcIcon').value = s.icon || '';
      $('#svcEnquiry').checked = s.price === null;
      $('#serviceFormTitle').textContent = `Edit "${s.title}"`;
      $('#cancelServiceEdit').hidden = false;
      $('#serviceTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const delSvc = e.target.closest('[data-service-del]');
    if (delSvc && confirmDestructive(delSvc, 'Tap again to delete')) {
      try {
        const res = await req('DELETE', `/admin/services/${delSvc.dataset.serviceDel}`);
        await refresh();
        toast(res.message || 'Service deleted');
      } catch (err) { toast('Could not delete: ' + err.message); }
    }
  });

  /* --- service form --- */
  $('#serviceForm').addEventListener('submit', saveService);
  $('#cancelServiceEdit').addEventListener('click', resetServiceForm);
  $('#resetServiceForm').addEventListener('click', resetServiceForm);

  /* --- CSV of the visible orders --- */
  $('#csvBtn').addEventListener('click', () => {
    if (!state.orders.length) { toast('Nothing to export yet'); return; }
    const cols = ['Order Ref', 'Date', 'Customer', 'Phone', 'Items', 'Subtotal', 'GST', 'Total', 'Payment', 'Status'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      cols.map(cell).join(','),
      ...state.orders.map((o) => [o.orderRef, fmtDate(o.date), o.name, o.phone, o.items,
        o.subtotal, o.gst, o.total, o.payment, o.status].map(cell).join(','))
    ].join('\r\n');

    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `trishool-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV downloaded');
  });

  /* --- panel mode: open, close, and the shared website footer --- */
  if (IN_PANEL) {
    const panel = $('#adminPanel');

    const closePanel = () => {
      panel.hidden = true;
      document.body.style.removeProperty('overflow');
      $('#navAdmin')?.focus();
    };

    const openPanel = async () => {
      panel.hidden = false;
      // Stop the page behind the panel from scrolling with it.
      document.body.style.overflow = 'hidden';

      // Nothing is fetched until this runs, so the panel starts on the
      // sign-in card unless a session already exists.
      try {
        const me = await req('GET', '/auth/me');
        state.admin = me.admin;
        $('#adminName').textContent = me.admin.name;
        $('#adminEmail').textContent = me.admin.email;
        $('#gate').hidden = true;
        $('#app').hidden = false;
        await refresh();
      } catch {
        showGate();
      }
      $('#gateEmail')?.focus();
    };

    $('#panelClose')?.addEventListener('click', closePanel);
    $('#gateClose')?.addEventListener('click', closePanel);
    $('#panelWebsiteBtn')?.addEventListener('click', closePanel);

    // Escape closes the panel, like the cart drawer.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) closePanel();
    });

    // Exposed for app.js, which opens the panel from the Admin links.
    window.openAdminPanel = openPanel;
    window.closeAdminPanel = closePanel;
    return;
  }

  /* --- standalone page: check for an existing session straight away --- */
  // If this host has no API at all, go where the dashboard really lives
  // rather than showing a sign-in form that can never work here.
  redirectIfNoApi().then(() => {
    req('GET', '/auth/me')
      .then(async (data) => {
        state.admin = data.admin;
        $('#adminName').textContent = data.admin.name;
        $('#adminEmail').textContent = data.admin.email;
        $('#gate').hidden = true;
        $('#app').hidden = false;
        await refresh();
      })
      .catch(() => showGate());
  });
}

if (document.readyState === 'loading') {
  // admin.html: a normal <script> tag, so the DOM is still building.
  document.addEventListener('DOMContentLoaded', initAdmin, { once: true });
} else {
  // index.html: this file is fetched on demand, after load has finished,
  // so DOMContentLoaded has already fired and will never fire again.
  initAdmin();
}


})();
