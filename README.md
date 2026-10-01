# Trishool Enterprises — Website with a Full-Stack Backend

The Trishool Enterprises website (computer and printer repair, AMC plans, and
Buy & Sell) with a real backend behind it: **Node.js + Express**, a **MySQL**
database, a **REST API**, and an **admin dashboard** with genuine sign-in.

The website design is unchanged from the original static site — same layout,
colours, fonts, images and responsive behaviour. What changed is that the forms
now save to a database instead of going nowhere, and there is an admin dashboard
that reads and writes that database.

---

## 1. Contents

- [2. What it does](#2-what-it-does)
- [3. Technology used](#3-technology-used)
- [4. Project structure](#4-project-structure)
- [5. Installing](#5-installing)
- [6. Database setup](#6-database-setup)
- [7. Configuration (.env)](#7-configuration-env)
- [8. Running it](#8-running-it)
- [9. Admin dashboard](#9-admin-dashboard)
- [10. API reference](#10-api-reference)
- [11. Database tables](#11-database-tables)
- [12. Security](#12-security)
- [13. Testing](#13-testing)
- [14. Troubleshooting](#14-troubleshooting)

---

## 2. What it does

### For customers (the public website)

| Feature | What happens |
|---|---|
| Service prices and AMC plans | Read live from the database, so a price change in the dashboard appears on the site immediately |
| Service enquiry form | Saves to the database, gives the customer a reference number like `TRH-INQ-4K7P`, and offers a WhatsApp button with the service and their details already filled in |
| Booking form | Saves the booking with a reference like `TRH-BKG-9X2M` |
| Cart and checkout | Saves the order, recalculates the totals on the server, and sends the customer to WhatsApp |
| Reviews | Saved as **Pending**. Only an admin-approved review appears on the public page |
| Contact form | Saves the message for the admin to read |
| WhatsApp buttons | Unchanged — still open WhatsApp with the service and customer details prefilled |

### For the business (the admin dashboard)

The dashboard is built **into the website page itself**, as a full-screen panel.
Clicking **Admin** — in the navigation bar, or the quiet link in the footer —
opens it over the site. Sign in with an email address and password; the panel
then shows the dashboard until you close it.

Nothing about an order or a customer is sent to a visitor's browser. The panel
starts as an empty shell, `admin.js` is only downloaded once an admin opens it,
and every figure comes from `/api/admin/*`, which the server rejects without a
valid session cookie. A customer who never opens the panel downloads none of
it.

The dashboard shows:

- **Counters** — total orders, order value, GST collected, this month's value, new orders, customers, new inquiries, open bookings, reviews waiting for approval, new messages
- **Orders** — every order with its items and totals; change the status; search; export to CSV
- **Inquiries** — every question sent through the website
- **Bookings** — every service booking and the customer's preferred date
- **Reviews** — approve, hide or delete before they go public
- **Services** — add, edit, hide or delete any service; the public site updates itself
- **Messages** — contact form submissions
- **Customers** — everyone who has ordered, booked, inquired or reviewed, with their totals

---

## 3. Technology used

**Frontend** — plain HTML, CSS and JavaScript. No framework, no build step, no
npm packages in the browser. The design is the original design.

**Backend**

| Package | Why |
|---|---|
| `express` | HTTP server and routing |
| `mysql2` | MySQL driver, using a connection pool and named parameters |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | Signs the admin session token |
| `cookie-parser` | Reads the auth cookie |
| `helmet` | Security headers |
| `compression` | gzip responses |
| `express-rate-limit` | Rate limits form posts and sign-in attempts |
| `dotenv` | Loads `.env` |

**Database** — MySQL 8 or MariaDB 10.6+ (either works; it was built and tested
against MariaDB 11.4).

**Runtime** — Node.js 18 or newer.

---

## 4. Project structure

```
trishool-website/
├── index.html              Public website (unchanged design)
├── admin.html              Admin dashboard
├── app.js                  Public site behaviour
├── admin.js                Admin dashboard behaviour
├── styles.css              Website styles
├── admin.css               Admin dashboard styles
├── sw.js                   Offline support (service worker)
├── manifest.webmanifest    Installable app / PWA manifest
├── assets/                 Images, logo, UPI QR code
├── icons/                  App icons
│
├── server/
│   ├── index.js            Server entry point: serves the site AND /api
│   ├── config/
│   │   ├── env.js          Reads and validates .env
│   │   └── db.js           MySQL connection pool
│   ├── middleware/
│   │   ├── auth.js         requireAdmin — checks the JWT
│   │   └── error.js        Error handling and request logging
│   ├── controllers/
│   │   ├── auth.controller.js       Sign in / out
│   │   ├── services.controller.js   Services list and CRUD
│   │   ├── inquiry.controller.js    Inquiries and bookings
│   │   └── records.controller.js    Orders, reviews, messages, customers, stats
│   ├── models/
│   │   └── customer.js     Find-or-create a customer
│   ├── utils/
│   │   └── validate.js     Input validation, reference numbers
│   ├── routes/
│   │   └── index.js        Every route in one file
│   ├── db/
│   │   ├── schema.sql      The 8 tables
│   │   ├── setup.js        Creates the database and tables
│   │   ├── seed.js         Loads the services and the admin account
│   │   └── demo.js         Clears test data, ready for a demo
│   └── test/
│       └── smoke.js        54 end-to-end checks
│
├── tools/                  Optional developer scripts (see section 13)
├── android/                Optional: guide for wrapping the site as an Android
│                           app with Capacitor. Not needed to run the project
├── .env.example            Template configuration
├── .gitignore
├── package.json
└── START-WEBSITE.bat       Double-click to start everything on Windows
```

---

## 5. Installing

You need three things:

1. **Node.js 18 or newer** — <https://nodejs.org> (choose the LTS version).
   Check it worked by typing `node --version`. If Windows says "not
   recognised", Node is installed but missing from PATH — reinstall and tick
   "Add to PATH", or add its folder to PATH yourself. `START-WEBSITE.bat`
   looks in the usual places by itself, so the site still starts either way.
2. **MySQL 8 or MariaDB 10.6+** — installed. `START-WEBSITE.bat` starts it for
   you if it is not already running.
3. This project folder

Then, in a terminal opened in the project folder:

```bash
npm install
```

---

## 6. Database setup

Run these three commands once, in order:

```bash
# 1. Create the database and the 8 tables (from server/db/schema.sql)
npm run db:setup

# 2. Load the 10 services and the first admin account
npm run db:seed

# 3. (optional) Check everything is connected
#    Start the server first, then open http://127.0.0.1:3000/api/health
```

`npm run db:seed` prints the admin email and password. If
`ADMIN_SEED_PASSWORD` is blank in `.env`, it generates a random password and
shows it **once** — write it down.

### Other database commands

| Command | What it does |
|---|---|
| `npm run db:setup` | Creates the database and tables. Safe to re-run — existing tables are left alone |
| `npm run db:reset` | **Drops everything** and recreates it from `schema.sql`. Wipes all data |
| `npm run db:seed` | Loads the services and admin account. Safe to re-run — it updates rather than duplicates |
| `npm run db:demo` | Clears orders, inquiries, bookings, reviews, messages and customers, then reloads the services and admin. **Run this before a demonstration** so the dashboard is not full of test rows |

---

## 7. Configuration (.env)

Copy `.env.example` to `.env` and fill in your values:

```bash
copy .env.example .env        # Windows
cp .env.example .env          # macOS / Linux
```

The only values you must change are the database ones and the JWT secret.

| Variable | What it is | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |
| `HOST` | Address to bind to | `127.0.0.1` |
| `NODE_ENV` | `development` or `production` | `development` |
| `DB_HOST` | Database host | `127.0.0.1` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database username | `root` |
| `DB_PASSWORD` | Database password | *(empty)* |
| `DB_NAME` | Database name | `trishool_db` |
| `DB_POOL_SIZE` | Connections kept open | `10` |
| `JWT_SECRET` | Secret used to sign admin sessions — **change this** | *(placeholder)* |
| `JWT_EXPIRES_IN` | How long a sign-in lasts | `8h` |
| `BCRYPT_ROUNDS` | Password hashing cost | `12` |
| `AUTH_COOKIE_NAME` | Name of the session cookie | `trishool_admin_token` |
| `AUTH_COOKIE_SECURE` | Set to `true` when served over HTTPS | `false` |
| `PUBLIC_ORIGIN` | Only if the site is hosted somewhere else | *(empty)* |
| `TRUST_PROXY` | Set to `1` **only** if Nginx/a load balancer sits in front | *(empty)* |
| `BUSINESS_WHATSAPP` | Business number, digits only | `919082278478` |
| `BUSINESS_UPI_ID` | UPI ID shown on the payment card | `9324534405@ptaxis` |
| `GST_RATE` | GST percentage | `18` |
| `ADMIN_SEED_EMAIL` | First admin's email | *(empty - you choose)* |
| `ADMIN_SEED_NAME` | First admin's display name | `Trishool Admin` |
| `ADMIN_SEED_PASSWORD` | First admin's password — used **once**, by `db:seed` | *(empty)* |

Generate a good `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `.env` is listed in `.gitignore` and is never committed. Only `.env.example`
> is shared.

---

## 8. Running it

```bash
npm start
```

Then open:

| | |
|---|---|
| Website | <http://127.0.0.1:3000/> |
| Admin dashboard | <http://127.0.0.1:3000/admin.html> |
| Health check | <http://127.0.0.1:3000/api/health> |

On Windows you can also just **double-click `START-WEBSITE.bat`**. It checks
that Node.js and `.env` are present, installs the packages on first run, starts
the server and opens the website.

To stop the server, press `Ctrl + C` in the terminal (or close the
`START-WEBSITE.bat` window).

### Opening it on your phone or another laptop

By default the server only accepts connections from the computer it runs on
(`HOST=127.0.0.1`). To use the admin dashboard from a phone or a second
computer on the same Wi-Fi:

1. In `.env`, change `HOST=127.0.0.1` to `HOST=0.0.0.0`
2. Right-click **`ALLOW-PHONE-ACCESS.bat`** → **Run as administrator** (this adds
   one firewall rule for port 3000, limited to private networks)
3. Restart the server (`npm start`)
4. Find your address — either run `ALLOW-PHONE-ACCESS.bat` again and read it off
   the screen, or type `ipconfig` and look for **IPv4 Address**

Then on the phone, on the **same Wi-Fi**:

| | |
|---|---|
| Website | `http://YOUR-IP:3000/` — e.g. `http://192.168.0.105:3000/` |
| Admin dashboard | `http://YOUR-IP:3000/admin.html` |

Sign in with the email and password from section 6, exactly as on the computer.

Your IP can change when the router reconnects, so check `ipconfig` if it stops
working. To use the dashboard from somewhere *other* than your own Wi-Fi — a
different network, or when you are not at home — you would need to publish it to
a real host (see the deployment note in section 12), because a home IP address
is not reachable from the internet.

> Opening the port means anyone on that Wi-Fi can load the login page. They
> still cannot see any data without the password, but prefer this on a network
> you trust.

### npm commands

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start the server and restart it automatically when a file changes |
| `npm run db:setup` | Create the database and tables |
| `npm run db:seed` | Load the services and the admin account |
| `npm run db:reset` | Drop and recreate everything |
| `npm run db:demo` | Clear test data and reload the services and admin |
| `npm run smoke` | Run the 54 end-to-end checks (server must be running) |
| `npm run check` | Static checks: module exports and SQL parameters |
| `npm run check:exports` | Module export check only |
| `npm run check:sql` | SQL parameter check only |

---

## 9. Admin dashboard

The dashboard lives **inside the website page** as a full-screen panel, so the
site and the admin side are one place:

1. Open the website — <http://127.0.0.1:3000/>
2. Click **Admin** in the navigation bar, or the small **Admin** link in the
   footer
3. Sign in with the email and password from section 6
4. Use the tabs to work through orders, inquiries, bookings, reviews, services,
   messages and customers
5. Close the panel with the **×**, the **Escape** key, or the **Website**
   button
6. **Sign out** when finished

After signing in, the **Admin** link also appears in the navigation bar of the
website itself. It is hidden from anyone who is not signed in.

`admin.html` also still works on its own, if you prefer a dedicated URL —
<http://127.0.0.1:3000/admin.html>. Both share the same `admin.js`.

**Why the panel is not just part of the page content:** the panel is an empty
shell. Its numbers are fetched from `/api/admin/*`, and the server refuses those
requests unless the request carries a valid session cookie. So embedding it costs
a visitor nothing but the markup — no order, customer or message data is ever
downloaded for them.

**Changing the admin password:** there is no settings screen. Sign in, then
change the password directly in MySQL with a hashed value, or simply set a new
`ADMIN_SEED_PASSWORD` in `.env` and run `npm run db:seed` again — it updates
the existing account rather than creating a second one.

To add another admin, insert a row into `admin_accounts` with a bcrypt hash.

---

## 10. API reference

All responses are JSON. Base URL: `http://127.0.0.1:3000/api`

### Public — no sign-in needed

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Server and database status |
| `GET` | `/services` | All active services (prices, AMC plans, products) |
| `GET` | `/services/:idOrSlug` | One service, by id, slug or name |
| `POST` | `/inquiries` | Save a service enquiry → returns a reference |
| `POST` | `/bookings` | Save a service booking → returns a reference |
| `POST` | `/orders` | Save an order → returns a reference and server-calculated totals |
| `POST` | `/reviews` | Save a review as Pending |
| `GET` | `/reviews` | Approved reviews only (what the public page shows) |
| `POST` | `/contact` | Save a contact message |
| `POST` | `/auth/login` | Sign in → sets an httpOnly cookie |
| `POST` | `/auth/logout` | Sign out → clears the cookie |
| `GET` | `/auth/me` | Who am I? (401 if not signed in) |
| `GET` | `/auth/status` | Is this visitor a signed-in admin? Always 200 — `admin` is `null` when not |

### Admin — these need the session cookie, otherwise 401

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/stats` | Every counter shown on the dashboard |
| `GET` | `/admin/orders` | All orders |
| `PATCH` | `/admin/orders/:ref` | Change an order's status or note |
| `GET` | `/admin/inquiries` | All inquiries |
| `PATCH` | `/admin/inquiries/:ref` | Change an inquiry's status |
| `GET` | `/admin/bookings` | All bookings |
| `PATCH` | `/admin/bookings/:ref` | Change a booking's status |
| `GET` | `/admin/reviews` | All reviews, including Pending |
| `PATCH` | `/admin/reviews/:id` | Approve, hide or un-hide a review |
| `DELETE` | `/admin/reviews/:id` | Delete a review |
| `GET` | `/admin/services` | All services, including hidden ones |
| `POST` | `/admin/services` | Create a service |
| `PUT` | `/admin/services/:id` | Edit a service |
| `DELETE` | `/admin/services/:id` | Delete a service |
| `GET` | `/admin/contact` | Contact messages |
| `PATCH` | `/admin/contact/:id` | Mark a message as read |
| `GET` | `/admin/customers` | Customers with their totals |

### Example

```bash
# Save an enquiry
curl -X POST http://127.0.0.1:3000/api/inquiries \
  -H "Content-Type: application/json" \
  -d '{"name":"Anita Desai","phone":"9812345670","service":"printer-repair","message":"Printer is not printing."}'

# Sign in (cookies land in admin-cookies.txt)
curl -c admin-cookies.txt -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@yourdomain.com","password":"your-password"}'

# Read something only an admin can read
curl -b admin-cookies.txt http://127.0.0.1:3000/api/admin/stats
```

---

## 11. Database tables

Eight tables, with foreign keys between them.

| Table | Holds | Links to |
|---|---|---|
| `admin_accounts` | Admin logins (bcrypt hashed) | — |
| `services` | Services, AMC plans and products, with prices and AMC feature lists | — |
| `customers` | One row per person, with lifetime totals | — |
| `service_inquiries` | Enquiries from the website | `customers`, `services` |
| `bookings` | Service bookings and preferred dates | `customers`, `services` |
| `orders` | Orders with subtotal, GST and total | `customers` |
| `contact_submissions` | Contact form messages | `customers` |
| `reviews` | Customer reviews and their approval state | `customers`, `services` |

The exact columns are in [`server/db/schema.sql`](server/db/schema.sql).

**Money is calculated on the server, not trusted from the browser.** Prices come
from the `services` table and GST is computed there, so a customer editing the
request in their browser cannot change what they are charged.

---

## 12. Security

- **Passwords are hashed with bcrypt**, never stored or logged as plain text.
- **Admin sessions use a signed JWT** in an `httpOnly`, `sameSite` cookie, so
  page scripts cannot read it. Set `AUTH_COOKIE_SECURE=true` when you serve the
  site over HTTPS.
- **No secrets in the frontend.** There is no admin key, password or API secret
  anywhere in the HTML, CSS or JavaScript — the browser only ever sees the
  public API.
- **Every `/api/admin` route is checked** by `requireAdmin` before the
  controller runs.
- **All input is validated** server-side (lengths, formats, allowed statuses)
  and everything rendered back into the page is escaped.
- **Rate limiting** — 60 form submissions an hour, and 10 *failed* sign-in
  attempts every 15 minutes. The limiter buckets by real client IP and
  deliberately ignores `X-Forwarded-For` unless `TRUST_PROXY` is set, so nobody
  can dodge it by sending a fake header. There is a test for this.
- **SQL injection is prevented** by using named parameters for every query. No
  string is ever concatenated into SQL from user input.
- **Security headers** are set with `helmet`.
- **Server errors never leak internals** — a 500 returns "Something went wrong
  on our side", never a stack trace or a database message.
- **The admin page** asks search engines not to index it, and sends no
  referrer.
- **Only the public frontend is served.** The static handler is pointed at the
  project root, which also contains the backend source, the SQL schema and the
  database scripts — two of which include the admin email address. An allowlist
  means only `index.html`, `admin.html`, the CSS and JS, `assets/` and `icons/`
  are reachable; everything else returns 404. There are tests for this.

### Known limits

Honest about what is *not* covered:

- **It runs on plain HTTP locally.** Set `AUTH_COOKIE_SECURE=true` and put it
  behind HTTPS before using it for real business, or the session cookie can be
  read in transit.
- **One admin account, no password reset screen.** Passwords are changed in
  `.env` and re-seeded. A real deployment would add a reset flow and an audit
  log of who changed what.
- **Rate-limit counters are in memory**, so they reset when the server restarts.
  Fine for one process; a multi-server deployment would need a shared store.
- **`/api/health` reports the database name and version** in its response. That
  is minor information disclosure — remove it if that bothers you.
- **No two-factor authentication.**

---

## 13. Testing

### The smoke test

With the server running in one terminal:

```bash
npm run smoke
```

It runs **54 end-to-end checks** against the live server and the live database:
public reads and writes, input validation, sign-in, rejection of protected
endpoints without a token, services CRUD, review approval, order totals and the
dashboard statistics.

It signs in using `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` **from your
`.env`**, so it always tests the password you actually set. To test a different
server, set `TEST_BASE`:

```bash
TEST_BASE=http://127.0.0.1:3001 npm run smoke
```

```
  ==============================================
  54 passed, 0 failed
```

### Static checks

```bash
npm run check
```

- `check:exports` — confirms every module exports what its callers import
- `check:sql` — confirms every SQL statement's named parameters match the
  parameters actually passed to it (this catches the class of bug where a
  placeholder is renamed in one place only)

### Optional tools

These are developer utilities and are **not** needed to run the project:

| File | Purpose |
|---|---|
| `tools/check_exports.js` | The export check above (also runs via `npm run check:exports`) |
| `tools/check_db_params.py` | The SQL parameter check above (also runs via `npm run check:sql`) |
| `tools/make_logo_assets.py` | Regenerates the logo images |
| `tools/make_app_icons.py` | Regenerates the app icons |
| `tools/make_upi_qr.py` | Regenerates the UPI QR code |

---

## 14. Troubleshooting

**"Please check your details" or the form does not save**
Is the server running? Open <http://127.0.0.1:3000/api/health>. If it says
`unhealthy`, the database is the problem, not the website.

**`ER_ACCESS_DENIED_ERROR` on start**
The `DB_USER` or `DB_PASSWORD` in `.env` is wrong. On a default MariaDB or MySQL
install the root user often has a password you set during installation.

**`ECONNREFUSED 127.0.0.1:3306`**
MySQL is not running. Start the MySQL service before starting this server.

**The dashboard shows nothing**
Run `npm run db:seed`. Without it there are no services and no admin account, so
you cannot sign in.

**Cannot sign in**
The password is the one from `npm run db:seed`. If you cannot remember it, set
`ADMIN_SEED_PASSWORD` in `.env` and run `npm run db:seed` again — it updates the
existing admin rather than adding another one.

**The website looks like the old version / changes do not appear**
Force-refresh the browser with `Ctrl + F5`. HTML, CSS and JavaScript are served
with `Cache-Control: no-cache` so they revalidate on every load.

**Port 3000 is already in use**
Change `PORT` in `.env` to something else, for example `PORT=3001`, and open
<http://127.0.0.1:3001/>. Remember to use the new port everywhere.

**The dashboard is full of test rows**
Run `npm run db:demo`.
