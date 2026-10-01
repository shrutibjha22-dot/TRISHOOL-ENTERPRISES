/**
 * Seeds the database with the real service list and one admin account.
 *
 * Safe to run more than once: the admin is upserted by email, and services are
 * upserted by slug, so re-running updates rather than duplicating.
 *
 *   npm run db:seed
 *
 * The admin password is read from ADMIN_SEED_PASSWORD in .env. If that is
 * unset, a random one is generated and printed once.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const config = require('../config/env');

/**
 * The six services the website already offers, plus the four Buy & Sell items.
 * `display_size` reproduces the bento layout the frontend already renders.
 */
const SERVICES = [
  {
    slug: 'printer-repair', name: 'Printer Repair', price: 300, sort: 1,
    icon: '🖨️', display_size: 'lead', badge: 'Most booked', category: 'service',
    description: 'Paper jams, print errors, streaking, blinking lights and power issues. All major brands.',
    detail: 'Dot Matrix,Laser,Ink Tank,MFP'
  },
  {
    slug: 'computer-repair', name: 'Computer Repair', price: 500, sort: 2,
    icon: '💻', category: 'service',
    description: 'No power, no display, frequent hangs, viruses and slow performance. Desktop or laptop.'
  },
  {
    slug: 'cartridge-refill', name: 'Cartridge Refill', price: 250, sort: 3,
    icon: '🖋️', category: 'service',
    description: 'Genuine-toner refill with print-head cleaning, restoring sharp original print quality.'
  },
  {
    slug: 'quick-service', name: 'Quick Service', price: 250, sort: 4,
    icon: '⚡', display_size: 'wide', category: 'service',
    description: 'Express check-up and minor fixes while you wait, or a priority on-site visit slot.'
  },
  {
    slug: 'amc-computer', name: 'Computer AMC', price: 2500, sort: 5,
    icon: '💻', category: 'amc', period: 'per year',
    description: 'Annual Maintenance Contract for desktops & laptops',
    badge: 'Annual', badgeClass: 'badge-annual',
    features: [
      { t: 'Unlimited breakdown support', ok: true },
      { t: 'Priority on-site response', ok: true },
      { t: 'Routine servicing & cleaning', ok: true },
      { t: 'OS, drivers & software support', ok: true },
      { t: 'Parts and consumables', ok: false, note: 'charged at cost' }
    ]
  },
  {
    slug: 'amc-printer', name: 'Printer AMC', price: 1500, sort: 6,
    icon: '🖨️', category: 'amc', period: 'per year',
    description: 'Annual Maintenance Contract for printers & MFPs',
    badge: 'Annual', badgeClass: 'badge-annual',
    features: [
      { t: 'Breakdown call support', ok: true },
      { t: 'Priority service slots', ok: true },
      { t: 'Roller & head maintenance', ok: true },
      { t: 'Error-code diagnosis', ok: true },
      { t: 'Cartridges & parts', ok: false, note: 'charged at cost' }
    ]
  },
  {
    slug: 'buy-desktop', name: 'Refurbished Desktops', price: null, sort: 7,
    icon: '🖥️', category: 'product',
    description: 'Tested, graded and ready-to-use office and gaming desktops. Bulk supply available.'
  },
  {
    slug: 'buy-printer', name: 'Printers & MFPs', price: null, sort: 8,
    icon: '🖨️', category: 'product',
    description: 'New and refurbished inkjet, laser and multifunction printers from all major brands.'
  },
  {
    slug: 'buy-laptop', name: 'Laptops', price: null, sort: 9,
    icon: '💼', category: 'product',
    description: 'Business and student laptops, new and certified refurbished. We also buy yours.'
  },
  {
    slug: 'buy-consumables', name: 'Consumables & Parts', price: null, sort: 10,
    icon: '📦', category: 'product',
    description: 'Toner, ink, cartridges, ribbons, drums and spare parts for all major brands.'
  }
];

async function seedServices() {
  for (const s of SERVICES) {
    await db.execute(
      `INSERT INTO services
         (slug, name, description, price, is_enquiry, icon, display_size, badge, detail, features, category, period, sort_order, is_active)
       VALUES (:slug, :name, :description, :price, :is_enquiry, :icon, :display_size, :badge, :detail, :features, :category, :period, :sort_order, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), description = VALUES(description), price = VALUES(price),
         is_enquiry = VALUES(is_enquiry), icon = VALUES(icon), display_size = VALUES(display_size),
         badge = VALUES(badge), detail = VALUES(detail), features = VALUES(features),
         category = VALUES(category),
         period = VALUES(period), sort_order = VALUES(sort_order), is_active = 1`,
      {
        slug: s.slug, name: s.name, description: s.description,
        price: s.price ?? 0, is_enquiry: s.price === null ? 1 : 0,
        icon: s.icon, display_size: s.display_size || 'normal',
        badge: s.badge || null, detail: s.detail || null,
        // mysql2 will not bind an object into a JSON column on its own.
        features: s.features ? JSON.stringify(s.features) : null,
        category: s.category, period: s.period || null, sort_order: s.sort
      }
    );
  }
  console.log(`[seed] ${SERVICES.length} services ready`);
}

async function seedAdmin() {
  // No built-in fallback address. The admin email is yours to choose and must
  // not be hard-coded here, or it ends up published in the repository for
  // anyone who opens seed.js. Set ADMIN_SEED_EMAIL in .env first.
  const email = (process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase();
  const name = process.env.ADMIN_SEED_NAME || 'Trishool Admin';

  if (!email) {
    console.error('[seed] ADMIN_SEED_EMAIL is not set.');
    console.error('       Add your admin email address to .env (see .env.example) and run this again.');
    process.exit(1);
  }

  let password = process.env.ADMIN_SEED_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }

  const hash = await bcrypt.hash(password, config.auth.bcryptRounds);

  await db.execute(
    `INSERT INTO admin_accounts (name, email, password_hash, role, is_active)
     VALUES (:name, :email, :hash, 'owner', 1)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), password_hash = VALUES(password_hash), is_active = 1`,
    { name, email, hash }
  );

  console.log('[seed] admin account ready');
  console.log(`       email    ${email}`);
  if (generated) {
    console.log(`       password ${password}`);
    console.log('       ^ generated now, shown once. Put it in .env to keep it.');
  } else {
    console.log('       password (from ADMIN_SEED_PASSWORD)');
  }
}

(async () => {
  try {
    await seedServices();
    await seedAdmin();
    console.log('[seed] done');
    process.exit(0);
  } catch (err) {
    console.error('[seed] failed:', err.message);
    process.exit(1);
  }
})();
