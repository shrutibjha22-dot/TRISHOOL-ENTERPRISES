/**
 * Inquiries and bookings — the two things a customer sends you deliberately.
 *
 * Both get a short human-quotable reference (TRH-INQ-4F2A) so the customer can
 * quote it back on WhatsApp or the phone.
 */

const db = require('../config/db');
const { asyncHandler } = require('../middleware/error');
const customers = require('../models/customer');
const services = require('./services.controller');
const {
  str, cleanText, makeRef, formatPhone,
  checkName, checkPhone, checkEmail, checkText, checkEnum
} = require('../utils/validate');

const INQUIRY_STATUS = ['New', 'Contacted', 'Quoted', 'Booked', 'Closed'];
const BOOKING_STATUS = ['New', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'];

/** Build the WhatsApp text the frontend opens, so the message matches the row. */
function whatsappText({ prefix, customer, phone, serviceName, message, ref, extra = [] }) {
  return [
    'Namaste Trishool Enterprises!',
    '',
    `Kaptan, we would like to ${prefix}:`,
    '',
    `Reference: ${ref}`,
    `Service: ${serviceName || 'Not specified'}`,
    ...extra,
    ...(message ? ['', message] : []),
    '',
    `Name: ${customer}`,
    `Phone: ${phone}`,
    '',
    'Looking forward to doing business with you!'
  ].join('\n');
}

/* ============================ INQUIRIES ============================ */

/** POST /api/inquiries — public. */
exports.createInquiry = asyncHandler(async (req, res) => {
  const b = req.body || {};

  const problems = [
    ...checkName(b.name),
    ...checkPhone(b.phone),
    ...checkText(b.message, { label: 'Message', min: 5, max: 2000 }),
    ...checkEmail(b.email)
  ];
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  const service = b.serviceId || b.service ? await services.resolveService(b.serviceId || b.service) : null;
  const customerId = await customers.upsert({
    name: b.name, phone: b.phone, email: b.email, city: b.city
  });

  // Retry on the astronomically unlikely reference clash.
  let ref = makeRef('INQ');
  for (let i = 0; i < 5; i += 1) {
    const exists = await db.query('SELECT id FROM service_inquiries WHERE inquiry_ref = :ref', { ref });
    if (!exists.length) break;
    ref = makeRef('INQ');
  }

  await db.execute(
    `INSERT INTO service_inquiries
       (inquiry_ref, customer_id, service_id, customer_name, phone, message)
     VALUES (:ref, :customer_id, :service_id, :customer_name, :phone, :message)`,
    {
      ref,
      customer_id: customerId,
      service_id: service ? service.id : null,
      customer_name: cleanText(str(b.name), 120),
      phone: formatPhone(b.phone),
      message: cleanText(str(b.message), 2000)
    }
  );

  const whatsapp = whatsappText({
    prefix: 'make an inquiry',
    customer: cleanText(str(b.name), 120),
    phone: formatPhone(b.phone),
    serviceName: service?.name,
    message: cleanText(str(b.message), 2000),
    ref
  });

  res.status(201).json({
    ok: true,
    inquiry: {
      ref,
      service: service?.name || null,
      status: 'New',
      message: 'Inquiry received. We will call you back shortly.'
    },
    whatsapp
  });
});

/** GET /api/admin/inquiries — admin, filterable. */
exports.listInquiries = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const where = [];
  const params = {};

  if (status && INQUIRY_STATUS.includes(status)) { where.push('i.status = :status'); params.status = status; }
  if (q) {
    where.push('(i.customer_name LIKE :q OR i.phone LIKE :q OR i.inquiry_ref LIKE :q OR i.message LIKE :q)');
    params.q = `%${str(q)}%`;
  }

  const rows = await db.query(
    `SELECT i.*, s.name AS service_name
       FROM service_inquiries i
       LEFT JOIN services s ON s.id = i.service_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY i.created_at DESC
      LIMIT 500`,
    params
  );

  res.json({ ok: true, count: rows.length, inquiries: rows });
});

/** PATCH /api/admin/inquiries/:ref — update status or add a note. */
exports.updateInquiry = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const rows = await db.query('SELECT * FROM service_inquiries WHERE inquiry_ref = :ref', { ref: str(req.params.ref) });
  const row = rows[0];
  if (!row) return res.status(404).json({ ok: false, error: 'Inquiry not found' });

  const problems = [];
  if (b.status !== undefined) problems.push(...checkEnum(b.status, INQUIRY_STATUS, { label: 'Status', required: true }));
  if (b.adminNote !== undefined) problems.push(...checkText(b.adminNote, { label: 'Note', max: 2000, required: false }));
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  await db.execute(
    `UPDATE service_inquiries
        SET status = COALESCE(:status, status),
            admin_note = COALESCE(:adminNote, admin_note)
      WHERE id = :id`,
    {
      status: b.status !== undefined ? b.status : null,
      adminNote: b.adminNote !== undefined ? cleanText(str(b.adminNote), 2000) : null,
      id: row.id
    }
  );

  const updated = await db.query('SELECT * FROM service_inquiries WHERE id = :id', { id: row.id });
  res.json({ ok: true, inquiry: updated[0] });
});

