/**
 * API routes.
 *
 * Public endpoints are deliberately unauthenticated — customers need to reach
 * them. Everything under /api/admin goes through requireAdmin, so adding a new
 * admin route is just a matter of putting it on the right router.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const auth = require('../middleware/auth');
const authC = require('../controllers/auth.controller');
const servicesC = require('../controllers/services.controller');
const inquiryC = require('../controllers/inquiry.controller');
const recordsC = require('../controllers/records.controller');

const router = express.Router();

/** Generous limit for ordinary form posts, tight on login. */
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,       // only failures count toward the limit
  message: { ok: false, error: 'Too many sign-in attempts. Please wait a few minutes.' }
});

/* ------------------------------ public ------------------------------ */

router.get('/health', async (_req, res) => {
  const db = require('../config/db');
  try {
    const info = await db.ping();
    res.json({ ok: true, status: 'healthy', database: info.db, version: info.version });
  } catch (err) {
    res.status(503).json({ ok: false, status: 'unhealthy', error: err.message });
  }
});

router.get('/services', servicesC.list);
router.get('/services/:idOrSlug', servicesC.get);

router.post('/inquiries', writeLimiter, inquiryC.createInquiry);
router.post('/bookings', writeLimiter, inquiryC.createBooking);

router.post('/orders', writeLimiter, recordsC.createOrder);
router.post('/reviews', writeLimiter, recordsC.createReview);
router.get('/reviews', recordsC.listPublicReviews);
router.post('/contact', writeLimiter, recordsC.createContact);

/* ------------------------------ auth ------------------------------ */

router.post('/auth/login', loginLimiter, authC.login);
router.post('/auth/logout', authC.logout);
router.get('/auth/me', authC.me);
// Always answers 200 so the public site can ask without logging an error for
// ordinary visitors. See auth.controller.status.
router.get('/auth/status', authC.status);

/* ------------------------------ admin ------------------------------ */

router.get('/admin/stats', auth.requireAdmin, recordsC.stats);

router.get('/admin/services', auth.requireAdmin, servicesC.list);
router.post('/admin/services', auth.requireAdmin, servicesC.create);
router.put('/admin/services/:id', auth.requireAdmin, servicesC.update);
router.delete('/admin/services/:id', auth.requireAdmin, servicesC.remove);

router.get('/admin/inquiries', auth.requireAdmin, inquiryC.listInquiries);
router.patch('/admin/inquiries/:ref', auth.requireAdmin, inquiryC.updateInquiry);

router.get('/admin/bookings', auth.requireAdmin, inquiryC.listBookings);
router.patch('/admin/bookings/:ref', auth.requireAdmin, inquiryC.updateBooking);

router.get('/admin/orders', auth.requireAdmin, recordsC.listOrders);
router.patch('/admin/orders/:ref', auth.requireAdmin, recordsC.updateOrder);

router.get('/admin/reviews', auth.requireAdmin, recordsC.listReviews);
router.patch('/admin/reviews/:id', auth.requireAdmin, recordsC.updateReview);
router.delete('/admin/reviews/:id', auth.requireAdmin, recordsC.deleteReview);

router.get('/admin/contact', auth.requireAdmin, recordsC.listContact);
router.patch('/admin/contact/:id', auth.requireAdmin, recordsC.updateContact);

router.get('/admin/customers', auth.requireAdmin, recordsC.listCustomers);

module.exports = router;
