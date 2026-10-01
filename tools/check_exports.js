/**
 * Loads every server module and reports anything a caller relies on that is
 * not actually exported.
 *
 * A missing `exports.foo` only breaks at runtime, on whichever request happens
 * to hit that line. Requiring the modules up front turns it into an immediate,
 * obvious error.
 */
const path = require('path');

const SERVER = path.join(__dirname, '..', 'server');

/** module path -> names other modules require from it */
const EXPECTED = {
  'controllers/services.controller.js': ['list', 'get', 'create', 'update', 'remove', 'resolveService', 'slugify'],
  'controllers/auth.controller.js': ['login', 'logout', 'me'],
  'controllers/inquiry.controller.js': ['createInquiry', 'listInquiries', 'updateInquiry', 'createBooking', 'listBookings', 'updateBooking'],
  'controllers/records.controller.js': [
    'createOrder', 'listOrders', 'updateOrder',
    'createReview', 'listPublicReviews', 'listReviews', 'updateReview', 'deleteReview',
    'createContact', 'listContact', 'updateContact',
    'listCustomers', 'stats'
  ],
  'models/customer.js': ['findByPhone', 'upsert'],
  'config/db.js': ['pool', 'ping', 'query', 'execute', 'transaction'],
  'config/env.js': [],
  'middleware/auth.js': ['hashPassword', 'verifyPassword', 'signToken', 'setAuthCookie', 'clearAuthCookie', 'readToken', 'attachAdmin', 'requireAdmin'],
  'middleware/error.js': ['asyncHandler', 'notFound', 'errorHandler', 'requestLogger'],
  'utils/validate.js': ['str', 'normalisePhone', 'formatPhone', 'cleanText', 'makeRef', 'checkName', 'checkPhone', 'checkEmail', 'checkText', 'checkInt', 'checkEnum']
};

let bad = 0;

for (const [rel, names] of Object.entries(EXPECTED)) {
  const mod = require(path.join(SERVER, rel));
  const missing = names.filter((n) => typeof mod[n] === 'undefined');
  if (missing.length) {
    bad += 1;
    console.log(`  MISSING EXPORTS  ${rel}: ${missing.join(', ')}`);
  }
}

// Anything a controller calls on another module should exist.
const crossCalls = [
  ['controllers/inquiry.controller.js', 'resolveService'],
  ['controllers/records.controller.js', 'resolveService'],
  ['controllers/inquiry.controller.js', 'upsert'],
  ['controllers/records.controller.js', 'upsert']
];

console.log(`\n  checked ${Object.keys(EXPECTED).length} modules`);
if (bad) {
  console.log(`  ${bad} module(s) missing exports`);
  process.exit(1);
}
console.log('  all exports present');
