# Plan 1: Foundation, Auth and Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Woodhall Capital Visitor Management app where IT controls user accounts (including who is an admin), admins manage departments and everyday accounts, both hand out one-time set-password links, and every other role can sign in and see its (placeholder) navigation.

**Architecture:** A PHP 8 JSON API (`api/index.php` → `handle_request()` → a small `Router`) over MySQL via PDO, with PHP sessions + CSRF tokens for auth. Business logic lives in focused `lib/*.php` service files; route handlers live in `lib/routes/*.php`. `handle_request()` is a pure function of (method, path, body, query, headers, `$_SESSION`), so PHP tests drive the whole API in-process without a web server. The front end is a React 19 + TypeScript + Tailwind v4 + Vite SPA ported from the KYC project's design language, re-branded Woodhall Capital.

**Tech Stack:** PHP 8 (no Composer, no framework), MySQL (InnoDB, utf8mb4), React 19, TypeScript, Tailwind CSS v4, Vite, React Router 7, Vitest + React Testing Library, a custom PHP assertion harness (copied from KYC).

**Spec:** `docs/superpowers/specs/2026-10-06-visitor-system-design.md` (read it before starting; this plan covers spec §15 steps 1–3).

**Working directory for every command:** `/Users/mac/Developer/woodhall/visitor` unless a step says otherwise. Reference project (read-only): `/Users/mac/Developer/woodhall/kyc`.

**Later plans (not this one):** Plan 2 = booking + reception board + security views (§15 steps 4–6). Plan 3 = IT dashboard + CSV export + packaging/Bluehost deploy (§15 steps 7–8). Plan 4 = email (§15 step 9).

## Global Constraints

- **No email of any kind** in this plan: no mailer, templates, SMTP/Graph config, or mail tests (spec §9). Account set-up uses admin-generated set-password links.
- PHP syntax must stay within **PHP 8.1** (Bluehost's version is unconfirmed, spec §14 item 5): no readonly classes, DNF types, typed class constants, property hooks, `array_find`, etc. Readonly promoted properties and `never` are fine.
- SQL must run on **MySQL 5.7+ and MariaDB 10.3+**: no `CHECK` constraints, no expression defaults, no `JSON` column type (use `TEXT`).
- No Composer and no PHP dependencies. Nothing in `vendor/`.
- Timezone: PHP `date_default_timezone_set('Africa/Lagos')`; MySQL session `SET time_zone = '+01:00'` (WAT has no DST; named zones are often missing on shared hosting).
- Passwords: `password_hash(..., PASSWORD_DEFAULT)`; minimum 10 characters (`mb_strlen`), maximum 72 **bytes** (`strlen`).
- Set-password tokens: 32 random bytes, hex-encoded (64 chars); only `hash('sha256', $raw)` is stored; invite TTL 72 h, reset TTL 1 h; single use; issuing a new one for the same user + purpose invalidates older ones.
- Login rate limit: 5 failed attempts for one email + IP within 15 minutes → `429 rate_limited`; a successful login clears that pair.
- Session idle timeout: 8 hours. Cookies `HttpOnly`, `SameSite=Lax`, `Secure` when `cookie_secure` is true; `session_regenerate_id(true)` at login.
- Every POST/PATCH to a non-public route needs header `X-CSRF-Token` equal to the session token, else `403 csrf_failed`.
- API error envelope: `{"error": {"code": "...", "message": "...", "fields": {...}}}` (`fields` only when non-empty). Codes used: `validation_failed` 422, `unauthenticated` 401, `invalid_credentials` 401, `forbidden` 403, `csrf_failed` 403, `not_found` 404, `method_not_allowed` 405, `conflict` 409, `token_invalid` 422, `rate_limited` 429, `server_error` 500. (The spec's list plus four specific codes the UI needs to tell apart.)
- Brand: product name "Visitor Management", company "Woodhall Capital". Tokens: `primary #3c2219`, `primary-dark #2a1711`, `accent #d0c5b0`, `copper #b48569`, `copper-dark #8f6048`, `bg #f8f3f0`, `bg-alt #efe8e1`, `cream #f6f5f2`, `ink #161616`, `error #b3261e`, `radius-brand 28px`, `shadow-card 0 18px 50px rgba(60, 34, 25, 0.09)`, font Work Sans.
- **User management (spec §3):** IT and admins use the Users screen. Only IT may create, edit, disable or reset a user whose role is `admin` or `it`, or give anyone those roles; an admin attempting it gets `403 forbidden` "Only IT can manage admin and IT accounts." Nobody may change their own role or disable their own account (`409`). Departments are admin-only to change; `GET /departments` is open to admin, IT (all departments) and reception (active only).
- Front-end routes for user management are `/users` and `/departments` (not under `/admin`, since IT uses them too).
- Copy rule: the login page says exactly "Forgot your password? Ask an administrator to reset it."
- Commit messages: conventional style (`feat:`, `test:`, `docs:`…) and **no `Co-Authored-By` or other attribution trailers** (user preference).
- Local dev DB: MySQL at `127.0.0.1:3306`, user `root`, empty password (already running on this Mac). Tests use database `woodhall_visitor_test` and refuse any name not ending in `_test`.

## Review Focus

1. **Locking yourself out** — an IT user or admin disabling their own account or changing their own role. Expected: `409 conflict`, nothing changes. Tests in Task 6.
2. **Over-long or multibyte passwords** — bcrypt silently ignores bytes past 72, so a 100-character password would "work" with only its prefix. Expected: >72 bytes rejected with a field error; 10 multibyte characters accepted. Tests in Task 4 (PHP) and Task 7 (TS).
3. **A bad password burns the link** — submitting a too-short password on the set-password page must not consume the token. Expected: 422 field error, and the same link still works afterwards. Test in Task 4.
4. **Email case and whitespace** — `"  Ada@Example.COM "` must sign in as `ada@example.com`, and inviting `ADA@example.com` when `ada@example.com` exists must be a 422, not a 500 or a duplicate. Tests in Tasks 3 and 6.
5. **Stale sessions** — a user disabled by an admin mid-session, or idle for more than 8 hours, must get `401 unauthenticated` on their next request and the UI must return to sign-in. Tests in Task 3 (PHP) and Task 8 (UI listener).

---

## File map

```
visitor/
  config.php                      defaults + config.local.php merge + VISITOR_DB_NAME env override
  api/index.php                   web entry: session cookie, JSON in/out → handle_request()
  lib/bootstrap.php               requires every lib/*.php and lib/routes/*.php, sets timezone
  lib/config.php                  config(), config_override()
  lib/db.php                      db(), db_reset_connection(), db_all/one/exec/insert, is_duplicate_key()
  lib/migrations.php              migrate(PDO, dir): list<string>
  lib/http.php                    HttpError, Request, Response, request_headers()
  lib/router.php                  Router
  lib/app.php                     app_router(), handle_request()
  lib/validator.php               ROLES, clean_text(), normalize_email(), normalize_phone(), validate_password(), validate_user()
  lib/audit.php                   audit()
  lib/auth.php                    session_user(), require_user(), require_role(), csrf_token(), csrf_verify(), login rate limit
  lib/tokens.php                  token_issue(), token_consume(), set_password_link()
  lib/users.php                   user_find(), users_list(), user_create(), user_update(), user_reset_link()
  lib/departments.php             department_find(), departments_list(), department_create(), department_update()
  lib/routes/health.php           GET /health
  lib/routes/auth.php             /auth/*
  lib/routes/departments.php      /departments
  lib/routes/users.php            /users
  migrations/001_init.sql         full schema (spec §6)
  migrations/migrate.php          CLI runner
  scripts/create-it-user.php      CLI: first IT account + set-password link
  tests/run.sh                    runs every tests/php/test_*.php
  tests/php/test_helper.php       assertion harness (from KYC) + assert_status()
  tests/php/bootstrap.php         test DB lifecycle, db_test(), request()
  tests/php/fixtures.php          make_department(), make_user(), act_as()
  tests/php/test_*.php            one file per area
  assets/logos/                   existing logos + generated tree-mark SVGs
  frontend/                       Vite app (see Tasks 7–9)
  README.md
```

---

### Task 1: PHP foundation — config, database, migrations, test harness

**Files:**
- Create: `config.php`, `lib/bootstrap.php`, `lib/config.php`, `lib/db.php`, `lib/migrations.php`, `migrations/001_init.sql`, `migrations/migrate.php`, `tests/php/test_helper.php`, `tests/php/bootstrap.php`, `tests/run.sh`
- Test: `tests/php/test_migrations.php`

**Interfaces:**
- Produces: `config(?string $key = null): mixed` (dot keys, throws `RuntimeException("Missing config key: …")`), `config_override(array $values): void`, `db(): PDO`, `db_reset_connection(): void`, `db_all(string $sql, array $params = []): array`, `db_one(string $sql, array $params = []): ?array`, `db_exec(string $sql, array $params = []): int` (affected rows), `db_insert(string $sql, array $params = []): int` (insert id), `is_duplicate_key(PDOException $e): bool`, `migrate(PDO $pdo, string $dir): array` (names applied), constants `ROOT_DIR`, `MIGRATIONS_DIR`. Test harness: `test_case()`, `assert_true()`, `assert_equal()`, `test_summary()`, `db_test(string $name, callable $fn)` (resets tables first), `reset_tables()`.

- [ ] **Step 1: Write the config and loader**

`config.php`:

```php
<?php
declare(strict_types=1);

// Defaults for local development. Real values (DB credentials, site URL, cookie_secure) go in
// config.local.php, which is git-ignored and returns an array merged over these.
$config = [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'woodhall_visitor',
        'user' => 'root',
        'pass' => '',
    ],
    'site_url' => 'http://localhost:5173',
    'timezone' => 'Africa/Lagos',
    'session_idle_seconds' => 8 * 3600,
    'cookie_secure' => false,
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}

// Lets CLI tests point scripts at the test database. Web requests cannot set environment variables.
$dbName = getenv('VISITOR_DB_NAME');
if ($dbName !== false && $dbName !== '') {
    $config['db']['name'] = $dbName;
}

return $config;
```

`lib/config.php`:

```php
<?php
declare(strict_types=1);

function config(?string $key = null): mixed
{
    if (!isset($GLOBALS['__config'])) {
        $GLOBALS['__config'] = require ROOT_DIR . '/config.php';
    }
    if ($key === null) {
        return $GLOBALS['__config'];
    }
    $value = $GLOBALS['__config'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            throw new RuntimeException("Missing config key: {$key}");
        }
        $value = $value[$part];
    }
    return $value;
}

/** Tests only: merge values over the loaded config. */
function config_override(array $values): void
{
    $GLOBALS['__config'] = array_replace_recursive(config(), $values);
}
```

`lib/db.php`:

```php
<?php
declare(strict_types=1);

function db(): PDO
{
    if (!isset($GLOBALS['__db'])) {
        $c = config('db');
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['name']);
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Native prepares make mysqlnd return INT columns as PHP ints.
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        // WAT has no daylight saving, so a fixed offset is exact and needs no MySQL timezone tables.
        $pdo->exec("SET time_zone = '+01:00'");
        $GLOBALS['__db'] = $pdo;
    }
    return $GLOBALS['__db'];
}

function db_reset_connection(): void
{
    unset($GLOBALS['__db']);
}

function db_all(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function db_one(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/** Runs a write and returns the number of affected rows. */
function db_exec(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function db_insert(string $sql, array $params = []): int
{
    db_exec($sql, $params);
    return (int) db()->lastInsertId();
}

function is_duplicate_key(PDOException $e): bool
{
    return ($e->errorInfo[1] ?? null) === 1062;
}
```

`lib/migrations.php`:

```php
<?php
declare(strict_types=1);

/**
 * Applies every *.sql file in $dir not yet recorded in schema_migrations, in filename order.
 * Statements are split on ";" at end of line, so SQL files must not contain semicolons inside statements.
 *
 * @return list<string> the file names applied by this call
 */
function migrate(PDO $pdo, string $dir): array
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(190) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $done = $pdo->query('SELECT name FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);

    $files = glob(rtrim($dir, '/') . '/*.sql') ?: [];
    sort($files);
    $applied = [];
    foreach ($files as $file) {
        $name = basename($file);
        if (in_array($name, $done, true)) {
            continue;
        }
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
        foreach (preg_split('/;\s*(?:\R|$)/', $sql) as $statement) {
            if (trim($statement) !== '') {
                $pdo->exec($statement);
            }
        }
        $pdo->prepare('INSERT INTO schema_migrations (name) VALUES (?)')->execute([$name]);
        $applied[] = $name;
    }
    return $applied;
}
```

`lib/bootstrap.php`:

```php
<?php
declare(strict_types=1);

const ROOT_DIR = __DIR__ . '/..';
const MIGRATIONS_DIR = ROOT_DIR . '/migrations';

// Every lib file only declares functions, classes and constants, so load order does not matter.
foreach ([...glob(__DIR__ . '/*.php'), ...glob(__DIR__ . '/routes/*.php')] as $file) {
    if (realpath($file) !== realpath(__FILE__)) {
        require_once $file;
    }
}

date_default_timezone_set(config('timezone'));
```

- [ ] **Step 2: Write the schema**

`migrations/001_init.sql` (the whole spec §6 schema, including `visits`, so later plans add no tables):

```sql
-- Initial schema: spec §6. utf8mb4_unicode_ci makes the unique keys on names and emails case-insensitive.

CREATE TABLE departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NULL,
  role ENUM('staff','reception','security','it','admin') NOT NULL,
  department_id INT UNSIGNED NULL,
  password_hash VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE visits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  visitor_name VARCHAR(120) NOT NULL,
  visitor_phone VARCHAR(30) NOT NULL,
  visitor_email VARCHAR(190) NULL,
  visitor_company VARCHAR(120) NULL,
  visitor_type ENUM('client','vendor','interviewee','contractor','guest') NOT NULL,
  host_user_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NULL,
  booked_by_user_id INT UNSIGNED NOT NULL,
  channel ENUM('staff','reception') NOT NULL,
  visit_date DATE NOT NULL,
  expected_arrival TIME NOT NULL,
  expected_departure TIME NULL,
  purpose VARCHAR(255) NOT NULL,
  party_size TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('booked','checked_in','checked_out','cancelled','no_show') NOT NULL DEFAULT 'booked',
  checked_in_at DATETIME NULL,
  checked_in_by INT UNSIGNED NULL,
  checked_out_at DATETIME NULL,
  checked_out_by INT UNSIGNED NULL,
  badge_number VARCHAR(30) NULL,
  id_type VARCHAR(40) NULL,
  id_number VARCHAR(40) NULL,
  cancelled_at DATETIME NULL,
  cancelled_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_visits_date_status (visit_date, status),
  KEY idx_visits_host (host_user_id),
  KEY idx_visits_department (department_id),
  CONSTRAINT fk_visits_host FOREIGN KEY (host_user_id) REFERENCES users (id),
  CONSTRAINT fk_visits_department FOREIGN KEY (department_id) REFERENCES departments (id),
  CONSTRAINT fk_visits_booked_by FOREIGN KEY (booked_by_user_id) REFERENCES users (id),
  CONSTRAINT fk_visits_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES users (id),
  CONSTRAINT fk_visits_checked_out_by FOREIGN KEY (checked_out_by) REFERENCES users (id),
  CONSTRAINT fk_visits_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose ENUM('invite','reset') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_tokens_hash (token_hash),
  KEY idx_auth_tokens_user (user_id, purpose),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No foreign key on user_id: audit rows must outlive anything they mention.
CREATE TABLE audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NULL,
  details TEXT NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_attempts_lookup (email, ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`migrations/migrate.php`:

```php
<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$applied = migrate(db(), MIGRATIONS_DIR);
echo $applied ? 'Applied: ' . implode(', ', $applied) . "\n" : "Nothing to apply.\n";
```

- [ ] **Step 3: Write the test harness**

`tests/php/test_helper.php` (KYC's harness plus `assert_status`):

```php
<?php
declare(strict_types=1);

$GLOBALS['__test_count'] = 0;
$GLOBALS['__test_failures'] = 0;

function test_case(string $name, callable $fn): void
{
    $GLOBALS['__test_count']++;
    try {
        $fn();
        echo "PASS: {$name}\n";
    } catch (Throwable $e) {
        $GLOBALS['__test_failures']++;
        echo "FAIL: {$name} — {$e->getMessage()}\n";
    }
}

function assert_true($condition, string $message = 'Expected true'): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assert_equal($expected, $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        $expectedStr = var_export($expected, true);
        $actualStr = var_export($actual, true);
        throw new RuntimeException($message ?: "Expected {$expectedStr}, got {$actualStr}");
    }
}

/** $response is a Response (defined in lib/http.php from Task 2 on). */
function assert_status(int $expected, object $response): void
{
    if ($response->status !== $expected) {
        throw new RuntimeException("Expected HTTP {$expected}, got {$response->status}: " . json_encode($response->body));
    }
}

function test_summary(): void
{
    $count = $GLOBALS['__test_count'];
    $failures = $GLOBALS['__test_failures'];
    echo "\n{$count} tests, " . ($count - $failures) . " passed, {$failures} failed\n";
    if ($failures > 0) {
        exit(1);
    }
}
```

`tests/php/bootstrap.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/test_helper.php';
require dirname(__DIR__, 2) . '/lib/bootstrap.php';

config_override([
    'db' => ['name' => getenv('VISITOR_TEST_DB') ?: 'woodhall_visitor_test'],
    'site_url' => 'https://visitor.test',
]);
ini_set('error_log', sys_get_temp_dir() . '/woodhall-visitor-test-errors.log');

const TEST_TABLES = ['audit_log', 'auth_tokens', 'login_attempts', 'visits', 'users', 'departments'];

/** Drops and recreates the test database, then runs every migration. */
function test_db_setup(): void
{
    $c = config('db');
    if (!str_ends_with($c['name'], '_test')) {
        fwrite(STDERR, "Refusing to use database '{$c['name']}': test database names must end in _test.\n");
        exit(1);
    }
    $server = new PDO(
        sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['host'], $c['port']),
        $c['user'],
        $c['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $server->exec("DROP DATABASE IF EXISTS `{$c['name']}`");
    $server->exec("CREATE DATABASE `{$c['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    db_reset_connection();
    migrate(db(), MIGRATIONS_DIR);
}

function reset_tables(): void
{
    db()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (TEST_TABLES as $table) {
        db()->exec("TRUNCATE TABLE {$table}");
    }
    db()->exec('SET FOREIGN_KEY_CHECKS = 1');
    $_SESSION = [];
}

/** A test case that starts from empty tables and an empty session. */
function db_test(string $name, callable $fn): void
{
    test_case($name, function () use ($fn) {
        reset_tables();
        $fn();
    });
}

test_db_setup();
```

`tests/run.sh`:

```bash
#!/usr/bin/env bash
# Runs every PHP test file; exits non-zero if any file fails.
set -u
cd "$(dirname "$0")/.."
status=0
for file in tests/php/test_*.php; do
  [ "$file" = "tests/php/test_helper.php" ] && continue
  echo "== $file"
  php "$file" || status=1
done
exit $status
```

Run: `chmod +x tests/run.sh`

- [ ] **Step 4: Write the failing test**

`tests/php/test_migrations.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

test_case('migrations create every table', function () {
    $names = array_column(
        db_all('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()'),
        't'
    );
    foreach (['audit_log', 'auth_tokens', 'departments', 'login_attempts', 'schema_migrations', 'users', 'visits'] as $table) {
        assert_true(in_array($table, $names, true), "missing table {$table}");
    }
});

test_case('migrate is idempotent', function () {
    assert_equal([], migrate(db(), MIGRATIONS_DIR));
});

test_case('the database session runs in WAT', function () {
    assert_equal('+01:00', db_one('SELECT @@session.time_zone AS tz')['tz']);
});

test_case('PHP runs in Africa/Lagos', function () {
    assert_equal('Africa/Lagos', date_default_timezone_get());
});

test_case('config reads nested keys and names missing ones', function () {
    assert_equal('woodhall_visitor_test', config('db.name'));
    try {
        config('nope.missing');
        throw new LogicException('expected an exception');
    } catch (RuntimeException $e) {
        assert_true(str_contains($e->getMessage(), 'nope.missing'));
    }
});

db_test('unique keys ignore case', function () {
    db_exec("INSERT INTO departments (name) VALUES ('Finance')");
    try {
        db_exec("INSERT INTO departments (name) VALUES ('FINANCE')");
        throw new LogicException('expected a duplicate key error');
    } catch (PDOException $e) {
        assert_true(is_duplicate_key($e));
    }
});

test_summary();
```

- [ ] **Step 5: Run the tests**

Run: `php tests/php/test_migrations.php`
Expected: 6 PASS lines, then `6 tests, 6 passed, 0 failed`. (If MySQL is not running: `brew services start mysql`.)

If any test fails, fix the code from Steps 1–3; do not change the assertions.

- [ ] **Step 6: Commit**

```bash
git add config.php lib migrations tests
git commit -m "feat: PHP foundation with config, PDO helpers, schema migrations and test harness"
```

---

### Task 2: HTTP core — router, request/response, error envelope, web entry point

**Files:**
- Create: `lib/http.php`, `lib/router.php`, `lib/app.php`, `lib/routes/health.php`, `api/index.php`
- Test: `tests/php/test_http.php`

**Interfaces:**
- Consumes: `config()`, `db()` from Task 1.
- Produces:
  - `final class HttpError extends RuntimeException` with `public readonly int $status`, `public readonly string $errorCode`, `public readonly array $fields`; constructor `(int $status, string $errorCode, string $message, array $fields = [])`; statics `validation(array $fields)`, `unauthenticated()`, `forbidden()`, `notFound(string $message = 'Not found.')`, `conflict(string $message)`.
  - `final class Request` with readonly `method`, `path`, `params` (array<string,int>), `body` (array), `query` (array), `ip` (string).
  - `final class Response` with `public int $status`, `public array $body`.
  - `final class Router` with `add(string $method, string $pattern, callable $handler, array $options = []): void` (pattern placeholders `{name}` match digits and arrive as ints; option `public => true` skips auth/CSRF) and `match(string $method, string $path): ?array` returning `['handler' => callable, 'params' => array, 'options' => array]`, `null` if no path matches, throwing `HttpError(405)` if the path matches another method.
  - `app_router(): Router` (built once; each `lib/routes/*.php` exposes a `register_*_routes(Router $r): void`).
  - `handle_request(string $method, string $path, array $body = [], array $query = [], array $headers = [], string $ip = '', ?Router $router = null): Response`. `$path` may include `/api` and a query string; header names must be lower-case. Handlers are `callable(Request): array|Response` (an array means 200).
  - `request_headers(): array` (lower-cased names, works without `getallheaders()`).

- [ ] **Step 1: Write the failing test**

`tests/php/test_http.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

test_case('router extracts numeric params as ints', function () {
    $router = new Router();
    $router->add('PATCH', '/users/{id}', fn() => []);
    $match = $router->match('PATCH', '/users/42');
    assert_equal(['id' => 42], $match['params']);
});

test_case('router returns null for an unknown path', function () {
    $router = new Router();
    $router->add('GET', '/users/{id}', fn() => []);
    assert_equal(null, $router->match('GET', '/users/abc'));
    assert_equal(null, $router->match('GET', '/nope'));
});

test_case('router reports a known path with the wrong method as 405', function () {
    $router = new Router();
    $router->add('GET', '/departments', fn() => []);
    try {
        $router->match('DELETE', '/departments');
        throw new LogicException('expected HttpError');
    } catch (HttpError $e) {
        assert_equal(405, $e->status);
        assert_equal('method_not_allowed', $e->errorCode);
    }
});

test_case('GET /api/health answers 200', function () {
    $response = handle_request('GET', '/api/health');
    assert_status(200, $response);
    assert_equal(['ok' => true], $response->body);
});

test_case('the /api prefix, trailing slash and query string are ignored when routing', function () {
    assert_status(200, handle_request('GET', '/api/health/?x=1'));
    assert_status(200, handle_request('GET', '/health'));
});

test_case('an unknown route gets the not_found envelope', function () {
    $response = handle_request('GET', '/api/nope');
    assert_status(404, $response);
    assert_equal('not_found', $response->body['error']['code']);
    assert_true(!isset($response->body['error']['fields']), 'fields must be omitted when empty');
});

test_case('validation errors carry their fields', function () {
    $router = new Router();
    $router->add('POST', '/thing', function () {
        throw HttpError::validation(['name' => 'Enter a name.']);
    }, ['public' => true]);
    $response = handle_request('POST', '/thing', [], [], [], '', $router);
    assert_status(422, $response);
    assert_equal('validation_failed', $response->body['error']['code']);
    assert_equal(['name' => 'Enter a name.'], $response->body['error']['fields']);
});

test_case('an unexpected exception becomes a generic 500 without leaking details', function () {
    $router = new Router();
    $router->add('GET', '/boom', function () {
        throw new RuntimeException('SQLSTATE secret detail');
    }, ['public' => true]);
    $response = handle_request('GET', '/boom', [], [], [], '', $router);
    assert_status(500, $response);
    assert_equal('server_error', $response->body['error']['code']);
    assert_true(!str_contains(json_encode($response->body), 'secret'), 'internal message leaked');
});

test_case('handlers can return a Response with a custom status', function () {
    $router = new Router();
    $router->add('POST', '/made', fn(Request $r) => new Response(201, ['id' => 7]), ['public' => true]);
    $response = handle_request('POST', '/made', [], [], [], '', $router);
    assert_status(201, $response);
    assert_equal(['id' => 7], $response->body);
});

test_case('handlers receive body, query, params and ip', function () {
    $router = new Router();
    $router->add('POST', '/echo/{id}', fn(Request $r) => [
        'id' => $r->params['id'], 'body' => $r->body, 'query' => $r->query, 'ip' => $r->ip,
    ], ['public' => true]);
    $response = handle_request('POST', '/echo/5', ['a' => 1], ['q' => 'x'], [], '10.1.2.3', $router);
    assert_equal(['id' => 5, 'body' => ['a' => 1], 'query' => ['q' => 'x'], 'ip' => '10.1.2.3'], $response->body);
});

test_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/test_http.php`
Expected: fatal error `Class "Router" not found`.

- [ ] **Step 3: Implement**

`lib/http.php`:

```php
<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = [],
    ) {
        parent::__construct($message);
    }

    public static function validation(array $fields): self
    {
        return new self(422, 'validation_failed', 'Please correct the highlighted fields.', $fields);
    }

    public static function unauthenticated(): self
    {
        return new self(401, 'unauthenticated', 'Please sign in.');
    }

    public static function forbidden(): self
    {
        return new self(403, 'forbidden', "You don't have permission to do that.");
    }

    public static function notFound(string $message = 'Not found.'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function conflict(string $message): self
    {
        return new self(409, 'conflict', $message);
    }
}

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $params,
        public readonly array $body,
        public readonly array $query,
        public readonly string $ip,
    ) {
    }
}

final class Response
{
    public function __construct(public int $status, public array $body)
    {
    }
}

/** Request headers with lower-case names, including on servers without getallheaders(). */
function request_headers(): array
{
    if (function_exists('getallheaders')) {
        return array_change_key_case(getallheaders(), CASE_LOWER);
    }
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (str_starts_with($key, 'HTTP_')) {
            $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
        }
    }
    return $headers;
}
```

`lib/router.php`:

```php
<?php
declare(strict_types=1);

final class Router
{
    /** @var list<array{method: string, regex: string, handler: callable, options: array}> */
    private array $routes = [];

    /** Pattern placeholders like {id} match digits only and are passed to handlers as ints. */
    public function add(string $method, string $pattern, callable $handler, array $options = []): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', $pattern) . '$#';
        $this->routes[] = ['method' => $method, 'regex' => $regex, 'handler' => $handler, 'options' => $options];
    }

    public function match(string $method, string $path): ?array
    {
        $pathMatched = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $method) {
                continue;
            }
            $params = [];
            foreach ($m as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = (int) $value;
                }
            }
            return ['handler' => $route['handler'], 'params' => $params, 'options' => $route['options']];
        }
        if ($pathMatched) {
            throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
        }
        return null;
    }
}
```

`lib/routes/health.php`:

```php
<?php
declare(strict_types=1);

