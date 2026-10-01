/**
 * Orders, reviews, contact submissions, customers and dashboard statistics.
 *
 * The JSON field names match what the frontend already used, so the card and
 * table renderers needed no changes.
 */

const db = require('../config/db');
const { asyncHandler } = require('../middleware/error');
const customers = require('../models/customer');
const services = require('./services.controller');
const {
  str, cleanText, formatPhone, makeRef,
  checkName, checkPhone, checkEmail, checkText, checkEnum, checkInt
} = require('../utils/validate');

/* ============================ ORDERS ============================ */

/**
 * POST /api/orders — public.
 *
 * The client sends what it already calculated; we recompute the totals from
 * the stored service prices so a tampered cart total cannot be saved.
 */
exports.createOrder = asyncHandler(async (req, res) => {
  const b = req.body || {};

  const problems = [
    ...checkName(b.name),
    ...checkPhone(b.phone),
    ...checkInt(b.subtotal, { label: 'Subtotal', min: 0, required: true }),
    ...checkEnum(b.payment, ['Cash', 'UPI'], { label: 'Payment method', required: true })
  ];

  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
  if (!items.length) problems.push('Your cart is empty');

  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  // Recalculate from the database.
  let subtotal = 0;
  let hasEnquiry = false;
  const resolved = [];

  for (const line of items) {
    const svc = await services.resolveService(line.id || line.slug || line.title);
    if (!svc) continue;

    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
    if (svc.is_enquiry) {
      hasEnquiry = true;
      resolved.push({ id: svc.id, title: svc.name, qty, price: null, enquiry: true });
      continue;
    }
    const lineTotal = Number(svc.price) * qty;
    subtotal += lineTotal;
    resolved.push({ id: svc.id, title: svc.name, qty, price: Number(svc.price), enquiry: false });
  }

  if (!resolved.length) {
    return res.status(400).json({ ok: false, error: 'None of those items match our current services' });
  }

  const gstRate = 18;
  // Round per line, then sum — the same rule the frontend uses.
  const gst = resolved.reduce((sum, l) => sum + (l.enquiry ? 0 : Math.round(l.price * l.qty * gstRate / 100)), 0);
  const total = subtotal + gst;

  const customerId = await customers.upsert({ name: b.name, phone: b.phone });
  let ref = makeRef('ORD');
  for (let i = 0; i < 5; i += 1) {
    const exists = await db.query('SELECT id FROM orders WHERE order_ref = :ref', { ref });
    if (!exists.length) break;
    ref = makeRef('ORD');
  }

  const itemsText = resolved.map((l) => `${l.title} x ${l.qty}`).join(', ').slice(0, 500);

  await db.execute(
    `INSERT INTO orders
       (order_ref, customer_id, customer_name, phone, items, items_text,
        subtotal, gst_rate, gst, total, has_enquiry, payment_method)
     VALUES (:ref, :customer_id, :customer_name, :phone, :items, :items_text,
             :subtotal, :gst_rate, :gst, :total, :has_enquiry, :payment_method)`,
    {
      ref,
      customer_id: customerId,
      customer_name: cleanText(str(b.name), 120),
      phone: formatPhone(b.phone),
      items: JSON.stringify(resolved),
      items_text: itemsText,
      subtotal,
      gst_rate: gstRate,
      gst,
      total,
      has_enquiry: hasEnquiry ? 1 : 0,
      payment_method: b.payment
    }
  );

  res.status(201).json({
    ok: true,
    order: {
      ref, subtotal, gstRate, gst, total,
      hasEnquiry, status: 'New',
      items: itemsText,
      message: 'Order saved. We will confirm on WhatsApp shortly.'
    }
  });
});

/** GET /api/admin/orders — admin, filterable. */
exports.listOrders = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const where = [];
  const params = {};

  if (status && ['New', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'].includes(status)) {
    where.push('status = :status'); params.status = status;
  }
  if (q) {
    where.push('(customer_name LIKE :q OR phone LIKE :q OR order_ref LIKE :q OR items_text LIKE :q)');
    params.q = `%${str(q)}%`;
  }

  const rows = await db.query(
    `SELECT id, order_ref, customer_name, phone, items_text, subtotal, gst_rate, gst,
            total, has_enquiry, payment_method, status, admin_note, created_at
       FROM orders
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT 500`,
    params
  );

  res.json({
    ok: true,
    count: rows.length,
    orders: rows.map((r) => ({
      orderRef: r.order_ref,
      date: r.created_at,
      name: r.customer_name,
      phone: r.phone,
      items: r.items_text,
      subtotal: Number(r.subtotal),
      gstRate: Number(r.gst_rate),
      gst: Number(r.gst),
      total: Number(r.total),
      hasEnquiry: !!r.has_enquiry,
      payment: r.payment_method,
      status: r.status,
      adminNote: r.admin_note
    }))
  });
});

