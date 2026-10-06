# Woodhall Capital Visitor Management: design

- **Date:** 2026-10-06
- **Owner:** Aboderin Daniel
- **Status:** approved in brainstorming, awaiting written-spec review
- **Source brief:** `/Users/mac/Developer/woodhall/visitor-system-brief.md` (meeting notes, 2026-10-02)
- **Sister project:** `/Users/mac/Developer/woodhall/kyc` (stack, design language and structure are reused from it)

## 1. Goal

A custom web app at **`https://visitor.woodhallcap.com`** that replaces the Power Apps visitor booking system. Staff and reception book visitors, reception checks them in and out, security watches who is on site, IT sees statistics, and admins manage users and departments.

It must:

- have its own accounts (no Microsoft / Entra sign-in);
- include the **expected arrival time** field the meeting asked for;
- send email for bookings, arrivals, visitor invitations and account set-up;
- look and be structured like the KYC project, branded **Woodhall Capital**.

## 2. Decisions

| Topic | Decision |
|---|---|
| Build | New custom web app (not edits to the Power App) |
| Hosting | Bluehost shared hosting (box5735, where `visitor.woodhallcap.com` already resolves) |
| Stack | React 19 + TypeScript + Tailwind v4 + Vite front end built to static files; PHP 8 JSON API; MySQL (InnoDB, utf8mb4) |
| Auth | Own accounts, email + password, created by an admin by invitation |
| Approval | None. Bookings are confirmed immediately |
| Front desk vs reception | Same people, one **Reception** role |
| Visitor type | A label only. It does not change the form or workflow |
| Email transport | Microsoft Graph `sendMail` (app-only). woodhallcap.com mail is on Microsoft 365 and its SPF allows only Outlook to send |
| Timezone | WAT, `Africa/Lagos`, in PHP and in the MySQL session |
| Brand | Woodhall Capital (not Woodhall Finance) |

## 3. Roles and permissions

| Action | Staff | Reception | Security | IT | Admin |
|---|---|---|---|---|---|
| Book a visit | host = self only | any host | – | – | any host |
| See visits | own (host = self) | all | all, read-only | all, read-only | all |
| Edit or cancel a visit | own, while `booked` | any, while `booked` | – | – | any, while `booked` |
| Check in / check out | – | ✔ | – | – | – |
| Stats dashboard and CSV export | – | – | – | ✔ | ✔ |
| Manage users and departments | – | – | – | – | ✔ |

- **Reception is the only role that can check visitors in or out.** Admin cannot.
- Security's job is to see who is checked in and whether they have checked out.
- IT's job is management oversight through statistics and stat cards.
- Permissions are enforced in PHP. The UI hides what a role cannot use, but that is not a security control.

## 4. Visit lifecycle

```
booked ──check-in──▶ checked_in ──check-out──▶ checked_out
   │
   ├──cancel──▶ cancelled
   └──(visit_date passed, still booked)──▶ no_show
```

- Only `booked` visits can be edited or cancelled.
- Check-in is only allowed for `booked` visits dated today. Check-out is only allowed for `checked_in` visits.
- **No-show:** no cron dependency. The first API request of each day runs an idempotent update that sets `status = 'no_show'` where `status = 'booked' AND visit_date < CURDATE()`. Queries and stats treat that rule as the source of truth either way.
- **Overstay:** derived, not stored. It applies when the visit is `checked_in`, `expected_departure` is set, and the current WAT time is past `visit_date + expected_departure`.

## 5. Booking form

**Visitor**

| Field | Rule |
|---|---|
| Full name | required, 2–120 chars |
| Phone | required, digits with optional leading `+`, 7–20 chars after removing spaces and dashes |
| Email | optional, valid email. Needed for the invitation email |
| Company or organization | optional, ≤ 120 chars |
| Visitor type | required: `client`, `vendor`, `interviewee`, `contractor`, `guest` |

**Visit**

| Field | Rule |
|---|---|
| Host | required. Staff: themselves (not editable). Reception and admin: pick from active staff (`GET /hosts`) |
| Department | copied from the host's profile when the booking is made. Not entered by hand |
| Visit date | required, today or later |
| **Expected arrival time** | **required**, `HH:MM`, 24-hour, WAT. If the date is today, a walk-in may use any time today |
| Expected departure time | optional, `HH:MM`, must be after arrival |
| Purpose of visit | required, 3–255 chars |
| Accompanying people | optional integer 0–50, default 0 |