function register_health_routes(Router $r): void
{
    $r->add('GET', '/health', fn(Request $req) => ['ok' => true], ['public' => true]);
}
```

`lib/app.php`:

```php
<?php
declare(strict_types=1);

function app_router(): Router
{
    static $router = null;
    if ($router === null) {
        $router = new Router();
        register_health_routes($router);
    }
    return $router;
}

/**
 * Handles one API request. A pure function of its arguments and $_SESSION, so tests call it directly.
 * $headers must have lower-case names.
 */
function handle_request(
    string $method,
    string $path,
    array $body = [],
    array $query = [],
    array $headers = [],
    string $ip = '',
    ?Router $router = null,
): Response {
    $GLOBALS['__request_ip'] = $ip;
    try {
        $path = (string) parse_url($path, PHP_URL_PATH);
        $path = '/' . trim((string) preg_replace('#^/api(?=/|$)#', '', $path), '/');
        $route = ($router ?? app_router())->match($method, $path);
        if ($route === null) {
            throw HttpError::notFound();
        }
        $result = ($route['handler'])(new Request($method, $path, $route['params'], $body, $query, $ip));
        return $result instanceof Response ? $result : new Response(200, $result);
    } catch (HttpError $e) {
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->fields) {
            $error['fields'] = $e->fields;
        }
        return new Response($e->status, ['error' => $error]);
    } catch (Throwable $e) {
        error_log('[visitor] ' . $e);
        return new Response(500, ['error' => ['code' => 'server_error', 'message' => 'Something went wrong. Please try again.']]);
    }
}
```

`api/index.php`:

```php
<?php
declare(strict_types=1);

// Web entry point for /api/*. Locally: php -S localhost:8000 api/index.php
require dirname(__DIR__) . '/lib/bootstrap.php';

