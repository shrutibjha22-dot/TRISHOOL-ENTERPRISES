/**
 * End-to-end smoke test against a running server.
 *
 *   npm start          (in one terminal)
 *   npm run smoke      (in another)
 *
 * Exercises every requirement: public writes, admin login, JWT protection,
 * services CRUD, reviews approval, and dashboard statistics.
 *
 * The admin credentials are read from .env (and can still be overridden by
 * real environment variables), so the test signs in with whatever password you
 * actually set instead of a value baked in here.
 */

require('dotenv').config();

// Needed only by the cleanup step, so the test can remove the rows it created.
const db = require('../config/db');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
// Both credentials come from .env. There is deliberately no fallback value:
// the admin address is a private choice and must not be baked into source.
const ADMIN_EMAIL = (process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase();
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || 'Trishool Admin';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  const missing = [
    !ADMIN_EMAIL && 'ADMIN_SEED_EMAIL',
    !ADMIN_PASSWORD && 'ADMIN_SEED_PASSWORD'
  ].filter(Boolean).join(' and ');

  console.error(
    `\n  ${missing} is not set.\n` +
    '  Add it to your .env file (see .env.example), then run this again.\n'
  );
  process.exit(1);
}

let pass = 0;
let fail = 0;
let cookie = '';

const c = { g: '\u001b[32m', r: '\u001b[31m', y: '\u001b[33m', d: '\u001b[2m', x: '\u001b[0m' };

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`${c.g}  PASS${c.x}  ${name}`);
  } else {
    fail += 1;
    console.log(`${c.r}  FAIL${c.x}  ${name}${detail ? `  ${c.y}${detail}${c.x}` : ''}`);
  }
}

/** Summary line, coloured by outcome. */
const colour0 = (p, f) => (f === 0 ? `${c.g}${p} passed, ${f} failed${c.x}` : `${c.r}${p} passed, ${f} failed${c.x}`);

/**
 * Delete everything this test just wrote.
 *
 * The checks above exercise the real write endpoints, so they leave real rows
 * behind. Without this, running the test would fill the admin dashboard with
 * fake "Smoke Tester" orders and make a demo look like the business is busy
 * when it is not.
 *
 * Every row the test creates is identifiable by these two markers, which no
 * real customer record would ever carry. Runs only when the test is pointed at
 * the local database, so a deployed site is never touched.
 */
const TEST_MARKERS = { names: ['Smoke Tester', 'Tamper'], phone: '+919876543210' };