**Recorded by reception at check-in** (all optional): badge or tag number (≤ 30 chars), ID type (≤ 40), ID number (≤ 40). Check-in and check-out timestamps and the user are recorded automatically.

`lib/validator.php` is authoritative. `frontend/src/lib/validation.ts` mirrors it for inline feedback, as in KYC.

## 6. Data model (MySQL)

**`departments`**: `id`, `name` (unique), `active` (bool), `created_at`. Starts empty. Admins fill it from the CTO's list. No department names are hard-coded or seeded.

**`users`**: `id`, `full_name`, `email` (unique, login), `phone` (nullable), `role` ENUM(`staff`,`reception`,`security`,`it`,`admin`), `department_id` (nullable FK), `password_hash` (nullable until set; `password_hash()` bcrypt), `active` (bool), `last_login_at`, `created_at`, `updated_at`.

**`visits`**:

- **Visitor:** `visitor_name`, `visitor_phone`, `visitor_email` (nullable), `visitor_company` (nullable), `visitor_type` ENUM.
- **Booking:** `host_user_id` FK, `department_id` FK (nullable, copied from the host when booked), `booked_by_user_id` FK, `channel` ENUM(`staff`,`reception`).
- **Timing:** `visit_date` DATE, `expected_arrival` TIME, `expected_departure` TIME nullable.
- **Details:** `purpose`, `party_size` TINYINT default 0.
- **State:** `status` ENUM(`booked`,`checked_in`,`checked_out`,`cancelled`,`no_show`).
- **Check-in and check-out:** `checked_in_at`, `checked_in_by`, `checked_out_at`, `checked_out_by`, `badge_number`, `id_type`, `id_number`.
- **Cancellation:** `cancelled_at`, `cancelled_by`.
- **Timestamps:** `created_at`, `updated_at`.
- **Indexes:** (`visit_date`, `status`), (`host_user_id`), (`department_id`).

**`auth_tokens`**: `id`, `user_id` FK, `purpose` ENUM(`invite`,`reset`), `token_hash` (SHA-256 of a 32-byte random token; the raw token only appears in the email link), `expires_at` (invite 72 h, reset 1 h), `used_at`, `created_at`. Single use. Issuing a new token for the same user and purpose invalidates the old ones.

**`audit_log`**: `id`, `user_id` (nullable), `action` (for example `visit.create`, `visit.check_in`, `visit.check_out`, `visit.cancel`, `user.invite`, `user.disable`, `email.failed`), `entity`, `entity_id`, `details` JSON, `ip`, `created_at`.

**`login_attempts`**: `id`, `email`, `ip`, `created_at`. Five failed attempts for one email and IP pair within 15 minutes blocks that pair for 15 minutes. A successful login clears the pair.

Schema changes are numbered SQL files in `migrations/`, applied by `migrations/migrate.php`, which records them in a `schema_migrations` table.

## 7. API

A single entry point, `api/index.php`, with a small router. JSON in, JSON out. All routes need an authenticated session except those marked *public*. All writes (POST/PATCH) need the `X-CSRF-Token` header to match the session token.

| Method and path | Who | Purpose |
|---|---|---|
| `POST /auth/login` | public | email + password → session, returns user and CSRF token |
| `POST /auth/logout` | any | ends the session |
| `GET /auth/me` | any | current user, role and CSRF token |
| `POST /auth/forgot` | public | sends a reset email. Always returns 200 so it does not reveal which emails exist |
| `POST /auth/set-password` | public | token + new password (invite or reset) |
| `GET /visits?date_from&date_to&status&q` | per §3 | list, scoped by role |
| `POST /visits` | staff, reception, admin | create |
| `PATCH /visits/{id}` | per §3 | edit fields or `{status:"cancelled"}` |
| `POST /visits/{id}/check-in` | reception | `{badge_number?, id_type?, id_number?}` |
| `POST /visits/{id}/check-out` | reception | – |
| `GET /hosts` | reception, admin | active users for the host picker (id, name, department) |
| `GET /stats?from&to` | it, admin | stat cards and chart series (§8) |
| `GET /visits/export.csv?from&to` | it, admin | CSV of the visit log |
| `GET/POST/PATCH /users`, `POST /users/{id}/resend-invite` | admin | user management |
| `GET/POST/PATCH /departments` | admin (GET also for reception) | department management |