/* ============================ BOOKINGS ============================ */

/** POST /api/bookings — public. */
exports.createBooking = asyncHandler(async (req, res) => {
  const b = req.body || {};

  const problems = [
    ...checkName(b.name),
    ...checkPhone(b.phone),
    ...checkText(b.message, { label: 'Notes', min: 3, max: 2000, required: false }),
    ...checkEmail(b.email)
  ];
  if (b.preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(str(b.preferredDate))) {
    problems.push('Preferred date must be YYYY-MM-DD');
  }
  // A booking for a day that has already gone is never what the customer meant,
  // and it would sit in the admin's list as an impossible job. Today itself is
  // allowed, since a same-day visit is a normal request.
  //
  // Both sides are plain YYYY-MM-DD strings, so comparing them as text is both
  // correct and free of timezone trouble that parsing to a Date would invite.
  if (b.preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(str(b.preferredDate))) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (str(b.preferredDate) < todayStr) {
      problems.push('Preferred date cannot be in the past');
    }
  }
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  const service = b.serviceId || b.service ? await services.resolveService(b.serviceId || b.service) : null;
  const customerId = await customers.upsert({
    name: b.name, phone: b.phone, email: b.email, city: b.city
  });

  let ref = makeRef('BKG');
  const result = await db.execute(
    `INSERT INTO bookings
       (booking_ref, customer_id, service_id, customer_name, phone, address,
        preferred_date, preferred_time, notes)
     VALUES (:ref, :customer_id, :service_id, :customer_name, :phone, :address, :preferred_date, :preferred_time, :notes)`,
    {
      ref,
      customer_id: customerId,
      service_id: service ? service.id : null,
      customer_name: cleanText(str(b.name), 120),
      phone: formatPhone(b.phone),
      address: cleanText(str(b.address), 255) || null,
      preferred_date: str(b.preferredDate) || null,
      preferred_time: cleanText(str(b.preferredTime), 40) || null,
      notes: cleanText(str(b.message || b.notes), 2000) || null
    }
  );

  const extra = [];
  if (b.address) extra.push(`Address: ${cleanText(str(b.address), 255)}`);
  if (b.preferredDate) extra.push(`Preferred: ${str(b.preferredDate)}${b.preferredTime ? ` ${cleanText(str(b.preferredTime), 40)}` : ''}`);

  res.status(201).json({
    ok: true,
    booking: {
      id: result.insertId,
      ref,
      service: service?.name || null,
      status: 'New',
      message: 'Booking received. We will confirm the time shortly.'
    },
    whatsapp: whatsappText({
      prefix: 'book a service',
      customer: cleanText(str(b.name), 120),
      phone: formatPhone(b.phone),
      serviceName: service?.name,
      message: cleanText(str(b.message || b.notes), 2000),
      ref,
      extra
    })
  });
});

/** GET /api/admin/bookings — admin, filterable. */
exports.listBookings = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const where = [];
  const params = {};

  if (status && BOOKING_STATUS.includes(status)) { where.push('b.status = :status'); params.status = status; }
  if (q) {
    where.push('(b.customer_name LIKE :q OR b.phone LIKE :q OR b.booking_ref LIKE :q)');
    params.q = `%${str(q)}%`;
  }

  const rows = await db.query(
    `SELECT b.*, s.name AS service_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY b.created_at DESC
      LIMIT 500`,
    params
  );

  res.json({ ok: true, count: rows.length, bookings: rows });
});

/** PATCH /api/admin/bookings/:ref */
exports.updateBooking = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const rows = await db.query('SELECT * FROM bookings WHERE booking_ref = :ref', { ref: str(req.params.ref) });
  const row = rows[0];
  if (!row) return res.status(404).json({ ok: false, error: 'Booking not found' });

  const problems = [];
  if (b.status !== undefined) problems.push(...checkEnum(b.status, BOOKING_STATUS, { label: 'Status', required: true }));
  if (b.adminNote !== undefined) problems.push(...checkText(b.adminNote, { label: 'Note', max: 2000, required: false }));
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  await db.execute(
    `UPDATE bookings
        SET status = COALESCE(:status, status),
            admin_note = COALESCE(:adminNote, admin_note)
      WHERE id = :id`,
    {
      status: b.status !== undefined ? b.status : null,
      adminNote: b.adminNote !== undefined ? cleanText(str(b.adminNote), 2000) : null,
      id: row.id
    }
  );

  const updated = await db.query('SELECT * FROM bookings WHERE id = :id', { id: row.id });
  res.json({ ok: true, booking: updated[0] });
});
