/* ============================================================
   TRISHOOL ENTERPRISES — app.js
   Catalog + cart + WhatsApp / UPI wiring
   ============================================================ */

/* ---------------------------------------------------------
   BUSINESS DETAILS
   Change these values here to update the whole site.
   --------------------------------------------------------- */
const BUSINESS = {
  name:    'TRISHOOL ENTERPRISES',
  // Digits only, with country code, no +, spaces or dashes.
  whatsapp: '919082278478',
  upiId:    '9324534405@ptaxis',
  upiName:  'TRISHOOL ENTERPRISES',
  currency: '₹',

  // Shown in the contact card, the footer and every WhatsApp order message.
  address: {
    line1: 'Steel Chamber Tower',
    line2: 'C Wing, 527',
    line3: 'Kalamboli',
    line4: 'Navi Mumbai',
    // Used for the Google Maps link.
    query:  'Steel Chamber Tower, C Wing, 527, Kalamboli, Navi Mumbai'
  },

  hours: {
    weekdays: '10:00 AM – 8:00 PM',
    sunday:   'By appointment'
  },

  // GST is added automatically to every cart line and to the grand total.
  // 18% is the standard rate for computer / peripheral repair, AMC services
  // and sale of computer & printer hardware in India.
  gst: {
    rate:      18,     // percent
    inclusive: false,  // false = listed prices are pre-GST, GST added on top
    gstin:     ''      // put your GSTIN here; it prints on the cart summary
  }
};

/* ---------------------------------------------------------
   BACKEND API
   ---------------------------------------------------------
   The Express server serves this page and the JSON API from the same
   origin, so a relative path is all that is needed. Set apiBase only if
   the API is hosted somewhere else.

   There is no key or password in this file. The public write endpoints
   need no credential (the worst a forger can do is add a junk row to a
   table only the owner can see), while reading records and changing them
   requires a signed-in admin session, which lives in an httpOnly cookie
   the browser sends automatically and no script here can read.
   --------------------------------------------------------- */
/* ---------------------------------------------------------
   WHERE THE BACKEND LIVES

   There are three ways this site can be run, and the two settings
   below are what let one build work in all of them.

   1. Everything on one machine (START-WEBSITE.bat, or a Render
      deployment). The page and the API share an origin, so both
      settings stay blank. This is the default.

   2. Static page on GitHub Pages, API on a real host
      (Render, Railway, a VPS). Put that host in BOTH settings,
      for example:

          apiBase:  'https://trishool-website.onrender.com',
          adminUrl: 'https://trishool-website.onrender.com/admin.html'

      Forms then save to the database and the admin dashboard works
      from anywhere in the world.

   3. Static page on GitHub Pages with no API deployed yet.
      Leave apiBase blank and set adminUrl to wherever you do run the
      server - by default your own machine. Clicking Admin then takes
      the browser to the working dashboard instead of showing an error
      page that cannot do anything.
   --------------------------------------------------------- */
const BACKEND = {
  // '' means "the same host that served this page".
  apiBase: '',

  // Where the admin dashboard lives when it cannot run on this page.
  adminUrl: 'http://127.0.0.1:3000/admin.html'
};

/** Build an API URL. */
const api = (path) => BACKEND.apiBase + '/api' + path;

/** The backend is considered up once the page is served by it. */
const backendOn = () => true;

/**
 * Is the API actually answering?
 *
 * Checked once and remembered. A static host such as GitHub Pages serves the
 * page fine but has no /api at all, and that is the one situation where the
 * admin panel genuinely cannot work on this page.
 */
