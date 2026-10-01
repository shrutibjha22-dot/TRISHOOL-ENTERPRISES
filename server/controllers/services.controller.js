/**
 * Services — read for the public site, full CRUD for the admin.
 *
 * The row shape returned here is exactly what the frontend card renderer
 * expects, so adding or editing a service in the dashboard changes the public
 * page with no frontend change at all.
 */

const db = require('../config/db');
const { asyncHandler } = require('../middleware/error');
const { str, cleanText, checkInt, makeRef } = require('../utils/validate');

/** Slug from a name, so URLs stay readable: "Printer Repair" -> "printer-repair". */
function slugify(value) {
  return str(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'service';
}

/**
 * The `features` column holds the AMC bullet list. mysql2 already parses JSON
 * columns into objects, but a JSON string is handled too so the API never
 * depends on that driver detail.
 */
function parseFeatures(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Map a database row to the JSON the frontend uses. */
function toJson(row) {
  const isAmc = row.category === 'amc';
  return {
    id: row.id,
    slug: row.slug,
    title: row.name,
    price: row.is_enquiry ? null : Number(row.price),
    desc: row.description,
    // The AMC cards label their description "sub"; reuse the same text.
    sub: isAmc ? row.description : null,
    icon: row.icon,
    bento: row.display_size === 'normal' ? null : row.display_size,
    badge: row.badge || null,
    detail: row.detail ? row.detail.split(',').map((s) => s.trim()).filter(Boolean) : null,
    features: parseFeatures(row.features),
    category: row.category,
    period: row.period || null,
    isActive: !!row.is_active
  };
}

/**
 * Resolve whatever identifier the client sent — id, slug or name — to a row.
 * Lets the frontend keep using its existing slugs, while forms that send a
 * human-readable label (the review form) still link to the right service.
 */
async function resolveService(idOrSlug) {
  const value = str(idOrSlug);
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    const rows = await db.query('SELECT * FROM services WHERE id = :id LIMIT 1', { id: Number(value) });
    if (rows[0]) return rows[0];
  }

  const bySlug = await db.query('SELECT * FROM services WHERE slug = :slug LIMIT 1', { slug: value });
  if (bySlug[0]) return bySlug[0];

  const byName = await db.query(
    'SELECT * FROM services WHERE LOWER(name) = LOWER(:name) LIMIT 1',
    { name: value }
  );
  return byName[0] || null;
}

/** GET /api/services — public. Only active rows, in display order. */
exports.list = asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === '1' && !!req.admin;

  const rows = await db.query(
    `SELECT * FROM services
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY sort_order ASC, id ASC`
  );

  res.json({ ok: true, count: rows.length, services: rows.map(toJson) });
});

/** GET /api/services/:idOrSlug — public. */
exports.get = asyncHandler(async (req, res) => {
  const row = await resolveService(req.params.idOrSlug);
  if (!row) return res.status(404).json({ ok: false, error: 'Service not found' });
  res.json({ ok: true, service: toJson(row) });
});

// Shared with the inquiry, booking and order controllers, which all need to
// turn whatever identifier the client sent into a service row.
exports.resolveService = resolveService;
exports.slugify = slugify;

/**
 * POST /api/admin/services  (admin)
 * Accepts either `id` to update an existing row, or not to create one.
 */
exports.create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const problems = [];
  const name = cleanText(str(b.title || b.name), 120);
  if (!name) problems.push('Service name is required');

  const price = b.price === null || b.price === '' || b.isEnquiry === true ? 0 : Number(b.price);
  if (Number.isNaN(price) || price < 0 || price > 10000000) {
    problems.push('Price must be a positive number, or blank for "on request"');
  }
  const displaySize = ['lead', 'wide', 'normal'].includes(b.bento) ? b.bento : 'normal';
  const category = ['service', 'amc', 'product'].includes(b.category) ? b.category : 'service';
  if (problems.length) return res.status(400).json({ ok: false, error: problems[0], fields: problems });

  let slug = slugify(b.slug || name);
  // Ensure uniqueness.
  const clash = await db.query('SELECT id FROM services WHERE slug = :slug', { slug });
  if (clash.length) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM services');

  const result = await db.execute(
    `INSERT INTO services
       (slug, name, description, price, is_enquiry, icon, display_size, badge, detail, category, period, sort_order, is_active)
     VALUES (:slug, :name, :description, :price, :is_enquiry, :icon, :display_size, :badge, :detail, :category, :period, :sort_order, :is_active)`,
    {
      slug,
      name,
      description: cleanText(str(b.desc ?? b.description), 500),
      price,
      is_enquiry: b.isEnquiry === true || b.price === null || b.price === '' ? 1 : 0,
      icon: cleanText(str(b.icon), 16),
      display_size: displaySize,
      badge: cleanText(str(b.badge), 40) || null,
      detail: cleanText(str(Array.isArray(b.detail) ? b.detail.join(',') : b.detail), 200) || null,
      category,
      period: cleanText(str(b.period), 30) || null,
      sort_order: Number(maxOrder[0].m) + 1,
      is_active: b.isActive === false ? 0 : 1
    }
  );

  const row = await resolveService(String(result.insertId));
  res.status(201).json({ ok: true, service: toJson(row) });
});

