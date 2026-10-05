# Deploying Trishool Enterprises

There are two separate things here, and only one of them needs deploying.

| | What it is | Where it runs now |
|---|---|---|
| **The website** | HTML, CSS, JavaScript, images | Already live on GitHub Pages |
| **The backend** | Node.js + Express + MySQL | Only on your own computer |

GitHub Pages is a **static host**. It can serve files but cannot run a program
or hold a database. That is the whole reason the admin dashboard and the forms
do not work there:

```
/api/health      404   there is no API on a static host
/api/services    404
/api/admin/stats 404
```

When you deploy the backend, one address serves **everything** — the website,
the forms that save, and the admin dashboard — because our Node server serves
the page and the API from the same origin. You will not need to change any
setting afterwards.

---

## Deploying to Render (free tier, about 10 minutes)

### 1. Create the account

1. Go to <https://render.com>
2. Click **Get Started**
3. Sign up with your email, or click **Continue with GitHub** and approve the
   app it asks for

### 2. Create the blueprint

1. In the dashboard click **New** → **Blueprint**
2. Connect and choose `TRISHOOL-ENTERPRISES`
3. Render reads `render.yaml` from the repository and shows a plan:
   - a web service called `trishool-website`
   - a MySQL database called `trishool-db`
4. Render will ask for the two values it cannot know:

   | Field | What to enter |
   |---|---|
   | `ADMIN_SEED_EMAIL` | your own email address |
   | `ADMIN_SEED_PASSWORD` | a strong password you choose |

   These create the admin account. If you leave them blank the site comes up
   with no admin and you cannot sign in.

5. Click **Apply** / **Create**

### 3. Wait for the first deploy

The build log shows each step. The start command runs the database setup and
seed before serving, so you should see:

```
[db] schema ready in `trishool_db`
[seed] 10 services ready
[seed] admin account ready
  Website   https://trishool-website.onrender.com/
```

### 4. Open your site

```
https://trishool-website.onrender.com/
```

Admin is the **Admin** link in the navigation bar, or
`https://trishool-website.onrender.com/admin.html`.

#### Signing in to the admin dashboard from any device

Once the service is deployed this works from a phone, a tablet or any other
computer, not just the machine you deployed from. Sign in at
`https://trishool-website.onrender.com/admin.html` with the email and password
you entered for `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`.

The **published GitHub Pages address works too** — its Admin link finds the live
API on its own, because the page asks which host answers rather than trusting
the address it was built with. Nothing needs rebuilding when the backend moves.

Two settings make that work, and both are set for you in `render.yaml`:

| Setting | Why it is needed |
|---|---|
| `PUBLIC_ORIGIN` | The published site and the API are on different addresses, so the browser blocks the responses unless the API allows that address. |
| `TRUST_PROXY` | Render forwards every request through its own proxy. Without this the rate limiter counts every visitor as the same IP, and 60 form submissions an hour site-wide would lock everybody out at once. |

The session cookie is `SameSite=Lax` when the page and API share an address,
and automatically becomes `SameSite=None` when `PUBLIC_ORIGIN` is set, because
a lax cookie is never sent cross-site — which would let you sign in and then be
refused on every following request.

If you ever publish the site at a different address, change `PUBLIC_ORIGIN` to
match it.

---

## What the free tier costs you

Be aware of these before you rely on it:

| Limitation | Effect |
|---|---|
| MySQL free database is **deleted after 30 days** | After a month you need the paid database, or your orders, enquiries and reviews are lost |
| Web service **sleeps after 15 minutes** idle | The first visitor after a quiet spell waits a few seconds |
| No custom domain | The address ends in `.onrender.com` |

For a college project or a trial, 30 days is plenty. For a real business, buy
the paid database so the data survives.

---

## Using your own domain (optional, costs money)

A domain has to be rented every year, roughly ₹700–1200 for a `.com`. There
is no free `.com`; any site offering one is not legitimate.

Once you own one:

1. Add these DNS records at your registrar:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |

2. In Render: **Settings → Custom Domains → Add**, then type your domain

Render issues a free HTTPS certificate automatically.

> **Do not add a `CNAME` file to the repository for this.** Doing that switches
> GitHub Pages over to the custom domain straight away. If the domain is not
> registered yet, your working site goes offline. Use the Render dashboard
> instead, which is safer.

---

## Running it on your own computer

The backend also runs locally, which is how you develop and how you demo.

Double-click **`START-WEBSITE.bat`**. It starts the database if it is not
already running, installs packages on a fresh copy, creates `.env` and offers
to open it, then starts the server and opens your browser.

Then <http://127.0.0.1:3000/>.

Stop it with `Ctrl + C` in the black window, or close the window.

On a phone on the same Wi-Fi, run **`ALLOW-PHONE-ACCESS.bat`** as
administrator once. It prints the address to use.

---

## Checking a deployment is healthy

```
https://your-site/api/health
```

Should reply:

```json
{ "ok": true, "status": "healthy", "database": "trishool_db", "version": "8.x" }
```

If `status` is `unhealthy`, open the service's **Logs** tab in Render — the
database password is almost always the cause.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Forms do nothing | No API behind the page. Deploy the backend, or you are on GitHub Pages |
| "We could not reach the server" on a form | Same. The page is static, so nothing can be saved |
| Admin says "not running" | The backend is not deployed, or not running on your machine |
| Login always rejected | `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` in Render differ from what you are typing |
| Site loads but no images | Something is missing from the repository. Check `/assets/logo-mark.png` returns 200 |
| Data vanished after 30 days | That is the free Render database expiring. Buy the paid one |