ini_set('session.use_strict_mode', '1');
session_name('wvsid');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => (bool) config('cookie_secure'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$raw = file_get_contents('php://input');
$decoded = $raw ? json_decode($raw, true) : null;

$response = handle_request(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $_SERVER['REQUEST_URI'] ?? '/',
    is_array($decoded) ? $decoded : [],
    $_GET,
    request_headers(),
    $_SERVER['REMOTE_ADDR'] ?? '',
);

http_response_code($response->status);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo json_encode($response->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `php tests/php/test_http.php && php tests/php/test_migrations.php`
Expected: `10 tests, 10 passed, 0 failed` and `6 tests, 6 passed, 0 failed`.

- [ ] **Step 5: Smoke-test the real entry point**

Run: `mysql -uroot -e "CREATE DATABASE IF NOT EXISTS woodhall_visitor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" && php migrations/migrate.php && (php -S localhost:8000 api/index.php >/dev/null 2>&1 & echo $! > /tmp/visitor-php.pid) && sleep 1 && curl -s localhost:8000/api/health; echo; curl -s -i localhost:8000/api/nope | head -1; kill "$(cat /tmp/visitor-php.pid)"`
Expected: `Applied: 001_init.sql` (or `Nothing to apply.`), then `{"ok":true}`, then `HTTP/1.1 404 Not Found`.

- [ ] **Step 6: Commit**

```bash
git add lib api tests
git commit -m "feat: JSON API core with router, error envelope and web entry point"
```

---

### Task 3: Sessions, sign-in, CSRF and login rate limiting

**Files:**
- Create: `lib/validator.php`, `lib/audit.php`, `lib/auth.php`, `lib/users.php`, `lib/routes/auth.php`, `tests/php/fixtures.php`
- Modify: `lib/app.php` (register auth routes; enforce auth + CSRF on non-public routes)
- Test: `tests/php/test_auth.php`

**Interfaces:**
- Consumes: Task 1 DB helpers; Task 2 `HttpError`, `Request`, `Response`, `Router`, `handle_request`.
- Produces:
  - `lib/validator.php`: `const ROLES = ['staff', 'reception', 'security', 'it', 'admin']`, `clean_text(mixed $v): string` (non-strings → `''`, trims, collapses whitespace), `normalize_email(mixed $v): string` (lower-case, trimmed; non-strings → `''`), `normalize_phone(string $v): ?string` (strips spaces and dashes; returns `null` unless `^\+?\d{7,20}$`), `validate_password(mixed $v): ?string` (error message or null).
  - `lib/audit.php`: `audit(?int $userId, string $action, string $entity, ?int $entityId, array $details = []): void`.
  - `lib/users.php`: `const USER_SELECT`, `user_row(array $row): array`, `user_find(int $id): ?array`. A user array has: `id` int, `full_name`, `email`, `phone` ?string, `role`, `department_id` ?int, `department_name` ?string, `active` bool, `has_password` bool, `last_login_at` ?string, `created_at` string.
  - `lib/auth.php`: `const DUMMY_PASSWORD_HASH`, `const LOGIN_MAX_FAILURES = 5`, `session_rotate(): void`, `session_user(): ?array`, `require_user(): array`, `require_role(string ...$roles): array`, `csrf_token(): string` (session key `csrf`), `csrf_verify(?string $header): void`, `login_is_blocked(string $email, string $ip): bool`, `login_record_failure(string $email, string $ip): void`, `login_clear_failures(string $email, string $ip): void`. Session keys: `user_id` (int), `last_seen` (unix time), `csrf` (hex).
  - Routes: `POST /auth/login` (public) → `{user, csrf_token}`; `POST /auth/logout` → `{ok: true}`; `GET /auth/me` → `{user, csrf_token}`.
  - Test fixtures: `const TEST_PASSWORD = 'correct horse battery'`, `make_department(string $name, bool $active = true): array` (`['id' => int, 'name' => string]`), `make_user(string $role = 'staff', array $o = []): array` (overrides: `full_name`, `email`, `phone`, `department_id`, `password` (null = no password yet), `active`; staff get a new department unless `department_id` is given), `act_as(array $user): void`, `request(string $method, string $path, array $body = [], array $query = [], ?array $headers = null): Response` (adds the session's CSRF header unless `$headers` is given; IP `10.0.0.1`).

- [ ] **Step 1: Write the fixtures**

`tests/php/fixtures.php`:

```php
<?php
declare(strict_types=1);

const TEST_PASSWORD = 'correct horse battery';
const TEST_IP = '10.0.0.1';

function make_department(string $name, bool $active = true): array
{
    $id = db_insert('INSERT INTO departments (name, active) VALUES (?, ?)', [$name, $active ? 1 : 0]);
    return ['id' => $id, 'name' => $name];
}

function make_user(string $role = 'staff', array $o = []): array
{
    static $n = 0;
    $n++;
    $departmentId = array_key_exists('department_id', $o)
        ? $o['department_id']
        : ($role === 'staff' ? make_department("Department {$n}")['id'] : null);
    $password = array_key_exists('password', $o) ? $o['password'] : TEST_PASSWORD;
    $id = db_insert(
        'INSERT INTO users (full_name, email, phone, role, department_id, password_hash, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            $o['full_name'] ?? "User {$n}",
            $o['email'] ?? "user{$n}@example.com",
            $o['phone'] ?? null,
            $role,
            $departmentId,
            // Cost 4 keeps the suite fast; production uses PASSWORD_DEFAULT's cost.
            $password === null ? null : password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]),
            ($o['active'] ?? true) ? 1 : 0,
        ]
    );
    return user_find($id);
}

function act_as(array $user): void
{
    $_SESSION = ['user_id' => $user['id'], 'last_seen' => time(), 'csrf' => bin2hex(random_bytes(32))];
}

function request(string $method, string $path, array $body = [], array $query = [], ?array $headers = null): Response
{
    $headers ??= isset($_SESSION['csrf']) ? ['x-csrf-token' => $_SESSION['csrf']] : [];
    return handle_request($method, $path, $body, $query, $headers, TEST_IP);
}
```

- [ ] **Step 2: Write the failing test**

`tests/php/test_auth.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

db_test('login with the right password starts a session', function () {
    $user = make_user('reception', ['email' => 'ada@example.com']);
    $response = request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => TEST_PASSWORD]);
    assert_status(200, $response);
    assert_equal($user['id'], $response->body['user']['id']);
    assert_equal('reception', $response->body['user']['role']);
    assert_true(!array_key_exists('password_hash', $response->body['user']), 'password hash leaked');
    assert_equal(64, strlen($response->body['csrf_token']));
    assert_equal($user['id'], $_SESSION['user_id']);
    assert_equal($response->body['csrf_token'], $_SESSION['csrf']);
    assert_true(user_find($user['id'])['last_login_at'] !== null, 'last_login_at not set');
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.login'")['n']);
});

db_test('login ignores case and surrounding spaces in the email', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    $response = request('POST', '/auth/login', ['email' => '  Ada@Example.COM ', 'password' => TEST_PASSWORD]);
    assert_status(200, $response);
});

db_test('a wrong password and an unknown email get the same 401', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    $wrong = request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => 'wrong password!']);
    $unknown = request('POST', '/auth/login', ['email' => 'who@example.com', 'password' => 'wrong password!']);
    assert_status(401, $wrong);
    assert_status(401, $unknown);
    assert_equal('invalid_credentials', $wrong->body['error']['code']);
    assert_equal($wrong->body, $unknown->body);
    assert_equal(2, db_one('SELECT COUNT(*) AS n FROM login_attempts')['n']);
    assert_true(!isset($_SESSION['user_id']), 'session started on failure');
});

db_test('an invited user without a password cannot sign in', function () {
    make_user('staff', ['email' => 'new@example.com', 'password' => null]);
    assert_status(401, request('POST', '/auth/login', ['email' => 'new@example.com', 'password' => TEST_PASSWORD]));
});

db_test('a disabled user cannot sign in', function () {
    make_user('staff', ['email' => 'gone@example.com', 'active' => false]);
    assert_status(401, request('POST', '/auth/login', ['email' => 'gone@example.com', 'password' => TEST_PASSWORD]));
});

db_test('empty credentials are a validation error', function () {
    $response = request('POST', '/auth/login', ['email' => '', 'password' => '']);
    assert_status(422, $response);
    assert_equal(['email' => 'Enter your email.', 'password' => 'Enter your password.'], $response->body['error']['fields']);
});

db_test('five failures in 15 minutes block the email and IP, even with the right password', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    for ($i = 0; $i < 5; $i++) {
        assert_status(401, request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => 'nope nope nope']));
    }
    $blocked = request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => TEST_PASSWORD]);
    assert_status(429, $blocked);
    assert_equal('rate_limited', $blocked->body['error']['code']);
});

db_test('failures older than 15 minutes do not count', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    for ($i = 0; $i < 5; $i++) {
        db_exec("INSERT INTO login_attempts (email, ip, created_at) VALUES ('ada@example.com', ?, NOW() - INTERVAL 16 MINUTE)", [TEST_IP]);
    }
    assert_status(200, request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => TEST_PASSWORD]));
});

db_test('a successful login clears earlier failures', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => 'nope nope nope']);
    request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => TEST_PASSWORD]);
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM login_attempts')['n']);
});

db_test('GET /auth/me needs a session', function () {
    $response = request('GET', '/auth/me');
    assert_status(401, $response);
    assert_equal('unauthenticated', $response->body['error']['code']);
});

db_test('GET /auth/me returns the signed-in user and CSRF token', function () {
    $user = make_user('security');
    act_as($user);
    $response = request('GET', '/auth/me');
    assert_status(200, $response);
    assert_equal($user['id'], $response->body['user']['id']);
    assert_equal($_SESSION['csrf'], $response->body['csrf_token']);
});

db_test('a session idle for more than 8 hours is ended', function () {
    act_as(make_user('staff'));
    $_SESSION['last_seen'] = time() - 8 * 3600 - 1;
    assert_status(401, request('GET', '/auth/me'));
    assert_equal([], $_SESSION);
});

db_test('a user disabled mid-session is signed out on the next request', function () {
    $user = make_user('reception');
    act_as($user);
    db_exec('UPDATE users SET active = 0 WHERE id = ?', [$user['id']]);
    assert_status(401, request('GET', '/auth/me'));
    assert_equal([], $_SESSION);
});

db_test('writes without the CSRF header are rejected', function () {
    act_as(make_user('staff'));
    $missing = request('POST', '/auth/logout', [], [], []);
    $wrong = request('POST', '/auth/logout', [], [], ['x-csrf-token' => str_repeat('0', 64)]);
    assert_status(403, $missing);
    assert_equal('csrf_failed', $missing->body['error']['code']);
    assert_status(403, $wrong);
    assert_true(isset($_SESSION['user_id']), 'rejected logout must not end the session');
});

db_test('logout ends the session', function () {
    act_as(make_user('staff'));
    assert_status(200, request('POST', '/auth/logout'));
    assert_true(!isset($_SESSION['user_id']));
    assert_status(401, request('GET', '/auth/me'));
});

test_case('normalize_phone accepts common formats and rejects junk', function () {
    assert_equal('+2348028297772', normalize_phone('+234 802-829-7772'));
    assert_equal('08028297772', normalize_phone('0802 829 7772'));
    assert_equal(null, normalize_phone('12345'));
    assert_equal(null, normalize_phone('080-CALL-NOW'));
});

test_summary();
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `php tests/php/test_auth.php`
Expected: fatal error `Call to undefined function user_find()`, or FAIL lines with 404s.

- [ ] **Step 4: Implement**

`lib/validator.php`:

```php
<?php
declare(strict_types=1);

const ROLES = ['staff', 'reception', 'security', 'it', 'admin'];

/** Trims and collapses runs of whitespace. Non-strings become ''. */
function clean_text(mixed $value): string
{
    return is_string($value) ? trim((string) preg_replace('/\s+/u', ' ', $value)) : '';
}

function normalize_email(mixed $value): string
{
    return is_string($value) ? strtolower(trim($value)) : '';
}

/** Strips spaces and dashes; returns null unless what is left is an optional + and 7–20 digits. */
function normalize_phone(string $value): ?string
{
    $stripped = str_replace([' ', '-'], '', trim($value));
    return preg_match('/^\+?\d{7,20}$/', $stripped) ? $stripped : null;
}

/** bcrypt ignores bytes past 72, so longer passwords are refused rather than silently truncated. */
function validate_password(mixed $value): ?string
{
    if (!is_string($value) || $value === '') {
        return 'Enter a password.';
    }
    if (mb_strlen($value) < 10) {
        return 'Use at least 10 characters.';
    }
    if (strlen($value) > 72) {
        return 'Use 72 characters or fewer.';
    }
    return null;
}
```

`lib/audit.php`:

```php
<?php
declare(strict_types=1);

function audit(?int $userId, string $action, string $entity, ?int $entityId, array $details = []): void
{
    db_exec(
        'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [
            $userId,
            $action,
            $entity,
            $entityId,
            $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
            ($GLOBALS['__request_ip'] ?? '') ?: null,
        ]
    );
}
```

`lib/users.php`:

```php
<?php
declare(strict_types=1);

const USER_SELECT = 'SELECT u.id, u.full_name, u.email, u.phone, u.role, u.department_id, d.name AS department_name,
        u.active, (u.password_hash IS NOT NULL) AS has_password, u.last_login_at, u.created_at
    FROM users u LEFT JOIN departments d ON d.id = u.department_id';

function user_row(array $row): array
{
    $row['active'] = (bool) $row['active'];
    $row['has_password'] = (bool) $row['has_password'];
    return $row;
}

function user_find(int $id): ?array
{
    $row = db_one(USER_SELECT . ' WHERE u.id = ?', [$id]);
    return $row === null ? null : user_row($row);
}
```

`lib/auth.php`:

```php
<?php
declare(strict_types=1);

// A real bcrypt hash of a throwaway string: verifying against it when the email is unknown keeps
// response times the same as for a wrong password.
const DUMMY_PASSWORD_HASH = '$2y$12$GtatOUV8rnNDZfPVSN6uVOh4LQuZKIkuGbE8vVopLRSKXhX0vWaDq';
const LOGIN_MAX_FAILURES = 5;

function session_rotate(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}

/** The signed-in, active user, or null. Ends idle and disabled sessions. */
function session_user(): ?array
{
    $id = $_SESSION['user_id'] ?? null;
    if (!is_int($id)) {
        return null;
    }
    if (time() - (int) ($_SESSION['last_seen'] ?? 0) > (int) config('session_idle_seconds')) {
        $_SESSION = [];
        return null;
    }
    $user = user_find($id);
    if ($user === null || !$user['active']) {
        $_SESSION = [];
        return null;
    }
    $_SESSION['last_seen'] = time();
    return $user;
}

function require_user(): array
{
    return session_user() ?? throw HttpError::unauthenticated();
}

function require_role(string ...$roles): array
{
    $user = require_user();
    if (!in_array($user['role'], $roles, true)) {
        throw HttpError::forbidden();
    }
    return $user;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_verify(?string $header): void
{
    $expected = $_SESSION['csrf'] ?? '';
    if (!is_string($header) || $expected === '' || !hash_equals($expected, $header)) {
        throw new HttpError(403, 'csrf_failed', 'Your session has expired. Refresh the page and try again.');
    }
}

function login_is_blocked(string $email, string $ip): bool
{
    $row = db_one(
        'SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND ip = ? AND created_at > NOW() - INTERVAL 15 MINUTE',
        [$email, $ip]
    );
    return $row['n'] >= LOGIN_MAX_FAILURES;
}

function login_record_failure(string $email, string $ip): void
{
    db_exec('INSERT INTO login_attempts (email, ip) VALUES (?, ?)', [$email, $ip]);
    db_exec('DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL 1 DAY');
}

function login_clear_failures(string $email, string $ip): void
{
    db_exec('DELETE FROM login_attempts WHERE email = ? AND ip = ?', [$email, $ip]);
}
```

`lib/routes/auth.php`:

```php
<?php
declare(strict_types=1);

function register_auth_routes(Router $r): void
{
    $r->add('POST', '/auth/login', 'auth_login', ['public' => true]);
    $r->add('POST', '/auth/logout', 'auth_logout');
    $r->add('GET', '/auth/me', 'auth_me');
}

function auth_login(Request $req): array
{
    $email = normalize_email($req->body['email'] ?? '');
    $password = $req->body['password'] ?? '';
    $password = is_string($password) ? $password : '';
    $fields = [];
    if ($email === '') {
        $fields['email'] = 'Enter your email.';
    }
    if ($password === '') {
        $fields['password'] = 'Enter your password.';
    }
    if ($fields) {
        throw HttpError::validation($fields);
    }
    if (login_is_blocked($email, $req->ip)) {
        throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again in 15 minutes.');
    }

    $row = db_one('SELECT id, password_hash, active FROM users WHERE email = ?', [$email]);
    $hash = $row['password_hash'] ?? null;
    $verified = password_verify($password, $hash ?? DUMMY_PASSWORD_HASH);
    if (!$verified || $hash === null || $row['active'] !== 1) {
        login_record_failure($email, $req->ip);
        throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    login_clear_failures($email, $req->ip);
    session_rotate();
    $_SESSION = ['user_id' => $row['id'], 'last_seen' => time()];
    db_exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$row['id']]);
    audit($row['id'], 'auth.login', 'user', $row['id']);
    return ['user' => user_find($row['id']), 'csrf_token' => csrf_token()];
}

function auth_logout(Request $req): array
{
    $_SESSION = [];
    session_rotate();
    return ['ok' => true];
}

function auth_me(Request $req): array
{
    return ['user' => require_user(), 'csrf_token' => csrf_token()];
}
```

Modify `lib/app.php`. Replace `app_router()` and the `try` block's routing section so the whole file reads:

```php
<?php
declare(strict_types=1);

function app_router(): Router
{
    static $router = null;
    if ($router === null) {
        $router = new Router();
        register_health_routes($router);
        register_auth_routes($router);
    }
    return $router;
}

/**
 * Handles one API request. A pure function of its arguments and $_SESSION, so tests call it directly.
 * $headers must have lower-case names. Non-public routes need a signed-in user, and their writes a CSRF token.
 */
function handle_request(
    string $method,
    string $path,
    array $body = [],
    array $query = [],
    array $headers = [],
    string $ip = '',
    ?Router $router = null,
): Response {
    $GLOBALS['__request_ip'] = $ip;
    try {
        $path = (string) parse_url($path, PHP_URL_PATH);
        $path = '/' . trim((string) preg_replace('#^/api(?=/|$)#', '', $path), '/');
        $route = ($router ?? app_router())->match($method, $path);
        if ($route === null) {
            throw HttpError::notFound();
        }
        if (!($route['options']['public'] ?? false)) {
            require_user();
            if ($method !== 'GET') {
                csrf_verify($headers['x-csrf-token'] ?? null);
            }
        }
        $result = ($route['handler'])(new Request($method, $path, $route['params'], $body, $query, $ip));
        return $result instanceof Response ? $result : new Response(200, $result);
    } catch (HttpError $e) {
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->fields) {
            $error['fields'] = $e->fields;
        }
        return new Response($e->status, ['error' => $error]);
    } catch (Throwable $e) {
        error_log('[visitor] ' . $e);
        return new Response(500, ['error' => ['code' => 'server_error', 'message' => 'Something went wrong. Please try again.']]);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `tests/run.sh`
Expected: every file ends `… 0 failed`; `test_auth.php` shows `16 tests, 16 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add lib tests
git commit -m "feat: session sign-in with CSRF protection, idle timeout and login rate limiting"
```

---

### Task 4: Set-password links and the first-IT-account CLI

**Files:**
- Create: `lib/tokens.php`, `scripts/create-it-user.php`
- Modify: `lib/routes/auth.php` (add `POST /auth/set-password`)
- Test: `tests/php/test_tokens.php`

**Interfaces:**
- Consumes: Task 3 `validate_password`, `audit`, `user_find`, fixtures.
- Produces:
  - `const TOKEN_TTL_SECONDS = ['invite' => 259200, 'reset' => 3600]`
  - `token_issue(int $userId, string $purpose): array` → `['token' => string (64 hex), 'expires_at' => 'Y-m-d H:i:s']`
  - `token_consume(string $raw): ?array` → `['id' => int, 'user_id' => int, 'purpose' => string]` or null (malformed, unknown, used, expired, or user inactive). Single use even under a race.
  - `set_password_link(int $userId, string $purpose): array` → `['set_password_url' => string, 'expires_at' => string, 'purpose' => string]`; the URL is `rtrim(config('site_url'), '/') . '/set-password?token=' . $token`.
  - Route `POST /auth/set-password` (public), body `{token, password}` → `{ok: true}`; 422 `validation_failed` with `fields.password` (token not consumed), 422 `token_invalid`.
  - CLI `php scripts/create-it-user.php --name="…" --email="…"`: prints the link, exits 0; exits 1 with a message for missing arguments or invalid input. (In Task 4 it inserts the user directly; Task 6 switches it to `user_create()`.)

- [ ] **Step 1: Write the failing test**

`tests/php/test_tokens.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

db_test('token_issue stores only a hash and sets the right expiry', function () {
    $user = make_user('staff', ['password' => null]);
    $invite = token_issue($user['id'], 'invite');
    assert_true((bool) preg_match('/^[0-9a-f]{64}$/', $invite['token']), 'token must be 64 hex chars');
    $row = db_one('SELECT token_hash, expires_at FROM auth_tokens WHERE user_id = ?', [$user['id']]);
    assert_equal(hash('sha256', $invite['token']), $row['token_hash']);
    assert_true($row['token_hash'] !== $invite['token'], 'raw token stored');
    assert_true(abs(strtotime($row['expires_at']) - (time() + 72 * 3600)) < 5, 'invite should last 72 hours');
    $reset = token_issue($user['id'], 'reset');
    assert_true(abs(strtotime($reset['expires_at']) - (time() + 3600)) < 5, 'reset should last 1 hour');
});

db_test('a token works once', function () {
    $user = make_user('staff', ['password' => null]);
    $token = token_issue($user['id'], 'invite')['token'];
    $first = token_consume($token);
    assert_equal($user['id'], $first['user_id']);
    assert_equal('invite', $first['purpose']);
    assert_equal(null, token_consume($token));
});

db_test('expired, malformed and unknown tokens are refused', function () {
    $user = make_user('staff');
    $token = token_issue($user['id'], 'reset')['token'];
    db_exec('UPDATE auth_tokens SET expires_at = NOW() - INTERVAL 1 SECOND');
    assert_equal(null, token_consume($token));
    assert_equal(null, token_consume('not-a-token'));
    assert_equal(null, token_consume(str_repeat('a', 64)));
});

db_test('a disabled user cannot use a token', function () {
    $user = make_user('staff', ['active' => false]);
    $token = token_issue($user['id'], 'reset')['token'];
    assert_equal(null, token_consume($token));
});

db_test('issuing a new token cancels the previous one for the same purpose', function () {
    $user = make_user('staff', ['password' => null]);
    $old = token_issue($user['id'], 'invite')['token'];
    $new = token_issue($user['id'], 'invite')['token'];
    assert_equal(null, token_consume($old));
    assert_true(token_consume($new) !== null);
});

db_test('set_password_link builds the URL from site_url', function () {
    $user = make_user('staff', ['password' => null]);
    $link = set_password_link($user['id'], 'invite');
    assert_true(str_starts_with($link['set_password_url'], 'https://visitor.test/set-password?token='));
    assert_equal('invite', $link['purpose']);
});

db_test('POST /auth/set-password sets the password so the user can sign in', function () {
    $user = make_user('staff', ['email' => 'new@example.com', 'password' => null]);
    $token = token_issue($user['id'], 'invite')['token'];
    $response = request('POST', '/auth/set-password', ['token' => $token, 'password' => 'a brand new pass']);
    assert_status(200, $response);
    assert_status(200, request('POST', '/auth/login', ['email' => 'new@example.com', 'password' => 'a brand new pass']));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.set_password'")['n']);
});

db_test('a too-short password is refused and does not use up the link', function () {
    $user = make_user('staff', ['password' => null]);
    $token = token_issue($user['id'], 'invite')['token'];
    $short = request('POST', '/auth/set-password', ['token' => $token, 'password' => 'short']);
    assert_status(422, $short);
    assert_equal('Use at least 10 characters.', $short->body['error']['fields']['password']);
    assert_status(200, request('POST', '/auth/set-password', ['token' => $token, 'password' => 'long enough now']));
});

db_test('passwords over 72 bytes are refused; 10 multibyte characters are fine', function () {
    $user = make_user('staff', ['password' => null]);
    $token = token_issue($user['id'], 'invite')['token'];
    $long = request('POST', '/auth/set-password', ['token' => $token, 'password' => str_repeat('a', 73)]);
    assert_status(422, $long);
    assert_equal('Use 72 characters or fewer.', $long->body['error']['fields']['password']);
    assert_status(200, request('POST', '/auth/set-password', ['token' => $token, 'password' => str_repeat('é', 10)]));
});

db_test('a used or bogus link gets token_invalid', function () {
    $response = request('POST', '/auth/set-password', ['token' => str_repeat('b', 64), 'password' => 'long enough now']);
    assert_status(422, $response);
    assert_equal('token_invalid', $response->body['error']['code']);
});

db_test('create-it-user CLI creates an IT account and prints a set-password link', function () {
    $cmd = 'VISITOR_DB_NAME=' . escapeshellarg(config('db.name')) . ' php ' . escapeshellarg(ROOT_DIR . '/scripts/create-it-user.php')
        . ' --name=' . escapeshellarg('Ife Eze') . ' --email=' . escapeshellarg('Ife@Example.com') . ' 2>&1; echo "EXIT:$?"';
    $out = (string) shell_exec($cmd);
    assert_true(str_contains($out, 'EXIT:0'), $out);
    assert_true(str_contains($out, '/set-password?token='), $out);
    $row = db_one("SELECT role, password_hash FROM users WHERE email = 'ife@example.com'");
    assert_equal('it', $row['role']);
    assert_equal(null, $row['password_hash']);
});

db_test('create-it-user CLI fails cleanly without arguments', function () {
    $out = (string) shell_exec('VISITOR_DB_NAME=' . escapeshellarg(config('db.name')) . ' php ' . escapeshellarg(ROOT_DIR . '/scripts/create-it-user.php') . ' 2>&1; echo "EXIT:$?"');
    assert_true(str_contains($out, 'EXIT:1'), $out);
    assert_true(str_contains($out, 'Usage'), $out);
});

test_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/test_tokens.php`
Expected: fatal error `Call to undefined function token_issue()`.

- [ ] **Step 3: Implement**

`lib/tokens.php`:

```php
<?php
declare(strict_types=1);

const TOKEN_TTL_SECONDS = ['invite' => 72 * 3600, 'reset' => 3600];

/** @return array{token: string, expires_at: string} the raw token is never stored */
function token_issue(int $userId, string $purpose): array
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', time() + TOKEN_TTL_SECONDS[$purpose]);
    db_exec('UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [$userId, $purpose]);
    db_exec(
        'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        [$userId, $purpose, hash('sha256', $token), $expiresAt]
    );
    return ['token' => $token, 'expires_at' => $expiresAt];
}

/** Marks a valid token used and returns it, or null. The conditional UPDATE makes it single-use under races. */
function token_consume(string $raw): ?array
{
    if (!preg_match('/^[0-9a-f]{64}$/', $raw)) {
        return null;
    }
    $row = db_one(
        'SELECT t.id, t.user_id, t.purpose FROM auth_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW() AND u.active = 1',
        [hash('sha256', $raw)]
    );
    if ($row === null) {
        return null;
    }
    $claimed = db_exec('UPDATE auth_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [$row['id']]);
    return $claimed === 1 ? $row : null;
}

function set_password_link(int $userId, string $purpose): array
{
    $issued = token_issue($userId, $purpose);
    return [
        'set_password_url' => rtrim((string) config('site_url'), '/') . '/set-password?token=' . $issued['token'],
        'expires_at' => $issued['expires_at'],
        'purpose' => $purpose,
    ];
}
```

In `lib/routes/auth.php`, add this line inside `register_auth_routes()`:

```php
    $r->add('POST', '/auth/set-password', 'auth_set_password', ['public' => true]);
```

and add this function at the end of the file:

```php
function auth_set_password(Request $req): array
{
    // Validate first: a typo in the password must not use up the link.
    $password = $req->body['password'] ?? '';
    $error = validate_password($password);
    if ($error !== null) {
        throw HttpError::validation(['password' => $error]);
    }
    $token = token_consume(is_string($req->body['token'] ?? null) ? $req->body['token'] : '');
    if ($token === null) {
        throw new HttpError(422, 'token_invalid', 'This link has expired or has already been used. Ask an administrator for a new one.');
    }
    db_exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $token['user_id']]);
    audit($token['user_id'], 'auth.set_password', 'user', $token['user_id'], ['purpose' => $token['purpose']]);
    return ['ok' => true];
}
```

`scripts/create-it-user.php`:

```php
<?php
declare(strict_types=1);

// Creates an IT account (IT then invites admins and everyone else) and prints a one-time set-password link. CLI only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$opts = getopt('', ['name:', 'email:']);
if (empty($opts['name']) || empty($opts['email'])) {
    fwrite(STDERR, "Usage: php scripts/create-it-user.php --name=\"Full Name\" --email=\"person@woodhallcap.com\"\n");
    exit(1);
}

$name = clean_text($opts['name']);
$email = normalize_email($opts['email']);
if (mb_strlen($name) < 2 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "Enter a full name and a valid email address.\n");
    exit(1);
}
try {
    $id = db_insert("INSERT INTO users (full_name, email, role) VALUES (?, ?, 'it')", [$name, $email]);
} catch (PDOException $e) {
    fwrite(STDERR, is_duplicate_key($e) ? "A user with this email already exists.\n" : $e->getMessage() . "\n");
    exit(1);
}
audit(null, 'user.invite', 'user', $id, ['role' => 'it', 'via' => 'cli']);
$link = set_password_link($id, 'invite');

echo "IT account created: {$name} <{$email}>\n";
echo "Open this link before {$link['expires_at']} (WAT) to set the password:\n{$link['set_password_url']}\n";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tests/run.sh`
Expected: every file ends `… 0 failed`; `test_tokens.php` shows `12 tests, 12 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add lib scripts tests
git commit -m "feat: one-time set-password links and a CLI to create the first IT account"
```

---

### Task 5: Departments API

**Files:**
- Create: `lib/departments.php`, `lib/routes/departments.php`
- Modify: `lib/app.php` (add `register_department_routes($router);` after `register_auth_routes($router);`)
- Test: `tests/php/test_departments.php`

**Interfaces:**
- Consumes: `require_role`, `audit`, `clean_text`, DB helpers, fixtures.
- Produces:
  - A department array: `['id' => int, 'name' => string, 'active' => bool, 'user_count' => int]`.
  - `department_find(int $id): ?array`, `departments_list(bool $includeInactive): array` (ordered by name), `department_create(array $input, array $actor): array`, `department_update(int $id, array $input, array $actor): array` (input keys `name`, `active`; others ignored).
  - Routes: `GET /departments` (admin and IT: all; reception: active only; others 403) → `{departments: [...]}`; `POST /departments` (admin) → 201 `{department}`; `PATCH /departments/{id}` (admin) → `{department}`.
  - Error messages: `name` → `'Enter a department name (2–120 characters).'` / `'A department with this name already exists.'`; `active` → `'Invalid value.'`; missing → 404 `'Department not found.'`.

- [ ] **Step 1: Write the failing test**

`tests/php/test_departments.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

db_test('only admin, IT and reception can list departments', function () {
    foreach (['staff', 'security'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/departments'));
    }
});

db_test('admin and IT see every department with user counts; reception sees active ones', function () {
    $finance = make_department('Finance');
    make_department('Legal', false);
    make_user('staff', ['department_id' => $finance['id']]);
    make_user('staff', ['department_id' => $finance['id']]);

    act_as(make_user('admin'));
    $all = request('GET', '/departments')->body['departments'];
    assert_equal(['Finance', 'Legal'], array_column($all, 'name'));
    assert_equal(['id' => $finance['id'], 'name' => 'Finance', 'active' => true, 'user_count' => 2], $all[0]);
    assert_equal(false, $all[1]['active']);

    act_as(make_user('it'));
    assert_equal(['Finance', 'Legal'], array_column(request('GET', '/departments')->body['departments'], 'name'));

    act_as(make_user('reception'));
    assert_equal(['Finance'], array_column(request('GET', '/departments')->body['departments'], 'name'));
});

db_test('only admin can create or change departments', function () {
    $dept = make_department('Finance');
    foreach (['staff', 'reception', 'security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('POST', '/departments', ['name' => 'New']));
        assert_status(403, request('PATCH', "/departments/{$dept['id']}", ['name' => 'X']));
    }
});

db_test('admin creates a department with a tidied name', function () {
    $admin = make_user('admin');
    act_as($admin);
    $response = request('POST', '/departments', ['name' => "  Human   Resources "]);
    assert_status(201, $response);
    assert_equal('Human Resources', $response->body['department']['name']);
    assert_equal(true, $response->body['department']['active']);
    assert_equal(0, $response->body['department']['user_count']);
    $audit = db_one("SELECT user_id, entity_id FROM audit_log WHERE action = 'department.create'");
    assert_equal($admin['id'], $audit['user_id']);
    assert_equal($response->body['department']['id'], $audit['entity_id']);
});

db_test('department names must be 2–120 characters', function () {
    act_as(make_user('admin'));
    foreach (['', 'A', str_repeat('x', 121), ['array']] as $bad) {
        $response = request('POST', '/departments', ['name' => $bad]);
        assert_status(422, $response);
        assert_equal('Enter a department name (2–120 characters).', $response->body['error']['fields']['name']);
    }
});

db_test('a duplicate name in any case is a validation error, not a crash', function () {
    make_department('Finance');
    act_as(make_user('admin'));
    $response = request('POST', '/departments', ['name' => 'FINANCE']);
    assert_status(422, $response);
    assert_equal('A department with this name already exists.', $response->body['error']['fields']['name']);
});

db_test('admin renames and deactivates a department', function () {
    $dept = make_department('Finanse');
    make_department('Legal');
    act_as(make_user('admin'));
    $renamed = request('PATCH', "/departments/{$dept['id']}", ['name' => 'Finance']);
    assert_status(200, $renamed);
    assert_equal('Finance', $renamed->body['department']['name']);
    $off = request('PATCH', "/departments/{$dept['id']}", ['active' => false]);
    assert_equal(false, $off->body['department']['active']);
    assert_status(422, request('PATCH', "/departments/{$dept['id']}", ['name' => 'legal']));
    assert_status(422, request('PATCH', "/departments/{$dept['id']}", ['active' => 'no']));
    assert_equal(2, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'department.update'")['n']);
});

db_test('patching a missing department is a 404', function () {
    act_as(make_user('admin'));
    $response = request('PATCH', '/departments/999', ['name' => 'Nope']);
    assert_status(404, $response);
    assert_equal('Department not found.', $response->body['error']['message']);
});

test_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/test_departments.php`
Expected: FAIL lines (404 instead of 403/200/201).

- [ ] **Step 3: Implement**

`lib/departments.php`:

```php
<?php
declare(strict_types=1);

const DEPARTMENT_SELECT = 'SELECT d.id, d.name, d.active, COUNT(u.id) AS user_count
    FROM departments d LEFT JOIN users u ON u.department_id = d.id';

function department_row(array $row): array
{
    return ['id' => $row['id'], 'name' => $row['name'], 'active' => (bool) $row['active'], 'user_count' => (int) $row['user_count']];
}

function department_find(int $id): ?array
{
    $row = db_one(DEPARTMENT_SELECT . ' WHERE d.id = ? GROUP BY d.id, d.name, d.active', [$id]);
    return $row === null ? null : department_row($row);
}

function departments_list(bool $includeInactive): array
{
    $where = $includeInactive ? '' : ' WHERE d.active = 1';
    return array_map('department_row', db_all(DEPARTMENT_SELECT . $where . ' GROUP BY d.id, d.name, d.active ORDER BY d.name'));
}

function validate_department_name(mixed $value): string
{
    $name = clean_text($value);
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        throw HttpError::validation(['name' => 'Enter a department name (2–120 characters).']);
    }
    return $name;
}

function department_create(array $input, array $actor): array
{
    $name = validate_department_name($input['name'] ?? '');
    try {
        $id = db_insert('INSERT INTO departments (name) VALUES (?)', [$name]);
    } catch (PDOException $e) {
        if (is_duplicate_key($e)) {
            throw HttpError::validation(['name' => 'A department with this name already exists.']);
        }
        throw $e;
    }
    audit($actor['id'], 'department.create', 'department', $id, ['name' => $name]);
    return department_find($id);
}

function department_update(int $id, array $input, array $actor): array
{
    if (department_find($id) === null) {
        throw HttpError::notFound('Department not found.');
    }
    $changes = [];
    if (array_key_exists('name', $input)) {
        $changes['name'] = validate_department_name($input['name']);
    }
    if (array_key_exists('active', $input)) {
        if (!is_bool($input['active'])) {
            throw HttpError::validation(['active' => 'Invalid value.']);
        }
        $changes['active'] = $input['active'] ? 1 : 0;
    }
    if ($changes) {
        $sets = implode(', ', array_map(fn(string $column) => "{$column} = ?", array_keys($changes)));
        try {
            db_exec("UPDATE departments SET {$sets} WHERE id = ?", [...array_values($changes), $id]);
        } catch (PDOException $e) {
            if (is_duplicate_key($e)) {
                throw HttpError::validation(['name' => 'A department with this name already exists.']);
            }
            throw $e;
        }
        audit($actor['id'], 'department.update', 'department', $id, $changes);
    }
    return department_find($id);
}
```

`lib/routes/departments.php`:

```php
<?php
declare(strict_types=1);

function register_department_routes(Router $r): void
{
    $r->add('GET', '/departments', function (Request $req) {
        $user = require_role('admin', 'it', 'reception');
        return ['departments' => departments_list($user['role'] !== 'reception')];
    });
    $r->add('POST', '/departments', function (Request $req) {
        $actor = require_role('admin');
        return new Response(201, ['department' => department_create($req->body, $actor)]);
    });
    $r->add('PATCH', '/departments/{id}', function (Request $req) {
        $actor = require_role('admin');
        return ['department' => department_update($req->params['id'], $req->body, $actor)];
    });
}
```

In `lib/app.php`, inside `app_router()`, add after `register_auth_routes($router);`:

```php
        register_department_routes($router);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tests/run.sh`
Expected: every file ends `… 0 failed`; `test_departments.php` shows `8 tests, 8 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat: departments API for admins, read access for IT and reception"
```

---

### Task 6: Users API — invite, edit, disable, reset link (IT and admins)

**Files:**
- Modify: `lib/users.php` (add list/create/update/reset-link), `lib/validator.php` (add `validate_user`), `lib/app.php` (register user routes), `scripts/create-it-user.php` (use `user_create`)
- Create: `lib/routes/users.php`
- Test: `tests/php/test_users.php`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:
  - `validate_user(array $input): array` → `['full_name', 'email', 'phone' (?string, normalized), 'role', 'department_id' (?int), 'active' (bool)]` or throws validation. Messages: `full_name` `'Enter a full name (2–120 characters).'`; `email` `'Enter a valid email address.'`; `phone` `'Enter a valid phone number.'`; `role` `'Choose a role.'`; `department_id` `'Choose a department.'` (wrong type, unknown or inactive) / `'Staff need a department.'`; `active` `'Invalid value.'`.
  - `const PRIVILEGED_ROLES = ['admin', 'it']`; `assert_can_manage(array $actor, string ...$roles): void` (throws `HttpError(403, 'forbidden', 'Only IT can manage admin and IT accounts.')` when the actor is not IT and any of `$roles` is privileged).
  - `users_list(): array` (ordered by full name), `user_create(array $input, ?array $actor): array` (a user; `$actor` null = CLI, which may create any role), `user_update(int $id, array $input, array $actor): array`, `user_reset_link(int $id, array $actor): array` (a link array, from `set_password_link`).
  - Routes (IT and admin only; others 403): `GET /users` → `{users}`; `POST /users` → 201 `{user, link}` (link purpose `invite`); `PATCH /users/{id}` (keys `full_name`, `email`, `phone`, `role`, `department_id`, `active`) → `{user}`; `POST /users/{id}/reset-link` → `{link}` (purpose `invite` if the user has no password yet, else `reset`).
  - Conflicts (409): `"You can't change your own role or disable your own account."`, `'Enable this user before creating a set-password link.'`. 404: `'User not found.'`. Duplicate email: 422 `email` `'A user with this email already exists.'`.
  - Audit actions: `user.invite`, `user.update`, `user.disable`, `user.enable`, `user.reset_link`.

- [ ] **Step 1: Write the failing test**

`tests/php/test_users.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

db_test('users routes are for IT and admins only', function () {
    $target = make_user('staff');
    foreach (['staff', 'reception', 'security'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/users'));
        assert_status(403, request('POST', '/users', ['full_name' => 'X Y', 'email' => 'x@example.com', 'role' => 'security']));
        assert_status(403, request('PATCH', "/users/{$target['id']}", ['full_name' => 'Changed']));
        assert_status(403, request('POST', "/users/{$target['id']}/reset-link"));
    }
    assert_equal($target['full_name'], user_find($target['id'])['full_name']);
});

db_test('admin and IT list users with department names, sorted by name', function () {
    $finance = make_department('Finance');
    make_user('staff', ['full_name' => 'Zainab Bello', 'department_id' => $finance['id']]);
    $admin = make_user('admin', ['full_name' => 'Ada Obi']);
    act_as($admin);
    $users = request('GET', '/users')->body['users'];
    assert_equal(['Ada Obi', 'Zainab Bello'], array_column($users, 'full_name'));
    assert_equal('Finance', $users[1]['department_name']);
    assert_true(!array_key_exists('password_hash', $users[0]), 'password hash leaked');

    act_as(make_user('it', ['full_name' => 'Ife Eze']));
    assert_equal(['Ada Obi', 'Ife Eze', 'Zainab Bello'], array_column(request('GET', '/users')->body['users'], 'full_name'));
});

db_test('inviting a user returns a set-password link and stores no password', function () {
    $finance = make_department('Finance');
    $admin = make_user('admin');
    act_as($admin);
    $response = request('POST', '/users', [
        'full_name' => ' Chidi  Okafor ', 'email' => ' Chidi@WoodhallCap.com ', 'phone' => '0802 829 7772',
        'role' => 'staff', 'department_id' => $finance['id'],
    ]);
    assert_status(201, $response);
    $user = $response->body['user'];
    assert_equal('Chidi Okafor', $user['full_name']);
    assert_equal('chidi@woodhallcap.com', $user['email']);
    assert_equal('08028297772', $user['phone']);
    assert_equal('Finance', $user['department_name']);
    assert_equal(false, $user['has_password']);
    assert_equal(true, $user['active']);
    assert_equal('invite', $response->body['link']['purpose']);
    assert_true(str_starts_with($response->body['link']['set_password_url'], 'https://visitor.test/set-password?token='));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.invite' AND user_id = ?", [$admin['id']])['n']);
});

db_test('an email that differs only in case is a duplicate', function () {
    make_user('security', ['email' => 'ada@example.com']);
    act_as(make_user('admin'));
    $response = request('POST', '/users', ['full_name' => 'Ada Two', 'email' => 'ADA@example.com', 'role' => 'security']);
    assert_status(422, $response);
    assert_equal('A user with this email already exists.', $response->body['error']['fields']['email']);
});

db_test('invite input is validated field by field', function () {
    $legal = make_department('Legal', false);
    act_as(make_user('admin'));
    $response = request('POST', '/users', ['full_name' => 'A', 'email' => 'not-an-email', 'phone' => '123', 'role' => 'boss']);
    assert_status(422, $response);
    assert_equal([
        'full_name' => 'Enter a full name (2–120 characters).',
        'email' => 'Enter a valid email address.',
        'phone' => 'Enter a valid phone number.',
        'role' => 'Choose a role.',
    ], $response->body['error']['fields']);

    $noDept = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff']);
    assert_equal('Staff need a department.', $noDept->body['error']['fields']['department_id']);
    $inactive = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff', 'department_id' => $legal['id']]);
    assert_equal('Choose a department.', $inactive->body['error']['fields']['department_id']);
    $missing = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff', 'department_id' => 999]);
    assert_equal('Choose a department.', $missing->body['error']['fields']['department_id']);
    $text = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff', 'department_id' => '1']);
    assert_equal('Choose a department.', $text->body['error']['fields']['department_id']);
});

db_test('non-staff roles may have no department', function () {
    act_as(make_user('admin'));
    assert_status(201, request('POST', '/users', ['full_name' => 'Sam Guard', 'email' => 'sam@example.com', 'role' => 'security']));
});

db_test('admin edits name, role and department', function () {
    $finance = make_department('Finance');
    $target = make_user('reception', ['department_id' => null]);
    act_as(make_user('admin'));
    $response = request('PATCH', "/users/{$target['id']}", ['full_name' => 'New Name', 'role' => 'staff', 'department_id' => $finance['id']]);
    assert_status(200, $response);
    assert_equal('New Name', $response->body['user']['full_name']);
    assert_equal('staff', $response->body['user']['role']);
    assert_equal($finance['id'], $response->body['user']['department_id']);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.update'")['n']);
});

db_test('a user keeps a department that was later deactivated', function () {
    $legal = make_department('Legal');
    $target = make_user('staff', ['department_id' => $legal['id']]);
    db_exec('UPDATE departments SET active = 0 WHERE id = ?', [$legal['id']]);
    act_as(make_user('admin'));
    assert_status(200, request('PATCH', "/users/{$target['id']}", ['full_name' => 'Still In Legal']));
});

db_test('disabling a user ends their session; enabling restores access', function () {
    $target = make_user('reception');
    $admin = make_user('admin');
    act_as($admin);
    $off = request('PATCH', "/users/{$target['id']}", ['active' => false]);
    assert_equal(false, $off->body['user']['active']);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.disable'")['n']);

    act_as($target);
    assert_status(401, request('GET', '/auth/me'));

    act_as($admin);
    request('PATCH', "/users/{$target['id']}", ['active' => true]);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.enable'")['n']);
    act_as($target);
    assert_status(200, request('GET', '/auth/me'));
});

db_test('IT users cannot disable themselves or change their own role', function () {
    $it = make_user('it');
    act_as($it);
    $disable = request('PATCH', "/users/{$it['id']}", ['active' => false]);
    assert_status(409, $disable);
    assert_equal("You can't change your own role or disable your own account.", $disable->body['error']['message']);
    assert_status(409, request('PATCH', "/users/{$it['id']}", ['role' => 'admin']));
    assert_equal('it', user_find($it['id'])['role']);
    assert_equal(true, user_find($it['id'])['active']);
    assert_status(200, request('PATCH', "/users/{$it['id']}", ['full_name' => 'Renamed IT']));
});

db_test('admins cannot edit their own account at all (IT manages admin accounts)', function () {
    $admin = make_user('admin');
    act_as($admin);
    $response = request('PATCH', "/users/{$admin['id']}", ['active' => false]);
    assert_status(403, $response);
    assert_equal('Only IT can manage admin and IT accounts.', $response->body['error']['message']);
    assert_equal(true, user_find($admin['id'])['active']);
});

db_test('admins cannot create, edit, reset or grant admin and IT accounts', function () {
    $otherAdmin = make_user('admin');
    $it = make_user('it');
    $staff = make_user('staff');
    act_as(make_user('admin'));
    $create = request('POST', '/users', ['full_name' => 'New Admin', 'email' => 'na@example.com', 'role' => 'admin']);
    assert_status(403, $create);
    assert_equal('Only IT can manage admin and IT accounts.', $create->body['error']['message']);
    assert_status(403, request('POST', '/users', ['full_name' => 'New IT', 'email' => 'ni@example.com', 'role' => 'it']));
    assert_status(403, request('PATCH', "/users/{$otherAdmin['id']}", ['full_name' => 'Renamed']));
    assert_status(403, request('PATCH', "/users/{$it['id']}", ['active' => false]));
    assert_status(403, request('PATCH', "/users/{$staff['id']}", ['role' => 'admin']));
    assert_status(403, request('POST', "/users/{$it['id']}/reset-link"));
    assert_equal('staff', user_find($staff['id'])['role']);
    assert_equal(true, user_find($it['id'])['active']);
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM users WHERE email IN (?, ?)', ['na@example.com', 'ni@example.com'])['n']);
});

db_test('IT creates, promotes, demotes, disables and resets admins and IT accounts', function () {
    $staff = make_user('staff');
    $admin = make_user('admin');
    act_as(make_user('it'));
    assert_status(201, request('POST', '/users', ['full_name' => 'New Admin', 'email' => 'na@example.com', 'role' => 'admin']));
    assert_status(201, request('POST', '/users', ['full_name' => 'New IT', 'email' => 'ni@example.com', 'role' => 'it']));
    assert_equal('admin', request('PATCH', "/users/{$staff['id']}", ['role' => 'admin'])->body['user']['role']);
    assert_equal('reception', request('PATCH', "/users/{$admin['id']}", ['role' => 'reception'])->body['user']['role']);
    assert_equal(false, request('PATCH', "/users/{$staff['id']}", ['active' => false])->body['user']['active']);
    $other = make_user('admin');
    assert_status(200, request('POST', "/users/{$other['id']}/reset-link"));
});

db_test('changing an email to one already used is a 422', function () {
    make_user('security', ['email' => 'taken@example.com']);
    $target = make_user('security', ['email' => 'mine@example.com']);
    act_as(make_user('admin'));
    $response = request('PATCH', "/users/{$target['id']}", ['email' => 'Taken@example.com']);
    assert_status(422, $response);
    assert_equal('A user with this email already exists.', $response->body['error']['fields']['email']);
});

db_test('patching a missing user is a 404', function () {
    act_as(make_user('admin'));
    assert_status(404, request('PATCH', '/users/999', ['full_name' => 'Nobody Here']));
    assert_status(404, request('POST', '/users/999/reset-link'));
});

db_test('reset-link gives an invite link before a password exists and a reset link after', function () {
    $invited = make_user('security', ['password' => null]);
    $active = make_user('security');
    act_as(make_user('admin'));
    $first = request('POST', "/users/{$invited['id']}/reset-link");
    assert_status(200, $first);
    assert_equal('invite', $first->body['link']['purpose']);
    assert_equal('reset', request('POST', "/users/{$active['id']}/reset-link")->body['link']['purpose']);
    assert_equal(2, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.reset_link'")['n']);
});

db_test('reset-link refuses a disabled user', function () {
    $target = make_user('security', ['active' => false]);
    act_as(make_user('admin'));
    $response = request('POST', "/users/{$target['id']}/reset-link");
    assert_status(409, $response);
    assert_equal('Enable this user before creating a set-password link.', $response->body['error']['message']);
});

test_summary();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php tests/php/test_users.php`
Expected: FAIL lines (404 where 403/200/201 expected).

- [ ] **Step 3: Implement**

Append to `lib/validator.php`:

```php
/** Shape and format checks for a user. Department existence is checked by the users service. */
function validate_user(array $input): array
{
    $errors = [];

    $name = clean_text($input['full_name'] ?? '');
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        $errors['full_name'] = 'Enter a full name (2–120 characters).';
    }

    $email = normalize_email($input['email'] ?? '');
    if (strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $errors['email'] = 'Enter a valid email address.';
    }

    $phone = null;
    $rawPhone = clean_text($input['phone'] ?? '');
    if ($rawPhone !== '') {
        $phone = normalize_phone($rawPhone);
        if ($phone === null) {
            $errors['phone'] = 'Enter a valid phone number.';
        }
    }

    $role = $input['role'] ?? '';
    if (!in_array($role, ROLES, true)) {
        $errors['role'] = 'Choose a role.';
    }

    $departmentId = $input['department_id'] ?? null;
    if ($departmentId !== null && !is_int($departmentId)) {
        $errors['department_id'] = 'Choose a department.';
        $departmentId = null;
    } elseif ($role === 'staff' && $departmentId === null) {
        $errors['department_id'] = 'Staff need a department.';
    }

    $active = $input['active'] ?? true;
    if (!is_bool($active)) {
        $errors['active'] = 'Invalid value.';
    }

    if ($errors) {
        throw HttpError::validation($errors);
    }
    return ['full_name' => $name, 'email' => $email, 'phone' => $phone, 'role' => $role, 'department_id' => $departmentId, 'active' => $active];
}
```

Append to `lib/users.php`:

```php
const USER_EDITABLE_FIELDS = ['full_name', 'email', 'phone', 'role', 'department_id', 'active'];
const PRIVILEGED_ROLES = ['admin', 'it'];

/** Spec §3: only IT may touch admin and IT accounts or hand out those roles. */
function assert_can_manage(array $actor, string ...$roles): void
{
    if ($actor['role'] !== 'it' && array_intersect($roles, PRIVILEGED_ROLES)) {
        throw new HttpError(403, 'forbidden', 'Only IT can manage admin and IT accounts.');
    }
}

function users_list(): array
{
    return array_map('user_row', db_all(USER_SELECT . ' ORDER BY u.full_name, u.id'));
}

/** A newly chosen department must exist and be active; a user may keep one that was deactivated later. */
function assert_assignable_department(?int $departmentId, ?int $currentDepartmentId = null): void
{
    if ($departmentId === null || $departmentId === $currentDepartmentId) {
        return;
    }
    $row = db_one('SELECT active FROM departments WHERE id = ?', [$departmentId]);
    if ($row === null || $row['active'] !== 1) {
        throw HttpError::validation(['department_id' => 'Choose a department.']);
    }
}

function user_create(array $input, ?array $actor): array
{
    $data = validate_user($input);
    if ($actor !== null) {
        assert_can_manage($actor, $data['role']);
    }
    assert_assignable_department($data['department_id']);
    try {
        $id = db_insert(
            'INSERT INTO users (full_name, email, phone, role, department_id) VALUES (?, ?, ?, ?, ?)',
            [$data['full_name'], $data['email'], $data['phone'], $data['role'], $data['department_id']]
        );
    } catch (PDOException $e) {
        if (is_duplicate_key($e)) {
            throw HttpError::validation(['email' => 'A user with this email already exists.']);
        }
        throw $e;
    }
    audit($actor['id'] ?? null, 'user.invite', 'user', $id, ['role' => $data['role']]);
    return user_find($id);
}

function user_update(int $id, array $input, array $actor): array
{
    $existing = user_find($id) ?? throw HttpError::notFound('User not found.');
    $merged = array_intersect_key($existing, array_flip(USER_EDITABLE_FIELDS));
    foreach (USER_EDITABLE_FIELDS as $field) {
        if (array_key_exists($field, $input)) {
            $merged[$field] = $input[$field];
        }
    }
    $data = validate_user($merged);
    assert_can_manage($actor, $existing['role'], $data['role']);
    assert_assignable_department($data['department_id'], $existing['department_id']);
    if ($existing['id'] === $actor['id'] && ($data['role'] !== $existing['role'] || $data['active'] !== $existing['active'])) {
        throw HttpError::conflict("You can't change your own role or disable your own account.");
    }

    try {
        db_exec(
            'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, department_id = ?, active = ? WHERE id = ?',
            [$data['full_name'], $data['email'], $data['phone'], $data['role'], $data['department_id'], $data['active'] ? 1 : 0, $id]
        );
    } catch (PDOException $e) {
        if (is_duplicate_key($e)) {
            throw HttpError::validation(['email' => 'A user with this email already exists.']);
        }
        throw $e;
    }

    $changed = [];
    foreach (['full_name', 'email', 'phone', 'role', 'department_id'] as $field) {
        if ($data[$field] !== $existing[$field]) {
            $changed[] = $field;
        }
    }
    if ($changed) {
        audit($actor['id'], 'user.update', 'user', $id, ['fields' => $changed]);
    }
    if ($data['active'] !== $existing['active']) {
        audit($actor['id'], $data['active'] ? 'user.enable' : 'user.disable', 'user', $id);
    }
    return user_find($id);
}

function user_reset_link(int $id, array $actor): array
{
    $user = user_find($id) ?? throw HttpError::notFound('User not found.');
    assert_can_manage($actor, $user['role']);
    if (!$user['active']) {
        throw HttpError::conflict('Enable this user before creating a set-password link.');
    }
    $purpose = $user['has_password'] ? 'reset' : 'invite';
    $link = set_password_link($id, $purpose);
    audit($actor['id'], 'user.reset_link', 'user', $id, ['purpose' => $purpose]);
    return $link;
}
```

`lib/routes/users.php`:

```php
<?php
declare(strict_types=1);

function register_user_routes(Router $r): void
{
    $r->add('GET', '/users', function (Request $req) {
        require_role('admin', 'it');
        return ['users' => users_list()];
    });
    $r->add('POST', '/users', function (Request $req) {
        $actor = require_role('admin', 'it');
        $user = user_create($req->body, $actor);
        return new Response(201, ['user' => $user, 'link' => set_password_link($user['id'], 'invite')]);
    });
    $r->add('PATCH', '/users/{id}', function (Request $req) {
        $actor = require_role('admin', 'it');
        return ['user' => user_update($req->params['id'], $req->body, $actor)];
    });
    $r->add('POST', '/users/{id}/reset-link', function (Request $req) {
        $actor = require_role('admin', 'it');
        return ['link' => user_reset_link($req->params['id'], $actor)];
    });
}
```

In `lib/app.php`, inside `app_router()`, add after `register_department_routes($router);`:

```php
        register_user_routes($router);
```

Replace everything in `scripts/create-it-user.php` after the `require` line with:

```php
$opts = getopt('', ['name:', 'email:']);
if (empty($opts['name']) || empty($opts['email'])) {
    fwrite(STDERR, "Usage: php scripts/create-it-user.php --name=\"Full Name\" --email=\"person@woodhallcap.com\"\n");
    exit(1);
}

try {
    $user = user_create(['full_name' => $opts['name'], 'email' => $opts['email'], 'role' => 'it'], null);
} catch (HttpError $e) {
    fwrite(STDERR, implode("\n", $e->fields ?: [$e->getMessage()]) . "\n");
    exit(1);
}
$link = set_password_link($user['id'], 'invite');

echo "IT account created: {$user['full_name']} <{$user['email']}>\n";
echo "Open this link before {$link['expires_at']} (WAT) to set the password:\n{$link['set_password_url']}\n";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `tests/run.sh`
Expected: every file ends `… 0 failed`; `test_users.php` shows `17 tests, 17 passed, 0 failed`; `test_tokens.php` still 12/12 (the CLI now goes through `user_create`).

- [ ] **Step 5: Commit**

```bash
git add lib scripts tests
git commit -m "feat: users API for IT and admins, with IT-only control of admin and IT accounts"
```

---

### Task 7: Front-end scaffold — Woodhall Capital theme, shared components, API client, validation

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json` (copied), `frontend/src/main.tsx`, `frontend/src/App.tsx` (temporary), `frontend/src/index.css`, `frontend/src/test-setup.ts`, `frontend/src/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/validation.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/roles.ts`, `frontend/src/components/{Field,TextInput,SelectInput,Button,Pill,Banner,Dialog,Card,PageHeader,CopyLink,icons}.tsx`, `assets/logos/woodhall-capital-tree-mark.svg`, `assets/logos/woodhall-capital-tree-mark-white.svg`, `frontend/public/favicon.svg`
- Test: `frontend/src/lib/api.test.ts`, `frontend/src/lib/validation.test.ts`, `frontend/src/lib/format.test.ts`

**Interfaces:**
- Produces (TypeScript):
  - `types.ts`: `type Role = 'staff' | 'reception' | 'security' | 'it' | 'admin'`; `const ROLES: Role[]`; `interface User { id: number; full_name: string; email: string; phone: string | null; role: Role; department_id: number | null; department_name: string | null; active: boolean; has_password: boolean; last_login_at: string | null; created_at: string }`; `interface Department { id: number; name: string; active: boolean; user_count: number }`; `interface SetPasswordLink { set_password_url: string; expires_at: string; purpose: 'invite' | 'reset' }`; `interface SessionPayload { user: User; csrf_token: string }`.
  - `lib/api.ts`: `class ApiError extends Error { status: number; code: string; fields: Record<string, string> }`; `setCsrfToken(token: string | null): void`; `onUnauthenticated(fn: () => void): () => void`; `api<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T>` (prefixes `/api`; sends `X-CSRF-Token` on non-GET; network failure → `ApiError(0, 'network_error', …)`; fires unauthenticated listeners only for code `unauthenticated`); `messageOf(err: unknown): string`.
  - `lib/validation.ts`: `type FieldErrors = Record<string, string>`; `validatePassword(pw: string): string | null`; `isValidPhone(p: string): boolean`; `interface UserFormValues { full_name: string; email: string; phone: string; role: Role | ''; department_id: string }`; `validateUserForm(v: UserFormValues): FieldErrors`; `validateDepartmentName(n: string): string | null`. Messages identical to the PHP ones.
  - `lib/format.ts`: `formatDateTime(value: string | null): string` (`'2026-10-07 14:05:00'` → `'7 Oct 2026, 14:05'`; null → `'—'`).
  - `lib/roles.ts`: `ROLE_LABELS: Record<Role, string>`; `PRIVILEGED_ROLES: Role[]` (`['admin', 'it']`); `canManage(actor: User, targetRole: Role): boolean` (IT: always; others: only non-privileged roles); `interface NavItem { to: string; label: string }`; `NAV: Record<Role, NavItem[]>`; `homeFor(role: Role): string`.
  - Components: `Field({label?, htmlFor?, error?, hint?, children})`, `inputClass(hasError: boolean): string`, `TextInput(props: InputHTMLAttributes & {label, name, error?, hint?})`, `SelectInput(props: SelectHTMLAttributes & {label, name, error?, hint?, children})`, `Button({variant?: 'primary' | 'secondary', arrow?, ...button props})` (defaults `type="button"`), `Pill({children, tone?: 'neutral' | 'accent' | 'muted' | 'error'})`, `Banner({tone: 'error' | 'success' | 'info', children, onDismiss?})`, `Dialog({title, onClose, children})`, `Card({children, className?})`, `PageHeader({title, description?, actions?})`, `CopyLink({url})`, icons `ArrowUpRightIcon`, `CheckIcon`.

- [ ] **Step 1: Generate the tree-mark SVGs and favicon**

Run (from `/Users/mac/Developer/woodhall/visitor`):

```bash
mkdir -p frontend/public && python3 - <<'EOF'
import re
src = open('assets/logos/woodhall-capital-stacked.svg').read()
d = re.search(r'<path id="logoMark" d="([^"]+)"', src).group(1)
# The mark's bounding box inside the 864 x 719 stacked logo is about x 188-675, y 0-420.
for path, fill in [('assets/logos/woodhall-capital-tree-mark.svg', '#3c2219'),
                   ('assets/logos/woodhall-capital-tree-mark-white.svg', '#fff'),
                   ('frontend/public/favicon.svg', '#3c2219')]:
    open(path, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="182 -4 500 430"><path fill="{fill}" d="{d}"/></svg>\n')
EOF
ls assets/logos frontend/public
```

Expected: the three new files listed. Open `assets/logos/woodhall-capital-tree-mark.svg` in a browser (or `qlmanage -p`) and check that the whole tree is visible and nothing is clipped; widen the viewBox if it is.

- [ ] **Step 2: Create the Vite project files**

```bash
cp /Users/mac/Developer/woodhall/kyc/frontend/tsconfig.json /Users/mac/Developer/woodhall/kyc/frontend/tsconfig.app.json /Users/mac/Developer/woodhall/kyc/frontend/tsconfig.node.json frontend/
```

`frontend/package.json`:

```json
{
  "name": "visitor-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "jsdom": "^30.1.1",
    "oxlint": "^1.81.0",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vitest": "^5.0.3"
  }
}
```

Run: `cd frontend && npm install && npm install react-router@7 && cd ..`
Expected: installs without errors; `react-router` appears under `dependencies`.

`frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Absolute base: the SPA serves nested routes like /reception/today, so relative asset paths would break.
  base: '/',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
```

`frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Visitor Management — Woodhall Capital</title>
    <meta name="description" content="Woodhall Capital's internal visitor booking and check-in system." />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#3c2219" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/index.css`:

```css
@import 'tailwindcss';

@theme {
  /* Woodhall Capital: primary is the logo brown; the rest carries over from the KYC form. */
  --color-primary: #3c2219;
  --color-primary-dark: #2a1711;
  --color-accent: #d0c5b0;
  --color-copper: #b48569;
  --color-copper-dark: #8f6048;
  --color-bg: #f8f3f0;
  --color-bg-alt: #efe8e1;
  --color-cream: #f6f5f2;
  --color-ink: #161616;
  --color-error: #b3261e;
  --font-heading: 'Work Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-body: 'Work Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --radius-brand: 28px;
  --shadow-card: 0 18px 50px rgba(60, 34, 25, 0.09);
}

@layer base {
  body { @apply bg-bg font-body text-ink m-0 min-h-screen text-base; }
  h1, h2, h3 { @apply font-heading text-primary mt-0 mb-5 font-normal leading-tight tracking-[0.005em]; }
  h1 { @apply text-[1.75rem] sm:text-[2rem]; }
  h2 { @apply text-[1.5rem] sm:text-[1.75rem]; }
  h3 { @apply text-xl; }
  p { @apply mb-4 leading-relaxed; }
  input[type='checkbox'], input[type='radio'] { accent-color: var(--color-primary); }
  [hidden] { display: none !important; }
  :focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
}
```

`frontend/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`frontend/src/App.tsx` (temporary; Task 8 replaces it):

```tsx
export default function App() {
  return <h1>Visitor Management</h1>;
}
```

- [ ] **Step 3: Write the types, roles and format helpers**

`frontend/src/types.ts`:

```ts
export type Role = 'staff' | 'reception' | 'security' | 'it' | 'admin';
export const ROLES: Role[] = ['staff', 'reception', 'security', 'it', 'admin'];

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  department_id: number | null;
  department_name: string | null;
  active: boolean;
  has_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  active: boolean;
  user_count: number;
}

export interface SetPasswordLink {
  set_password_url: string;
  expires_at: string;
  purpose: 'invite' | 'reset';
}

export interface SessionPayload {
  user: User;
  csrf_token: string;
}
```

`frontend/src/lib/roles.ts`:

```ts
import type { Role, User } from '../types';

export const ROLE_LABELS: Record<Role, string> = {
  staff: 'Staff',
  reception: 'Reception',
  security: 'Security',
  it: 'IT',
  admin: 'Admin',
};

export interface NavItem {
  to: string;
  label: string;
}

// Spec §8. Pages other than Users and Departments arrive in later plans and show "Coming soon" until then.
export const NAV: Record<Role, NavItem[]> = {
  staff: [
    { to: '/my-visitors', label: 'My visitors' },
    { to: '/book', label: 'Book a visitor' },
  ],
  reception: [
    { to: '/reception/today', label: 'Today' },
    { to: '/reception/walk-in', label: 'Book walk-in' },
    { to: '/visits', label: 'All visits' },
  ],
  security: [
    { to: '/security/on-site', label: 'On site now' },
    { to: '/security/log', label: "Today's log" },
    { to: '/security/history', label: 'History' },
  ],
  it: [
    { to: '/it/dashboard', label: 'Dashboard' },
    { to: '/users', label: 'Users' },
    { to: '/reception/today', label: 'Today' },
    { to: '/visits', label: 'All visits' },
  ],
  admin: [
    { to: '/users', label: 'Users' },
    { to: '/departments', label: 'Departments' },
    { to: '/reception/today', label: 'Today' },
    { to: '/visits', label: 'All visits' },
    { to: '/it/dashboard', label: 'Dashboard' },
  ],
};

export function homeFor(role: Role): string {
  return NAV[role][0].to;
}

export const PRIVILEGED_ROLES: Role[] = ['admin', 'it'];

/** Spec §3: only IT manages admin and IT accounts. The server enforces this; the UI only mirrors it. */
export function canManage(actor: User, targetRole: Role): boolean {
  return actor.role === 'it' || !PRIVILEGED_ROLES.includes(targetRole);
}
```

`frontend/src/lib/format.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Server datetimes are already WAT ('YYYY-MM-DD HH:MM:SS'), so format them as-is, not via the browser's timezone. */
export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
}
```

- [ ] **Step 4: Write the failing tests for api, validation and format**

`frontend/src/lib/format.test.ts`:

```ts
import { formatDateTime } from './format';

test('formats a WAT datetime without timezone conversion', () => {
  expect(formatDateTime('2026-10-07 14:05:00')).toBe('7 Oct 2026, 14:05');
  expect(formatDateTime('2026-01-31T09:00:00')).toBe('31 Jan 2026, 09:00');
});

test('shows a dash for null and passes through unknown formats', () => {
  expect(formatDateTime(null)).toBe('—');
  expect(formatDateTime('soon')).toBe('soon');
});
```

`frontend/src/lib/validation.test.ts`:

```ts
import { isValidPhone, validateDepartmentName, validatePassword, validateUserForm } from './validation';

const valid = { full_name: 'Ada Obi', email: 'ada@woodhallcap.com', phone: '', role: 'it' as const, department_id: '' };

test('password rules mirror the server', () => {
  expect(validatePassword('')).toBe('Enter a password.');
  expect(validatePassword('short')).toBe('Use at least 10 characters.');
  expect(validatePassword('a'.repeat(73))).toBe('Use 72 characters or fewer.');
  expect(validatePassword('é'.repeat(10))).toBeNull();
  expect(validatePassword('é'.repeat(37))).toBe('Use 72 characters or fewer.'); // 74 bytes
  expect(validatePassword('long enough pw')).toBeNull();
});

test('phone numbers allow spaces, dashes and a leading plus', () => {
  expect(isValidPhone('+234 802-829-7772')).toBe(true);
  expect(isValidPhone('12345')).toBe(false);
  expect(isValidPhone('080-CALL-NOW')).toBe(false);
});

test('a valid user form has no errors', () => {
  expect(validateUserForm(valid)).toEqual({});
});

test('user form errors use the server messages', () => {
  expect(validateUserForm({ full_name: 'A', email: 'nope', phone: '123', role: '', department_id: '' })).toEqual({
    full_name: 'Enter a full name (2–120 characters).',
    email: 'Enter a valid email address.',
    phone: 'Enter a valid phone number.',
    role: 'Choose a role.',
  });
});

test('staff need a department', () => {
  expect(validateUserForm({ ...valid, role: 'staff' })).toEqual({ department_id: 'Staff need a department.' });
  expect(validateUserForm({ ...valid, role: 'staff', department_id: '3' })).toEqual({});
});

test('department names must be 2–120 characters after trimming', () => {
  expect(validateDepartmentName('  A ')).toBe('Enter a department name (2–120 characters).');
  expect(validateDepartmentName('Finance')).toBeNull();
});
```

`frontend/src/lib/api.test.ts`:

```ts
import { vi } from 'vitest';
import { ApiError, api, messageOf, onUnauthenticated, setCsrfToken } from './api';

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

test('GET requests go to /api without a body or CSRF header', async () => {
  setCsrfToken('tok');
  const fetchMock = stubFetch(200, { ok: true });
  await expect(api('GET', '/health')).resolves.toEqual({ ok: true });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/health');
  expect(init.body).toBeUndefined();
  expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
});

test('writes send JSON and the CSRF token', async () => {
  setCsrfToken('tok');
  const fetchMock = stubFetch(201, { department: { id: 1 } });
  await api('POST', '/departments', { name: 'Finance' });
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  expect(init.method).toBe('POST');
  expect(init.body).toBe(JSON.stringify({ name: 'Finance' }));
  expect(headers['Content-Type']).toBe('application/json');
  expect(headers['X-CSRF-Token']).toBe('tok');
});

test('error envelopes become ApiError with fields', async () => {
  stubFetch(422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { name: 'Enter a name.' } } });
  const err = await api('POST', '/departments', { name: '' }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 422, code: 'validation_failed', fields: { name: 'Enter a name.' } });
  expect(messageOf(err)).toBe('Please correct the highlighted fields.');
});

