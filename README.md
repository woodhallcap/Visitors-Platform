# Woodhall Capital — Visitor Management

Internal visitor booking and check-in for Woodhall Capital, served at `https://visitor.woodhallcap.com`.
Design: [`docs/superpowers/specs/2026-10-06-visitor-system-design.md`](docs/superpowers/specs/2026-10-06-visitor-system-design.md).

**Status:** sign-in, user management (IT and admins), departments (admins), booking (staff and reception walk-ins),
the reception Today board with check-in and check-out, and the security views (on site now, today's log, history) are
built. The IT dashboard and CSV export show "Coming soon". Email is deliberately not built yet; admins share one-time
set-password links instead.

## Tech stack

- **Front end:** React 19, TypeScript, Tailwind CSS v4, Vite, React Router (`frontend/`)
- **API:** plain PHP 8 (no Composer, no framework), JSON over `/api/*` (`api/index.php` → `lib/`)
- **Database:** MySQL 5.7+ / MariaDB 10.3+ (`migrations/`)
- **Tests:** Vitest + React Testing Library; a small custom PHP assertion harness

## Local development

Prerequisites: PHP 8.1+ with `pdo_mysql`, MySQL running locally (root, no password, or set `config.local.php`), Node 20+.

```bash
# 1. Database
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS woodhall_visitor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
php migrations/migrate.php

# 2. First IT account (prints a one-time set-password link); IT then invites the admins
php scripts/create-it-user.php --name="Your Name" --email="you@woodhallcap.com"

# 3. API on :8000
php -S localhost:8000 api/index.php

# 4. Front end on :5173 (proxies /api to :8000)
cd frontend && npm install && npm run dev
```

Open the link from step 2, set a password, then sign in at http://localhost:5173.

### Configuration

`config.php` holds defaults. Put real values in `config.local.php` (git-ignored), which returns an array merged
over them, e.g.:

```php
<?php
return [
    'db' => ['host' => 'localhost', 'name' => 'acct_visitor', 'user' => 'acct_visitor', 'pass' => '…'],
    'site_url' => 'https://visitor.woodhallcap.com',
    'cookie_secure' => true,
];
```

## Tests

```bash
tests/run.sh              # PHP: uses (and recreates) the woodhall_visitor_test database
cd frontend && npm test   # front end
```

## Accounts without email

IT controls accounts: only IT can create, edit or disable admin and IT accounts, so IT can appoint as many admins
as needed. Admins manage staff, reception and security accounts and the department list.

Until email is added (the last milestone), IT or an admin creates users on **Users → Invite user** and gets a
one-time link to send through Teams, WhatsApp or in person. Invite links last 72 hours, reset links 1 hour.
Forgotten passwords: IT or an admin clicks **Reset password** on that user (IT for admin and IT accounts).
