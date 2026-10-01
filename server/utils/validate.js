/**
 * Small validation helpers.
 *
 * Written by hand rather than pulled from a validation library so the exact
 * rules are visible and can be reused identically on the frontend. Every
 * helper returns an array of human-readable error strings (empty when valid).
 */

const PHONE_RE = /^[6-9]\d{9}$/;          // Indian mobile, 10 digits, starts 6-9

/** Trim a value to a string, treating null/undefined as ''. */
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Normalise any phone format to a bare 10-digit Indian mobile. */
function normalisePhone(v) {
  let digits = str(v).replace(/\D/g, '');
  if (digits.length > 10 && digits.slice(0, 2) === '91') digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Format as +91XXXXXXXXXX. Returns '' when the input is unusable. */
function formatPhone(v) {
  const d = normalisePhone(v);
  return d.length === 10 ? `+91${d}` : '';
}

/** Name: 2-120 characters, letters/marks/spaces/punctuation. */
function checkName(v) {
  const value = str(v);
  if (!value) return ['Name is required'];
  if (value.length < 2) return ['Name must be at least 2 characters'];
  if (value.length > 120) return ['Name must be under 120 characters'];
  return [];
}

/** Phone: must resolve to a valid 10-digit Indian mobile. */
function checkPhone(v) {
  if (!str(v)) return ['Phone number is required'];
  const d = normalisePhone(v);
  if (d.length !== 10) return ['Enter a valid 10-digit mobile number'];
  if (!PHONE_RE.test(d)) return ['Enter a valid Indian mobile number'];
  return [];
}

/** Optional email. */
function checkEmail(v) {
  const value = str(v);
  if (!value) return [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return ['Enter a valid email address'];
  if (value.length > 190) return ['Email is too long'];
  return [];
}

/** Free text with a length window. Empty is allowed unless `required`. */
function checkText(v, { label = 'Message', min = 1, max = 2000, required = true } = {}) {
  const value = str(v);
  if (!value) return required ? [`${label} is required`] : [];
  if (value.length < min) return [`${label} must be at least ${min} characters`];
  if (value.length > max) return [`${label} must be under ${max} characters`];
  return [];
}

/** Integer within a range. */
function checkInt(v, { label = 'Value', min = -Infinity, max = Infinity, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    return required ? [`${label} is required`] : [];
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return [`${label} must be a number`];
  if (n < min || n > max) return [`${label} must be between ${min} and ${max}`];
  return [];
}

/** One of a fixed set. */
function checkEnum(v, allowed, { label = 'Value', required = false } = {}) {
  const value = str(v);
  if (!value) return required ? [`${label} is required`] : [];
  if (!allowed.includes(value)) return [`${label} must be one of: ${allowed.join(', ')}`];
  return [];
}

/**
 * Strip anything that is not a printable character and cap the length.
 * Applied to free text before it is stored, so a hostile payload cannot end
 * up in the database or break a downstream template.
 */
function cleanText(v, max = 2000) {
  return str(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, max);
}

/** Human-quotable reference, e.g. TRH-INQ-4F2A. */
function makeRef(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `TRH-${prefix}-${out}`;
}

module.exports = {
  str, normalisePhone, formatPhone, cleanText, makeRef,
  checkName, checkPhone, checkEmail, checkText, checkInt, checkEnum,
  PHONE_RE
};