/** PATCH /api/admin/orders/:ref */
exports.updateOrder = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const rows = await db.query('SELECT * FROM orders WHERE order_ref = :ref', { ref: str(req.params.ref) });
  const row = rows[0];
  if (!row) return res.status(404).json({ ok: false, error: 'Order not found' });

  const problems = [];
  if (b.status !== undefined) {
    problems.push(...checkEnum(b.status, ['New', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'], { label: 'Status', required: true }));
  }
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  await db.execute(
    `UPDATE orders SET status = COALESCE(:status, status), admin_note = COALESCE(:adminNote, admin_note) WHERE id = :id`,
    {
      status: b.status !== undefined ? b.status : null,
      adminNote: b.adminNote !== undefined ? cleanText(str(b.adminNote), 2000) : null,
      id: row.id
    }
  );

  const updated = await db.query('SELECT * FROM orders WHERE id = :id', { id: row.id });
  const r = updated[0];
  res.json({
    ok: true,
    order: {
      orderRef: r.order_ref, status: r.status, adminNote: r.admin_note,
      total: Number(r.total), name: r.customer_name, phone: r.phone, date: r.created_at
    }
  });
});

/* ============================ REVIEWS ============================ */

/** POST /api/reviews — public. Always starts as Pending. */
exports.createReview = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const problems = [
    ...checkName(b.name),
    ...checkText(b.text ?? b.body, { label: 'Review', min: 10, max: 900 })
  ];
  const rating = Number(b.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) problems.push('Rating must be 1 to 5');
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  const svc = b.service ? await services.resolveService(b.service) : null;
  // Reviews are anonymous by default; we only store a phone if one is given.
  const customerId = b.phone ? await customers.upsert({ name: b.name, phone: b.phone }) : null;

  const result = await db.execute(
    `INSERT INTO reviews (customer_id, name, rating, service_id, service_label, body)
     VALUES (:customer_id, :name, :rating, :service_id, :service_label, :body)`,
    {
      customer_id: customerId,
      name: cleanText(str(b.name), 120),
      rating: Math.round(rating),
      service_id: svc ? svc.id : null,
      service_label: svc ? svc.name : (cleanText(str(b.service), 80) || null),
      body: cleanText(str(b.text ?? b.body), 900)
    }
  );

  res.status(201).json({
    ok: true,
    review: { id: result.insertId, status: 'Pending' },
    message: 'Thank you. Your review will appear once we approve it.'
  });
});

/** GET /api/reviews — public. Approved only. */
exports.listPublicReviews = asyncHandler(async (_req, res) => {
  const rows = await db.query(
    `SELECT name, rating, service_label, body, created_at
       FROM reviews WHERE status = 'Approved'
      ORDER BY created_at DESC LIMIT 12`
  );
  res.json({
    ok: true,
    reviews: rows.map((r) => ({
      name: r.name,
      rating: r.rating,
      service: r.service_label,
      text: r.body,
      date: r.created_at
    }))
  });
});

/** GET /api/admin/reviews — admin. All of them. */
exports.listReviews = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status && ['Pending', 'Approved', 'Hidden'].includes(status)
    ? 'WHERE r.status = :status' : '';
  const params = status && where ? { status } : {};

  const rows = await db.query(
    `SELECT r.*, s.name AS service_name
       FROM reviews r
       LEFT JOIN services s ON s.id = r.service_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 500`,
    params
  );

  res.json({
    ok: true,
    count: rows.length,
    reviews: rows.map((r) => ({
      id: r.id,
      date: r.created_at,
      name: r.name,
      rating: r.rating,
      service: r.service_label || r.service_name || '',
      text: r.body,
      status: r.status
    }))
  });
});

/** PATCH /api/admin/reviews/:id */
exports.updateReview = asyncHandler(async (req, res) => {
  const status = str(req.body?.status);
  const problems = checkEnum(status, ['Pending', 'Approved', 'Hidden'], { label: 'Status', required: true });
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  const result = await db.execute('UPDATE reviews SET status = :status WHERE id = :id', {
    status, id: Number(req.params.id)
  });
  if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Review not found' });

  res.json({ ok: true, id: Number(req.params.id), status });
});

/** DELETE /api/admin/reviews/:id */
exports.deleteReview = asyncHandler(async (req, res) => {
  const result = await db.execute('DELETE FROM reviews WHERE id = :id', { id: Number(req.params.id) });
  if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Review not found' });
  res.json({ ok: true, deleted: true });
});

/* ============================ CONTACT ============================ */