let apiCheck = null;
function apiAvailable() {
  if (apiCheck === null) {
    apiCheck = fetch(api('/health'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => !!(d && d.ok))
      .catch(() => false);
  }
  return apiCheck;
}

/* ---------------------------------------------------------
   CATALOG
   price: number  -> fixed price, added to the cart total
   price: null    -> enquiry item, quoted on WhatsApp
   --------------------------------------------------------- */
let SERVICES = [
  {
    id: 'printer-repair',
    title: 'Printer Repair',
    icon: '🖨️',
    price: 300,
    bento: 'lead',            // 2 x 2 in the bento grid
    badge: 'Most booked',
    desc: 'Paper jams, print errors, streaking, blinking lights and power issues. All major brands.',
    detail: ['Dot Matrix', 'Laser', 'Ink Tank', 'MFP']
  },
  {
    id: 'computer-repair',
    title: 'Computer Repair',
    icon: '💻',
    price: 500,
    desc: 'No power, no display, frequent hangs, viruses and slow performance. Desktop or laptop.'
  },
  {
    id: 'cartridge-refill',
    title: 'Cartridge Refill',
    icon: '🖋️',
    price: 250,
    desc: 'Genuine-toner refill with print-head cleaning, restoring sharp original print quality.'
  },
  {
    id: 'quick-service',
    title: 'Quick Service',
    icon: '⚡',
    price: 250,
    bento: 'wide',            // full width, short
    desc: 'Express check-up and minor fixes while you wait, or a priority on-site visit slot.'
  }
];

let AMC_PLANS = [
  {
    id: 'amc-computer',
    title: 'Computer AMC',
    icon: '💻',
    price: 2500,
    period: 'per year',
    sub: 'Annual Maintenance Contract for desktops & laptops',
    badge: 'Annual',
    badgeClass: 'badge-annual',
    features: [
      { t: 'Unlimited breakdown support', ok: true },
      { t: 'Priority on-site response', ok: true },
      { t: 'Routine servicing & cleaning', ok: true },
      { t: 'OS, drivers & software support', ok: true },
      { t: 'Parts and consumables', ok: false, note: 'charged at cost' }
    ]
  },
  {
    id: 'amc-printer',
    title: 'Printer AMC',
    icon: '🖨️',
    price: 1500,
    period: 'per year',
    sub: 'Annual Maintenance Contract for printers & MFPs',
    badge: 'Annual',
    badgeClass: 'badge-annual',
    features: [
      { t: 'Breakdown call support', ok: true },
      { t: 'Priority service slots', ok: true },
      { t: 'Roller & head maintenance', ok: true },
      { t: 'Error-code diagnosis', ok: true },
      { t: 'Cartridges & parts', ok: false, note: 'charged at cost' }
    ]
  }
];

let BUY_SELL = [
  {
    id: 'buy-desktop',
    title: 'Refurbished Desktops',
    icon: '🖥️',
    price: null,
    desc: 'Tested, graded and ready-to-use office and gaming desktops. Bulk supply available.'
  },
  {
    id: 'buy-printer',
    title: 'Printers & MFPs',
    icon: '🖨️',
    price: null,
    desc: 'New and refurbished inkjet, laser and multifunction printers from all major brands.'
  },
  {
    id: 'buy-laptop',
    title: 'Laptops',
    icon: '💼',
    price: null,
    desc: 'Business and student laptops, new and certified refurbished. We also buy yours.'
  },
  {
    id: 'buy-consumables',
    title: 'Consumables & Parts',
    icon: '📦',
    price: null,
    desc: 'Toner, ink, cartridges, ribbons, drums and spare parts for all major brands.'
  }
];

/* ---------------------------------------------------------
   HELPERS
   --------------------------------------------------------- */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const money = (n) => BUSINESS.currency + Number(n).toLocaleString('en-IN');

/** Format a catalog price for display. `null` becomes an enquiry label. */
function priceLabel(item) {
  return item.price === null
    ? '<span class="amt na">On request</span>'
    : `<span class="amt">${money(item.price)}</span>`;
}

/** Small "GST extra" caption shown under a listed price. */
function gstCaption(item) {
  if (item.price === null) return '';
  return BUSINESS.gst.inclusive
    ? '<span class="gst-note">incl. GST</span>'
    : `<span class="gst-note">+ ${BUSINESS.gst.rate}% GST</span>`;
}

/** WhatsApp click-to-chat link with an optional prefilled message. */
function waLink(message) {
  const base = `https://wa.me/${BUSINESS.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** upi:// intent. Amount is only included when we actually know the total. */
function upiLink(amount) {
  const params = new URLSearchParams({
    pa: BUSINESS.upiId,
    pn: BUSINESS.upiName,
    cu: 'INR',
    tn: `Payment to ${BUSINESS.name}`
  });
  if (amount > 0) params.set('am', String(amount));
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

/** Google Maps directions/search link. */
const mapLink = () =>
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(BUSINESS.address.query);

/* ---------------------------------------------------------
   RENDER CATALOG
   --------------------------------------------------------- */
function renderHeroRates() {
  $('#heroRates').innerHTML = SERVICES.map((s) => `
    <li>
      <b>${esc(s.icon)} ${esc(s.title)}</b>
      <span class="price">${money(s.price)}</span>
    </li>
  `).join('');
}

/**
 * Replace the built-in catalog with the live one from MySQL.
 *
 * The hardcoded lists above stay as a fallback, so the page still renders if
 * the API is slow or briefly unavailable - it just shows the prices that were
 * correct when the file was written.
 *
 * The card markup is unchanged: the API returns the same field names the
 * renderers already use, including `bento`, so the layout is identical.
 */
async function loadServicesFromApi() {
  try {
    const res = await fetch(api('/services'), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.services) || !data.services.length) return false;

    const byCategory = { service: [], amc: [], product: [] };

    data.services.forEach((svc) => {
      const item = {
        id: svc.slug || svc.id,      // keep slugs, so any saved cart still resolves
        dbId: svc.id,
        title: svc.title,
        icon: svc.icon || '',
        price: svc.price,
        desc: svc.desc || '',
        bento: svc.bento || null,
        badge: svc.badge || null,
        detail: svc.detail || null,
        // AMC cards need their bullet list and "sub" line; plain services do not.
        features: Array.isArray(svc.features) ? svc.features : null,
        sub: svc.sub || null,
        period: svc.period || null
      };
      (byCategory[svc.category] || byCategory.service).push(item);
    });

    if (byCategory.service.length) SERVICES = byCategory.service;
    if (byCategory.amc.length)     AMC_PLANS = byCategory.amc;
    if (byCategory.product.length) BUY_SELL  = byCategory.product;

    // Re-render the parts of the page that show the catalog.
    renderHeroRates();
    renderServices();
    renderAmc();
    renderBuySell();
    renderCart();
    return true;

  } catch (err) {
    console.warn('Using the built-in service list:', err);
    return false;
  }
}

function renderServices() {
  $('#servicesGrid').innerHTML = SERVICES.map((s) => {
    const size = s.bento ? ` card--${s.bento}` : '';
    const badge = s.badge ? `<span class="badge badge-pop">${esc(s.badge)}</span>` : '';
    const chips = s.detail
      ? `<ul class="chip-row">${s.detail.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
      : '';

    return `
      <article class="card${size}">
        ${badge}
        <span class="card-ico">${esc(s.icon)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.desc)}</p>
        ${chips}
        <div class="card-meta">
          <span class="price">${priceLabel(s)}${gstCaption(s)}</span>
        </div>
        <button class="btn ${s.bento === 'lead' ? 'btn-primary' : 'btn-outline'} btn-block" data-add="${esc(s.id)}">
          ${s.bento === 'lead' ? 'Add to cart' : 'Add'}
        </button>
      </article>
    `;
  }).join('');
}

function renderAmc() {
  $('#amcGrid').innerHTML = AMC_PLANS.map((a) => {
    // A service created in the dashboard has no feature list yet, so default it
    // to an empty one rather than letting the card renderer throw.
    const feats = (a.features || []).map((f) => `
      <li>
        <svg viewBox="0 0 24 24" class="${f.ok ? '' : 'no'}">
          <path d="${f.ok
            ? 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z'
            : 'M19 13H5v-2h14v2Z'}"/>
        </svg>
        <span>${esc(f.t)}${f.note ? ` <em class="tiny">(${esc(f.note)})</em>` : ''}</span>
      </li>
    `).join('');

    return `
      <article class="amc-card">
        <span class="badge ${a.badgeClass || 'badge-annual'}">${esc(a.badge || 'Annual')}</span>
        <h3>${esc(a.icon)} ${esc(a.title)}</h3>
        <p class="amc-sub">${esc(a.sub || a.desc || '')}</p>
        <div class="amc-price">
          <span class="amt">${money(a.price)}</span>
          <span class="per">${esc(a.period)}</span>
          ${gstCaption(a)}
        </div>
        <p class="fine">Non-comprehensive AMC &middot; parts charged separately at cost</p>
        <ul class="amc-list">${feats}</ul>
        <button class="btn ${a.price <= 1500 ? 'btn-outline' : 'btn-primary'} btn-block" data-add="${esc(a.id)}">
          Add AMC to cart
        </button>
      </article>
    `;
  }).join('');
}

function renderBuySell() {
  $('#buyGrid').innerHTML = BUY_SELL.map((b) => `
    <article class="card">
      <span class="card-ico">${esc(b.icon)}</span>
      <h3>${esc(b.title)}</h3>
      <p>${esc(b.desc)}</p>
      <div class="card-meta">
        <span class="price">${priceLabel(b)}${gstCaption(b)}</span>
      </div>
      <button class="btn btn-outline btn-block" data-add="${esc(b.id)}">Add enquiry to cart</button>
    </article>
  `).join('');
}

/* ---------------------------------------------------------
   CART STATE
   --------------------------------------------------------- */
const CART_KEY = 'trishool_cart_v1';
let cart = loadCart();

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

/** Reject anything that no longer matches the catalog (stale/tampered storage). */
function isValidItem(it) {
  return it
    && typeof it.id === 'string'
    && Number.isFinite(it.qty) && it.qty > 0
    && allItems().some((c) => c.id === it.id);
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* storage full/blocked */ }
}

function allItems() { return [...SERVICES, ...AMC_PLANS, ...BUY_SELL]; }

function findItem(id) { return allItems().find((i) => i.id === id); }

