# Plan 3: IT Dashboard, CSV Export and Bluehost Packaging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (The user chose native execution: executing-plans.)

**Goal:** IT and admins get a statistics dashboard (stat cards and four charts) and a CSV export of the visit log; the app is packaged as a Bluehost deploy zip with hardened Apache and PHP settings and a written deploy runbook.

**Architecture:** `lib/stats.php` computes the dashboard numbers in SQL for a validated date range; a raw-body `Response` lets `GET /visits/export.csv` stream a CSV through the existing router. The front end adds `StatCard`, `ColumnChart` and `BarList` (hand-rolled, no chart library) and a `DashboardPage`. A root `.htaccess` routes `/api/*` to PHP, serves the SPA, blocks server files and adds security headers; `scripts/package.sh` assembles `build/visitor-deploy.zip`, verified by `tests/package_test.sh`.

**Tech Stack:** As Plans 1–2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-visitor-system-design.md` (§7 `GET /stats`, `GET /visits/export.csv`; §8 IT dashboard; §11 structure; §15 steps 7–8). Actually deploying needs Bluehost access (spec §14 item 5), so this plan delivers the package and runbook, not a live deploy.

**Working directory:** `/Users/mac/Developer/woodhall/visitor`, branch `plan-3-dashboard-deploy`.

## Global Constraints

- Plans 1–2 constraints still apply (PHP 8.1 ceiling, MySQL 5.7/MariaDB 10.3 SQL, WAT, error envelope, CSRF, no email, no attribution trailers).
- `GET /stats` and `GET /visits/export.csv`: **IT and admin only**. Query `from`, `to` (`YYYY-MM-DD`); default range = the 30 days ending today (WAT); `from` after `to` → 422 `to` "The end date must be on or after the start date."; more than 366 days → 422 `from` "Choose a range of at most 366 days."; bad date → 422 "Enter a valid date.".
- Stat definitions (cancelled visits never count):
  - **Visitors today** — visits dated today, not cancelled.
  - **On site now** — visits with status `checked_in` (any date).
  - **Visits in range** — visits dated in range, not cancelled.
  - **Average visit length** — mean minutes between check-in and check-out for `checked_out` visits dated in range; `null` when none.
  - **No-show rate** — `no_show` ÷ (`checked_in` + `checked_out` + `no_show`) for visits dated in range, rounded to 3 decimals; `null` when the denominator is 0.
  - **Visits per day** — every day in range, zero-filled. **By visitor type** — all five types, zero-filled, in the fixed order client, vendor, interviewee, contractor, guest. **Top departments** — up to 8, most visits first, missing department shown as "No department". **Arrivals by hour** — hours 0–23 of actual check-in time, zero-filled.
- CSV: UTF-8 with BOM, CRLF lines, every cell quoted, `"` doubled; cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'` (spreadsheet formula injection) **unless** the cell is a plain number like a phone `+2348031234567`. Filename `visits-FROM-to-TO.csv`. Each export writes an audit row `visits.export`.
- Charts (dataviz rules): single series, so no legend box; bar colour token `--color-chart: #b56a38` (validated: lightness band, chroma floor, ≥3:1 contrast on white); columns ≤24px thick with 4px rounded top and square base, 2px gaps; text in ink tokens, never the bar colour; every chart has a hover/focus tooltip and a visually hidden data table.
- Production: HTTPS forced; `/lib`, `/migrations`, `/scripts`, `/storage`, `/tests`, `/docs`, `config*.php` and dotfiles (except `/.well-known`) never served; PHP `display_errors` off with errors logged to `storage/logs/php-error.log`; the session cookie is `Secure` whenever the request is HTTPS.

## Review Focus

1. **Formula injection via a visitor name** — a visitor typed as `=HYPERLINK("http://evil","x")` must not become a live formula when IT opens the CSV in Excel. Test in Task 2.
2. **Phones in the CSV** — `+2348031234567` must stay a readable phone, not `'+234…`. Test in Task 2.
3. **Empty ranges** — a new install with no visits: cards show 0 / "—", charts show zeroed bars, nothing divides by zero. Tests in Task 2 (API) and Task 3 (UI).
4. **A one-year range** — 366 days accepted, 367 refused; the per-day chart stays readable (thinned labels). Tests in Task 2 and Task 3.
5. **Server files over HTTP** — `config.local.php` (DB password), `lib/`, `storage/sessions` must never be downloadable. Covered by `.htaccess` rules and the package test; the runbook's post-deploy curl checks verify it on the live host.

---

### Task 1: Production hardening and query performance

**Files:** Create `migrations/002_indexes.sql`; Modify `lib/visits.php` (activity_date range), `lib/http.php` (raw `Response`, `ensure_private_dir`), `api/index.php`; Test `tests/php/test_migrations.php`, `tests/php/test_http.php`

**Interfaces:** `Response::__construct(int $status, array $body, ?string $raw = null, array $headers = [])`; `ensure_private_dir(string $dir): bool` (creates with 0700 if missing; never warns; returns whether the dir exists).

- [ ] **Step 1: Failing tests**

Append to `tests/php/test_migrations.php` before `test_summary();`:

```php
test_case('visit indexes for status sweeps and check-in/out times exist', function () {
    $names = array_column(db_all("SELECT DISTINCT index_name AS i FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'visits'"), 'i');
    foreach (['idx_visits_status_date', 'idx_visits_checked_in_at', 'idx_visits_checked_out_at'] as $index) {
        assert_true(in_array($index, $names, true), "missing index {$index}");
    }
});
```

Append to `tests/php/test_http.php` before `test_summary();`:

```php
test_case('ensure_private_dir creates a 0700 directory and is quiet when it exists', function () {
    $dir = sys_get_temp_dir() . '/visitor-test-' . bin2hex(random_bytes(4)) . '/nested';
    assert_true(ensure_private_dir($dir));
    assert_equal('0700', substr(sprintf('%o', fileperms($dir)), -4));
    assert_true(ensure_private_dir($dir));
    rmdir($dir);
    rmdir(dirname($dir));
});

test_case('a Response can carry a raw body with headers', function () {
    $router = new Router();
    $router->add('GET', '/file.csv', fn() => new Response(200, [], "a,b\r\n", ['Content-Type' => 'text/csv']), ['public' => true]);
    $response = handle_request('GET', '/file.csv', [], [], [], '', $router);
    assert_equal("a,b\r\n", $response->raw);
    assert_equal(['Content-Type' => 'text/csv'], $response->headers);
});
```

