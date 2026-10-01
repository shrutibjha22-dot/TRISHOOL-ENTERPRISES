-- ============================================================
--  TRISHOOL ENTERPRISES — database schema
--  MySQL 8.0+ / MariaDB 10.6+
--
--  Run with:  mysql -u root -p < schema.sql
--  or via:    npm run db:setup
-- ============================================================

CREATE DATABASE IF NOT EXISTS trishool_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE trishool_db;

-- ---------- administrators ----------
CREATE TABLE IF NOT EXISTS admin_accounts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,     -- bcrypt, never the plain password
  role          ENUM('owner','staff') NOT NULL DEFAULT 'owner',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- services ----------
-- Powers the public service cards and the admin service editor.
-- `display_size` keeps the bento layout the frontend already uses.
CREATE TABLE IF NOT EXISTS services (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(80)   NOT NULL,
  name          VARCHAR(120)  NOT NULL,
  description   VARCHAR(500)  NOT NULL DEFAULT '',
  price         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- NULL price means "on request", used by the Buy & Sell items
  is_enquiry    TINYINT(1)    NOT NULL DEFAULT 0,
  icon          VARCHAR(16)   NOT NULL DEFAULT '',
  display_size  ENUM('lead','wide','normal') NOT NULL DEFAULT 'normal',
  badge         VARCHAR(40)   NULL,
  detail        VARCHAR(200)  NULL,        -- comma separated chips
  -- Bullet list under an AMC card: [{ "t": "text", "ok": true, "note": "..." }]
  features      JSON          NULL,
  category      ENUM('service','amc','product') NOT NULL DEFAULT 'service',
  period        VARCHAR(30)   NULL,        -- e.g. "per year" for AMC
  sort_order    INT           NOT NULL DEFAULT 0,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_slug (slug),
  KEY idx_service_active (is_active, sort_order),
  KEY idx_service_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- customers ----------
-- One row per person. Reused across inquiries, bookings, orders and reviews.
CREATE TABLE IF NOT EXISTS customers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(20)  NOT NULL,          -- stored as +91XXXXXXXXXX
  email      VARCHAR(190) NULL,
  city       VARCHAR(80)  NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_phone (phone),
  KEY idx_customer_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- service inquiries ----------
CREATE TABLE IF NOT EXISTS service_inquiries (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  inquiry_ref   VARCHAR(24)  NOT NULL,      -- human-quotable, e.g. TRH-INQ-4F2A
  customer_id   INT UNSIGNED NULL,
  service_id    INT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  message       TEXT         NULL,
  status        ENUM('New','Contacted','Quoted','Booked','Closed') NOT NULL DEFAULT 'New',
  admin_note    TEXT         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inquiry_ref (inquiry_ref),
  KEY idx_inquiry_status (status),
  KEY idx_inquiry_customer (customer_id),
  KEY idx_inquiry_service (service_id),
  KEY idx_inquiry_created (created_at),
  CONSTRAINT fk_inquiry_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_inquiry_service  FOREIGN KEY (service_id)
    REFERENCES services (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- bookings ----------
CREATE TABLE IF NOT EXISTS bookings (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_ref  VARCHAR(24)  NOT NULL,       -- TRH-BKG-9C31
  customer_id  INT UNSIGNED NULL,
  service_id   INT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  address      VARCHAR(255) NULL,
  preferred_date DATE       NULL,
  preferred_time  VARCHAR(40) NULL,
  notes        TEXT         NULL,
  status       ENUM('New','Scheduled','In Progress','Completed','Cancelled') NOT NULL DEFAULT 'New',
  admin_note   TEXT         NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_ref (booking_ref),
  KEY idx_booking_status (status),
  KEY idx_booking_customer (customer_id),
  KEY idx_booking_service (service_id),
  KEY idx_booking_date (preferred_date),
  CONSTRAINT fk_booking_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_booking_service  FOREIGN KEY (service_id)
    REFERENCES services (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- cart orders ----------
-- The line items of the website cart, kept as JSON alongside the money totals
-- so historical orders stay readable even if a service is later renamed.
CREATE TABLE IF NOT EXISTS orders (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_ref    VARCHAR(24)  NOT NULL,        -- TRH-ORD-8H2K
  customer_id  INT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  items        JSON         NOT NULL,
  items_text   VARCHAR(500) NOT NULL DEFAULT '',
  subtotal     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gst_rate     DECIMAL(5,2)  NOT NULL DEFAULT 18.00,
  gst          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  has_enquiry  TINYINT(1)   NOT NULL DEFAULT 0,
  payment_method ENUM('Cash','UPI') NOT NULL DEFAULT 'Cash',
  status       ENUM('New','Confirmed','In Progress','Completed','Cancelled') NOT NULL DEFAULT 'New',
  admin_note   TEXT         NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_ref (order_ref),
  KEY idx_order_status (status),
  KEY idx_order_created (created_at),
  KEY idx_order_customer (customer_id),
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- contact form submissions ----------
CREATE TABLE IF NOT EXISTS contact_submissions (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NULL,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(20)  NULL,
  email      VARCHAR(190) NULL,
  subject    VARCHAR(160) NULL,
  message    TEXT         NOT NULL,
  status     ENUM('New','Read','Replied','Archived') NOT NULL DEFAULT 'New',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contact_status (status),
  KEY idx_contact_created (created_at),
  KEY idx_contact_customer (customer_id),
  CONSTRAINT fk_contact_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- reviews ----------
-- Nothing appears on the public site until status = 'Approved'.
CREATE TABLE IF NOT EXISTS reviews (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NULL,
  name       VARCHAR(120) NOT NULL,
  rating     TINYINT UNSIGNED NOT NULL DEFAULT 5,
  service_id INT UNSIGNED NULL,
  service_label VARCHAR(80) NULL,           -- kept even if the service is deleted
  body       TEXT         NOT NULL,
  status     ENUM('Pending','Approved','Hidden') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_review_status (status),
  KEY idx_review_created (created_at),
  KEY idx_review_customer (customer_id),
  KEY idx_review_service (service_id),
  CONSTRAINT fk_review_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_review_service  FOREIGN KEY (service_id)
    REFERENCES services (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