function addToCart(id) {
  const item = findItem(id);
  if (!item) return;

  const line = cart.find((l) => l.id === id);
  if (line) {
    line.qty += 1;
  } else {
    cart.push({ id, qty: 1 });
  }

  saveCart();
  renderCart();
  toast(`${item.title} added to cart`);
}

function setQty(id, qty) {
  const line = cart.find((l) => l.id === id);
  if (!line) return;

  if (qty <= 0) {
    cart = cart.filter((l) => l.id !== id);
  } else {
    line.qty = Math.min(qty, 99);
  }

  saveCart();
  renderCart();
}

function clearCart() {
  cart = [];
  saveCart();
  renderCart();
  toast('Cart cleared');
}

/** Sum of fixed-price lines only. Enquiry items contribute 0. */
function cartTotal() {
  return cart.reduce((sum, line) => {
    const item = findItem(line.id);
    return sum + (item && item.price !== null ? item.price * line.qty : 0);
  }, 0);
}

/**
 * Split one cart line into base / GST / total.
 *
 * GST is rounded per line rather than on the cart total, which is how a GST
 * invoice is normally prepared and keeps the printed lines adding up exactly.
 * Enquiry items have no price, so they carry no GST.
 */
function lineTotals(line) {
  const item = findItem(line.id);
  if (!item || item.price === null) {
    return { base: 0, gst: 0, total: 0, enquiry: true };
  }

  const base = item.price * line.qty;
  const gst = BUSINESS.gst.inclusive ? 0 : Math.round((base * BUSINESS.gst.rate) / 100);
  return { base, gst, total: base + gst, enquiry: false };
}

/** Cart-wide subtotal / GST / grand total. */
function cartTotals() {
  return cart.reduce((acc, line) => {
    const t = lineTotals(line);
    acc.subtotal += t.base;
    acc.gst += t.gst;
    if (t.enquiry) acc.hasEnquiry = true;
    return acc;
  }, { subtotal: 0, gst: 0, hasEnquiry: false });
}

/** The amount the customer actually pays. */
function cartGrandTotal() {
  const t = cartTotals();
  return t.subtotal + t.gst;
}

/** Human label for the GST line, e.g. "GST @ 18%". */
function gstLabel() {
  return `GST @ ${BUSINESS.gst.rate}%`;
}

function cartHasEnquiry() {
  return cart.some((l) => {
    const item = findItem(l.id);
    return item && item.price === null;
  });
}

function cartCount() {
  return cart.reduce((n, l) => n + l.qty, 0);
}

/* ---------------------------------------------------------
   RENDER CART
   --------------------------------------------------------- */
function renderCart() {
  /* badge */
  const count = cartCount();
  const badge = $('#cartCount');
  badge.textContent = count;
  badge.dataset.empty = String(count === 0);

  /* The badge number is visible text, so the accessible name has to contain it,
     otherwise screen readers announce a name that doesn't match what is shown. */
  $('#cartBtn').setAttribute(
    'aria-label',
    count === 0
      ? 'Open cart, empty'
      : `Open cart, ${count} item${count === 1 ? '' : 's'}`
  );

  /* lines */
  const itemsEl  = $('#cartItems');
  const emptyEl  = $('#cartEmpty');
  const hasItems = cart.length > 0;

  emptyEl.hidden = hasItems;

  itemsEl.innerHTML = cart.map((line) => {
    const item = findItem(line.id);
    if (!item) return '';

    const t = lineTotals(line);
    const unit = t.enquiry ? 'Quote on WhatsApp' : money(item.price);
    const total = t.enquiry
      ? '<span class="tiny">&mdash;</span>'
      : money(t.total);
    const gstLine = t.enquiry || t.gst === 0
      ? ''
      : `<span class="ci-gst">+ ${money(t.gst)} GST</span>`;

    return `
      <li class="cart-item">
        <span class="cart-item-ico">${esc(item.icon)}</span>
        <div class="cart-item-info">
          <h4>${esc(item.title)}</h4>
          <span class="ci-price ${t.enquiry ? 'na' : ''}">${unit}</span>
          ${gstLine}
          <div class="qty">
            <button type="button" data-dec="${esc(item.id)}" aria-label="&minus; decrease quantity of ${esc(item.title)}">&minus;</button>
            <span>${line.qty}</span>
            <button type="button" data-inc="${esc(item.id)}" aria-label="+ increase quantity of ${esc(item.title)}">+</button>
          </div>
        </div>
        <span class="cart-item-total">${total}</span>
        <button class="cart-remove" data-rm="${esc(item.id)}" aria-label="&times; remove ${esc(item.title)} from cart">&times;</button>
      </li>
    `;
  }).join('');

  /* totals: subtotal, GST, grand total */
  const t = cartTotals();
  const grand = t.subtotal + t.gst;

  $('#cartSubtotal').textContent = money(t.subtotal);
  $('#cartGst').textContent = BUSINESS.gst.inclusive ? 'Included' : money(t.gst);
  $('#cartGstLabel').textContent = gstLabel();
  $('#cartTotal').textContent = money(grand);
  $('#cartEnquiryNote').hidden = !t.hasEnquiry;

  /* a GST-registered business must show its GSTIN on the bill */
  const gstinRow = $('#cartGstinRow');
  if (gstinRow) {
    gstinRow.hidden = !BUSINESS.gst.gstin;
    if (BUSINESS.gst.gstin) {
      $('#cartGstin').textContent = BUSINESS.gst.gstin;
    }
  }

  /* UPI panel — the customer pays the GST-inclusive amount */
  const method = $('input[name="payMethod"]:checked')?.value || 'Cash';
  $('#cartUpi').hidden = method !== 'UPI';
  $('#cartPayLink').href = upiLink(grand);
  $('#payLink').href = upiLink(0);

  /* checkout button label */
  $('#cartCheckout').textContent = hasItems
    ? `Send order on WhatsApp · ${money(grand)}`
    : 'Send order on WhatsApp';

  /* Any change to the cart invalidates the last receipt: the reference shown
     belongs to an order that no longer matches what is in the drawer. Hiding
     it here covers add, remove, quantity change and clear, since all of them
     funnel through renderCart. showOrderReceipt does not, so the receipt it
     draws survives until the cart really does change. */
  $('#cartReceipt').hidden = true;
}

/** Show the customer fields only when orders are actually being recorded. */
function initCustomerFields() {
  const block = $('#custBlock');
  if (!block) return;
  block.hidden = !backendOn();
}

/* ---------------------------------------------------------
   WHATSAPP MESSAGES
   Plain text only, deliberately:

     - no emoji
     - no WhatsApp *bold* or _italic_ markers, which show up as literal
       asterisks on some clients and in notifications
     - no address; it is already on the contact card and the footer

   House format:

     Namaste Trishool Enterprises!
     Kaptan, we would like to place an order for [service].
     Kindly share the necessary details and guide us...
     Looking forward to doing business with you!
   --------------------------------------------------------- */

