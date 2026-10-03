# 🎂 Birthday Gift Wheel

A funny, flashy birthday mini-game: a guest types their name, spins an animated
wheel, and the server assigns them a gift they're now "responsible" for buying
the birthday person — then they share it to WhatsApp with one tap. A protected
admin console manages the gift catalog, tracks every spin, and controls wheel
behavior.

## Tech stack

- **Client:** React + Vite + Tailwind CSS + Framer Motion
- **Server:** Node.js 24.x + Express + `node:sqlite` (Node's built-in SQLite module — no native/npm database dependency)
- **Database:** SQLite (file-based, no separate DB server needed)

> **Requires Node >=22.12.0.** This project was developed and verified
> against Node 24.x, which is recommended for both local development and
> deployment. It uses Node's built-in `node:sqlite` module, which doesn't
> exist before Node 22.5 and needs a recent Node build to run unflagged.
> Check your version with `node --version` before installing, and use a
> version manager (nvm/fnm/volta) to switch if needed.

## Install

```bash
npm run install:all
```

This installs dependencies for both `server/` and `client/`.

## Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on (default `3000`) |
| `NODE_ENV` | `development` or `production` |
| `SESSION_SECRET` | Long random string used to sign admin session cookies — generate one with `openssl rand -hex 32` (or any password manager) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Used **once**, on first server boot, to create the one admin account |
| `DB_PATH` | Where the SQLite database file lives (default `server/data/app.db`) |
| `UPLOAD_DIR` | Where uploaded gift images are stored (default `server/data/uploads`) |

## Run in development

```bash
npm run dev
```

Starts the Express API on `http://localhost:3000` and the Vite dev server on
`http://localhost:5173` (which proxies `/api` and `/uploads` to the API). Open
`http://localhost:5173` in your browser.

## Create the admin account

The admin account is created automatically the first time the server boots
with `ADMIN_USERNAME` and `ADMIN_PASSWORD` set in `.env` **and no admin account
already exists** in the database. After that first boot, changing `.env` does
nothing — the seed step only ever runs once, so a stray restart can't silently
change your password out from under you. If you need to change the admin
password later, the straightforward path is to delete the `admin_users` row
from the SQLite database (e.g. with the `sqlite3` CLI or a GUI browser like
DB Browser for SQLite) and restart the server with new `.env` values.

## Add gifts

1. Go to `/admin/login` and sign in.
2. Open the "Gifts" tab.
3. Fill in Gift Name, Gift URL, optionally upload an image (JPEG/PNG/WEBP, up
   to 5MB), leave "Active" checked, and click "Add gift".
4. Only **active** gifts appear on the public wheel.

## Build for production

```bash
npm run build
```

Builds the client into `client/dist`.

## Run in production

```bash
NODE_ENV=production npm start
```

This serves both the built client and the API from a single Express process
on `PORT` — one URL for guests to open from WhatsApp, no CORS configuration
needed.

> **Testing production mode locally:** running `NODE_ENV=production` on your
> own machine over plain `http://localhost` will never produce a `Set-Cookie`
> for admin login — secure cookies require the browser to see an HTTPS
> origin, and this is correct, expected behavior, not a bug. To actually
> exercise admin login in production mode locally, either send a
> `X-Forwarded-Proto: https` header manually (e.g. `curl -H "X-Forwarded-Proto: https" ...`)
> to simulate the reverse proxy, or just test against a real deployed HTTPS
> instance.

## Deploy (Hostinger)

1. Push this repository to GitHub.
2. In Hostinger, create the app under **Deploy Web App** and connect it to
   the GitHub repo (or upload a zip of the repo, excluding `node_modules`,
   `.git`, `server/data`, and `.env`).
3. Build command: `npm run build` (the `postinstall` script in
   `package.json` installs `server/` and `client/` dependencies
   automatically, including with `NODE_ENV=production` set — see note below).
4. Entry file: `server/src/index.js`
5. Set environment variables from the table above in Hostinger's dashboard
   (`SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NODE_ENV=production`).
6. **Point `DB_PATH` and `UPLOAD_DIR` at Hostinger's persistent storage
   directory**, not the app's own deployed code directory. This step is not
   optional: Hostinger replaces the app's code directory on every
   redeploy, which silently deletes the database and every uploaded gift
   image if they're stored inside it. Use a path like
   `/home/<your-account-id>/persistent_data/database/database.db` for
   `DB_PATH` and `/home/<your-account-id>/persistent_data/uploads` for
   `UPLOAD_DIR` (find your account's actual persistent storage path in
   Hostinger's dashboard).
7. **Secure session cookies behind a reverse proxy.** The app calls
   `app.set('trust proxy', 1)` internally to ensure admin login's secure
   session cookie works correctly behind Hostinger's TLS-terminating
   reverse proxy — no action needed on your part.
8. **Pin the Node version to 22.x or newer** in Hostinger's runtime/Node
   version setting (don't rely solely on `package.json`'s `engines` field —
   hosts don't always default to a version recent enough for `node:sqlite`).
9. Deploy, then share the resulting URL.

> **Why `npm run build` alone is enough:** some deploy UIs (Hostinger
> included) only expose a single build-command field with no separate
> install step you can customize. `package.json`'s `postinstall` script
> hooks into npm's automatic install step to also install `server/` and
> `client/` dependencies — and explicitly passes `--include=dev` for the
> client, since `NODE_ENV=production` would otherwise make npm skip
> `vite` and the rest of the client's dev-only build tooling, breaking
> the build in production mode specifically.

## Database

SQLite via Node's built-in `node:sqlite` module (`DatabaseSync`) — no native
compilation, no extra npm dependency. The file lives at `DB_PATH`. Tables
(`admin_users`, `gifts`, `participants`, `settings`, `sessions`) are created automatically
on first boot — see `server/src/db/index.js`. There is no separate migration
tool; schema changes at this project's scale are made directly in that file
using `CREATE TABLE IF NOT EXISTS`.

## Testing

```bash
npm test --prefix server   # unit + integration tests (node:test + supertest)
npm test --prefix client   # pure-logic unit tests (vitest) for api.js, sound.js, wheelMath.js
```

## Project structure

```
birthday-gift-game/
  client/       React SPA (Vite, Tailwind, Framer Motion)
  server/       Express API + SQLite
  docs/         design spec and implementation plan
```