- [ ] **Step 2: Run — expect failure** (`php tests/php/test_migrations.php` → missing index; `php tests/php/test_http.php` → undefined `ensure_private_dir`).

- [ ] **Step 3: Implement**

`migrations/002_indexes.sql`:

```sql
-- Hot paths: the no-show sweep and status filters (status first), and Today's log (check-in/out times as ranges).
CREATE INDEX idx_visits_status_date ON visits (status, visit_date);
CREATE INDEX idx_visits_checked_in_at ON visits (checked_in_at);
CREATE INDEX idx_visits_checked_out_at ON visits (checked_out_at);
```

In `lib/visits.php` replace the `activity_date` block with:

```php
    if ($day = visit_query_date($query, 'activity_date')) {
        // Ranges instead of DATE(column) so the check-in/out indexes are used.
        $next = date('Y-m-d', strtotime($day . ' +1 day'));
        $where[] = '((v.checked_in_at >= ? AND v.checked_in_at < ?) OR (v.checked_out_at >= ? AND v.checked_out_at < ?))';
        array_push($params, $day, $next, $day, $next);
    }
```

In `lib/http.php` replace the `Response` class with:

```php
final class Response
{
    /** When $raw is set it is sent as-is with $headers instead of JSON-encoding $body (e.g. a CSV download). */
    public function __construct(public int $status, public array $body, public ?string $raw = null, public array $headers = [])
    {
    }
}
```

and append:

```php
/** Creates $dir (0700) if missing. Quiet when another request created it first; logs if it cannot be created. */
function ensure_private_dir(string $dir): bool
{
    if (is_dir($dir) || @mkdir($dir, 0700, true) || is_dir($dir)) {
        return true;
    }
    error_log("[visitor] cannot create directory {$dir}");
    return false;
}
```

Replace `api/index.php` with:

```php
<?php
declare(strict_types=1);

// Web entry point for /api/*. Locally: php -S localhost:8000 api/index.php
require dirname(__DIR__) . '/lib/bootstrap.php';

// Never show PHP errors to visitors; log them privately instead.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
$logDir = dirname(__DIR__) . '/storage/logs';
if (ensure_private_dir($logDir)) {
    ini_set('error_log', $logDir . '/php-error.log');
}

$https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
ini_set('session.use_strict_mode', '1');
session_name('wvsid');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https || (bool) config('cookie_secure'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
// A private session dir: on shared hosts the system-wide cleanup uses php.ini's short gc_maxlifetime and would end sessions early.
$sessionDir = dirname(__DIR__) . '/storage/sessions';
if (ensure_private_dir($sessionDir)) {
    session_save_path($sessionDir);
}
ini_set('session.gc_maxlifetime', (string) config('session_idle_seconds'));
ini_set('session.gc_probability', '1');
ini_set('session.gc_divisor', '100');
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
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($response->raw !== null) {
    foreach ($response->headers as $name => $value) {
        header("{$name}: {$value}");
    }
    echo $response->raw;
} else {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($response->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
```

Apply the new migration to the dev database: `php migrations/migrate.php` → `Applied: 002_indexes.sql`.

- [ ] **Step 4: Run — expect pass** (`tests/run.sh` → every file 0 failed; the activity_date test in `test_visits.php` still passes).

- [ ] **Step 5: Commit** — `git add migrations lib api tests && git commit -m "perf: visit indexes and range queries; harden the API entry point; raw responses"`

---

### Task 2: Stats and CSV export API

**Files:** Create `lib/stats.php`, `lib/routes/stats.php`, `tests/php/test_stats.php`; Modify `lib/app.php`

**Interfaces:**
- `stats_range(array $query): array` → `[$from, $to]`; `stats_summary(string $from, string $to): array` → `['from', 'to', 'cards' => [visitors_today, on_site_now, visits_in_range, average_visit_minutes (?int), no_show_rate (?float)], 'per_day' => [['date', 'count']], 'by_type' => [['type', 'count']], 'by_department' => [['department', 'count']], 'by_hour' => [['hour', 'count']]]`.
- `csv_cell(mixed $v): string`, `visits_export_csv(string $from, string $to): string`.
- Routes `GET /stats` → stats summary; `GET /visits/export.csv` → raw CSV with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="visits-FROM-to-TO.csv"`.

- [ ] **Step 1: Failing tests** — `tests/php/test_stats.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

function day(int $offset): string
{
    return date('Y-m-d', strtotime(($offset >= 0 ? '+' : '') . $offset . ' days'));
}