/** Greeting used by every non-cart WhatsApp link (header, footer, float). */
function waGreeting() {
  return [
    'Namaste Trishool Enterprises!',
    '',
    'Kaptan, we would like to know more about your services.',
    '',
    'Kindly share the necessary details and guide us through the booking process.',
    '',
    'Looking forward to doing business with you!'
  ].join('\n');
}

/** Short, human-quotable order reference, e.g. "TRH-K3P9QZ". */
const newOrderRef = () =>
  'TRH-' + Date.now().toString(36).toUpperCase().slice(-6);

/**
 * The order message sent from the cart.
 *
 * Services and their prices share one numbered list, so nothing is repeated:
 * the item is named once and its breakdown sits on the same line.
 */
function buildOrderMessage(customer, orderRef) {
  if (cart.length === 0) return null;

  const method = $('input[name="payMethod"]:checked')?.value || 'Cash';
  const totals = cartTotals();

  const items = cart.map((line, i) => {
    const item = findItem(line.id);
    const t = lineTotals(line);

    if (t.enquiry) {
      return `${i + 1}. ${item.title} - on request`;
    }

    const line2 = `${money(item.price)} x ${line.qty} = ${money(t.base)}`;
    const gst = BUSINESS.gst.inclusive ? '' : ` (GST ${money(t.gst)})`;
    return `${i + 1}. ${item.title} - ${line2}${gst}`;
  });

  /* An enquiry-only cart has nothing to total, so say so rather than print
     a row of zeroes. */
  const pricedTotal = totals.subtotal + totals.gst;
  const showGst = !BUSINESS.gst.inclusive && totals.gst > 0;

  const totalsBlock = pricedTotal === 0
    ? ['Pricing: on request, kindly share a quote']
    : [
        `Subtotal: ${money(totals.subtotal)}`,
        ...(showGst ? [`${gstLabel()}: ${money(totals.gst)}`] : []),
        ...(BUSINESS.gst.gstin ? [`GSTIN: ${BUSINESS.gst.gstin}`] : []),
        `Total: ${money(pricedTotal)}`,
        ...(totals.hasEnquiry ? ['Plus items quoted separately'] : [])
      ];

  return [
    'Namaste Trishool Enterprises!',
    '',
    'Kaptan, we would like to place an order for:',
    '',
    ...items,
    '',
    'Kindly share the necessary details and guide us through the booking process.',
    '',
    // Only included when the customer actually gave their details.
    ...(customer.name  ? [`Name: ${customer.name}`]  : []),
    ...(customer.phone ? [`Phone: ${customer.phone}`] : []),
    `Order Ref: ${orderRef}`,
    '',
    ...totalsBlock,
    `Payment method: ${method}${method === 'UPI' ? ` (${BUSINESS.upiId})` : ''}`,
    '',
    'Looking forward to doing business with you!'
  ].join('\n');
}

/* ---------------------------------------------------------
   REVIEWS
   Submissions are held for approval. The public page only ever shows
   reviews the owner has marked "Approved" in the admin page.
   --------------------------------------------------------- */

/** Escape and clamp, so approved database content can never break the page. */
function cleanReview(r) {
  return {
    name:    String(r.name || '').trim().slice(0, 80),
    rating:  Math.max(1, Math.min(5, Number(r.rating) || 5)),
    service: String(r.service || '').trim().slice(0, 80),
    text:    String(r.text || '').trim().slice(0, 900),
    // Keep the date the card caption shows, but only if it parses.
    date:    r.date && !Number.isNaN(new Date(r.date).getTime()) ? r.date : ''
  };
}

/** "1 Oct 2026" from an ISO date, or an empty string if it cannot be parsed. */
function dayLabel(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function reviewCard(r) {
  const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  const meta = [esc(r.service), esc(dayLabel(r.date))].filter(Boolean).join(' &middot; ');
  return `
    <figure class="quote">
      <div class="stars" aria-label="${r.rating} out of 5">${stars}</div>
      <blockquote>${esc(r.text)}</blockquote>
      <figcaption>
        <strong>${esc(r.name)}</strong>
        <span>${meta}</span>
      </figcaption>
    </figure>
  `;
}

/**
 * Show real approved reviews, newest first.
 *
 * There are no invented reviews on the site: until a customer actually writes
 * one and it is approved, the section shows an honest empty state instead.
 */
async function loadPublicReviews() {
  if (!backendOn()) return false;

  try {
    const res = await fetch(api('/reviews'), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.reviews)) return false;

    const list = data.reviews
      .map(cleanReview)
      .filter((r) => r.name && r.text);

    if (!list.length) return false;

    $('#reviewsGrid').innerHTML = list.map(reviewCard).join('');
    $('#reviewsNote').textContent =
      `${list.length} customer review${list.length === 1 ? '' : 's'}.`;
    return true;

  } catch (err) {
    console.warn('Could not load reviews:', err);
    return false;
  }
}

function readReview() {
  const name  = ($('#rvName')?.value || '').trim();
  const text  = ($('#rvText')?.value || '').trim();
  const rating = Number($('input[name="rating"]:checked')?.value || 0);
  const service = $('#rvService')?.value || '';

  if (name.length < 2) return { ok: false, message: 'Please enter your name' };
  if (text.length < 10) return { ok: false, message: 'Please write a little more (at least 10 characters)' };

  return { ok: true, review: { name, text, rating, service, at: new Date().toISOString() } };
}

function reviewFeedback(ok, message) {
  const err = $('#rvError');
  const good = $('#rvOk');
  if (ok === null) {
    err.hidden = true;
    good.hidden = true;
    return;
  }
  if (ok) {
    err.hidden = true;
    good.hidden = false;
    good.textContent = message;
  } else {
    good.hidden = true;
    err.hidden = false;
    err.textContent = message;
  }
}

/**
 * Publish a review to the website.
 *
 * The review is stored by the API and starts as Pending; it appears on the
 * public page once an admin approves it. So:
 *
 *   - saved    -> we confirm it was received, not that it is already live
 *   - not saved-> we say so plainly and offer WhatsApp as a deliberate choice.
 *                 We never silently redirect, and we never claim a review was
 *                 saved when it was not.
 */