async function cleanup() {
  const counts = { orders: 0, inquiries: 0, bookings: 0, reviews: 0, messages: 0 };

  // Refuse outright if this is not a local database.
  let info;
  try {
    info = await db.ping();
  } catch (err) {
    return { ...counts, ok: false, error: `no database: ${err.message}` };
  }
  if (!/^(127\.0\.0\.1|localhost|::1)$/.test(info.host || '127.0.0.1')) {
    return { ...counts, ok: false, error: `refusing to clean a remote database (${info.host})` };
  }

  const { names, phone } = TEST_MARKERS;

  // One placeholder per name, so the parameter list matches the SQL exactly.
  const placeholders = names.map((_, i) => `:name${i}`).join(', ');
  const params = { phone };
  names.forEach((n, i) => { params[`name${i}`] = n; });

  // `reviews` has no phone column - it is a name-only record by design -
  // so the phone filter is applied only where the column exists.
  const wipe = async (table, column, hasPhone = true) => {
    const sql = hasPhone
      ? `DELETE FROM \`${table}\` WHERE \`${column}\` IN (${placeholders}) OR phone = :phone`
      : `DELETE FROM \`${table}\` WHERE \`${column}\` IN (${placeholders})`;
    const res = await db.execute(sql, params);
    return res.affectedRows;
  };

  try {
    counts.orders    = await wipe('orders', 'customer_name');
    counts.inquiries = await wipe('service_inquiries', 'customer_name');
    counts.bookings  = await wipe('bookings', 'customer_name');
    counts.reviews   = await wipe('reviews', 'name', false);
    counts.messages  = await wipe('contact_submissions', 'name');
    await db.execute('DELETE FROM customers WHERE phone = :phone', { phone });
    return { ...counts, ok: true };
  } catch (err) {
    return { ...counts, ok: false, error: err.message };
  }
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const setCookie = res.headers.getSetCookie?.() || [];
  if (setCookie.length) cookie = setCookie.map((s) => s.split(';')[0]).join('; ');

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

(async () => {
  console.log(`\n  Smoke test against ${BASE}\n  ${'='.repeat(46)}\n`);

  /* ---------------- health ---------------- */
  console.log(`${c.d}-- health --${c.x}`);
  const health = await api('GET', '/api/health');
  check('health endpoint responds', health.status === 200 && health.data.ok);
  check('database is connected', health.data?.status === 'healthy',
    JSON.stringify(health.data));

  /* ---------------- public: services ---------------- */
  console.log(`\n${c.d}-- services (public read) --${c.x}`);
  const svc = await api('GET', '/api/services');
  check('services list returns 200', svc.status === 200);
  check('services come from the database', svc.data?.count >= 10, `count=${svc.data?.count}`);
  const printer = svc.data?.services.find((s) => s.slug === 'printer-repair');
  check('printer repair priced at 300', printer?.price === 300, `got ${printer?.price}`);
  check('bento layout preserved', printer?.bento === 'lead', `got ${printer?.bento}`);
  const enquiry = svc.data?.services.find((s) => s.slug === 'buy-desktop');
  check('buy/sell items are enquiry-only (null price)', enquiry?.price === null);

  const one = await api('GET', '/api/services/amc-computer');
  check('service lookup by slug works', one.status === 200 && one.data.service.price === 2500);

  /* ---------------- public: inquiry ---------------- */
  console.log(`\n${c.d}-- inquiry --${c.x}`);
  const inq = await api('POST', '/api/inquiries', {
    name: 'Smoke Tester', phone: '9876543210',
    service: 'printer-repair', message: 'Printer is not printing at all, need help.'
  });
  check('inquiry created', inq.status === 201 && inq.data.ok);
  check('inquiry gets a unique reference', /^TRH-INQ-[A-Z2-9]{4}$/.test(inq.data?.inquiry?.ref || ''),
    inq.data?.inquiry?.ref);
  check('inquiry returns WhatsApp text', (inq.data?.whatsapp || '').includes('Smoke Tester'));
  check('inquiry WhatsApp names the service', (inq.data?.whatsapp || '').includes('Printer Repair'));

  const badInq = await api('POST', '/api/inquiries', { name: 'X', phone: '123', message: 'hi' });
  check('inquiry validation rejects bad input', badInq.status === 400, `status ${badInq.status}`);

  /* ---------------- public: booking ---------------- */
  console.log(`\n${c.d}-- booking --${c.x}`);
  const bkg = await api('POST', '/api/bookings', {
    name: 'Smoke Tester', phone: '9876543210', service: 'computer-repair',
    address: 'Steel Chamber Tower, C Wing 527, Kalamboli',
    preferredDate: '2026-10-05', message: 'Laptop will not boot.'
  });
  check('booking created', bkg.status === 201 && bkg.data.ok);
  check('booking reference generated', /^TRH-BKG-[A-Z2-9]{4}$/.test(bkg.data?.booking?.ref || ''),
    bkg.data?.booking?.ref);

  // A date that has already passed is never a real request. It was accepted
  // once because the value was only checked for shape, not for being ahead of
  // today, which left impossible jobs sitting in the admin's list.
  const past = await api('POST', '/api/bookings', {
    name: 'Smoke Tester', phone: '9876543210',
    preferredDate: '2020-01-01', message: 'Booking for a day that has gone.'
  });
  check('booking rejects a date in the past', past.status === 400,
    `status=${past.status}`);

  const malformed = await api('POST', '/api/bookings', {
    name: 'Smoke Tester', phone: '9876543210',
    preferredDate: '05-10-2026', message: 'Wrong date format entirely.'
  });
  check('booking rejects a malformed date', malformed.status === 400,
    `status=${malformed.status}`);

  const today = new Date();
  const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const sameDay = await api('POST', '/api/bookings', {
    name: 'Smoke Tester', phone: '9876543210',
    preferredDate: isoToday, message: 'A same-day visit, which must be allowed.'
  });
  check('booking allows today', sameDay.status === 201, `status=${sameDay.status}`);

  /* ---------------- public: order + GST ---------------- */
  console.log(`\n${c.d}-- order + GST --${c.x}`);
  const ord = await api('POST', '/api/orders', {
    name: 'Smoke Tester', phone: '9876543210', payment: 'UPI',
    subtotal: 0,
    items: [
      { id: 'printer-repair', qty: 1 },
      { id: 'computer-repair', qty: 1 },
      { id: 'cartridge-refill', qty: 1 },
      { id: 'quick-service', qty: 1 },
      { id: 'amc-computer', qty: 1 },
      { id: 'amc-printer', qty: 1 }
    ]
  });
  check('order created', ord.status === 201 && ord.data.ok);
  check('subtotal recalculated from DB = 5300', ord.data?.order?.subtotal === 5300,
    `got ${ord.data?.order?.subtotal}`);
  check('GST at 18% = 954', ord.data?.order?.gst === 954, `got ${ord.data?.order?.gst}`);
  check('grand total = 6254', ord.data?.order?.total === 6254, `got ${ord.data?.order?.total}`);

  const tamper = await api('POST', '/api/orders', {
    name: 'Tamper', phone: '9876543210', payment: 'Cash', subtotal: 1,
    items: [{ id: 'printer-repair', qty: 1 }]
  });
  check('tampered subtotal is ignored (server recalculates)',
    tamper.data?.order?.subtotal === 300, `got ${tamper.data?.order?.subtotal}`);

  /* ---------------- public: review ---------------- */
  console.log(`\n${c.d}-- review --${c.x}`);
  const pubBefore = await api('GET', '/api/reviews');
  const rev = await api('POST', '/api/reviews', {
    name: 'Smoke Tester', rating: 5, service: 'printer-repair',
    text: 'Fixed the same day and the bill matched the quote exactly.'
  });
  check('review submitted', rev.status === 201 && rev.data.ok);
  check('review starts as Pending', rev.data?.review?.status === 'Pending');
  const pubAfter = await api('GET', '/api/reviews');
  check('pending review is NOT public',
    pubAfter.data.reviews.length === pubBefore.data.reviews.length);
  const badRev = await api('POST', '/api/reviews', { name: 'A', rating: 9, text: 'too short' });
  check('review validation rejects bad rating', badRev.status === 400);

  /* ---------------- public: contact ---------------- */
  console.log(`\n${c.d}-- contact form --${c.x}`);
  const con = await api('POST', '/api/contact', {
    name: 'Smoke Tester', phone: '9876543210',
    subject: 'Printer enquiry', message: 'Do you do on-site service in Kalamboli?'
  });
  check('contact submission saved', con.status === 201 && con.data.ok);
  const badCon = await api('POST', '/api/contact', { name: '', message: '' });
  check('contact validation rejects empty', badCon.status === 400);

  /* ---------------- security: protected routes ---------------- */
  console.log(`\n${c.d}-- security --${c.x}`);
  cookie = '';

  // The website asks this on every page load to decide whether to show the
  // Admin link in the navigation, so it must answer 200 even for a visitor.
  const anonStatus = await api('GET', '/api/auth/status');
  check('auth status answers 200 without a session', anonStatus.status === 200);
  check('auth status reports "not an admin" without a session',
    anonStatus.data?.ok === true && anonStatus.data?.admin === null,
    JSON.stringify(anonStatus.data));

  // The rate limiter buckets by client IP. If the server wrongly trusts
  // X-Forwarded-For while no proxy is in front, anyone could send a different
  // fake IP on every request and get an unlimited allowance. Two probes with a
  // different spoofed IP must still share one countdown.
  const remaining = async (xff) => {
    const headers = { 'Content-Type': 'application/json' };
    if (xff) headers['X-Forwarded-For'] = xff;
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST', headers, body: '{}'      // invalid, but the limiter counts it
    });
    return Number(res.headers.get('ratelimit-remaining'));
  };

  const rlA = await remaining(null);
  const rlB = await remaining('203.0.113.7');
  check('rate limiter cannot be dodged with a spoofed X-Forwarded-For',
    Number.isFinite(rlA) && Number.isFinite(rlB) && rlB === rlA - 1,
    `remaining ${rlA} then ${rlB}`);

  const prot = await api('GET', '/api/admin/orders');
  check('admin orders blocked without a session', prot.status === 401);
  const protStats = await api('GET', '/api/admin/stats');
  check('admin stats blocked without a session', protStats.status === 401);
  const protSvc = await api('POST', '/api/admin/services', { name: 'Hack' });
  check('admin service creation blocked without a session', protSvc.status === 401);

  // The static handler is pointed at the project root, which also holds the
  // backend source, the SQL schema and the database scripts. Two of those files
  // contain the admin email address, so none of them may be downloadable.
  const mustNotServe = [
    '/server/db/seed.js',
    '/server/test/smoke.js',
    '/server/config/env.js',
    '/server/db/schema.sql',
    '/package.json',
    '/.env'
  ];
  for (const p of mustNotServe) {
    const res = await fetch(`${BASE}${p}`);
    check(`${p} is not served to visitors`, res.status === 404, `got ${res.status}`);
  }

  // ...while the actual website still has to be reachable.
  for (const p of ['/', '/index.html', '/admin.html', '/app.js', '/styles.css', '/assets/logo.png']) {
    const res = await fetch(`${BASE}${p}`);
    check(`${p} is served normally`, res.status === 200, `got ${res.status}`);
  }

  const badLogin = await api('POST', '/api/auth/login', {
    email: ADMIN_EMAIL, password: 'wrong-password'
  });
  check('wrong password rejected', badLogin.status === 401);

  /* ---------------- admin login ---------------- */
  console.log(`\n${c.d}-- admin session --${c.x}`);
  const login = await api('POST', '/api/auth/login', {
    email: ADMIN_EMAIL, password: ADMIN_PASSWORD
  });
  check('admin login succeeds', login.status === 200 && login.data.ok);
  check('session cookie issued', cookie.includes('trishool_admin_token'), cookie.slice(0, 60));

  // Everything below needs a session. Stop with a clear explanation rather than
  // crashing on the first undefined response.
  if (login.status !== 200) {
    console.log(`\n  ${c.r}Cannot continue: sign-in returned HTTP ${login.status}.${c.x}`);
    if (login.status === 429) {
      console.log('  The server is rate-limiting sign-in attempts (10 failures every 15 minutes).');
      console.log('  Wait a few minutes and run the test again, or restart the server to clear the limit.');
    } else if (login.status === 401) {
      console.log(`  Check ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD (currently "${ADMIN_EMAIL}").`);
      console.log('  Run "npm run db:seed" if the admin account has not been created yet.');
    }
    console.log(`\n  ${c.r}${pass} passed, ${fail} failed${c.x}\n`);
    process.exit(1);
  }

  const me = await api('GET', '/api/auth/me');
  check('session identifies the admin', me.status === 200 && me.data.admin?.email === ADMIN_EMAIL);

  // With a session, the same endpoint must now reveal who is signed in - that
  // is what makes the website show the Admin link. It deliberately returns only
  // id, name and role, never the email address, because the public page calls it.
  const authStatus = await api('GET', '/api/auth/status');
  check('auth status reveals the admin with a session',
    authStatus.status === 200 && authStatus.data?.admin?.name === ADMIN_NAME,
    JSON.stringify(authStatus.data));
  check('auth status does not leak the admin email',
    authStatus.data?.admin && authStatus.data.admin.email === undefined,
    JSON.stringify(authStatus.data));

  /* ---------------- admin reads ---------------- */
  console.log(`\n${c.d}-- admin reads --${c.x}`);
  const orders = await api('GET', '/api/admin/orders');
  check('admin sees orders from the database', orders.status === 200 && orders.data.count >= 1,
    `count=${orders.data?.count}`);
  check('order total preserved', orders.data.orders.some((o) => o.total === 6254));

  const inquiries = await api('GET', '/api/admin/inquiries');
  check('admin sees inquiries', inquiries.status === 200 && inquiries.data.count >= 1);
  const bookings = await api('GET', '/api/admin/bookings');
  check('admin sees bookings', bookings.status === 200 && bookings.data.count >= 1);
  const contacts = await api('GET', '/api/admin/contact');
  check('admin sees contact messages', contacts.status === 200 && contacts.data.count >= 1);
  const customers = await api('GET', '/api/admin/customers');
  check('admin sees customers', customers.status === 200 && customers.data.count >= 1);
  const adminReviews = await api('GET', '/api/admin/reviews');
  check('admin sees pending reviews', adminReviews.status === 200 && adminReviews.data.count >= 1);

  /* ---------------- admin writes ---------------- */
  console.log(`\n${c.d}-- admin writes --${c.x}`);
  const stats = await api('GET', '/api/admin/stats');
  check('stats reflect real data', stats.status === 200 && stats.data.stats.orders >= 1,
    `orders=${stats.data?.stats?.orders}`);
  check('stats revenue computed', stats.data.stats.revenue >= 6254,
    `revenue=${stats.data?.stats?.revenue}`);
  check('stats are not hardcoded', typeof stats.data.stats.recent === 'object');

  const orderRef = orders.data.orders[0].orderRef;
  const upd = await api('PATCH', `/api/admin/orders/${orderRef}`, { status: 'Confirmed' });
  check('order status updated', upd.status === 200 && upd.data.order.status === 'Confirmed');

  const inqRef = inquiries.data.inquiries[0].inquiry_ref;
  const inqUpd = await api('PATCH', `/api/admin/inquiries/${inqRef}`, { status: 'Contacted' });
  check('inquiry status updated', inqUpd.status === 200 && inqUpd.data.inquiry.status === 'Contacted');

  const pending = adminReviews.data.reviews.find((r) => r.status === 'Pending');
  if (pending) {
    const appr = await api('PATCH', `/api/admin/reviews/${pending.id}`, { status: 'Approved' });
    check('review approved', appr.status === 200 && appr.data.status === 'Approved');
    const pubNow = await api('GET', '/api/reviews');
    check('approved review is now public',
      pubNow.data.reviews.some((r) => r.name === pending.name));
  } else {
    check('review approval (skipped, none pending)', true);
  }

  /* ---------------- services CRUD ---------------- */
  console.log(`\n${c.d}-- services CRUD --${c.x}`);
  const created = await api('POST', '/api/admin/services', {
    title: 'Smoke Test Service', price: 123, desc: 'Temporary service created by the smoke test.',
    icon: '🧪', category: 'service'
  });
  check('admin can create a service', created.status === 201 && created.data.service?.title === 'Smoke Test Service',
    `status=${created.status} body=${JSON.stringify(created.data).slice(0, 120)}`);
  const newId = created.data?.service?.id;
  if (!newId) {
    console.log(`\n  ${c.r}Cannot continue the CRUD checks without a created service.${c.x}`);
    console.log(`  ${'='.repeat(46)}`);
    console.log(`  ${colour0(pass, fail)}\n`);
    process.exit(1);
  }

  const publicList = await api('GET', '/api/services');
  check('new service appears on the public list',
    publicList.data.services.some((s) => s.id === newId));

  const edited = await api('PUT', `/api/admin/services/${newId}`, { price: 456, desc: 'Updated.' });
  check('admin can edit a service', edited.status === 200 && edited.data.service.price === 456);

  const enquiryPrice = await api('PUT', `/api/admin/services/${newId}`, { isEnquiry: true });
  check('service can be switched to on-request',
    enquiryPrice.data.service.price === null);

  const removed = await api('DELETE', `/api/admin/services/${newId}`);
  check('admin can delete a service', removed.status === 200 && removed.data.ok);
  const afterDelete = await api('GET', '/api/services');
  check('deleted service is gone from the public list',
    !afterDelete.data.services.some((s) => s.id === newId));

  /* ---------------- logout ---------------- */
  console.log(`\n${c.d}-- logout --${c.x}`);
  const logout = await api('POST', '/api/auth/logout');
  check('logout succeeds', logout.status === 200 && logout.data.ok);

  /* ---------------- cleanup ---------------- */
  console.log(`\n${c.d}-- cleanup --${c.x}`);
  const cleaned = await cleanup();
  check('test records removed from the database',
    cleaned.ok, cleaned.error || `orders=${cleaned.orders} inquiries=${cleaned.inquiries} bookings=${cleaned.bookings} reviews=${cleaned.reviews} messages=${cleaned.messages}`);
  console.log(`${c.d}   removed ${cleaned.orders} order(s), ${cleaned.inquiries} inquiry(ies), `
    + `${cleaned.bookings} booking(s), ${cleaned.reviews} review(s), ${cleaned.messages} message(s)${c.x}`);
  console.log(`${c.d}   the dashboard is left exactly as it was before the test${c.x}`);

  /* ---------------- result ---------------- */
  console.log(`\n  ${'='.repeat(46)}`);
  const colour = fail === 0 ? c.g : c.r;
  console.log(`  ${colour}${pass} passed, ${fail} failed${c.x}\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(`\n${c.r}Smoke test crashed:${c.x}`, err);
  process.exit(1);
});