db_test('stats and export are for IT and admin only', function () {
    foreach (['staff', 'reception', 'security'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/stats'));
        assert_status(403, request('GET', '/visits/export.csv'));
    }
    foreach (['it', 'admin'] as $role) {
        act_as(make_user($role));
        assert_status(200, request('GET', '/stats'));
        assert_status(200, request('GET', '/visits/export.csv'));
    }
});

db_test('the default range is the 30 days ending today, zero-filled', function () {
    act_as(make_user('it'));
    $stats = request('GET', '/stats')->body;
    assert_equal(day(-29), $stats['from']);
    assert_equal(day(0), $stats['to']);
    assert_equal(30, count($stats['per_day']));
    assert_equal(day(0), $stats['per_day'][29]['date']);
    assert_equal(['visitors_today' => 0, 'on_site_now' => 0, 'visits_in_range' => 0, 'average_visit_minutes' => null, 'no_show_rate' => null], $stats['cards']);
    assert_equal(['client', 'vendor', 'interviewee', 'contractor', 'guest'], array_column($stats['by_type'], 'type'));
    assert_equal(24, count($stats['by_hour']));
    assert_equal([], $stats['by_department']);
});

db_test('stat cards follow the spec definitions', function () {
    $today = day(0);
    make_visit(['visitor_type' => 'vendor']);
    make_visit(['status' => 'cancelled']);
    make_visit(['status' => 'checked_in', 'checked_in_at' => "{$today} 09:00:00"]);
    make_visit(['status' => 'checked_out', 'visit_date' => day(-1), 'checked_in_at' => day(-1) . ' 10:00:00', 'checked_out_at' => day(-1) . ' 10:30:00']);
    make_visit(['status' => 'checked_out', 'visit_date' => day(-2), 'checked_in_at' => day(-2) . ' 14:00:00', 'checked_out_at' => day(-2) . ' 15:30:00']);
    make_visit(['status' => 'no_show', 'visit_date' => day(-3)]);
    make_visit(['status' => 'checked_in', 'visit_date' => day(-40), 'checked_in_at' => day(-40) . ' 08:00:00']);
    act_as(make_user('admin'));
    $cards = request('GET', '/stats')->body['cards'];
    assert_equal(2, $cards['visitors_today']);
    assert_equal(2, $cards['on_site_now']);
    assert_equal(5, $cards['visits_in_range']);
    assert_equal(60, $cards['average_visit_minutes']);
    assert_equal(0.25, $cards['no_show_rate']);
});

db_test('chart series count visits by day, type, department and check-in hour', function () {
    $finance = make_department('Finance');
    $host = make_user('staff', ['department_id' => $finance['id']]);
    make_visit(['host_user_id' => $host['id'], 'department_id' => $finance['id'], 'visitor_type' => 'vendor', 'status' => 'checked_in', 'checked_in_at' => day(0) . ' 09:15:00']);
    make_visit(['host_user_id' => $host['id'], 'department_id' => $finance['id'], 'visitor_type' => 'vendor', 'visit_date' => day(-1)]);
    make_visit(['department_id' => null, 'visitor_type' => 'guest']);
    make_visit(['visitor_type' => 'guest', 'status' => 'cancelled']);
    act_as(make_user('it'));
    $stats = request('GET', '/stats')->body;
    $perDay = array_column($stats['per_day'], 'count', 'date');
    assert_equal(2, $perDay[day(0)]);
    assert_equal(1, $perDay[day(-1)]);
    $byType = array_column($stats['by_type'], 'count', 'type');
    assert_equal(['client' => 0, 'vendor' => 2, 'interviewee' => 0, 'contractor' => 0, 'guest' => 1], $byType);
    assert_equal(['department' => 'Finance', 'count' => 2], $stats['by_department'][0]);
    assert_true(in_array(['department' => 'No department', 'count' => 1], $stats['by_department'], true), 'No department bucket missing');
    assert_equal(1, $stats['by_hour'][9]['count']);
    assert_equal(9, $stats['by_hour'][9]['hour']);
});

db_test('top departments are capped at 8', function () {
    for ($i = 1; $i <= 10; $i++) {
        $dept = make_department("Dept {$i}");
        make_visit(['department_id' => $dept['id']]);
    }
    act_as(make_user('it'));
    assert_equal(8, count(request('GET', '/stats')->body['by_department']));
});

db_test('ranges are validated: order, length and format', function () {
    act_as(make_user('it'));
    $backwards = request('GET', '/stats', [], ['from' => day(0), 'to' => day(-1)]);
    assert_status(422, $backwards);
    assert_equal('The end date must be on or after the start date.', $backwards->body['error']['fields']['to']);
    assert_status(200, request('GET', '/stats', [], ['from' => day(-365), 'to' => day(0)]));
    $tooLong = request('GET', '/stats', [], ['from' => day(-366), 'to' => day(0)]);
    assert_status(422, $tooLong);
    assert_equal('Choose a range of at most 366 days.', $tooLong->body['error']['fields']['from']);
    assert_status(422, request('GET', '/stats', [], ['from' => 'yesterday']));
});

db_test('the CSV export lists visits in range with safe cells', function () {
    $finance = make_department('Finance');
    $host = make_user('staff', ['department_id' => $finance['id'], 'full_name' => 'Chidi Okafor']);
    make_visit(['host_user_id' => $host['id'], 'department_id' => $finance['id'], 'visitor_name' => '=HYPERLINK("http://evil","x")',
        'visitor_phone' => '+2348031234567', 'purpose' => 'Says "hello"', 'expected_arrival' => '11:00']);
    make_visit(['host_user_id' => $host['id'], 'visitor_name' => 'Early Bird', 'expected_arrival' => '08:00']);
    make_visit(['visitor_name' => 'Too Old', 'visit_date' => day(-60)]);
    $it = make_user('it');
    act_as($it);
    $response = request('GET', '/visits/export.csv');
    assert_status(200, $response);
    assert_equal('text/csv; charset=utf-8', $response->headers['Content-Type']);
    assert_equal('attachment; filename="visits-' . day(-29) . '-to-' . day(0) . '.csv"', $response->headers['Content-Disposition']);
    assert_true(str_starts_with($response->raw, "\u{FEFF}\"Visit date\",\"Expected arrival\""), 'BOM + header row expected');
    $lines = explode("\r\n", trim(substr($response->raw, 3)));
    assert_equal(3, count($lines));
    assert_true(str_contains($lines[1], '"Early Bird"'), 'rows are ordered by arrival');
    assert_true(str_contains($lines[2], '"\'=HYPERLINK(""http://evil"",""x"")"'), 'formula must be neutralised: ' . $lines[2]);
    assert_true(str_contains($lines[2], '"+2348031234567"'), 'phone must stay readable');
    assert_true(str_contains($lines[2], '"Says ""hello"""'), 'quotes must be doubled');
    assert_true(str_contains($lines[2], '"Chidi Okafor","Finance"'), 'host and department expected');
    assert_true(!str_contains($response->raw, 'Too Old'), 'out-of-range visit leaked');
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visits.export' AND user_id = ?", [$it['id']])['n']);
});

test_case('csv_cell neutralises formulas but keeps plain numbers', function () {
    assert_equal('"\'=1+2"', csv_cell('=1+2'));
    assert_equal('"\'@SUM(A1)"', csv_cell('@SUM(A1)'));
    assert_equal('"\'-cmd"', csv_cell('-cmd'));
    assert_equal('"-12"', csv_cell('-12'));
    assert_equal('"+2348031234567"', csv_cell('+2348031234567'));
    assert_equal('""', csv_cell(null));
    assert_equal('"3"', csv_cell(3));
});

test_summary();
```

- [ ] **Step 2: Run — expect failure** (`php tests/php/test_stats.php` → 404s / undefined `csv_cell`).

- [ ] **Step 3: Implement**

`lib/stats.php`:

```php
<?php
declare(strict_types=1);

const STATS_MAX_DAYS = 366;
const STATS_TOP_DEPARTMENTS = 8;

/** ?from&to, defaulting to the 30 days ending today (WAT). */
function stats_range(array $query): array
{
    $to = visit_query_date($query, 'to') ?? date('Y-m-d');
    $from = visit_query_date($query, 'from') ?? date('Y-m-d', strtotime($to . ' -29 days'));
    if ($from > $to) {
        throw HttpError::validation(['to' => 'The end date must be on or after the start date.']);
    }
    if ((new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days + 1 > STATS_MAX_DAYS) {
        throw HttpError::validation(['from' => 'Choose a range of at most 366 days.']);
    }
    return [$from, $to];
}

function stats_count(string $sql, array $params = []): int
{
    return (int) db_one($sql, $params)['n'];
}

function stats_summary(string $from, string $to): array
{
    $range = [$from, $to];

    $average = db_one(
        "SELECT AVG(TIMESTAMPDIFF(MINUTE, checked_in_at, checked_out_at)) AS m FROM visits
         WHERE status = 'checked_out' AND visit_date BETWEEN ? AND ?",
        $range
    )['m'];
    $outcomes = db_one(
        "SELECT SUM(status = 'no_show') AS no_show, COUNT(*) AS total FROM visits
         WHERE visit_date BETWEEN ? AND ? AND status IN ('checked_in', 'checked_out', 'no_show')",
        $range
    );
    $total = (int) $outcomes['total'];

    $cards = [
        'visitors_today' => stats_count("SELECT COUNT(*) AS n FROM visits WHERE visit_date = ? AND status <> 'cancelled'", [date('Y-m-d')]),
        'on_site_now' => stats_count("SELECT COUNT(*) AS n FROM visits WHERE status = 'checked_in'"),
        'visits_in_range' => stats_count("SELECT COUNT(*) AS n FROM visits WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled'", $range),
        'average_visit_minutes' => $average === null ? null : (int) round((float) $average),
        'no_show_rate' => $total === 0 ? null : round((int) $outcomes['no_show'] / $total, 3),
    ];

    $byDate = array_column(db_all(
        "SELECT visit_date AS d, COUNT(*) AS n FROM visits WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled' GROUP BY visit_date",
        $range
    ), 'n', 'd');
    $perDay = [];
    for ($day = new DateTimeImmutable($from); $day->format('Y-m-d') <= $to; $day = $day->modify('+1 day')) {
        $key = $day->format('Y-m-d');
        $perDay[] = ['date' => $key, 'count' => (int) ($byDate[$key] ?? 0)];
    }

    $byTypeCounts = array_column(db_all(
        "SELECT visitor_type AS t, COUNT(*) AS n FROM visits WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled' GROUP BY visitor_type",
        $range
    ), 'n', 't');
    $byType = array_map(fn(string $type) => ['type' => $type, 'count' => (int) ($byTypeCounts[$type] ?? 0)], VISITOR_TYPES);

    $byDepartment = array_map(
        fn(array $row) => ['department' => $row['department'], 'count' => (int) $row['n']],
        db_all(
            "SELECT COALESCE(d.name, 'No department') AS department, COUNT(*) AS n
             FROM visits v LEFT JOIN departments d ON d.id = v.department_id
             WHERE v.visit_date BETWEEN ? AND ? AND v.status <> 'cancelled'
             GROUP BY COALESCE(d.name, 'No department') ORDER BY n DESC, department LIMIT " . STATS_TOP_DEPARTMENTS,
            $range
        )
    );

    $byHourCounts = array_column(db_all(
        'SELECT HOUR(checked_in_at) AS h, COUNT(*) AS n FROM visits
         WHERE checked_in_at IS NOT NULL AND visit_date BETWEEN ? AND ? GROUP BY HOUR(checked_in_at)',
        $range
    ), 'n', 'h');
    $byHour = array_map(fn(int $hour) => ['hour' => $hour, 'count' => (int) ($byHourCounts[$hour] ?? 0)], range(0, 23));

    return [
        'from' => $from,
        'to' => $to,
        'cards' => $cards,
        'per_day' => $perDay,
        'by_type' => $byType,
        'by_department' => $byDepartment,
        'by_hour' => $byHour,
    ];
}

const CSV_COLUMNS = [
    'Visit date' => 'visit_date',
    'Expected arrival' => 'expected_arrival',
    'Expected departure' => 'expected_departure',
    'Visitor' => 'visitor_name',
    'Phone' => 'visitor_phone',
    'Email' => 'visitor_email',
    'Company' => 'visitor_company',
    'Type' => 'visitor_type',
    'Host' => 'host_name',
    'Department' => 'department_name',
    'Purpose' => 'purpose',
    'Accompanying people' => 'party_size',
    'Status' => 'status',
    'Checked in at' => 'checked_in_at',
    'Checked out at' => 'checked_out_at',
    'Badge' => 'badge_number',
    'ID type' => 'id_type',
    'ID number' => 'id_number',
    'Booked by' => 'booked_by_name',
    'Channel' => 'channel',
];

/** Quotes a cell; a leading =, +, -, @, tab or CR would run as a spreadsheet formula, so it gets a ' — plain numbers excepted. */
function csv_cell(mixed $value): string
{
    $text = $value === null ? '' : (string) $value;
    if ($text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $text)) {
        $text = "'" . $text;
    }
    return '"' . str_replace('"', '""', $text) . '"';
}

function visits_export_csv(string $from, string $to): string
{
    $rows = db_all(VISIT_SELECT . ' WHERE v.visit_date BETWEEN ? AND ? ORDER BY v.visit_date, v.expected_arrival, v.id', [$from, $to]);
    $lines = [implode(',', array_map('csv_cell', array_keys(CSV_COLUMNS)))];
    foreach ($rows as $row) {
        $visit = visit_row($row);
        $lines[] = implode(',', array_map(fn(string $field) => csv_cell($visit[$field]), CSV_COLUMNS));
    }
    // The BOM makes Excel read the file as UTF-8 (names with accents, ₦, etc.).
    return "\u{FEFF}" . implode("\r\n", $lines) . "\r\n";
}
```

`lib/routes/stats.php`:

```php
<?php
declare(strict_types=1);

function register_stats_routes(Router $r): void
{
    $r->add('GET', '/stats', function (Request $req) {
        require_role('it', 'admin');
        visits_sweep_no_shows();
        [$from, $to] = stats_range($req->query);
        return stats_summary($from, $to);
    });
    $r->add('GET', '/visits/export.csv', function (Request $req) {
        $actor = require_role('it', 'admin');
        visits_sweep_no_shows();
        [$from, $to] = stats_range($req->query);
        $csv = visits_export_csv($from, $to);
        audit($actor['id'], 'visits.export', 'visit', null, ['from' => $from, 'to' => $to]);
        return new Response(200, [], $csv, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"visits-{$from}-to-{$to}.csv\"",
        ]);
    });
}
```

In `lib/app.php` `app_router()` add `register_stats_routes($router);` after `register_visit_routes($router);`.

- [ ] **Step 4: Run — expect pass** (`tests/run.sh`).

- [ ] **Step 5: Commit** — `git add lib tests && git commit -m "feat: dashboard statistics and CSV export of the visit log for IT and admin"`

---

### Task 3: IT dashboard page

**Files:** Modify `frontend/src/index.css` (chart token), `frontend/src/types.ts`, `frontend/src/lib/format.ts`, `frontend/src/App.tsx`; Create `frontend/src/components/StatCard.tsx`, `frontend/src/components/ColumnChart.tsx`, `frontend/src/components/BarList.tsx`, `frontend/src/pages/it/DashboardPage.tsx`; Test `frontend/src/pages/it/DashboardPage.test.tsx`, `frontend/src/lib/format.test.ts`

**Interfaces:**
- `interface Stats { from; to; cards: { visitors_today: number; on_site_now: number; visits_in_range: number; average_visit_minutes: number | null; no_show_rate: number | null }; per_day: { date: string; count: number }[]; by_type: { type: VisitorType; count: number }[]; by_department: { department: string; count: number }[]; by_hour: { hour: number; count: number }[] }`.
- `formatDuration(minutes: number | null): string` (`null` → `—`, `45` → `45 min`, `75` → `1 h 15 min`, `120` → `2 h`); `formatPercent(rate: number | null): string` (`null` → `—`, `0.125` → `13%`); `formatShortDate('2026-10-07') → '7 Oct'`.
- `StatCard({ label, value, hint? })`; `ColumnChart({ title, description?, data: { label: string; value: number; tooltip: string }[], labelEvery?: number })` — hover/focus tooltip, hidden table; `BarList({ title, data: { label: string; value: number }[], empty: string })`.
- Route `/it/dashboard` (IT, admin).

- [ ] **Step 1: Failing tests**

Append to `frontend/src/lib/format.test.ts`:

```ts
import { formatDuration, formatPercent, formatShortDate } from './format';

