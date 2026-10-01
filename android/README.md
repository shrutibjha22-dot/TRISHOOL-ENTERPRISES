# Trishool Enterprises — Android app (Play Store)

This folder holds the configuration for wrapping the website as an Android app
using **Capacitor**, which puts your existing site inside a real native app shell
with an app icon, a splash screen and offline support.

---

## Read this before you start

Three things here cannot be done for you, and none of them are negotiable by
Google:

1. **A paid Google Play developer account — USD 25, once.**
   <https://play.google.com/console/signup>
   You also have to verify your identity with a government ID, and Google
   sometimes asks for a D-U-N-S number for organisation accounts.

2. **Android Studio on this computer.**
   Nothing needed to build an Android app is currently installed — no Java, no
   Android SDK, no Gradle. Android Studio is roughly a 1 GB download plus
   ~6 GB of SDK packages, and the first setup takes 20–40 minutes.

3. **A signed release build, uploaded by you.**
   Signing keys are tied to your account. Never share or lose the keystore.

Expect the whole thing to take a few hours of your time, spread over a few days,
including Google's review.

---

## Is this worth it, honestly?

For most small businesses, **no — the PWA already gets you 90% of it, today and
free.**

The website is already installable. On an Android phone, open the site in
Chrome and use **⋮ → Add to Home screen**. You get an app icon, a splash
screen, full-screen display with no browser bar, and it works offline. No
account, no fee, no review, no waiting.

The Play Store version is worth it if you specifically want:
- the app to appear in Play Store search
- notifications
- deeper device integration (camera, push, files)

If that is not the goal, stop here and use the PWA.

**One risk worth knowing:** Google rejects thin apps that are only a website in
a webview, under its "minimum functionality" policy. A WebView wrapper of your
own single-business site is usually accepted, but it is not guaranteed. Adding
native notifications and a proper splash screen makes acceptance much more
likely — so build those, rather than shipping a bare wrapper.

---

## Build steps

### 1. Install Node.js
<https://nodejs.org> — download the **LTS** installer, accept defaults.

### 2. Install Android Studio
<https://developer.android.com/studio> — then let it download the SDK.

### 3. Open a terminal in this project folder and run

```powershell
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/android

# point Capacitor at the website files
npx cap init "Trishool Enterprises" in.trishool.enterprises --web-dir=www

# copy the website into the app
npx cap add android
npx cap sync android
npx cap open android
```

`www/` should contain a copy of the site — `index.html`, `styles.css`,
`app.js`, `assets/`, `icons/`, `manifest.webmanifest`. Copy them there:

```powershell
New-Item -ItemType Directory -Force www
Copy-Item index.html, styles.css, app.js, manifest.webmanifest www
Copy-Item -Recurse assets, icons www
```

### 4. App icon and splash screen

In Android Studio, right-click `res/drawable` and replace with the files from
`icons/`:

| Purpose          | File to use                     |
| ---------------- | ------------------------------- |
| Launcher icon    | `icons/icon-512.png`            |
| Adaptive icon    | `icons/maskable-512.png`        |
| Play listing     | `icons/play-store-512.png`      |
| Store banner     | `icons/play-feature-1024x500.png` |

### 5. Important setting — cleartext traffic

The site is loaded over https, which Android allows by default. If you ever
point the app at an `http://` address, Android will block it. Keep https.

### 6. Build the release bundle

In Android Studio: **Build → Generate Signed App Bundle (.aab)**.

Keep the generated keystore somewhere safe and back it up. If you lose it you
cannot update the app without creating a new listing.

### 7. Play Console

1. **Create the app** — name, language, "App" category, free.
2. **Store listing** — upload `icons/play-store-512.png` (512×512, opaque),
   the feature graphic, at least 2 phone screenshots, and the description.
3. **Privacy policy** — **required.** This app collects customer name, phone
   number and the content of reviews, so you must publish a privacy policy at a
   public URL and link it. A simple page stating what you collect, why, and
   that you never share it is enough.
4. **App content** — complete the data safety section. Be accurate: name,
   phone number and user-entered review text are collected for order
   fulfilment. The purpose is "App functionality" / "Business purposes".
5. **Target audience and content rating** — complete both questionnaires.
6. **Upload the `.aab`** to a closed test track first. Test on a real phone
   before going live.
7. **Submit for review** — usually a few hours to a few days.

---

## Files in this folder

| File                     | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `capacitor.config.json`  | App ID, name, and which folder holds the site  |

The `www/` folder and the generated `android/` project are created by the
commands above, so they are not checked in.

---

## Things to decide before you publish

- **Your privacy policy text.** Required, and it must match what the app does.
- **Screenshots.** Google wants real phone screenshots, not mock-ups.
- **Support email and website**, both shown publicly on the listing.
- **Content rating.** Answer the questionnaire honestly.

---

## The fastest alternative

If you want an app today rather than in a week, skip all of the above. The
website is already a PWA. On your Android phone:

**Chrome → ⋮ → Add to home screen**

That is genuinely an app: icon, splash, full screen, works offline. Then put a
QR code to your site on your shop front and in your WhatsApp status, and you
have the same practical benefit for zero cost and zero review time.