test('a network failure becomes a friendly ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  const err = await api('GET', '/users').catch((e: unknown) => e);
  expect(err).toMatchObject({ status: 0, code: 'network_error' });
});

test('a non-JSON error response still becomes an ApiError', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
  const err = await api('GET', '/users').catch((e: unknown) => e);
  expect(err).toMatchObject({ status: 502, code: 'server_error', message: 'Something went wrong. Please try again.' });
});

test('only code "unauthenticated" notifies listeners', async () => {
  const listener = vi.fn();
  const stop = onUnauthenticated(listener);
  stubFetch(401, { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } });
  await api('POST', '/auth/login', {}).catch(() => undefined);
  expect(listener).not.toHaveBeenCalled();
  stubFetch(401, { error: { code: 'unauthenticated', message: 'Please sign in.' } });
  await api('GET', '/auth/me').catch(() => undefined);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
});

test('messageOf falls back for unknown errors', () => {
  expect(messageOf(new Error('x'))).toBe('Something went wrong. Please try again.');
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib && cd ..`
Expected: `api.test.ts` and `validation.test.ts` fail to import (`Failed to resolve import "./api"`); `format.test.ts` passes.

- [ ] **Step 6: Implement api and validation**

`frontend/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

let csrfToken: string | null = null;
const unauthenticatedListeners = new Set<() => void>();

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Called when the server says the session is gone (expired, signed out elsewhere, or account disabled). */
export function onUnauthenticated(fn: () => void): () => void {
  unauthenticatedListeners.add(fn);
  return () => {
    unauthenticatedListeners.delete(fn);
  };
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', "Couldn't reach the server. Check your connection and try again.");
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    const apiError = new ApiError(res.status, error?.code ?? 'server_error', error?.message ?? FALLBACK_MESSAGE, error?.fields ?? {});
    if (apiError.code === 'unauthenticated') unauthenticatedListeners.forEach((fn) => fn());
    throw apiError;
  }
  return data as T;
}

export function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : FALLBACK_MESSAGE;
}
```

`frontend/src/lib/validation.ts`:

```ts
import type { Role } from '../types';