async function submitReview(event) {
  event.preventDefault();

  const result = readReview();
  if (!result.ok) {
    reviewFeedback(false, result.message);
    return;
  }

  const btn = $('#rvSubmit');
  btn.disabled = true;
  reviewFeedback(null, '');

  if (!backendOn()) {
    btn.disabled = false;
    reviewFeedback(
      false,
      'Reviews cannot be posted on the website yet. Please send it on WhatsApp instead — we will add it for you.'
    );
    $('#rvWhatsApp')?.removeAttribute('hidden');
    return;
  }

  try {
    const res = await fetch(api('/reviews'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: result.review.name,
        text: result.review.text,
        rating: result.review.rating,
        service: result.review.service,
        phone: result.review.phone || ''
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Could not save');

    $('#reviewForm').reset();
    $('#r5').checked = true;
    $('#rvWhatsApp')?.setAttribute('hidden', '');
    reviewFeedback(true, 'Thank you! Your review has been sent and will appear on this page once we approve it.');
    loadPublicReviews();

  } catch (err) {
    // Be honest about the failure, and offer a way through that does not lose
    // what they wrote.
    reviewFeedback(
      false,
      'We could not post that just now. Please send it on WhatsApp instead — we will add it for you.'
    );
    const wa = $('#rvWhatsApp');
    if (wa) {
      wa.href = waLink(buildReviewWhatsApp(result.review));
      wa.removeAttribute('hidden');
    }
  } finally {
    btn.disabled = false;
  }
}

/** Plain-text review, matching the house message style. */
function buildReviewWhatsApp(r) {
  return [
    'Namaste Trishool Enterprises!',
    '',
    'We would like to leave a review.',
    '',
    `Service: ${r.service}`,
    `Rating: ${r.rating} out of 5`,
    '',
    r.text,
    '',
    `From: ${r.name}`,
    '',
    'Looking forward to doing business with you!'
  ].join('\n');
}

/** Plain-text review, matching the house message style. */
function buildReviewWhatsApp(r) {
  return [
    'Namaste Trishool Enterprises!',
    '',
    'We would like to leave a review.',
    '',
    `Service: ${r.service}`,
    `Rating: ${r.rating} out of 5`,
    '',
    r.text,
    '',
    `From: ${r.name}`,
    '',
    'Looking forward to doing business with you!'
  ].join('\n');
}

/* ---------------------------------------------------------
   CUSTOMER DETAILS
   Only asked for when order records are switched on, so the checkout stays
   as short as possible if you never turn the backend on.
   --------------------------------------------------------- */
function readCustomer() {
  const nameEl  = $('#custName');
  const phoneEl = $('#custPhone');

  const name  = (nameEl?.value || '').trim();
  const phone = (phoneEl?.value || '').replace(/\D/g, '');

  /* Accept 10-digit Indian numbers, with or without 91 / +91. */
  let digits = phone;
  if (digits.length > 10 && digits.slice(0, 2) === '91') digits = digits.slice(2);

  if (name.length < 2)  return { ok: false, field: 'name',  message: 'Please enter your name' };
  if (digits.length !== 10) {
    return { ok: false, field: 'phone', message: 'Please enter a 10-digit mobile number' };
  }

  return { ok: true, name, phone: `+91${digits}` };
}

/** Show an inline error under the relevant field. */
function showCustomerError(field, message) {
  const box = $('#custError');
  if (!box) return;
  if (!field) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = message;
  const el = field === 'name' ? $('#custName') : $('#custPhone');
  el?.focus();
}

/* ---------------------------------------------------------
   CHECKOUT -> WHATSAPP
   --------------------------------------------------------- */

/** Build the record we store. Kept separate so it matches the sheet columns. */
function buildOrderRecord(customer, orderRef, method) {
  const totals = cartTotals();

  return {
    orderRef,
    at:         new Date().toISOString(),
    name:       customer.name,
    phone:      customer.phone,
    itemText:   cart
      .map((l) => `${findItem(l.id).title} x ${l.qty}`)
      .join(', '),
    subtotal:   totals.subtotal,
    gstRate:    BUSINESS.gst.rate,
    gst:        totals.gst,
    total:      totals.subtotal + totals.gst,
    hasEnquiry: totals.hasEnquiry,
    payment:    method,
    status:     'New'
  };
}

/**
 * Save the order to the database.
 *
 * The customer must reach WhatsApp regardless, so this never blocks checkout.
 * It returns the server's saved order (which carries the real reference) or
 * null, so the drawer can show them a receipt.
 */
async function saveOrder(record) {
  if (!backendOn()) return null;

  // A hung request must not strand the customer on a spinner, so the wait is
  // capped. fetch itself has no timeout, hence the explicit race.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(api('/orders'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        name: record.name,
        phone: record.phone,
        payment: record.payment,
        items: cart.map((l) => ({ id: l.id, qty: l.qty })),
        subtotal: record.subtotal
      })
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.order || null;
  } catch (err) {
    console.warn('Order record not saved:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Place the order.
 *
 * Guarded against a second tap. Saving the order before opening WhatsApp means
 * there is now a visible pause where the button is still live, and a double
 * tap - easy to do on a phone - would otherwise save two orders and open two
 * WhatsApp tabs. The flag makes repeat taps do nothing at all, rather than
 * relying on the disabled attribute alone.
 */
let checkingOut = false;

function checkout() {
  if (checkingOut) return;

  if (cart.length === 0) {
    toast('Your cart is empty — add a service first');
    return;
  }

  /* With records switched on we need to know who is ordering. */
  let customer = { name: '', phone: '' };
  if (backendOn()) {
    const result = readCustomer();
    if (!result.ok) {
      showCustomerError(result.field, result.message);
      return;
    }
    showCustomerError(null);
    customer = result;
  }

  const method = $('input[name="payMethod"]:checked')?.value || 'Cash';

  checkingOut = true;
  const btn = $('#cartCheckout');
  const originalLabel = btn.textContent;
  btn.disabled = true;

  // No records to keep: just open WhatsApp and be done.
  if (!backendOn()) {
    checkingOut = false;
    btn.disabled = false;
    window.open(waLink(buildOrderMessage(customer, newOrderRef())), '_blank', 'noopener');
    toast('Opening WhatsApp with your order…');
    return;
  }

  // With records on, the reference is saved *first* so the one the customer
  // quotes on WhatsApp is the one we can actually look up. Generating it here
  // meant WhatsApp carried TRH-QJMX6K while the database held TRH-ORD-EY6K,
  // so an admin searching for the customer's reference found nothing.
  //
  // The save is capped by a timeout so a slow or hanging database can never
  // stop the customer reaching WhatsApp - they fall back to a local reference
  // and the receipt warns them we do not have the order yet.
  const record = buildOrderRecord(customer, newOrderRef(), method);

  btn.textContent = 'Saving your order…';

  saveOrder(record)
    .catch(() => null)
    .then((saved) => {
      checkingOut = false;
      btn.disabled = false;
      btn.textContent = originalLabel;
      finishCheckout(customer, method, record.orderRef, saved);
    });
}

/**
 * Open WhatsApp with the confirmed reference and show the receipt.
 *
 * Runs whether or not the save succeeded, so the customer is never left
 * waiting on a request that has already given up.
 */
function finishCheckout(customer, method, localRef, saved) {
  const ref = saved?.ref || localRef;
  const message = buildOrderMessage(customer, ref);

  window.open(waLink(message), '_blank', 'noopener');
  toast(saved ? 'Order saved — opening WhatsApp…' : 'Opening WhatsApp with your order…');

  showOrderReceipt(saved ? ref : null);
}

/**
 * Tell the customer their order was received, with the reference we gave it.
 *
 * `ref` is the saved reference, or null when the order did not reach us.
 * Without this the only sign anything happened was a toast that vanishes, and
 * the cart stayed full - so a customer returning later could place the same
 * order twice and have no way of knowing. The cart is deliberately left alone
 * rather than cleared: if WhatsApp did not open, throwing their work away
 * would be worse than the risk of a repeat.
 */
function showOrderReceipt(ref) {
  const box = $('#cartReceipt');
  if (!box) return;

  box.hidden = false;

  if (ref) {
    box.innerHTML = `
      <p class="cart-receipt-ok">
        <strong>Order received.</strong>
        Your reference is <b>${esc(ref)}</b>.
        We have it on file and will confirm shortly.
      </p>
      <p class="tiny">
        WhatsApp did not open? Call us on the number above, or send the
        reference to ${esc(BUSINESS.whatsapp.slice(-10))}.
      </p>
      <p class="tiny">
        Your cart has been kept so nothing is lost. Clear it with
        "Clear cart" below once you are happy.
      </p>`;
  } else {
    box.innerHTML = `
      <p class="cart-receipt-warn">
        <strong>WhatsApp should have opened with your order.</strong>
        If it did not, please call us or send the details on WhatsApp - we
        will not have this order on file yet.
      </p>`;
  }

  // Bring the receipt into view, but only if the browser actually scrolls.
  // Wrapped because a stubbed or headless environment can throw here, and the
  // receipt stays readable in the drawer either way.
  try {
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch { /* scrolling is a nicety, not a requirement */ }
}

/* ---------------------------------------------------------
   DRAWER + NAV
   --------------------------------------------------------- */
function openCart() {
  $('#cartDrawer').hidden = false;
  $('#cartOverlay').hidden = false;
  requestAnimationFrame(() => {
    $('#cartDrawer').classList.add('open');
    $('#cartOverlay').classList.add('show');
  });
  document.body.classList.add('no-scroll');
  $('#cartClose').focus();
}

function closeCart() {
  $('#cartDrawer').classList.remove('open');
  $('#cartOverlay').classList.remove('show');
  document.body.classList.remove('no-scroll');
  setTimeout(() => {
    $('#cartDrawer').hidden = true;
    $('#cartOverlay').hidden = true;
  }, 300);
}

/* ---------------------------------------------------------
   TOAST
   --------------------------------------------------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------------------------------------------------
   JOURNEY — language switch
   --------------------------------------------------------- */
const LANG_KEY = 'trishool_lang_v1';

function setJourneyLang(lang, opts = {}) {
  const section = $('.journey');
  if (!section) return;

  section.dataset.lang = lang;

  $$('.lang-panel', section).forEach((panel) => {
    const show = panel.dataset.lang === lang;
    panel.hidden = !show;

    /* A panel that was hidden at load was never intersected, so its reveal
       elements would sit at opacity 0. Show them as soon as we switch over -
       on first paint we leave them alone so they can animate on scroll. */
    if (show && opts.reveal) {
      $$('[data-reveal]', panel).forEach((el) => el.classList.add('is-visible'));
    }
  });

  $$('.lang-btn', section).forEach((btn) => {
    const on = btn.dataset.setlang === lang;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage blocked */ }
}

function initJourneyLang() {
  const section = $('.journey');
  if (!section) return;

  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch { /* storage blocked */ }
  if (saved !== 'en' && saved !== 'hi') saved = 'en';

  setJourneyLang(saved);

  $$('.lang-btn', section).forEach((btn) => {
    btn.addEventListener('click', () => setJourneyLang(btn.dataset.setlang, { reveal: true }));
  });
}

/* ---------------------------------------------------------
   SCROLL REVEAL
   ---------------------------------------------------------
   [data-reveal] elements carry a real `opacity: 0` until revealed, so the
   mechanism that reveals them must be dependable. This uses a
   requestAnimationFrame-throttled scroll check rather than
   IntersectionObserver: it behaves identically in a normal browser, works
   even where IO never fires (background or non-rendered tabs), and costs
   nothing at this element count.

   The card-style elements have no hidden base state and are animated natively
   via `animation-timeline: view()` where supported, purely as an enhancement.
   --------------------------------------------------------- */
function initReveal() {
  const targets = $$('[data-reveal]');
  if (!targets.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  let queued = false;

  const check = () => {
    queued = false;
    const vh = window.innerHeight;
    targets.forEach((el) => {
      if (el.classList.contains('is-visible')) return;
      const r = el.getBoundingClientRect();
      // Reveal once the element's top edge is within the lower 12% of the
      // viewport, so it is already partly on screen when it fades up.
      if (r.top < vh * 0.88 && r.bottom > 0) el.classList.add('is-visible');
    });
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(check);
  };

  check();                                   // anything already on screen
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', onScroll);
}

/* ---------------------------------------------------------
   ANIMATED COUNTERS
   Counts up once, when the element first scrolls into view.
   <strong data-count="1997" data-from="1991">1997</strong>
   --------------------------------------------------------- */
function initCounters() {
  const nodes = $$('[data-count]');
  if (!nodes.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const run = (el) => {
    const to = Number(el.dataset.count);
    const from = el.dataset.from !== undefined ? Number(el.dataset.from) : 0;
    if (!Number.isFinite(to)) return;

    if (reduced) { el.textContent = String(to); return; }

    const dur = 1100;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      // easeOutExpo, so it decelerates instead of ticking linearly
      const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      run(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.4 });

  nodes.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  /* catalog */
  renderHeroRates();
  renderServices();
  renderAmc();
  renderBuySell();

  /* footer year */
  $('#year').textContent = new Date().getFullYear();

  /* cart */
  renderCart();

  /* Every general WhatsApp link opens a warm greeting rather than a blank chat. */
  const greeting = waGreeting();
  $$('[data-wa]').forEach((a) => { a.href = waLink(greeting); });

  /* Google Maps link built from the configured address */
  const map = $('#mapLink');
  if (map) map.href = mapLink();

  /* --- delegated clicks --- */

  // add to cart
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { addToCart(add.dataset.add); return; }

    const inc = e.target.closest('[data-inc]');
    if (inc) {
      const line = cart.find((l) => l.id === inc.dataset.inc);
      if (line) setQty(line.id, line.qty + 1);
      return;
    }

    const dec = e.target.closest('[data-dec]');
    if (dec) {
      const line = cart.find((l) => l.id === dec.dataset.dec);
      if (line) setQty(line.id, line.qty - 1);
      return;
    }

    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const item = findItem(rm.dataset.rm);
      setQty(rm.dataset.rm, 0);
      if (item) toast(`${item.title} removed`);
      return;
    }
  });

  /* --- cart controls --- */
  $('#cartBtn').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  $('#cartOverlay').addEventListener('click', closeCart);
  $('#cartClear').addEventListener('click', clearCart);
  $('#cartCheckout').addEventListener('click', checkout);

  /* payment method toggle */
  $$('input[name="payMethod"]').forEach((radio) => {
    radio.addEventListener('change', renderCart);
  });

  /* --- mobile nav --- */
  const navToggle = $('#navToggle');
  const nav = $('#primaryNav');

  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      nav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  /* --- admin: open the dashboard panel from either link --- */
  $('#navAdmin')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAdmin();
  });
  $('.foot-admin')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAdmin();
  });

  showAdminNav();

  /* --- keyboard: Escape closes drawer --- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#cartDrawer').classList.contains('open')) closeCart();
  });

  /* --- header shadow on scroll --- */
  const header = $('#siteHeader');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* --- journey: language switch + scroll reveal --- */
  initJourneyLang();
  initReveal();
  initCounters();

  /* order records */
  initCustomerFields();

  /* reviews */
  const rf = $('#reviewForm');
  if (rf) rf.addEventListener('submit', submitReview);
  loadPublicReviews();

  /* booking + inquiry forms */
  initInquireForms();
  initReviewLink();

  /* live service list from MySQL; the built-in list is the fallback */
  loadServicesFromApi().then((live) => {
    if (live) initInquireForms();   // refresh the selects with live names
  });

  initPwa();
});