test('duration, percent and short date formatting', () => {
  expect(formatDuration(null)).toBe('—');
  expect(formatDuration(45)).toBe('45 min');
  expect(formatDuration(75)).toBe('1 h 15 min');
  expect(formatDuration(120)).toBe('2 h');
  expect(formatPercent(null)).toBe('—');
  expect(formatPercent(0.125)).toBe('13%');
  expect(formatPercent(0)).toBe('0%');
  expect(formatShortDate('2026-10-07')).toBe('7 Oct');
});
```

(Merge the import into the file's existing `import { formatDateTime } from './format';` line.)

`frontend/src/pages/it/DashboardPage.test.tsx`:

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import type { Stats } from '../../types';
import { ADMIN, IT, SECURITY, STAFF, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const from = addDays(today, -29);
const defaultKey = `GET /stats?from=${from}&to=${today}`;

function stats(overrides: Partial<Stats> = {}, days = 30, start = from): Stats {
  return {
    from: start,
    to: today,
    cards: { visitors_today: 4, on_site_now: 2, visits_in_range: 57, average_visit_minutes: 75, no_show_rate: 0.125 },
    per_day: Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), count: i === days - 1 ? 6 : i % 3 })),
    by_type: [
      { type: 'client', count: 20 }, { type: 'vendor', count: 15 }, { type: 'interviewee', count: 10 },
      { type: 'contractor', count: 7 }, { type: 'guest', count: 5 },
    ],
    by_department: [{ department: 'Finance', count: 30 }, { department: 'No department', count: 4 }],
    by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 9 ? 12 : 0 })),
    ...overrides,
  };
}

test('the dashboard shows stat cards for the last 30 days', async () => {
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  const card = (label: string) => screen.getByRole('group', { name: label });
  expect(await screen.findByRole('group', { name: 'Visitors today' })).toHaveTextContent('4');
  expect(card('On site now')).toHaveTextContent('2');
  expect(card('Visits in range')).toHaveTextContent('57');
  expect(card('Average visit')).toHaveTextContent('1 h 15 min');
  expect(card('No-show rate')).toHaveTextContent('13%');
});

test('each chart has a data table and the category bars show values', async () => {
  renderApp('/it/dashboard', { ...signedInAs(ADMIN), [defaultKey]: () => [200, stats()] });
  const perDay = await screen.findByRole('table', { name: 'Visits per day' });
  expect(within(perDay).getAllByRole('row')).toHaveLength(31);
  expect(within(screen.getByRole('table', { name: 'Arrivals by hour' })).getAllByRole('row')).toHaveLength(25);
  const types = screen.getByRole('list', { name: 'By visitor type' });
  expect(within(types).getByText('Client')).toBeInTheDocument();
  expect(within(types).getByText('20')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Top departments' })).getByText('No department')).toBeInTheDocument();
});

test('hovering a column shows its tooltip', async () => {
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  await screen.findByRole('table', { name: 'Arrivals by hour' });
  const column = screen.getByRole('img', { name: /09:00.*12 arrivals/ });
  fireEvent.mouseEnter(column);
  expect(screen.getByRole('tooltip')).toHaveTextContent('09:00–10:00 · 12 arrivals');
});

test('an empty install shows zeros and dashes, not errors', async () => {
  const empty = stats({
    cards: { visitors_today: 0, on_site_now: 0, visits_in_range: 0, average_visit_minutes: null, no_show_rate: null },
    per_day: Array.from({ length: 30 }, (_, i) => ({ date: addDays(from, i), count: 0 })),
    by_type: stats().by_type.map((t) => ({ ...t, count: 0 })),
    by_department: [],
    by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  });
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, empty] });
  expect(await screen.findByRole('group', { name: 'Average visit' })).toHaveTextContent('—');
  expect(screen.getByRole('group', { name: 'No-show rate' })).toHaveTextContent('—');
  expect(screen.getByText('No visits in this range yet.')).toBeInTheDocument();
});

test('changing the range reloads the stats and the export link follows it', async () => {
  const newFrom = addDays(today, -6);
  const { calls } = renderApp('/it/dashboard', {
    ...signedInAs(IT),
    [defaultKey]: () => [200, stats()],
    [`GET /stats?from=${newFrom}&to=${today}`]: () => [200, stats({}, 7, newFrom)],
  });
  await screen.findByRole('table', { name: 'Visits per day' });
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', `/api/visits/export.csv?from=${from}&to=${today}`);
  const fromInput = screen.getByLabelText('From');
  await userEvent.clear(fromInput);
  await userEvent.type(fromInput, newFrom);
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await within(await screen.findByRole('table', { name: 'Visits per day' })).findAllByRole('row')).toHaveLength(8);
  expect(calls.some((c) => c.path === `/stats?from=${newFrom}&to=${today}`)).toBe(true);
  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', `/api/visits/export.csv?from=${newFrom}&to=${today}`);
});

test('a backwards range is caught before any request', async () => {
  const { calls } = renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats()] });
  await screen.findByRole('table', { name: 'Visits per day' });
  const before = calls.length;
  const toInput = screen.getByLabelText('To');
  await userEvent.clear(toInput);
  await userEvent.type(toInput, addDays(today, -40));
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByText('The end date must be on or after the start date.')).toBeInTheDocument();
  expect(calls.length).toBe(before);
});

test('a year of days thins the date labels', async () => {
  const yearFrom = addDays(today, -365);
  renderApp('/it/dashboard', { ...signedInAs(IT), [defaultKey]: () => [200, stats({}, 366, yearFrom)] });
  const chart = await screen.findByRole('figure', { name: 'Visits per day' });
  expect(within(chart).getAllByTestId('x-label').length).toBeLessThanOrEqual(12);
});

test.each([['staff', STAFF], ['security', SECURITY]])('%s cannot open the dashboard', async (_label, user) => {
  renderApp('/it/dashboard', signedInAs(user));
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect failure** (`cd frontend && npx vitest run src/pages/it src/lib/format.test.ts`).

- [ ] **Step 3: Implement**

In `frontend/src/index.css` add inside `@theme` after `--color-error`:

```css
  /* Single-series chart bars: a saturated copper (passes the dataviz lightness/chroma/contrast checks on white). */
  --color-chart: #b56a38;