/** POST /api/contact — public. */
exports.createContact = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const problems = [
    ...checkName(b.name),
    ...checkText(b.message, { label: 'Message', min: 5, max: 2000 }),
    ...checkEmail(b.email)
  ];
  if (b.phone) problems.push(...checkPhone(b.phone));
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  const customerId = b.phone ? await customers.upsert({ name: b.name, phone: b.phone, email: b.email }) : null;

  const result = await db.execute(
    `INSERT INTO contact_submissions (customer_id, name, phone, email, subject, message)
     VALUES (:customer_id, :name, :phone, :email, :subject, :message)`,
    {
      customer_id: customerId,
      name: cleanText(str(b.name), 120),
      phone: b.phone ? formatPhone(b.phone) : null,
      email: cleanText(str(b.email), 190) || null,
      subject: cleanText(str(b.subject), 160) || null,
      message: cleanText(str(b.message), 2000)
    }
  );

  res.status(201).json({
    ok: true,
    id: result.insertId,
    message: 'Thank you. We have received your message and will reply soon.'
  });
});

/** GET /api/admin/contact — admin. */
exports.listContact = asyncHandler(async (_req, res) => {
  const rows = await db.query(
    `SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ ok: true, count: rows.length, messages: rows });
});

/** PATCH /api/admin/contact/:id */
exports.updateContact = asyncHandler(async (req, res) => {
  const problems = checkEnum(req.body?.status, ['New', 'Read', 'Replied', 'Archived'], { label: 'Status', required: true });
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  const result = await db.execute(
    'UPDATE contact_submissions SET status = :status WHERE id = :id',
    { status: req.body.status, id: Number(req.params.id) }
  );
  if (!result.affectedRows) return res.status(404).json({ ok: false, error: 'Message not found' });
  res.json({ ok: true, id: Number(req.params.id), status: req.body.status });
});

/* ============================ CUSTOMERS ============================ */

/** GET /api/admin/customers — admin. */
exports.listCustomers = asyncHandler(async (req, res) => {
  const q = str(req.query.q);
  const rows = await db.query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM service_inquiries i WHERE i.customer_id = c.id) AS inquiries,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id)            AS orders,
            (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id) AS spent
       FROM customers c
      ${q ? 'WHERE c.name LIKE :q OR c.phone LIKE :q' : ''}
      ORDER BY c.created_at DESC
      LIMIT 500`,
    q ? { q: `%${q}%` } : {}
  );

  res.json({
    ok: true,
    count: rows.length,
    customers: rows.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, email: c.email, city: c.city,
      inquiries: Number(c.inquiries), orders: Number(c.orders),
      spent: Number(c.spent), createdAt: c.created_at
    }))
  });
});

/* ============================ STATS ============================ */

/** GET /api/admin/stats — admin. Everything the dashboard counters need. */
exports.stats = asyncHandler(async (_req, res) => {
  // Aggregate queries return an array of rows; read row 0 from each.
  const one = async (sql, params = {}) => {
    const rows = await db.query(sql, params);
    return rows[0] || {};
  };

  const orders = await one(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(total), 0) AS revenue,
            COALESCE(SUM(gst), 0)   AS gst
       FROM orders WHERE status <> 'Cancelled'`
  );
  const newOrders      = await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'New'");
  const inquiries      = await one('SELECT COUNT(*) AS n FROM service_inquiries WHERE status = :status', { status: 'New' });
  const bookings       = await one('SELECT COUNT(*) AS n FROM bookings WHERE status IN (:a, :b)', { a: 'New', b: 'Scheduled' });
  const pendingReviews = await one("SELECT COUNT(*) AS n FROM reviews WHERE status = 'Pending'");
  const customers      = await one('SELECT COUNT(*) AS n FROM customers');
  const services       = await one('SELECT COUNT(*) AS n FROM services WHERE is_active = 1');
  const contact        = await one("SELECT COUNT(*) AS n FROM contact_submissions WHERE status = 'New'");
  const month          = await one(
    `SELECT COALESCE(SUM(total), 0) AS revenue
       FROM orders
      WHERE status <> 'Cancelled' AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())`
  );
  const recent = await db.query(
    'SELECT order_ref, customer_name, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 8'
  );

  res.json({
    ok: true,
    stats: {
      orders:         Number(orders.total),
      revenue:        Number(orders.revenue),
      gst:            Number(orders.gst),
      monthRevenue:   Number(month.revenue),
      newOrders:      Number(newOrders.n),
      newInquiries:   Number(inquiries.n),
      openBookings:   Number(bookings.n),
      pendingReviews: Number(pendingReviews.n),
      newMessages:    Number(contact.n),
      customers:      Number(customers.n),
      activeServices: Number(services.n),
      recent: recent.map((r) => ({
        ref: r.order_ref, name: r.customer_name,
        total: Number(r.total), status: r.status, date: r.created_at
      }))
    }
  });
});