/**
 * Keep the WhatsApp fallback link in step with what has been typed, so it is
 * always a complete, ready-to-send message.
 */
function initReviewLink() {
  const link = $('#rvWhatsApp');
  if (!link) return;

  const update = () => {
    const result = readReview();
    if (result.ok) {
      link.href = waLink(buildReviewWhatsApp(result.review));
      link.textContent = `or send this on WhatsApp to ${BUSINESS.whatsapp.slice(-10)}`;
    } else {
      link.textContent = 'or send it on WhatsApp instead';
    }
  };

  ['#rvName', '#rvText', '#rvService'].forEach((sel) => {
    const el = $(sel);
    el?.addEventListener('input', update);
    el?.addEventListener('change', update);
  });
  document.addEventListener('change', (e) => {
    if (e.target.name === 'rating') update();
  });

  update();
}

/* ---------------------------------------------------------
   ADMIN LINK IN THE NAVIGATION
   ---------------------------------------------------------
   A signed-in admin gets an "Admin" link in the navigation bar so the
   dashboard is one click away from the site they manage.

   The link is hidden in the markup and only revealed once the API confirms a
   valid admin session, so an ordinary customer never sees it. This is a
   convenience only and grants nothing: the link points at admin.html, which
   still checks the session, and every /api/admin endpoint is still guarded by
   requireAdmin on the server. Hiding a link is not access control - the server
   is. Showing it only to an admin simply keeps the staff page out of the way of
   visitors.
   --------------------------------------------------------- */
