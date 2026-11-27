# TRUSTIFY

**Think Before You Trust.** A local-first Indonesian-language digital safety checker built with PHP 8+, MySQL, and a small vanilla JavaScript frontend.

## Run locally

1. Start MySQL from the XAMPP Control Panel. Apache is optional when using PHP's built-in server.
2. From this folder, run `C:\xampp\php\php.exe -S 127.0.0.1:8080 -t .`.
3. Open `http://127.0.0.1:8080`. The first API request creates the `trustify` database, tables, demo accounts, local indicators, and education articles.

Default database settings are `127.0.0.1:3306`, database `trustify`, user `root`, and an empty password, matching a standard local XAMPP setup. Override them with `TRUSTIFY_DB_HOST`, `TRUSTIFY_DB_PORT`, `TRUSTIFY_DB_NAME`, `TRUSTIFY_DB_USER`, and `TRUSTIFY_DB_PASS` environment variables. The MySQL account must be allowed to create the database and tables.

## Demo accounts

- Admin: `admin` / `admin123`
- User: `user` / `user123`

These are local test credentials. Change or remove them before exposing the app to a network.

## Included workflows

- Public checks for messages, Indonesian mobile numbers, bank accounts, and HTTP/HTTPS links.
- Registration, login, remember-me session cookie, logout, profile updates, and password changes.
- Per-user saved check history, filters, date range, pagination, detail, and deletion.
- User reports with optional JPG/PNG/WEBP/PDF evidence, up to 5 MB. Evidence is stored outside the webroot and downloaded through an owner/admin authorization check.
- Admin report review, verification notes, notifications, audit log, reputation records, article management, account role changes, account deactivation, and a live system-settings view.
- Education articles with search, category filter, and popular filter.
- Light/dark preference saved on the current device.

## Risk model and data boundaries

Message checks sum the strongest matching keyword weight per indicator category, add 12 points when a secret request is paired with urgency, and add 12 for a link. Scores are capped at 100. Phone and bank matches score `min(100, 20 + 15 × verified reports)`. URL checks combine verified-domain reputation, local URL indicators, IP-host detection, and unusually long/deep host structure. Scores map to low 0–29, medium 30–69, and high 70–100.

Phone, bank, and URL checks keep reputation status **Belum Ada Data** when there is no verified match, while still showing a separate local heuristic score. Phone and bank scores inspect repeated runs, long sequences, repeated pairs, and (for accounts) very low digit variety. These number-only scores are capped at 29 because number shape cannot establish fraud or identify an owner. URL scoring checks IP hosts, encoded international domains, login/reward wording, selected uncommon suffixes, unusually long/deep hosts, repeated hyphens, plain HTTP, redirect parameters, and common financial-brand names used on a different domain. Each rule family contributes once, and the total is capped at 100. The result explains which signals matched and their limitations. The application never fetches submitted URLs and has no external reputation API configured. A message result is a rule-based signal, not a machine-learning classification or a guarantee of safety.

Seeded phone, bank, URL, and message examples are simulations. The demo phone is `+6281200000099`, the demo bank record is `Bank Simulasi` / `000000123456`, and the reserved example domain is `login-hadiah.example`. UI labels distinguish demo records from real reports. A report affects reputation only after an admin verifies it.

## Security notes

Passwords use PHP `password_hash`; database operations use PDO prepared statements; mutating requests require a session CSRF token; cookies are HTTP-only and SameSite; and admin routes enforce a role check. Checks are rate-limited per session. Evidence MIME and size are validated server-side. This is a local development baseline, not a production security certification. Add HTTPS, a least-privilege database user, global rate limiting, backup/retention policy, and deployment hardening before public hosting.

Password reset email is not enabled because no mail transport is configured. The reset page explains this instead of pretending an email was sent. Configure a mail provider before enabling self-service reset in a deployed environment.

## External reputation adapters

AduanNomor, CekRekening, and Kredibel adapters are disabled until official provider endpoints are supplied and approved for use. Configure optional environment variables `TRUSTIFY_ADUANNOMOR_URL`, `TRUSTIFY_CEKREKENING_URL`, `TRUSTIFY_KREDIBEL_PHONE_URL`, `TRUSTIFY_KREDIBEL_BANK_URL`, `TRUSTIFY_EXTERNAL_API_KEY`, and `TRUSTIFY_EXTERNAL_TIMEOUT`. Internal database checks remain available as fallback. Keys are read only by the PHP backend and are never returned to the frontend.

## Schema

`schema.sql` defines users, checks, reports and evidence, reputation tables, risk indicators, articles, notifications, and admin audit logs. The app applies it idempotently at first connection.