**Errors:** `{ "error": { "code": "validation_failed" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "server_error", "message": "...", "fields": { "field": "message" } } }` with status 422, 401, 403, 404, 409, 429 or 500. Unhandled exceptions are logged server-side and return a generic 500 with no stack trace.

**Sessions and security**

- PHP sessions with `Secure`, `HttpOnly` and `SameSite=Lax` cookies, and `session_regenerate_id(true)` at login.
- 8-hour idle timeout.
- PDO prepared statements only.
- Passwords need at least 10 characters.
- Disabling a user ends their next request.
- The first admin is created by `scripts/create-admin.php` (CLI only, refuses to run over HTTP).

## 8. Screens

The layout follows KYC. **Login, forgot password and set password** use the KYC two-column layout: the dark brand panel on the left and a white rounded form card on the right. **Signed-in screens** use a slim dark brand sidebar (white horizontal logo, faint tree-mark decoration, nav links for the role, user name and sign-out) with white rounded cards on the `bg` cream. Every screen must work at phone width (reception may use a tablet).

**Staff**
- *My visitors:* upcoming and past bookings, status pills, and cancel on `booked` visits.
- *Book a visitor:* the §5 form.

**Reception**
- *Today:* a board with three columns: **Expected** (`booked`, today), **On site** (`checked_in`), **Left** (`checked_out` today). It has search, and each card shows the name, host, expected arrival and type pill.
  - **Check in** opens a small panel for the optional badge and ID fields.
  - **Check out** is a single action.
  - Overstayed cards are flagged in copper.
- *Book walk-in:* the §5 form with a host picker. The date defaults to today and the arrival time to now.
- *All visits:* date-range search and list.

**Security** (read-only, auto-refreshes every 30 seconds)
- *On site now:* name, company, host, checked in at, badge number, and overstay flag.
- *Today's log:* every check-in and check-out today, in time order.
- *History:* date-range search.

**IT**
- *Dashboard* for a date range (default: last 30 days):
  - **Stat cards:** visitors today, on site now, visits in range, average visit length (checked-out visits), no-show rate.
  - **Charts:** visits per day, visits by visitor type, top departments, arrivals by hour of day.
- *Export:* CSV of the visit log for the range.

**Admin**
- *Users:* list, invite (name, email, phone, role, department), edit role and department, disable or enable, resend invite.
- *Departments:* add, rename, activate or deactivate.
- Admin also has every Reception screen except the check-in and check-out actions, plus the IT dashboard.

**Status pills:** booked = tan (`accent`), on site = brown (`primary`), overstayed = copper, checked out = grey, cancelled and no-show = muted grey with strikethrough or label.

Charts follow the brand palette. Use a small dependency only if hand-rolled SVG bars are not enough.

## 9. Email

`lib/mailer.php` exposes one function: `send(to, subject, html, text)`. The transport is chosen in config:

- **`graph`** (production): Microsoft Graph `POST /users/{sender}/sendMail` with an app-only token (client-credentials flow). It needs `tenant_id`, `client_id`, `client_secret` and `sender` (a mailbox or shared mailbox on woodhallcap.com) from `config.local.php`. The app registration needs the `Mail.Send` application permission, ideally limited to the sender mailbox with an Exchange application access policy. See `kyc/docs/email-setup-microsoft-365.md`.
- **`log`** (development and tests): writes the message to `storage/mail.log`.

| # | Email | To | When |
|---|---|---|---|
| 1 | Booking confirmation | host | a visit is created (by the host or by reception) |
| 2 | Visitor arrived | host | reception checks the visitor in |
| 3 | Visit invitation | visitor | a visit is created, only if `visitor_email` is set |
| 4 | Account invitation (set-password link) | new user | admin invites or resends |
| 5 | Password reset | user | `POST /auth/forgot` for an active user |