/**
 * The Admin link is always visible - it only opens the sign-in form, so there
 * is nothing to hide and no reason to hide it. What this does is confirm
 * whether somebody is already signed in, so the link can say so.
 */
async function showAdminNav() {
  const link = $('#navAdmin');
  if (!link) return;

  try {
    const res = await fetch(api('/auth/status'), { cache: 'no-store' });
    const data = await res.json();
    if (data.ok && data.admin) {
      link.title = `Signed in as ${data.admin.name} - open the admin dashboard`;
    } else {
      link.title = 'Staff sign in';
    }
  } catch {
    link.title = 'Staff sign in';
  }
}

/**
 * Open the admin dashboard, which lives inside this page as a full-screen
 * panel (#adminPanel).
 *
 * admin.js is fetched on first use rather than on page load. A visitor who
 * never opens the panel never downloads the ~20 KB of dashboard code, and the
 * panel's own data still comes only from the protected /api/admin endpoints,
 * so nothing about an order or a customer is ever in the page until a valid
 * admin session has been confirmed by the server.
 */
let adminScriptPromise = null;

function loadAdminScript() {
  if (window.openAdminPanel) return Promise.resolve();
  if (adminScriptPromise) return adminScriptPromise;

  adminScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'admin.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the admin dashboard'));
    document.body.appendChild(s);
  });

  return adminScriptPromise;
}

/**
 * Where the real server lives.
 *
 * A page opened straight off disk (file://) is not allowed by the browser to
 * call an API, so the admin dashboard cannot work from there no matter what the
 * JavaScript does. Instead of showing a dead sign-in form, clicking Admin hands
 * the browser over to the server, where sign-in and the dashboard behave
 * normally. Staff never see an error, and customers never see a notice.
 */
const SERVER_URL = 'http://127.0.0.1:3000';

/** True when this page was opened from disk rather than from the server. */
const openedAsFile = () => location.protocol === 'file:';