// Mirrors lib/validator.php for inline feedback; the server stays authoritative.
export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePassword(password: string): string | null {
  if (password === '') return 'Enter a password.';
  if ([...password].length < 10) return 'Use at least 10 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Use 72 characters or fewer.';
  return null;
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{7,20}$/.test(phone.trim().replace(/[\s-]/g, ''));
}

export interface UserFormValues {
  full_name: string;
  email: string;
  phone: string;
  role: Role | '';
  department_id: string;
}

export function validateUserForm(v: UserFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const name = v.full_name.trim().replace(/\s+/g, ' ');
  if ([...name].length < 2 || [...name].length > 120) errors.full_name = 'Enter a full name (2–120 characters).';
  const email = v.email.trim();
  if (!EMAIL_RE.test(email) || email.length > 190) errors.email = 'Enter a valid email address.';
  if (v.phone.trim() !== '' && !isValidPhone(v.phone)) errors.phone = 'Enter a valid phone number.';
  if (v.role === '') errors.role = 'Choose a role.';
  if (v.role === 'staff' && v.department_id === '') errors.department_id = 'Staff need a department.';
  return errors;
}

export function validateDepartmentName(name: string): string | null {
  const length = [...name.trim().replace(/\s+/g, ' ')].length;
  return length < 2 || length > 120 ? 'Enter a department name (2–120 characters).' : null;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib && cd ..`
Expected: 3 files, all tests pass.

- [ ] **Step 8: Port the shared components**

`frontend/src/components/icons.tsx`:

```tsx
interface IconProps {
  className?: string;
}

export function ArrowUpRightIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

export function CheckIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12.5 10 17 19 7.5" />
    </svg>
  );
}
```

`frontend/src/components/Field.tsx` (KYC's `Field` plus an optional hint):

```tsx
import type { ReactNode } from 'react';