```

Append to `frontend/src/types.ts`:

```ts
export interface Stats {
  from: string;
  to: string;
  cards: {
    visitors_today: number;
    on_site_now: number;
    visits_in_range: number;
    average_visit_minutes: number | null;
    no_show_rate: number | null;
  };
  per_day: { date: string; count: number }[];
  by_type: { type: VisitorType; count: number }[];
  by_department: { department: string; count: number }[];
  by_hour: { hour: number; count: number }[];
}
```

Append to `frontend/src/lib/format.ts`:

```ts
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatShortDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : value;
}
```

`frontend/src/components/StatCard.tsx`:

```tsx
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-2xl bg-white p-5 shadow-card">
      <p className="mb-2 text-sm text-ink/60">{label}</p>
      <p className="mb-0 font-heading text-[2rem] leading-none text-primary">{value}</p>
      {hint && <p className="mt-2 mb-0 text-xs text-ink/50">{hint}</p>}
    </div>
  );
}
```

`frontend/src/components/ColumnChart.tsx`:

```tsx
import { useState } from 'react';

export interface ColumnDatum {
  label: string;
  value: number;
  tooltip: string;
}

interface ColumnChartProps {
  title: string;
  description?: string;
  data: ColumnDatum[];
  /** Show every Nth x-axis label (defaults to about 12 labels in total). */
  labelEvery?: number;
}