/** Is the machine that hosts the dashboard actually switched on and running? */
async function adminHostReachable() {
  const url = BACKEND.adminUrl || `${SERVER_URL}/admin.html`;
  try {
    // The page is not needed - only an answer. `no-cors` gives an opaque
    // response, but reaching it at all proves the server is up.
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tell the user what to do, instead of letting the browser show its own
 * "site can't be reached" page. That message names a port number and gives no
 * clue, which is exactly what happens when the dashboard host is switched off.
 */
function adminOfflineNotice() {
  const url = BACKEND.adminUrl || `${SERVER_URL}/admin.html`;
  toast('The admin dashboard is not running. Start it with START-WEBSITE.bat, then click Admin again.');
  console.warn(
    `[admin] ${url} is not reachable. Start the server (START-WEBSITE.bat) and try again.`
  );
}

async function openAdmin() {
  // Opened from disk, or served from a static host with no API behind it.
  // Either way there is nothing for the in-page panel to talk to, so the
  // browser goes to where the dashboard actually runs instead of showing a
  // sign-in form that can never succeed.
  if (openedAsFile() || !(await apiAvailable())) {
    // Only navigate if that host is up. Sending the browser to a machine that
    // is off just produces a dead end with no explanation.
    if (await adminHostReachable()) {
      location.href = BACKEND.adminUrl || `${SERVER_URL}/admin.html`;
    } else {
      adminOfflineNotice();
    }
    return;
  }

  const panel = $('#adminPanel');
  if (!panel) {
    // No panel on this page (admin.html) - go there instead.
    location.href = 'admin.html';
    return;
  }

  try {
    await loadAdminScript();
    window.openAdminPanel?.();
  } catch {
    toast('Could not open the admin dashboard. Please refresh and try again.');
  }
}

/* ---------------------------------------------------------
   BOOKING & INQUIRY FORMS
   Both save to MySQL through the API and hand back a reference plus a
   ready-made WhatsApp message, so nothing is lost if the visitor prefers
   to finish the conversation there.
   --------------------------------------------------------- */

function formFeedback(errId, okId, state, message) {
  const err = $(errId);
  const good = $(okId);
  if (state === 'ok') {
    err.hidden = true;
    good.hidden = false;
    good.textContent = message;
  } else {
    good.hidden = true;
    err.hidden = false;
    err.textContent = message;
  }
}

/** Populate a <select> from the live catalog. */
function fillServiceSelect(select, { includeBlank, blankLabel } = {}) {
  if (!select) return;
  const priced = [...SERVICES, ...AMC_PLANS];

  let html = includeBlank ? `<option value="">${blankLabel}</option>` : '';
  html += priced
    .map((s) => `<option value="${esc(s.id)}">${esc(s.title)}${
      s.price === null ? '' : ` — ${money(s.price)}`}</option>`)
    .join('');
  html += '<option value="product">Buying or selling equipment</option>';
  select.innerHTML = html;
}

async function submitBooking(event) {
  event.preventDefault();

  const payload = {
    name: ($('#bkName')?.value || '').trim(),
    phone: ($('#bkPhone')?.value || '').trim(),
    service: $('#bkService')?.value || '',
    address: ($('#bkAddress')?.value || '').trim(),
    preferredDate: $('#bkDate')?.value || '',
    message: ($('#bkNotes')?.value || '').trim()
  };

  const btn = $('#bkSubmit');
  btn.disabled = true;

  try {
    const res = await fetch(api('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.ok) {
      formFeedback('#bkError', '#bkOk', 'error', data.error || 'Please check your details');
      return;
    }

    $('#panelBooking').reset();
    formFeedback('#bkError', '#bkOk', 'ok',
      `${data.booking.message} Your reference is ${data.booking.ref}.`);

    const wa = $('#bkWhatsApp');
    if (wa && data.whatsapp) {
      wa.href = waLink(data.whatsapp);
      wa.removeAttribute('hidden');
    }
    toast('Request sent');

  } catch (err) {
    formFeedback('#bkError', '#bkOk', 'error',
      'We could not reach the server. Please WhatsApp us instead.');
    const wa = $('#bkWhatsApp');
    if (wa) { wa.href = waLink(); wa.removeAttribute('hidden'); }
  } finally {
    btn.disabled = false;
  }
}

async function submitInquiry(event) {
  event.preventDefault();

  const payload = {
    name: ($('#iqName')?.value || '').trim(),
    phone: ($('#iqPhone')?.value || '').trim(),
    service: $('#iqService')?.value || '',
    message: ($('#iqMessage')?.value || '').trim()
  };

  const btn = $('#iqSubmit');
  btn.disabled = true;

  try {
    const res = await fetch(api('/inquiries'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.ok) {
      formFeedback('#iqError', '#iqOk', 'error', data.error || 'Please check your details');
      return;
    }

    $('#panelInquiry').reset();
    formFeedback('#iqError', '#iqOk', 'ok',
      `${data.inquiry.message} Your reference is ${data.inquiry.ref}.`);

    const wa = $('#iqWhatsApp');
    if (wa && data.whatsapp) {
      wa.href = waLink(data.whatsapp);
      wa.removeAttribute('hidden');
    }
    toast('Question sent');

  } catch (err) {
    formFeedback('#iqError', '#iqOk', 'error',
      'We could not reach the server. Please WhatsApp us instead.');
    const wa = $('#iqWhatsApp');
    if (wa) { wa.href = waLink(); wa.removeAttribute('hidden'); }
  } finally {
    btn.disabled = false;
  }
}

/** Contact form in the contact section. */
async function submitContact(event) {
  event.preventDefault();

  const payload = {
    name: ($('#ctName')?.value || '').trim(),
    phone: ($('#ctPhone')?.value || '').trim(),
    subject: ($('#ctSubject')?.value || '').trim(),
    message: ($('#ctMessage')?.value || '').trim()
  };

  const btn = $('#ctSubmit');
  btn.disabled = true;

  try {
    const res = await fetch(api('/contact'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.ok) {
      formFeedback('#ctError', '#ctOk', 'error', data.error || 'Please check your details');
      return;
    }

    $('#contactForm').reset();
    formFeedback('#ctError', '#ctOk', 'ok', data.message);
    toast('Message sent');

  } catch (err) {
    formFeedback('#ctError', '#ctOk', 'error',
      'We could not reach the server. Please WhatsApp us instead.');
  } finally {
    btn.disabled = false;
  }
}

function initInquireForms() {
  const tabs = [['#tabBooking', '#panelBooking'], ['#tabInquiry', '#panelInquiry']];

  tabs.forEach(([tabSel, panelSel]) => {
    $(tabSel)?.addEventListener('click', () => {
      tabs.forEach(([t, p]) => {
        const on = t === tabSel;
        $(t).classList.toggle('is-active', on);
        $(t).setAttribute('aria-selected', String(on));
        $(p).hidden = !on;
      });
    });
  });

  $('#panelBooking')?.addEventListener('submit', submitBooking);
  $('#panelInquiry')?.addEventListener('submit', submitInquiry);
  $('#contactForm')?.addEventListener('submit', submitContact);

  // Stop the calendar offering days that have already gone. Set in JS rather
  // than as a `min` attribute in the HTML so it is always today, not the day
  // the file happened to be written. The server rejects past dates too - this
  // just means the customer never gets that far.
  const bkDate = $('#bkDate');
  if (bkDate) {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    bkDate.min = iso;
  }

  fillServiceSelect($('#bkService'));
  fillServiceSelect($('#iqService'), { includeBlank: true, blankLabel: 'Not sure yet' });

  /* Keep each WhatsApp link in step with what has been typed. */
  const updateLinks = () => {
    const bName = ($('#bkName')?.value || '').trim();
    const bSvc  = $('#bkService')?.selectedOptions[0]?.text || '';
    $('#bkWhatsApp')?.setAttribute('href', waLink([
      'Namaste Trishool Enterprises!',
      '',
      'Kaptan, I would like to book a service.',
      '',
      `Service: ${bSvc}`,
      `Name: ${bName}`,
      '',
      'Looking forward to doing business with you!'
    ].join('\n')));

    const iName = ($('#iqName')?.value || '').trim();
    const iMsg  = ($('#iqMessage')?.value || '').trim();
    $('#iqWhatsApp')?.setAttribute('href', waLink([
      'Namaste Trishool Enterprises!',
      '',
      'Kaptan, I have a question.',
      '',
      iMsg,
      '',
      `From: ${iName}`,
      '',
      'Looking forward to doing business with you!'
    ].join('\n')));
  };

  ['#panelBooking', '#panelInquiry'].forEach((sel) => {
    $(sel)?.addEventListener('input', updateLinks);
    $(sel)?.addEventListener('change', updateLinks);
  });
}

function initPwa() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Offline support not enabled:', err);
    });
  });

  /* The browser fires this when the app looks installable. Show a small,
     non-intrusive button rather than the raw prompt. */
  let deferred = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    showInstallBar();
  });

  function showInstallBar() {
    if ($('#installBar') || !deferred) return;

    const bar = document.createElement('div');
    bar.id = 'installBar';
    bar.className = 'install-bar';
    bar.innerHTML =
      '<span>Add the Trishool app to your home screen</span>' +
      '<button class="btn btn-primary btn-sm" id="installBtn">Install</button>' +
      '<button class="ib-close" id="installClose" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(bar);

    $('#installBtn').addEventListener('click', async () => {
      bar.remove();
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') toast('Installing the app…');
      deferred = null;
    });

    $('#installClose').addEventListener('click', () => {
      bar.remove();
      deferred = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    $('#installBar')?.remove();
    deferred = null;
    toast('App installed');
  });
}