- Templates are branded HTML (Woodhall Capital logo and palette, like the KYC emails) with a plain-text alternative.
- The office address and contact details in the visitor invitation come from config, not code.
- **A failed send never fails the action.** The booking or check-in is saved, an `email.failed` audit entry is written, and the API response includes `warnings: ["email_failed"]` so the UI can say "Saved, but the email couldn't be sent."

## 10. Branding

The KYC token names are kept, so ported components work unchanged. Only the values change:

| Token | Value |
|---|---|
| `primary` | `#3c2219` (Woodhall Capital logo brown) |
| `primary-dark` | `#2a1711` |
| `accent` | `#d0c5b0` |
| `copper` / `copper-dark` | `#b48569` / `#8f6048` |
| `bg` / `bg-alt` / `cream` | `#f8f3f0` / `#efe8e1` / `#f6f5f2` |
| `ink` / `error` | `#161616` / `#b3261e` |
| `shadow-card` | `0 18px 50px rgba(60, 34, 25, 0.09)` |
| fonts | Work Sans (heading and body), as in KYC |
| `radius-brand` | 28px |

**Logos** are in `assets/logos/`, copied from the files provided:

- `woodhall-capital-stacked.svg` (brown): login card and emails.
- `woodhall-capital-stacked-white.svg`: brand panel.
- `woodhall-capital-horizontal-white.svg`: sidebar.

**Name in the UI:** "Woodhall Capital — Visitor Management". The favicon is the tree mark.

## 11. Project structure

```
visitor/
  frontend/                 React 19 + TS + Tailwind v4 + Vite
    src/components/         ported from KYC: BrandPanel, Button, Field, TextField, Pill, SectionHeading, icons…
                            new: Sidebar, StatCard, StatusPill, VisitCard, CheckInPanel, DataTable, BarChart
    src/pages/              auth/, staff/, reception/, security/, it/, admin/
    src/lib/                api.ts (fetch + CSRF + error mapping), validation.ts, format.ts, copy.ts, roles.ts
  api/index.php             router entry point
  lib/                      db.php, auth.php, csrf.php, validator.php, visits.php, users.php,
                            departments.php, stats.php, mailer.php, audit.php, templates/
  migrations/               001_init.sql …, migrate.php
  assets/logos/
  vendor/                   vendored only if needed (Graph is a plain cURL call, so PHPMailer is not required)
  storage/                  mail.log, error log (not web-accessible; denied by .htaccess)
  config.php                defaults, reads config.local.php (git-ignored) for DB and Graph secrets
  scripts/package.sh        builds the front end and assembles the Bluehost deploy zip
  scripts/create-admin.php
  tests/php/                custom assertion harness as in KYC, against a throwaway MySQL test DB
  .htaccess                 routes /api/* to api/index.php, everything else to the SPA's index.html
```

## 12. Testing

- **PHP** (custom harness, real MySQL test database):
  - validator rules;
  - the full permission matrix (every role against every action);
  - status transitions and the no-show sweep;
  - stats queries against seeded data;
  - token expiry and single use;
  - the login rate limit;
  - CSRF rejection;
  - the mailer through the `log` transport, including the failed-send warning path.
- **Front end** (Vitest + React Testing Library): validation mirroring, role-based navigation and route guards, the booking form, the check-in panel, and API error mapping.
- **Manual:** the main flows for each role, run in a browser against a local PHP + MySQL server before calling a milestone done. No automated end-to-end tests in v1.

## 13. Out of scope for v1

SMS, a self check-in kiosk, visitor photo capture, badge printing, data retention or purge, Microsoft sign-in, and multiple sites or offices.

## 14. Open items (do not invent answers)

| # | Item | From |
|---|---|---|
| 1 | List of departments | CTO |
| 2 | Email details: sender mailbox on woodhallcap.com, and an Entra app registration (tenant ID, client ID, secret) with `Mail.Send` | CTO / M365 admin |
| 3 | Office address and contact line shown in the visitor invitation | CTO |
| 4 | Data retention for visitor phone and ID numbers (NDPR) | CTO |
| 5 | MySQL database and user on Bluehost, and PHP version on box5735 | whoever holds the Bluehost account |
| 6 | Whether the old Power Apps data needs importing | CTO |
| 7 | Who gets the first admin account | CTO |