/** One series of vertical columns: ≤24px thick, 4px rounded tops, 2px gaps, hover/focus tooltip and a hidden table. */
export function ColumnChart({ title, description, data, labelEvery }: ColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 12));

  return (
    <figure aria-label={title} className="m-0 rounded-brand bg-white p-5 shadow-card sm:p-6">
      <figcaption className="mb-4">
        <span className="block font-heading text-xl text-primary">{title}</span>
        {description && <span className="block text-sm text-ink/60">{description}</span>}
      </figcaption>
      <div className="relative">
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className="flex h-44 flex-col justify-between text-right text-xs text-ink/50">
            <span>{max}</span>
            <span>0</span>
          </div>
          <div className="relative flex h-44 flex-1 items-end gap-[2px] border-b border-ink/15">
            {data.map((d, i) => (
              <div key={d.label} className="relative flex h-full flex-1 items-end justify-center">
                <div
                  role="img"
                  aria-label={d.tooltip}
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="w-full max-w-6 cursor-default rounded-t bg-chart outline-offset-2 transition-opacity hover:opacity-80"
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
                {active === i && (
                  <div role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-card">
                    {d.tooltip}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="mt-1 ml-9 flex gap-[2px] text-[11px] text-ink/60">
          {data.map((d, i) => (
            <span key={d.label} className="flex-1 overflow-visible text-center whitespace-nowrap">
              {i % every === 0 ? <span data-testid="x-label">{d.label}</span> : ''}
            </span>
          ))}
        </div>
      </div>
      <table aria-label={title} className="sr-only">
        <thead>
          <tr>
            <th>Label</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
```

`frontend/src/components/BarList.tsx`:

```tsx
interface BarListProps {
  title: string;
  data: { label: string; value: number }[];
  empty: string;
}

/** Horizontal bars with the label above and the value at the tip; every value is visible, so no tooltip is needed. */
export function BarList({ title, data, empty }: BarListProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="rounded-brand bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 text-xl">{title}</h2>
      {data.length === 0 ? (
        <p className="mb-0 text-sm text-ink/60">{empty}</p>
      ) : (
        <ul aria-label={title} className="m-0 list-none space-y-3 p-0">
          {data.map((d) => (
            <li key={d.label}>
              <div className="mb-1 text-sm text-ink/80">{d.label}</div>
              <div className="flex items-center gap-2">
                <div className="h-3 rounded-r bg-chart" style={{ width: `${(d.value / max) * 85}%`, minWidth: d.value > 0 ? 2 : 0 }} />
                <span className="text-sm font-semibold text-ink">{d.value}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`frontend/src/pages/it/DashboardPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { BarList } from '../../components/BarList';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ColumnChart } from '../../components/ColumnChart';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { TextInput } from '../../components/TextInput';
import { api, messageOf } from '../../lib/api';
import { formatDate, formatDuration, formatPercent, formatShortDate } from '../../lib/format';
import { VISITOR_TYPE_LABELS, addDays, todayInLagos, visitsQuery } from '../../lib/visits';
import type { Stats } from '../../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function DashboardPage() {
  const today = todayInLagos();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: addDays(today, -29), to: today });
  const [rangeError, setRangeError] = useState<string | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = visitsQuery({ from: range.from, to: range.to });

  useEffect(() => {
    let cancelled = false;
    api<Stats>('GET', `/stats${query}`)
      .then((s) => {
        if (!cancelled) {
          setStats(s);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(messageOf(err)));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (from && to && to < from) {
      setRangeError('The end date must be on or after the start date.');
      return;
    }
    setRangeError(undefined);
    setRange({ from, to });
  };

  const noVisits = stats !== null && stats.cards.visits_in_range === 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={stats ? `${formatDate(stats.from)} – ${formatDate(stats.to)}` : 'Visitor statistics'}
        actions={
          <a href={`/api/visits/export.csv${query}`} download className="inline-flex items-center rounded-full border border-primary px-6 py-2.5 text-[15px] font-semibold text-primary no-underline hover:bg-primary/5">
            Download CSV
          </a>
        }
      />
      <Card className="mb-6">
        <form onSubmit={apply} noValidate className="grid gap-x-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <TextInput label="From" name="from" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          <TextInput label="To" name="to" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} error={rangeError} />
          <Button type="submit" className="sm:mt-8">
            Apply
          </Button>
        </form>
      </Card>
      {error && <Banner tone="error">{error}</Banner>}
      {stats === null && !error ? (
        <p role="status">Loading…</p>
      ) : (
        stats && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Visitors today" value={String(stats.cards.visitors_today)} />
              <StatCard label="On site now" value={String(stats.cards.on_site_now)} />
              <StatCard label="Visits in range" value={String(stats.cards.visits_in_range)} hint="Cancelled visits excluded" />
              <StatCard label="Average visit" value={formatDuration(stats.cards.average_visit_minutes)} hint="Check-in to check-out" />
              <StatCard label="No-show rate" value={formatPercent(stats.cards.no_show_rate)} hint="Of visits whose day has come" />
            </div>
            {noVisits && <Banner tone="info">No visits in this range yet.</Banner>}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <ColumnChart
                  title="Visits per day"
                  data={stats.per_day.map((d) => ({ label: formatShortDate(d.date), value: d.count, tooltip: `${formatDate(d.date)} · ${d.count} ${d.count === 1 ? 'visit' : 'visits'}` }))}
                />
              </div>
              <BarList title="By visitor type" data={stats.by_type.map((t) => ({ label: VISITOR_TYPE_LABELS[t.type], value: t.count }))} empty="No visits yet." />
              <BarList title="Top departments" data={stats.by_department.map((d) => ({ label: d.department, value: d.count }))} empty="No visits yet." />
              <div className="lg:col-span-2">
                <ColumnChart
                  title="Arrivals by hour"
                  description="When visitors actually checked in"
                  labelEvery={3}
                  data={stats.by_hour.map((h) => ({ label: pad(h.hour), value: h.count, tooltip: `${pad(h.hour)}:00–${pad((h.hour + 1) % 24)}:00 · ${h.count} ${h.count === 1 ? 'arrival' : 'arrivals'}` }))}
                />
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}
```

`frontend/src/App.tsx`: import `DashboardPage` and add `<Route path="it/dashboard" element={<RequireRole roles={['it', 'admin']}><DashboardPage /></RequireRole>} />`.

The Plan 1 App test "IT lands on the dashboard…" now renders the real page; it checks only navigation links and the pathname, so its unmocked `/stats` call (a "Not found." banner) does not affect it.

- [ ] **Step 4: Run — expect pass** (`cd frontend && npx tsc -b && npm test && npm run build`).

- [ ] **Step 5: Commit** — `git add frontend/src && git commit -m "feat: IT dashboard with stat cards, visit charts and CSV download"`

---

### Task 4: Bluehost packaging and runbook

**Files:** Create `.htaccess`, `config.local.example.php`, `scripts/package.sh`, `tests/package_test.sh`, `docs/deploy-bluehost.md`

- [ ] **Step 1: Failing test** — `tests/package_test.sh`:

```bash
#!/usr/bin/env bash
# Builds the deploy zip and checks what it ships, and what it must never ship.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/package.sh >/dev/null
LIST=$(unzip -Z1 build/visitor-deploy.zip)
fail=0
need() { grep -qx "visitor/$1" <<<"$LIST" || { echo "MISSING: $1"; fail=1; }; }
never() { if grep -qE "^visitor/$1" <<<"$LIST"; then echo "MUST NOT SHIP: $1"; fail=1; fi; }
for f in index.html favicon.svg .htaccess config.php config.local.example.php api/index.php lib/bootstrap.php lib/visits.php lib/stats.php \
  migrations/001_init.sql migrations/002_indexes.sql migrations/migrate.php scripts/create-it-user.php storage/.htaccess; do
  need "$f"
done
grep -qE '^visitor/assets/index-[^/]+\.js$' <<<"$LIST" || { echo "MISSING: built JS bundle"; fail=1; }
for p in 'tests/' 'docs/' 'frontend/' 'node_modules/' 'config\.local\.php$' 'storage/sessions' 'storage/logs' '\.superpowers' '\.git/' 'build/'; do
  never "$p"
done
grep -q 'RewriteRule \^api' build/visitor/.htaccess || { echo "MISSING: API rewrite in .htaccess"; fail=1; }
[ "$fail" -eq 0 ] && echo "package OK"
exit "$fail"
```

Run: `chmod +x tests/package_test.sh && tests/package_test.sh` → fails (`scripts/package.sh: No such file or directory`).

- [ ] **Step 2: Implement**

`.htaccess`:

```apache
# Woodhall Capital Visitor Management — Apache config for the subdomain's document root.
Options -Indexes
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On

  # Always HTTPS.
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

  # Server code, configuration, migrations, scripts and private storage are never served.
  RewriteRule ^(lib|migrations|scripts|storage|tests|docs|vendor)(/|$) - [F,L]
  RewriteRule ^config(\.local|\.local\.example)?\.php$ - [F,L]
  # Dotfiles, except /.well-known (needed for SSL certificate renewal).
  RewriteRule (^|/)\.(?!well-known/) - [F,L]

  # The JSON API.
  RewriteRule ^api(/.*)?$ api/index.php [L,QSA]

  # Anything else that is not a real file is a front-end route.
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^ index.html [L]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Strict-Transport-Security "max-age=31536000"
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  <FilesMatch "\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "^index-.*\.(js|css)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
```

`config.local.example.php`:

```php
<?php
declare(strict_types=1);

// Copy to config.local.php on the server and fill in. config.local.php is never committed and never served.
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'CPANELUSER_visitor',
        'user' => 'CPANELUSER_visitor',
        'pass' => 'CHANGE-ME',
    ],
    'site_url' => 'https://visitor.woodhallcap.com',
    'cookie_secure' => true,
];
```

`scripts/package.sh`:

```bash
#!/usr/bin/env bash
# Builds the front end and assembles build/visitor/ and build/visitor-deploy.zip for Bluehost.
# The zip's visitor/ folder becomes the subdomain's document root.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd frontend && npm ci --no-audit --no-fund && npm run build)
OUT=build/visitor
rm -rf build && mkdir -p "$OUT/storage" "$OUT/scripts"
cp -R frontend/dist/. "$OUT/"
cp .htaccess config.php config.local.example.php "$OUT/"
cp -R api lib migrations "$OUT/"
cp scripts/create-it-user.php "$OUT/scripts/"
cp storage/.htaccess "$OUT/storage/.htaccess"
(cd build && zip -qr visitor-deploy.zip visitor)
echo "Built build/visitor-deploy.zip"
```

`docs/deploy-bluehost.md`:

````markdown
# Deploying to Bluehost (visitor.woodhallcap.com)

Audience: whoever holds the Bluehost cPanel login. Takes about 20 minutes the first time.

## What you need

- cPanel access for the account that hosts woodhallcap.com (box5735).
- The deploy zip: on a machine with Node 20+, run `scripts/package.sh` → `build/visitor-deploy.zip`.

## First deploy

1. **PHP version.** cPanel → *MultiPHP Manager* → set `visitor.woodhallcap.com` to **PHP 8.1 or newer**. Check *MultiPHP INI Editor* has `pdo_mysql` (it is on by default).
2. **Subdomain.** cPanel → *Domains* → make sure `visitor.woodhallcap.com` exists and note its **document root** (e.g. `/home/CPANELUSER/visitor.woodhallcap.com`).
3. **Database.** cPanel → *MySQL Databases*: create a database (e.g. `CPANELUSER_visitor`), a user with a long random password, and add the user to the database with **ALL PRIVILEGES**.
4. **Upload.** cPanel → *File Manager* → open the document root → *Upload* `visitor-deploy.zip` → *Extract*. Move the **contents** of the extracted `visitor/` folder up into the document root (so `index.html` and `.htaccess` sit directly in it), then delete the empty `visitor/` folder and the zip. Enable *Show Hidden Files* to see `.htaccess`.
5. **Configuration.** In the document root, copy `config.local.example.php` to `config.local.php` and fill in the database name, user and password from step 3. Keep `site_url` as `https://visitor.woodhallcap.com` and `cookie_secure` as `true`.
6. **Create the tables.** cPanel → *Terminal* (or SSH): `cd ~/visitor.woodhallcap.com && php migrations/migrate.php` → `Applied: 001_init.sql, 002_indexes.sql`. If `php` is an older version in the terminal, use the full path shown in MultiPHP Manager (e.g. `/usr/local/bin/ea-php81`).
7. **SSL.** cPanel → *SSL/TLS Status* → run **AutoSSL** for `visitor.woodhallcap.com` and wait for a green padlock.
8. **First IT account.** In the terminal: `php scripts/create-it-user.php --name="IT Person" --email="it@woodhallcap.com"`. Open the printed link within 72 hours to set the password, sign in, then invite admins and everyone else from **Users**.

## Check it (after every deploy)

Replace the host if different. Each command should print the status shown.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/                    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/login               # 200 (front-end route)
curl -s https://visitor.woodhallcap.com/api/health                                           # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/config.local.php    # 403
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/lib/db.php          # 403
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/storage/            # 403
curl -s -o /dev/null -w "%{http_code}\n" https://visitor.woodhallcap.com/migrations/001_init.sql  # 403
curl -s -o /dev/null -w "%{http_code}\n" http://visitor.woodhallcap.com/                     # 301 (to https)
curl -sI https://visitor.woodhallcap.com/ | grep -i content-security-policy                  # header present
```

If any of the 403 checks returns 200, stop and fix `.htaccess` before anyone uses the site: it means server files are downloadable.

## Updating

1. Build a new zip. 2. Upload and extract it next to the live files, then copy everything **except** `config.local.php` and `storage/` over the live document root. 3. Run `php migrations/migrate.php` (it only applies new migrations). 4. Run the checks above.

## Troubleshooting

- **Blank page or 500:** check `storage/logs/php-error.log` (File Manager) and cPanel → *Errors*.
- **Everyone is signed out after a few minutes:** confirm `storage/sessions/` exists and is writable by PHP (it is created automatically on the first request).
- **"Something went wrong" on sign-in:** usually the database settings in `config.local.php`.
````

- [ ] **Step 3: Run — expect pass**

Run: `chmod +x scripts/package.sh && tests/package_test.sh` → `package OK`.

The `.htaccess` rules are verified on the live host by the runbook's post-deploy checks (there is no Apache in local development).

- [ ] **Step 4: Commit** — `git add .htaccess config.local.example.php scripts/package.sh tests/package_test.sh docs/deploy-bluehost.md && git commit -m "build: Bluehost deploy package, hardened .htaccess and deploy runbook"`

---

### Task 5: README and verification

**Files:** Modify `README.md`

- [ ] **Step 1:** In `README.md`:
  - Replace the **Status** paragraph with: `**Status:** everything except email is built: sign-in, user management, departments, booking, the reception Today board, security views, the IT dashboard and CSV export. Email is the final milestone; until then admins share one-time set-password links.`
  - Add a section before `## Tests`:

```markdown
## Deploying

`scripts/package.sh` builds `build/visitor-deploy.zip` (front end + PHP + hardened `.htaccess`). Step-by-step instructions
for Bluehost, including the post-deploy security checks, are in [`docs/deploy-bluehost.md`](docs/deploy-bluehost.md).
```

  - In `## Tests` add a line: `tests/package_test.sh     # builds the deploy zip and checks its contents`.

- [ ] **Step 2:** Run `tests/run.sh`, `cd frontend && npx tsc -b && npm test && npm run build`, and `tests/package_test.sh` — all green.

- [ ] **Step 3:** Smoke-test against the dev API (`php -S localhost:8000 api/index.php`, after `php migrations/migrate.php`): as the dev IT account, `GET /api/stats` → 200 JSON with `cards`; `GET /api/visits/export.csv` → 200, `Content-Type: text/csv`, first line is the header row; as reception → 403.

- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: README status, deploying section and package test"`