/** PUT /api/admin/services/:id  (admin) */
exports.update = asyncHandler(async (req, res) => {
  const row = await resolveService(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Service not found' });

  const b = req.body || {};
  const name = cleanText(str(b.title || b.name), 120) || row.name;

  let slug = row.slug;
  if (b.slug && slugify(b.slug) !== row.slug) {
    const next = slugify(b.slug);
    const clash = await db.query('SELECT id FROM services WHERE slug = :slug AND id <> :id', { slug: next, id: row.id });
    if (!clash.length) slug = next;
  }

  const isEnquiry = b.isEnquiry !== undefined
    ? (b.isEnquiry === true ? 1 : 0)
    : (b.price === null || b.price === '' ? 1 : row.is_enquiry);

  let price = row.price;
  if (b.price !== undefined && !isEnquiry) {
    const p = Number(b.price);
    if (Number.isNaN(p) || p < 0 || p > 10000000) {
      return res.status(400).json({ ok: false, error: 'Price must be a positive number' });
    }
    price = p;
  }
  if (isEnquiry) price = 0;

  await db.execute(
    `UPDATE services SET
       name = :name, slug = :slug, description = :description, price = :price,
       is_enquiry = :is_enquiry, icon = :icon,
       display_size = :display_size, badge = :badge, detail = :detail,
       category = :category, period = :period,
       sort_order = :sort_order, is_active = :is_active
     WHERE id = :id`,
    {
      name,
      slug,
      description: b.desc !== undefined || b.description !== undefined
        ? cleanText(str(b.desc ?? b.description), 500) : row.description,
      price,
      is_enquiry: isEnquiry,
      icon: b.icon !== undefined ? cleanText(str(b.icon), 16) : row.icon,
      display_size: ['lead', 'wide', 'normal'].includes(b.bento) ? b.bento : row.display_size,
      badge: b.badge !== undefined ? (cleanText(str(b.badge), 40) || null) : row.badge,
      detail: b.detail !== undefined
        ? (cleanText(str(Array.isArray(b.detail) ? b.detail.join(',') : b.detail), 200) || null)
        : row.detail,
      category: ['service', 'amc', 'product'].includes(b.category) ? b.category : row.category,
      period: b.period !== undefined ? (cleanText(str(b.period), 30) || null) : row.period,
      sort_order: b.sortOrder !== undefined ? Number(b.sortOrder) : row.sort_order,
      is_active: b.isActive === undefined ? row.is_active : (b.isActive ? 1 : 0),
      id: row.id
    }
  );

  const updated = await resolveService(String(row.id));
  res.json({ ok: true, service: toJson(updated) });
});

/** DELETE /api/admin/services/:id  (admin) — soft delete so orders stay intact. */
exports.remove = asyncHandler(async (req, res) => {
  const row = await resolveService(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Service not found' });

  const refs = await db.query('SELECT COUNT(*) AS n FROM orders WHERE items LIKE :items', { items: `%${row.slug}%` });
  if (refs[0].n > 0) {
    // Referenced by past orders: hide rather than delete, to keep history readable.
    await db.execute('UPDATE services SET is_active = 0 WHERE id = :id', { id: row.id });
    return res.json({
      ok: true,
      deactivated: true,
      message: `"${row.name}" appears in ${refs[0].n} past order(s), so it was hidden rather than deleted. Existing orders are unaffected.`
    });
  }

  await db.execute('DELETE FROM services WHERE id = :id', { id: row.id });
  res.json({ ok: true, deleted: true, message: `"${row.name}" was deleted.` });
});