export function inputClass(hasError: boolean): string {
  return (
    'w-full rounded-xl border bg-white px-3.5 py-2.5 font-body text-[15px] transition disabled:bg-cream disabled:text-ink/60 ' +
    (hasError ? 'border-error' : 'border-[#d9d0c6] hover:border-primary/50')
  );
}

interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="mb-5">
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block font-semibold">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 mb-0 text-[13px] text-ink/60">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 mb-0 text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
```

`frontend/src/components/TextInput.tsx`:

```tsx
import type { InputHTMLAttributes } from 'react';
import { Field, inputClass } from './Field';

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function TextInput({ label, name, error, hint, id, ...rest }: TextInputProps) {
  const inputId = id ?? name;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint}>
      <input id={inputId} name={name} className={inputClass(!!error)} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}
```

`frontend/src/components/SelectInput.tsx`:

```tsx
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Field, inputClass } from './Field';

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function SelectInput({ label, name, error, hint, id, children, ...rest }: SelectInputProps) {
  const selectId = id ?? name;
  return (
    <Field label={label} htmlFor={selectId} error={error} hint={hint}>
      <select id={selectId} name={name} className={inputClass(!!error)} aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
    </Field>
  );
}
```

`frontend/src/components/Button.tsx`: copy `/Users/mac/Developer/woodhall/kyc/frontend/src/components/Button.tsx` unchanged (it already defaults `type="button"` before `{...rest}`, imports `ArrowUpRightIcon` from `./icons`, and uses the `primary` tokens, so it re-brands automatically):

```bash
cp /Users/mac/Developer/woodhall/kyc/frontend/src/components/Button.tsx frontend/src/components/Button.tsx
```

`frontend/src/components/Pill.tsx`:

```tsx
import type { ReactNode } from 'react';

const TONES = {
  neutral: 'border-primary/25 text-primary',
  accent: 'border-accent bg-accent/40 text-primary',
  muted: 'border-ink/15 bg-cream text-ink/60',
  error: 'border-error/30 bg-error/5 text-error',
};

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[13px] font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
```

`frontend/src/components/Banner.tsx`:

```tsx
import type { ReactNode } from 'react';

const TONES = {
  error: 'border-error/30 bg-error/5 text-error',
  success: 'border-primary/25 bg-primary/5 text-primary',
  info: 'border-accent bg-cream text-ink',
};

interface BannerProps {
  tone: keyof typeof TONES;
  children: ReactNode;
  onDismiss?: () => void;
}

export function Banner({ tone, children, onDismiss }: BannerProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${TONES[tone]}`}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="cursor-pointer bg-transparent text-lg leading-none">
          ×
        </button>
      )}
    </div>
  );
}
```

`frontend/src/components/Dialog.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ title, onClose, children }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-brand bg-white p-6 shadow-card sm:p-8">
        <h2 id="dialog-title" className="mb-5 text-2xl">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
```

`frontend/src/components/Card.tsx`:

```tsx
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-brand bg-white p-5 shadow-card sm:p-7 ${className}`}>{children}</section>;
}
```

`frontend/src/components/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-1">{title}</h1>
        {description && <p className="mb-0 text-ink/70">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
```

`frontend/src/components/CopyLink.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Button } from './Button';
import { inputClass } from './Field';

export function CopyLink({ url }: { url: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (insecure context or permission denied): select it for a manual copy.
      inputRef.current?.select();
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input ref={inputRef} readOnly value={url} aria-label="Set-password link" onFocus={(e) => e.currentTarget.select()} className={inputClass(false)} />
      <Button onClick={copy} className="shrink-0">
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Type-check, test and build**

Run: `cd frontend && npx tsc -b && npm test && npm run build && cd ..`
Expected: no type errors; all tests pass; `dist/` built. (If `tsc` reports unused imports in the copied `Button.tsx`, fix the import, not the rule.)

- [ ] **Step 10: Commit**

```bash
git add assets/logos frontend/package.json frontend/package-lock.json frontend/index.html frontend/vite.config.ts frontend/tsconfig*.json frontend/public frontend/src
git commit -m "feat: front-end scaffold with Woodhall Capital theme, shared components and API client"
```

---

### Task 8: Sign-in, set-password, app shell and route guards

**Files:**
- Create: `frontend/src/lib/auth.tsx`, `frontend/src/components/BrandPanel.tsx`, `frontend/src/components/AuthLayout.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/AppShell.tsx`, `frontend/src/components/guards.tsx`, `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/pages/auth/SetPasswordPage.tsx`, `frontend/src/pages/ComingSoon.tsx`, `frontend/src/pages/NoAccess.tsx`, `frontend/src/test-utils.tsx`
- Modify: `frontend/src/App.tsx` (replace)
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 7 `api`, `setCsrfToken`, `onUnauthenticated`, `ApiError`, `messageOf`, `validatePassword`, `NAV`, `ROLE_LABELS`, `homeFor`, components.
- Produces:
  - `AuthProvider({children})`, `useAuth(): { status: 'loading' | 'signed-out' | 'signed-in'; user: User | null; login(email: string, password: string): Promise<void>; logout(): Promise<void> }`.
  - `RequireAuth()` (layout route: loading → status text; signed-out → `<Navigate to="/login" state={{from}}>`; signed-in → `<AppShell><Outlet/></AppShell>`), `RequireRole({roles, children})` (→ `NoAccess` if the role is not allowed), `HomeRedirect()`.
  - Routes in `App`: `/login`, `/set-password`, and under the protected layout `/` (index → home), `users` (IT and admin; ComingSoon until Task 9), `departments` (admin; ComingSoon until Task 9), `*` (ComingSoon).
  - Test helpers (fixtures `ADMIN` id 1, `STAFF` id 2 in Finance, `IT` id 4): `type MockRoutes = Record<string, (body: unknown) => [number, unknown]>`; `mockFetch(routes): { calls: Array<{ method: string; path: string; body: unknown; headers: Record<string, string> }> }` (keys like `'GET /auth/me'`; unknown routes → 404 envelope); `renderApp(path: string, routes: MockRoutes)`; fixtures `ADMIN`, `STAFF` (`User`); route snippets `signedOut`, `signedInAs(user)`.

- [ ] **Step 1: Write the test helpers**

`frontend/src/test-utils.tsx`:

```tsx
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import type { User } from './types';

export type MockRoutes = Record<string, (body: unknown) => [number, unknown]>;

export interface MockCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

export function mockFetch(routes: MockRoutes): { calls: MockCall[] } {
  const calls: MockCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = String(input).replace(/^\/api/, '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> });
      const handler = routes[`${method} ${path}`];
      const [status, json] = handler ? handler(body) : [404, { error: { code: 'not_found', message: 'Not found.' } }];
      return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return { calls };
}

export function renderApp(path: string, routes: MockRoutes) {
  const mock = mockFetch(routes);
  window.history.pushState({}, '', path);
  return { ...render(<App />), ...mock };
}

const BASE_USER: User = {
  id: 0,
  full_name: '',
  email: '',
  phone: null,
  role: 'staff',
  department_id: null,
  department_name: null,
  active: true,
  has_password: true,
  last_login_at: '2026-10-07 09:00:00',
  created_at: '2026-10-01 09:00:00',
};

export const ADMIN: User = { ...BASE_USER, id: 1, full_name: 'Ada Obi', email: 'ada@woodhallcap.com', role: 'admin' };
export const STAFF: User = { ...BASE_USER, id: 2, full_name: 'Chidi Okafor', email: 'chidi@woodhallcap.com', role: 'staff', department_id: 1, department_name: 'Finance' };
export const IT: User = { ...BASE_USER, id: 4, full_name: 'Ife Eze', email: 'ife@woodhallcap.com', role: 'it' };

export const signedOut: MockRoutes = {
  'GET /auth/me': () => [401, { error: { code: 'unauthenticated', message: 'Please sign in.' } }],
};

export function signedInAs(user: User): MockRoutes {
  return {
    'GET /auth/me': () => [200, { user, csrf_token: 'tok' }],
    'POST /auth/logout': () => [200, { ok: true }],
  };
}
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/App.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from './lib/api';
import { ADMIN, IT, STAFF, renderApp, signedInAs, signedOut } from './test-utils';

test('signed-out visitors are sent to sign in', async () => {
  renderApp('/users', signedOut);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('Forgot your password? Ask an administrator to reset it.')).toBeInTheDocument();
});

test('signing in takes staff to their home page with their navigation', async () => {
  const { calls } = renderApp('/login', { ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('heading', { name: 'Coming soon' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/my-visitors');
  expect(screen.getByRole('link', { name: 'Book a visitor' })).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ email: 'chidi@woodhallcap.com', password: 'correct horse battery' });
});

test('after sign-in the user returns to the page they first asked for', async () => {
  renderApp('/book', { ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('heading', { name: 'Coming soon' });
  expect(window.location.pathname).toBe('/book');
});

test('a wrong password shows the server message and stays on sign in', async () => {
  renderApp('/login', {
    ...signedOut,
    'POST /auth/login': () => [401, { error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } }],
  });
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('empty fields show inline errors without calling the API', async () => {
  const { calls } = renderApp('/login', signedOut);
  await userEvent.click(await screen.findByRole('button', { name: /sign in/i }));
  expect(screen.getByText('Enter your email.')).toBeInTheDocument();
  expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('staff cannot open user management', async () => {
  renderApp('/users', signedInAs(STAFF));
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
});

test('admins land on Users and see admin navigation', async () => {
  renderApp('/', signedInAs(ADMIN));
  expect(await screen.findByRole('link', { name: 'Departments' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/users');
});

test('IT lands on the dashboard, can reach Users, but not Departments', async () => {
  renderApp('/', signedInAs(IT));
  expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Departments' })).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/it/dashboard');
});

test('IT cannot open Departments', async () => {
  renderApp('/departments', signedInAs(IT));
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
});

test('signing out returns to the sign-in page', async () => {
  const { calls } = renderApp('/my-visitors', signedInAs(STAFF));
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(calls.find((c) => c.path === '/auth/logout')?.headers['X-CSRF-Token']).toBe('tok');
});

test('a session that expires mid-use returns to sign in', async () => {
  renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'GET /visits': () => [401, { error: { code: 'unauthenticated', message: 'Please sign in.' } }],
  });
  // /my-visitors makes no API calls yet, so trigger one the way a page would.
  await screen.findByRole('link', { name: 'Book a visitor' });
  await api('GET', '/visits').catch(() => undefined);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('set-password checks that the passwords match before calling the API', async () => {
  const { calls } = renderApp('/set-password?token=abc', signedOut);
  await userEvent.type(await screen.findByLabelText('New password'), 'long enough pw');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'different pw!!');
  await userEvent.click(screen.getByRole('button', { name: /set password/i }));
  expect(screen.getByText("The passwords don't match.")).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('set-password sends the token and confirms success', async () => {
  const { calls } = renderApp('/set-password?token=abc', { ...signedOut, 'POST /auth/set-password': () => [200, { ok: true }] });
  await userEvent.type(await screen.findByLabelText('New password'), 'long enough pw');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'long enough pw');
  await userEvent.click(screen.getByRole('button', { name: /set password/i }));
  expect(await screen.findByRole('heading', { name: 'Password set' })).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ token: 'abc', password: 'long enough pw' });
});

test('set-password shows the expired-link message', async () => {
  renderApp('/set-password?token=abc', {
    ...signedOut,
    'POST /auth/set-password': () => [422, { error: { code: 'token_invalid', message: 'This link has expired or has already been used. Ask an administrator for a new one.' } }],
  });
  await userEvent.type(await screen.findByLabelText('New password'), 'long enough pw');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'long enough pw');
  await userEvent.click(screen.getByRole('button', { name: /set password/i }));
  expect(await screen.findByText(/This link has expired/)).toBeInTheDocument();
});

test('set-password without a token explains the link is incomplete', async () => {
  renderApp('/set-password', signedOut);
  expect(await screen.findByRole('heading', { name: 'Link incomplete' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/App.test.tsx; cd ..`
Expected: all tests fail (the temporary App renders only a heading).

- [ ] **Step 4: Implement auth state, layouts and guards**

`frontend/src/lib/auth.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionPayload, User } from '../types';
import { api, onUnauthenticated, setCsrfToken } from './api';

type Status = 'loading' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; user: User | null }>({ status: 'loading', user: null });

  const signIn = useCallback((session: SessionPayload) => {
    setCsrfToken(session.csrf_token);
    setState({ status: 'signed-in', user: session.user });
  }, []);

  const signOut = useCallback(() => {
    setCsrfToken(null);
    setState({ status: 'signed-out', user: null });
  }, []);

  useEffect(() => onUnauthenticated(signOut), [signOut]);

  useEffect(() => {
    let cancelled = false;
    api<SessionPayload>('GET', '/auth/me')
      .then((session) => !cancelled && signIn(session))
      .catch(() => !cancelled && signOut());
    return () => {
      cancelled = true;
    };
  }, [signIn, signOut]);

  const login = useCallback(
    async (email: string, password: string) => {
      signIn(await api<SessionPayload>('POST', '/auth/login', { email, password }));
    },
    [signIn],
  );

  const logout = useCallback(async () => {
    try {
      await api('POST', '/auth/logout');
    } catch {
      // The session is gone either way.
    }
    signOut();
  }, [signOut]);

  const value = useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
```

`frontend/src/components/BrandPanel.tsx`:

```tsx
import logo from '../../../assets/logos/woodhall-capital-stacked-white.svg';
import treeMark from '../../../assets/logos/woodhall-capital-tree-mark-white.svg';

interface BrandPanelProps {
  title: string;
  text: string;
}

/** The one bold element on the sign-in screens: a brown panel with the Woodhall Capital mark. */
export function BrandPanel({ title, text }: BrandPanelProps) {
  return (
    <aside aria-label="About Visitor Management" className="relative overflow-hidden rounded-brand bg-primary p-6 text-white sm:p-8">
      <img src={treeMark} alt="" aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-16 w-80 opacity-[0.08]" />
      <div className="relative">
        <img src={logo} alt="Woodhall Capital" className="h-24 w-auto sm:h-28" />
        <p className="mt-8 mb-2 text-xs font-semibold tracking-[0.14em] text-accent uppercase">Visitor Management</p>
        <h2 className="mb-3 text-white">{title}</h2>
        <p className="mb-0 text-white/80">{text}</p>
      </div>
    </aside>
  );
}
```

`frontend/src/components/AuthLayout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { BrandPanel } from './BrandPanel';

interface AuthLayoutProps {
  title: string;
  text: string;
  children: ReactNode;
}

/** The KYC two-column layout: brand panel left, white form card right. */
export function AuthLayout({ title, text, children }: AuthLayoutProps) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 lg:py-10">
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-stretch">
        <BrandPanel title={title} text={text} />
        <main className="rounded-brand bg-white p-5 shadow-card sm:p-9">{children}</main>
      </div>
    </div>
  );
}
```

`frontend/src/components/Sidebar.tsx`:

```tsx
import { useState } from 'react';
import { NavLink } from 'react-router';
import logo from '../../../assets/logos/woodhall-capital-horizontal-white.svg';
import treeMark from '../../../assets/logos/woodhall-capital-tree-mark-white.svg';
import { NAV, ROLE_LABELS } from '../lib/roles';
import type { User } from '../types';

interface SidebarProps {
  user: User;
  onSignOut: () => void;
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="relative overflow-hidden bg-primary text-white lg:sticky lg:top-0 lg:h-screen">
      <img src={treeMark} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-12 w-64 opacity-[0.07]" />
      <div className="relative flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:py-8">
        <img src={logo} alt="Woodhall Capital" className="h-8 w-auto lg:h-9" />
        <button
          type="button"
          className="cursor-pointer rounded-full border border-white/30 bg-transparent px-4 py-1.5 text-sm text-white lg:hidden"
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
      </div>
      <div id="app-nav" className={`relative px-3 pb-6 lg:block lg:px-4 ${open ? 'block' : 'hidden'}`}>
        <p className="mb-0 px-3 text-xs font-semibold tracking-[0.14em] text-accent uppercase">Visitor Management</p>
        <nav aria-label="Main">
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {NAV[user.role].map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-full px-4 py-2.5 text-[15px] no-underline transition ${isActive ? 'bg-white font-semibold text-primary' : 'text-white/85 hover:bg-white/10'}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 rounded-2xl bg-white/10 p-4">
          <p className="mb-0 text-sm font-semibold">{user.full_name}</p>
          <p className="mb-3 text-xs text-white/70">{ROLE_LABELS[user.role]}</p>
          <button type="button" onClick={onSignOut} className="cursor-pointer bg-transparent p-0 text-sm text-accent underline underline-offset-2">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
```

`frontend/src/components/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <Sidebar user={user} onSignOut={logout} />
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
```

`frontend/src/pages/ComingSoon.tsx`:

```tsx
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';

export function ComingSoon() {
  return (
    <>
      <PageHeader title="Coming soon" />
      <Card>
        <p className="mb-0">This part of Visitor Management is still being built. It will appear here after the next update.</p>
      </Card>
    </>
  );
}
```

`frontend/src/pages/NoAccess.tsx`:

```tsx
import { Link } from 'react-router';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';

export function NoAccess() {
  return (
    <>
      <PageHeader title="No access" />
      <Card>
        <p>Your role doesn't include this page. If you think it should, ask an administrator.</p>
        <Link to="/" className="font-semibold text-primary underline underline-offset-2">
          Go to your home page
        </Link>
      </Card>
    </>
  );
}
```

`frontend/src/components/guards.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { homeFor } from '../lib/roles';
import { NoAccess } from '../pages/NoAccess';
import type { Role } from '../types';
import { AppShell } from './AppShell';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-primary">
        Loading…
      </div>
    );
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <NoAccess />;
  return <>{children}</>;
}

export function HomeRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={homeFor(user.role)} replace /> : null;
}
```

- [ ] **Step 5: Implement the auth pages and routes**

`frontend/src/pages/auth/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AuthLayout } from '../../components/AuthLayout';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { messageOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { homeFor } from '../../lib/roles';
import type { FieldErrors } from '../../lib/validation';

export function LoginPage() {
  const { status, user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signed-in' && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : homeFor(user.role)} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = 'Enter your email.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome" text="Book visitors, check them in and see who's on site. Sign in with the account your administrator set up for you.">
      <h2>Sign in</h2>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate className="max-w-md">
        <TextInput label="Email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} autoFocus />
        <TextInput label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        <Button type="submit" arrow disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 mb-0 text-sm text-ink/70">Forgot your password? Ask an administrator to reset it.</p>
    </AuthLayout>
  );
}
```

`frontend/src/pages/auth/SetPasswordPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/AuthLayout';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { validatePassword, type FieldErrors } from '../../lib/validation';

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: FieldErrors = {};
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    else if (confirm !== password) next.confirm = "The passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api('POST', '/auth/set-password', { token, password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Set your password" text="Choose a password for your Visitor Management account. Use at least 10 characters.">
      {done ? (
        <>
          <h2>Password set</h2>
          <p>You can now sign in with your email and new password.</p>
          <Link to="/login" className="font-semibold text-primary underline underline-offset-2">
            Go to sign in
          </Link>
        </>
      ) : !token ? (
        <>
          <h2>Link incomplete</h2>
          <p className="mb-0">This link is missing its code. Open the full link you were sent, or ask an administrator for a new one.</p>
        </>
      ) : (
        <>
          <h2>Set your password</h2>
          {error && <Banner tone="error">{error}</Banner>}
          <form onSubmit={submit} noValidate className="max-w-md">
            <TextInput label="New password" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 10 characters." autoFocus />
            <TextInput label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
            <Button type="submit" arrow disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
```

Replace `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Route, Routes } from 'react-router';
import { HomeRedirect, RequireAuth, RequireRole } from './components/guards';
import { AuthProvider } from './lib/auth';
import { ComingSoon } from './pages/ComingSoon';
import { LoginPage } from './pages/auth/LoginPage';
import { SetPasswordPage } from './pages/auth/SetPasswordPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/" element={<RequireAuth />}>
            <Route index element={<HomeRedirect />} />
            <Route
              path="users"
              element={
                <RequireRole roles={['admin', 'it']}>
                  <ComingSoon />
                </RequireRole>
              }
            />
            <Route
              path="departments"
              element={
                <RequireRole roles={['admin']}>
                  <ComingSoon />
                </RequireRole>
              }
            />
            <Route path="*" element={<ComingSoon />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

Add `declare module '*.svg'` support if `tsc` complains: Vite's `vite/client` types (already in `tsconfig.app.json` `types`) cover `*.svg` imports, so no extra file should be needed.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx tsc -b && npm test && cd ..`
Expected: no type errors; all test files pass (15 tests in `App.test.tsx`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: sign-in, set-password, role-aware app shell and route guards"
```

---

### Task 9: Users page (IT and admin) and Departments page (admin)

**Files:**
- Create: `frontend/src/pages/admin/DepartmentsPage.tsx`, `frontend/src/pages/admin/UsersPage.tsx`, `frontend/src/pages/admin/UserFormDialog.tsx`, `frontend/src/pages/admin/LinkDialog.tsx`
- Modify: `frontend/src/App.tsx` (swap the `users` and `departments` placeholders for the real pages)
- Test: `frontend/src/pages/admin/DepartmentsPage.test.tsx`, `frontend/src/pages/admin/UsersPage.test.tsx`

**Interfaces:**
- Consumes: Task 7 components, `api`, `ApiError`, `messageOf`, validation, `formatDateTime`, `ROLE_LABELS`, `ROLES`; Task 8 `useAuth`, `RequireRole`, test-utils.
- Produces: routes `/users` (IT and admin) and `/departments` (admin).
  - `UserFormDialog({ user?: User; departments: Department[]; roles: Role[]; isSelf: boolean; onClose(): void; onSaved(user: User, link?: SetPasswordLink): void })` (`roles` = the roles the signed-in person may assign).
  - `LinkDialog({ user: User; link: SetPasswordLink; onClose(): void })`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/pages/admin/DepartmentsPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, renderApp, signedInAs } from '../../test-utils';

const FINANCE = { id: 1, name: 'Finance', active: true, user_count: 3 };
const LEGAL = { id: 2, name: 'Legal', active: false, user_count: 0 };
const list = { 'GET /departments': () => [200, { departments: [FINANCE, LEGAL] }] as [number, unknown] };

test('lists departments with user counts and status', async () => {
  renderApp('/departments', { ...signedInAs(ADMIN), ...list });
  const finance = await screen.findByRole('row', { name: /Finance/ });
  expect(within(finance).getByText('3')).toBeInTheDocument();
  expect(within(finance).getByText('Active')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Legal/ })).getByText('Inactive')).toBeInTheDocument();
});

test('shows an empty state when there are no departments', async () => {
  renderApp('/departments', { ...signedInAs(ADMIN), 'GET /departments': () => [200, { departments: [] }] });
  expect(await screen.findByText('No departments yet. Add the first one above.')).toBeInTheDocument();
});

test('adds a department', async () => {
  const { calls } = renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'POST /departments': () => [201, { department: { id: 3, name: 'Operations', active: true, user_count: 0 } }],
  });
  await userEvent.type(await screen.findByLabelText('New department'), 'Operations');
  await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
  expect(await screen.findByRole('row', { name: /Operations/ })).toBeInTheDocument();
  expect(screen.getByText('Added Operations.')).toBeInTheDocument();
  const post = calls.find((c) => c.method === 'POST');
  expect(post?.body).toEqual({ name: 'Operations' });
  expect(post?.headers['X-CSRF-Token']).toBe('tok');
});

test('shows the server error for a duplicate name', async () => {
  renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'POST /departments': () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { name: 'A department with this name already exists.' } } }],
  });
  await userEvent.type(await screen.findByLabelText('New department'), 'finance');
  await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
  expect(await screen.findByText('A department with this name already exists.')).toBeInTheDocument();
});

test('blocks a too-short name without calling the API', async () => {
  const { calls } = renderApp('/departments', { ...signedInAs(ADMIN), ...list });
  await userEvent.type(await screen.findByLabelText('New department'), 'A');
  await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
  expect(screen.getByText('Enter a department name (2–120 characters).')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('renames a department', async () => {
  const { calls } = renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'PATCH /departments/1': () => [200, { department: { ...FINANCE, name: 'Finance & Accounts' } }],
  });
  const row = await screen.findByRole('row', { name: /Finance/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Rename' }));
  const input = screen.getByLabelText('Department name');
  await userEvent.clear(input);
  await userEvent.type(input, 'Finance & Accounts');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('row', { name: /Finance & Accounts/ })).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'Finance & Accounts' });
});

test('deactivates a department', async () => {
  renderApp('/departments', {
    ...signedInAs(ADMIN),
    ...list,
    'PATCH /departments/1': () => [200, { department: { ...FINANCE, active: false } }],
  });
  const row = await screen.findByRole('row', { name: /Finance/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Deactivate' }));
  expect(await within(screen.getByRole('row', { name: /Finance/ })).findByText('Inactive')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Finance/ })).getByRole('button', { name: 'Activate' })).toBeInTheDocument();
});
```

`frontend/src/pages/admin/UsersPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '../../types';
import { ADMIN, IT, STAFF, renderApp, signedInAs } from '../../test-utils';

const INVITED: User = { ...STAFF, id: 3, full_name: 'Bisi Ade', email: 'bisi@woodhallcap.com', role: 'reception', department_id: null, department_name: null, has_password: false, last_login_at: null };
const DEPARTMENTS = [{ id: 1, name: 'Finance', active: true, user_count: 1 }];
const base = {
  ...signedInAs(ADMIN),
  'GET /users': () => [200, { users: [ADMIN, INVITED, STAFF, IT] }] as [number, unknown],
  'GET /departments': () => [200, { departments: DEPARTMENTS }] as [number, unknown],
};
const LINK = { set_password_url: 'https://visitor.woodhallcap.com/set-password?token=abc', expires_at: '2026-10-10 12:00:00', purpose: 'invite' };

test('lists users with role, department and status', async () => {
  renderApp('/users', base);
  const chidi = await screen.findByRole('row', { name: /Chidi Okafor/ });
  expect(within(chidi).getByText('Staff')).toBeInTheDocument();
  expect(within(chidi).getByText('Finance')).toBeInTheDocument();
  expect(within(chidi).getByText('Active')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Bisi Ade/ })).getByText('Invited')).toBeInTheDocument();
});

test('search filters by name, email, role or department', async () => {
  renderApp('/users', base);
  await screen.findByRole('row', { name: /Chidi Okafor/ });
  await userEvent.type(screen.getByLabelText('Search users'), 'finance');
  expect(screen.getByRole('row', { name: /Chidi Okafor/ })).toBeInTheDocument();
  expect(screen.queryByRole('row', { name: /Bisi Ade/ })).not.toBeInTheDocument();
});

test('inviting a user shows a one-time set-password link', async () => {
  const created: User = { ...STAFF, id: 9, full_name: 'Tunde Bakare', email: 'tunde@woodhallcap.com', has_password: false, last_login_at: null };
  const { calls } = renderApp('/users', { ...base, 'POST /users': () => [201, { user: created, link: LINK }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }));
  const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Tunde Bakare');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'tunde@woodhallcap.com');
  await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'staff');
  await userEvent.selectOptions(within(dialog).getByLabelText('Department'), '1');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));

  const linkDialog = await screen.findByRole('dialog', { name: 'Set-password link' });
  expect(within(linkDialog).getByLabelText('Set-password link')).toHaveValue(LINK.set_password_url);
  expect(within(linkDialog).getByText(/Tunde Bakare/)).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
    full_name: 'Tunde Bakare', email: 'tunde@woodhallcap.com', phone: '', role: 'staff', department_id: 1,
  });
  await userEvent.click(within(linkDialog).getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('row', { name: /Tunde Bakare/ })).toBeInTheDocument();
});

test('staff need a department before the invite is sent', async () => {
  const { calls } = renderApp('/users', base);
  await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }));
  const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Tunde Bakare');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'tunde@woodhallcap.com');
  await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'staff');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
  expect(within(dialog).getByText('Staff need a department.')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('server field errors appear in the form', async () => {
  renderApp('/users', {
    ...base,
    'POST /users': () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { email: 'A user with this email already exists.' } } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Invite user' }));
  const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
  await userEvent.type(within(dialog).getByLabelText('Full name'), 'Ada Again');
  await userEvent.type(within(dialog).getByLabelText('Email'), 'ada@woodhallcap.com');
  await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'it');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
  expect(await within(dialog).findByText('A user with this email already exists.')).toBeInTheDocument();
});

test('a new link for an invited user', async () => {
  renderApp('/users', { ...base, 'POST /users/3/reset-link': () => [200, { link: LINK }] });
  const row = await screen.findByRole('row', { name: /Bisi Ade/ });
  await userEvent.click(within(row).getByRole('button', { name: 'New invite link' }));
  expect(await screen.findByRole('dialog', { name: 'Set-password link' })).toBeInTheDocument();
});

test('admins cannot change their own account, but can disable staff', async () => {
  renderApp('/users', { ...base, 'PATCH /users/2': () => [200, { user: { ...STAFF, active: false } }] });
  const me = await screen.findByRole('row', { name: /Ada Obi/ });
  expect(within(me).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  expect(within(me).getByText('Managed by IT')).toBeInTheDocument();
  const chidi = screen.getByRole('row', { name: /Chidi Okafor/ });
  await userEvent.click(within(chidi).getByRole('button', { name: 'Disable' }));
  expect(await within(screen.getByRole('row', { name: /Chidi Okafor/ })).findByText('Disabled')).toBeInTheDocument();
  expect(screen.getByText('Chidi Okafor is now disabled.')).toBeInTheDocument();
});

test('editing yourself locks the role field', async () => {
  renderApp('/users', { ...base, ...signedInAs(IT) });
  const me = await screen.findByRole('row', { name: /Ife Eze/ });
  expect(within(me).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  await userEvent.click(within(me).getByRole('button', { name: 'Edit' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit Ife Eze' });
  expect(within(dialog).getByLabelText('Role')).toBeDisabled();
  expect(within(dialog).getByText("You can't change your own role.")).toBeInTheDocument();
});

test('for an admin, admin and IT accounts are read-only and those roles cannot be assigned', async () => {
  renderApp('/users', base);
  const it = await screen.findByRole('row', { name: /Ife Eze/ });
  expect(within(it).getByText('Managed by IT')).toBeInTheDocument();
  expect(within(it).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  expect(within(it).queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument();
  expect(within(it).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Invite user' }));
  const options = within(screen.getByRole('dialog', { name: 'Invite a user' })).getAllByRole('option').map((o) => o.textContent);
  expect(options).toEqual(['Choose a role', 'Staff', 'Reception', 'Security', 'No department', 'Finance']);
});

test('IT can manage admins and assign every role', async () => {
  renderApp('/users', { ...base, ...signedInAs(IT) });
  const admin = await screen.findByRole('row', { name: /Ada Obi/ });
  expect(within(admin).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  expect(within(admin).getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Invite user' }));
  const role = within(screen.getByRole('dialog', { name: 'Invite a user' })).getByLabelText('Role');
  expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a role', 'Staff', 'Reception', 'Security', 'IT', 'Admin']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/admin; cd ..`
Expected: failures (pages show ComingSoon).

- [ ] **Step 3: Implement the Departments page**

`frontend/src/pages/admin/DepartmentsPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { inputClass } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { validateDepartmentName } from '../../lib/validation';
import type { Department } from '../../types';

type Notice = { tone: 'error' | 'success'; text: string } | null;

const byName = (a: Department, b: Department) => a.name.localeCompare(b.name);
const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-primary underline underline-offset-2';

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<{ id: number; name: string; error?: string } | null>(null);

  useEffect(() => {
    api<{ departments: Department[] }>('GET', '/departments')
      .then((r) => setDepartments(r.departments))
      .catch((err) => setLoadError(messageOf(err)));
  }, []);

  const replace = (department: Department) =>
    setDepartments((list) => (list ?? []).map((d) => (d.id === department.id ? department : d)).sort(byName));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const error = validateDepartmentName(name);
    setNameError(error ?? undefined);
    if (error) return;
    try {
      const r = await api<{ department: Department }>('POST', '/departments', { name });
      setDepartments((list) => [...(list ?? []), r.department].sort(byName));
      setName('');
      setNotice({ tone: 'success', text: `Added ${r.department.name}.` });
    } catch (err) {
      if (err instanceof ApiError && err.fields.name) setNameError(err.fields.name);
      else setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  const saveRename = async () => {
    if (!editing) return;
    const error = validateDepartmentName(editing.name);
    if (error) {
      setEditing({ ...editing, error });
      return;
    }
    try {
      const r = await api<{ department: Department }>('PATCH', `/departments/${editing.id}`, { name: editing.name });
      replace(r.department);
      setEditing(null);
    } catch (err) {
      setEditing({ ...editing, error: err instanceof ApiError && err.fields.name ? err.fields.name : messageOf(err) });
    }
  };

  const toggle = async (department: Department) => {
    try {
      const r = await api<{ department: Department }>('PATCH', `/departments/${department.id}`, { active: !department.active });
      replace(r.department);
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  return (
    <>
      <PageHeader title="Departments" description="Staff accounts belong to a department, and visit reports are grouped by it." />
      {notice && (
        <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}
      <Card className="mb-6">
        <form onSubmit={add} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <TextInput label="New department" name="new-department" value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
          </div>
          <Button type="submit" className="sm:mt-8">
            Add department
          </Button>
        </form>
      </Card>
      <Card>
        {loadError && <Banner tone="error">{loadError}</Banner>}
        {departments === null && !loadError && <p role="status" className="mb-0">Loading…</p>}
        {departments?.length === 0 && <p className="mb-0">No departments yet. Add the first one above.</p>}
        {departments && departments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Users</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-b border-bg-alt last:border-0">
                    <td className="py-3 pr-4">
                      {editing?.id === d.id ? (
                        <div>
                          <input aria-label="Department name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass(!!editing.error)} autoFocus />
                          {editing.error && <p role="alert" className="mt-1 mb-0 text-[13px] text-error">{editing.error}</p>}
                        </div>
                      ) : (
                        d.name
                      )}
                    </td>
                    <td className="py-3 pr-4">{d.user_count}</td>
                    <td className="py-3 pr-4">{d.active ? <Pill>Active</Pill> : <Pill tone="muted">Inactive</Pill>}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      {editing?.id === d.id ? (
                        <span className="inline-flex gap-4">
                          <button type="button" className={linkButton} onClick={saveRename}>Save</button>
                          <button type="button" className={linkButton} onClick={() => setEditing(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-4">
                          <button type="button" className={linkButton} onClick={() => setEditing({ id: d.id, name: d.name })}>Rename</button>
                          <button type="button" className={linkButton} onClick={() => toggle(d)}>{d.active ? 'Deactivate' : 'Activate'}</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Implement the Users page and its dialogs**

`frontend/src/pages/admin/LinkDialog.tsx`:

```tsx
import { Button } from '../../components/Button';
import { CopyLink } from '../../components/CopyLink';
import { Dialog } from '../../components/Dialog';
import { formatDateTime } from '../../lib/format';
import type { SetPasswordLink, User } from '../../types';

interface LinkDialogProps {
  user: User;
  link: SetPasswordLink;
  onClose: () => void;
}

export function LinkDialog({ user, link, onClose }: LinkDialogProps) {
  return (
    <Dialog title="Set-password link" onClose={onClose}>
      <p>
        Send this link to <strong>{user.full_name}</strong> ({user.email}) through Teams, WhatsApp or in person.{' '}
        {link.purpose === 'invite' ? 'They will use it to set their password.' : 'They will use it to choose a new password.'}
      </p>
      <CopyLink url={link.set_password_url} />
      <p className="mt-3 text-sm text-ink/70">It works once and expires {formatDateTime(link.expires_at)} (WAT). This is the only time it is shown.</p>
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
```

`frontend/src/pages/admin/UserFormDialog.tsx`:

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SelectInput } from '../../components/SelectInput';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { ROLE_LABELS } from '../../lib/roles';
import { validateUserForm, type FieldErrors, type UserFormValues } from '../../lib/validation';
import type { Department, Role, SetPasswordLink, User } from '../../types';

interface UserFormDialogProps {
  user?: User;
  departments: Department[];
  /** The roles the signed-in person may assign (IT: all; admin: staff, reception, security). */
  roles: Role[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: User, link?: SetPasswordLink) => void;
}

export function UserFormDialog({ user, departments, roles, isSelf, onClose, onSaved }: UserFormDialogProps) {
  const [values, setValues] = useState<UserFormValues>({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: user?.role ?? '',
    department_id: user?.department_id ? String(user.department_id) : '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof UserFormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));
  // A user may keep a department that was deactivated after they joined it.
  const options = departments.filter((d) => d.active || d.id === user?.department_id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next = validateUserForm(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload = {
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      role: values.role,
      department_id: values.department_id === '' ? null : Number(values.department_id),
    };
    setBusy(true);
    try {
      if (user) {
        const r = await api<{ user: User }>('PATCH', `/users/${user.id}`, payload);
        onSaved(r.user);
      } else {
        const r = await api<{ user: User; link: SetPasswordLink }>('POST', '/users', payload);
        onSaved(r.user, r.link);
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={user ? `Edit ${user.full_name}` : 'Invite a user'} onClose={onClose}>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate>
        <TextInput label="Full name" name="full_name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} autoFocus />
        <TextInput label="Email" name="email" type="email" value={values.email} onChange={set('email')} error={errors.email} hint="They sign in with this." />
        <TextInput label="Phone (optional)" name="phone" type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
        <SelectInput label="Role" name="role" value={values.role} onChange={set('role')} error={errors.role} disabled={isSelf} hint={isSelf ? "You can't change your own role." : undefined}>
          <option value="">Choose a role</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Department" name="department_id" value={values.department_id} onChange={set('department_id')} error={errors.department_id} hint="Required for staff.">
          <option value="">No department</option>
          {options.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </SelectInput>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

`frontend/src/pages/admin/UsersPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { inputClass } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { api, messageOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { ROLE_LABELS, canManage } from '../../lib/roles';
import { ROLES, type Department, type SetPasswordLink, type User } from '../../types';
import { LinkDialog } from './LinkDialog';
import { UserFormDialog } from './UserFormDialog';

type Notice = { tone: 'error' | 'success'; text: string } | null;
type FormState = { mode: 'invite' } | { mode: 'edit'; user: User } | null;

const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-primary underline underline-offset-2';

function matches(user: User, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.full_name, user.email, ROLE_LABELS[user.role], user.department_name ?? ''].some((v) => v.toLowerCase().includes(q));
}

function StatusPill({ user }: { user: User }) {
  if (!user.active) return <Pill tone="muted">Disabled</Pill>;
  if (!user.has_password) return <Pill tone="accent">Invited</Pill>;
  return <Pill>Active</Pill>;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(null);
  const [shownLink, setShownLink] = useState<{ user: User; link: SetPasswordLink } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    Promise.all([api<{ users: User[] }>('GET', '/users'), api<{ departments: Department[] }>('GET', '/departments')])
      .then(([u, d]) => {
        setUsers(u.users);
        setDepartments(d.departments);
      })
      .catch((err) => setLoadError(messageOf(err)));
  }, []);

  const upsert = (user: User) =>
    setUsers((list) => [...(list ?? []).filter((u) => u.id !== user.id), user].sort((a, b) => a.full_name.localeCompare(b.full_name)));

  const onSaved = (user: User, link?: SetPasswordLink) => {
    upsert(user);
    setForm(null);
    if (link) setShownLink({ user, link });
    else setNotice({ tone: 'success', text: `Saved ${user.full_name}.` });
  };

  const newLink = async (user: User) => {
    try {
      const r = await api<{ link: SetPasswordLink }>('POST', `/users/${user.id}/reset-link`);
      setShownLink({ user, link: r.link });
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  const toggleActive = async (user: User) => {
    try {
      const r = await api<{ user: User }>('PATCH', `/users/${user.id}`, { active: !user.active });
      upsert(r.user);
      setNotice({ tone: 'success', text: `${r.user.full_name} is now ${r.user.active ? 'enabled' : 'disabled'}.` });
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  const visible = (users ?? []).filter((u) => matches(u, query));
  const assignableRoles = me ? ROLES.filter((role) => canManage(me, role)) : [];

  return (
    <>
      <PageHeader title="Users" description={me?.role === 'it' ? 'Invite people, set their role and department, and reset passwords. Only IT can manage admin and IT accounts.' : 'Invite people, set their role and department, and reset passwords. Admin and IT accounts are managed by IT.'} actions={<Button onClick={() => setForm({ mode: 'invite' })}>Invite user</Button>} />
      {notice && (
        <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}
      <Card>
        <div className="mb-5 max-w-sm">
          <input aria-label="Search users" placeholder="Search by name, email, role or department" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass(false)} />
        </div>
        {loadError && <Banner tone="error">{loadError}</Banner>}
        {users === null && !loadError && <p role="status" className="mb-0">Loading…</p>}
        {users && visible.length === 0 && <p className="mb-0">No users match.</p>}
        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Last sign-in</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const isSelf = u.id === me?.id;
                  const manageable = !!me && canManage(me, u.role);
                  return (
                    <tr key={u.id} className="border-b border-bg-alt align-top last:border-0">
                      <td className="py-3 pr-4">
                        <span className="block font-medium">{u.full_name}</span>
                        <span className="block text-sm text-ink/60">{u.email}</span>
                      </td>
                      <td className="py-3 pr-4">{ROLE_LABELS[u.role]}</td>
                      <td className="py-3 pr-4">{u.department_name ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <StatusPill user={u} />
                      </td>
                      <td className="py-3 pr-4 text-sm whitespace-nowrap">{formatDateTime(u.last_login_at)}</td>
                      <td className="py-3 text-right whitespace-nowrap">
                        {!manageable ? (
                          <span className="text-sm text-ink/50">Managed by IT</span>
                        ) : (
                        <span className="inline-flex gap-4">
                          <button type="button" className={linkButton} onClick={() => setForm({ mode: 'edit', user: u })}>Edit</button>
                          {u.active && (
                            <button type="button" className={linkButton} onClick={() => newLink(u)}>
                              {u.has_password ? 'Reset password' : 'New invite link'}
                            </button>
                          )}
                          {!isSelf && (
                            <button type="button" className={linkButton} onClick={() => toggleActive(u)}>
                              {u.active ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && (
        <UserFormDialog
          user={form.mode === 'edit' ? form.user : undefined}
          departments={departments}
          roles={assignableRoles}
          isSelf={form.mode === 'edit' && form.user.id === me?.id}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}
      {shownLink && <LinkDialog user={shownLink.user} link={shownLink.link} onClose={() => setShownLink(null)} />}
    </>
  );
}
```

In `frontend/src/App.tsx`, add the imports:

```tsx
import { DepartmentsPage } from './pages/admin/DepartmentsPage';
import { UsersPage } from './pages/admin/UsersPage';
```

and replace the `users` and `departments` placeholder routes with:

```tsx
            <Route
              path="users"
              element={
                <RequireRole roles={['admin', 'it']}>
                  <UsersPage />
                </RequireRole>
              }
            />
            <Route
              path="departments"
              element={
                <RequireRole roles={['admin']}>
                  <DepartmentsPage />
                </RequireRole>
              }
            />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx tsc -b && npm test && cd ..`
Expected: no type errors; all test files pass, including the Task 8 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: users page for IT and admins, departments page for admins, copyable set-password links"
```

---

### Task 10: README and end-to-end check in a browser

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above. Produces documentation only.

- [ ] **Step 1: Write the README**

`README.md`:

````markdown
# Woodhall Capital — Visitor Management

Internal visitor booking and check-in for Woodhall Capital, served at `https://visitor.woodhallcap.com`.
Design: [`docs/superpowers/specs/2026-10-06-visitor-system-design.md`](docs/superpowers/specs/2026-10-06-visitor-system-design.md).

**Status:** foundation, sign-in, user management (IT and admins) and departments (admins) are built. Booking, reception, security and IT
screens show "Coming soon". Email is deliberately not built yet; admins share one-time set-password links instead.

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
````

- [ ] **Step 2: Run every test**

Run: `tests/run.sh && (cd frontend && npx tsc -b && npm test && npm run build)`
Expected: all PHP files `0 failed`; all front-end tests pass; build succeeds.

- [ ] **Step 3: Check the real app in a browser**

Start both servers (`php -S localhost:8000 api/index.php` and `cd frontend && npm run dev`, each in the background), create an IT account with `scripts/create-it-user.php` against the dev database, then in Chrome (use the browser tools; record a GIF named `visitor-plan1-user-management.gif`):

1. Open the set-password link (replace the host with `http://localhost:5173` if `site_url` differs) → set a password → "Password set".
2. Sign in as IT → lands on the Dashboard placeholder; the brown sidebar shows Dashboard, Users, Today, All visits (no Departments).
3. **Users**: invite an Admin → a link dialog appears; copy the link. The role picker offers IT and Admin.
4. In a private window, use that link, sign in as the admin → lands on **Users**; the IT account's row says "Managed by IT"; the invite role picker offers only Staff, Reception, Security.
5. As the admin, **Departments**: add "Finance", rename it, deactivate and reactivate it. Then invite a Staff user in Finance and copy the link.
6. In another private window, set the staff password and sign in → "Coming soon" with staff navigation (My visitors, Book a visitor). Visit `/users` → "No access".
7. As the admin, disable the staff user; in the staff window, click any nav item → returns to Sign in.
8. As IT, demote the admin to Reception → in the admin's window, the next page load shows the Reception navigation.
9. Resize to 390 px wide: the sidebar collapses to a Menu button, tables scroll inside their cards, and the page itself does not scroll sideways.

Fix anything that does not behave as described, re-run Step 2, then stop both servers.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with local setup, configuration, tests and the no-email account flow"
```
