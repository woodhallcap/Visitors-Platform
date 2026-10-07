# Plan 2: Booking, Reception Board and Security Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (The user chose native execution for this plan: executing-plans.)

**Goal:** Staff and reception book visitors (with the meeting's expected-arrival time), reception checks visitors in and out on a live Today board, security watches who is on site, and IT/admin see the same visit data read-only where the spec says so.

**Architecture:** One new PHP service, `lib/visits.php` (create, list with role scoping and filters, edit/cancel, check-in/out, no-show sweep), with routes in `lib/routes/visits.php` and `GET /hosts`. Visit validation joins `lib/validator.php`. The front end gets a `useVisits` hook, a shared `VisitForm`, `VisitTable` and a `useManageVisits` edit/cancel hook, and eight pages wired into the existing role routes. Two carried-over review items are fixed first.

**Tech Stack:** As Plan 1 — PHP 8.1+ (no Composer), MySQL 5.7+/MariaDB 10.3+, React 19, TypeScript, Tailwind v4, React Router 7, Vitest + RTL, custom PHP test harness.

**Spec:** `docs/superpowers/specs/2026-10-06-visitor-system-design.md` (§3 permissions, §4 lifecycle, §5 form, §7 API, §8 screens). This plan covers §15 steps 4–6.

**Working directory:** `/Users/mac/Developer/woodhall/visitor`, branch `plan-2-visits`.

## Global Constraints

- Everything in Plan 1's Global Constraints still applies (PHP 8.1 ceiling, MySQL 5.7/MariaDB 10.3 SQL, WAT timezone, error envelope, CSRF on non-public writes, no email, no attribution trailers in commits).
- **Permissions (spec §3):** book — staff (host = self), reception and admin (any host); see visits — staff own (host = self), everyone else all; edit/cancel — staff own while `booked`, reception and admin any while `booked`; check in/out — **reception only**; security and IT never write visits.
- **Lifecycle (spec §4):** only `booked` visits can be edited or cancelled; check-in only for `booked` visits dated today (WAT); check-out only for `checked_in` visits (any date). No-show: `UPDATE … SET status='no_show' WHERE status='booked' AND visit_date < CURDATE()` runs (idempotently) at the start of every visits route. Overstay is derived in SQL: `checked_in` AND `expected_departure IS NOT NULL` AND `TIMESTAMP(visit_date, expected_departure) < NOW()`.
- **Form rules and messages (spec §5)** — identical in PHP and TS:
  - `visitor_name` 2–120 → "Enter the visitor's full name (2–120 characters)."
  - `visitor_phone` required, `^\+?\d{7,20}$` after removing spaces/dashes → "Enter a valid phone number."
  - `visitor_email` optional valid → "Enter a valid email address."
  - `visitor_company` optional ≤120 → "Use 120 characters or fewer."
  - `visitor_type` one of client, vendor, interviewee, contractor, guest → "Choose a visitor type."
  - `host_user_id` active user with role `staff` → "Choose the person being visited."
  - `visit_date` `YYYY-MM-DD` → "Enter a valid date."; before today → "Choose today or a later date."
  - `expected_arrival` required `HH:MM` 24 h → "Enter the expected arrival time (HH:MM)." (any time is allowed, including earlier today)
  - `expected_departure` optional `HH:MM` → "Enter a valid time (HH:MM)."; not after arrival → "Departure must be after arrival."
  - `purpose` 3–255 → "Enter the purpose of the visit (3–255 characters)."
  - `party_size` integer 0–50, default 0 → "Enter a number from 0 to 50."
  - Check-in fields optional: `badge_number` ≤30, `id_type` ≤40, `id_number` ≤40 → "Use 30 characters or fewer." / "Use 40 characters or fewer."
- **Decisions made in this plan** (rulings, spec is silent or ambiguous):
  - Hosts are active users whose role is `staff` (spec §5 "active staff").
  - Staff never receive `id_type`/`id_number` (returned as `null`) — ID details are for reception/security/IT/admin.
  - Admin bookings use channel `reception`; staff bookings use `staff`.
  - `GET /visits` returns at most 500 rows, newest visit date first.
- Times are sent and returned as `HH:MM`; dates as `YYYY-MM-DD` (WAT). The browser computes "today" with `Intl.DateTimeFormat(…, { timeZone: 'Africa/Lagos' })`, never the device timezone.
- Security pages and the Today board auto-refresh every 30 seconds.

## Review Focus

1. **Midnight in Lagos vs the device clock** — a reception PC set to UTC at 23:30 UTC is already the next day in Lagos. Expected: "today" (board, defaults, date minimum) follows Lagos. Test in Task 5 (`todayInLagos` at 2026-10-07T23:30Z → `2026-10-08`).
2. **Double check-in / race** — two reception desks clicking Check in on the same card. Expected: one succeeds, the other gets 409 and nothing is overwritten (conditional `UPDATE … WHERE status='booked'`). Test in Task 3.
3. **Visitor checked in yesterday, still on site** — expected: shown under On site and checkable-out today. Tests in Task 3 (PHP) and Task 7 (board shows on-site visits from any date).
4. **Staff guessing another staff member's visit id** — expected: 404 on edit/cancel and absent from their list. Test in Task 3/2.
5. **Search text with SQL wildcards** (`%`, `_`) — expected: matched literally. Test in Task 2.

---

## File map

```
lib/db.php                         + db_transaction()
lib/users.php                      user_update runs inside a locking transaction (carry-over)
lib/validator.php                  + VISITOR_TYPES, validate_time(), validate_date(), validate_visit(), validate_check_in()
lib/visits.php                     visit service (new)
lib/routes/visits.php              /visits, /visits/{id}, check-in, check-out, /hosts (new)
lib/app.php                        register_visit_routes
tests/php/fixtures.php             + make_visit()
tests/php/test_visits.php          (new)
tests/php/test_users.php           + transaction test
frontend/src/types.ts              + VisitorType, VISITOR_TYPES, VisitStatus, Visit, Host
frontend/src/lib/visits.ts         labels, Lagos date/time helpers, form values, validation, payload, query builder (new)
frontend/src/lib/format.ts         + formatDate(), formatTime()
frontend/src/lib/useVisits.ts      data hook with refresh (new)
frontend/src/components/Pill.tsx   + primary, copper, struck tones
frontend/src/components/VisitStatusPill.tsx, VisitForm.tsx, VisitTable.tsx, CheckInDialog.tsx, ConfirmDialog.tsx (new)
frontend/src/lib/useManageVisits.tsx  edit/cancel dialogs (new)
frontend/src/pages/staff/{MyVisitorsPage,BookVisitorPage}.tsx
frontend/src/pages/reception/{TodayPage,WalkInPage}.tsx
frontend/src/pages/visits/VisitSearchPage.tsx
frontend/src/pages/security/{OnSitePage,TodayLogPage}.tsx
frontend/src/pages/auth/LoginPage.tsx  from-check also rejects backslash (carry-over)
frontend/src/App.tsx               routes
frontend/src/test-utils.tsx        query-less fallback in mockFetch; RECEPTION/SECURITY fixtures; makeVisit()
```

---

### Task 1: Carry-over fixes — locking user updates, stricter redirect check

**Files:** Modify `lib/db.php`, `lib/users.php`, `frontend/src/pages/auth/LoginPage.tsx`; Test `tests/php/test_users.php`, `frontend/src/App.test.tsx`

**Interfaces:** Produces `db_transaction(callable $fn): mixed` (begins, runs, commits; rolls back and rethrows on any Throwable).

- [ ] **Step 1: Failing tests**

Append to `tests/php/test_users.php` before `test_summary();`:

```php
db_test('a failed user update rolls back and leaves no open transaction', function () {
    $target = make_user('security');
    act_as(make_user('admin'));
    assert_status(422, request('PATCH', "/users/{$target['id']}", ['email' => 'not-an-email']));
    assert_equal(false, db()->inTransaction());
    assert_status(200, request('PATCH', "/users/{$target['id']}", ['full_name' => 'Still Works']));
});

test_case('db_transaction commits on success and rolls back on error', function () {
    reset_tables();
    db_transaction(fn() => db_exec("INSERT INTO departments (name) VALUES ('Kept')"));
    try {
        db_transaction(function () {
            db_exec("INSERT INTO departments (name) VALUES ('Dropped')");
            throw new RuntimeException('boom');
        });
    } catch (RuntimeException $e) {
    }
    assert_equal(['Kept'], array_column(db_all('SELECT name FROM departments'), 'name'));
    assert_equal(false, db()->inTransaction());
});
```

Append to `frontend/src/App.test.tsx`:

```tsx
test('a from path starting with a backslash is ignored after sign-in', async () => {
  mockFetch({ ...signedOut, 'POST /auth/login': () => [200, { user: STAFF, csrf_token: 'tok' }] });
  window.history.pushState({ usr: { from: '/\\evil.example' }, key: 'x', idx: 0 }, '', '/login');
  render(<App />);
  await userEvent.type(await screen.findByLabelText('Email'), 'chidi@woodhallcap.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('heading', { name: 'Coming soon' });
  expect(window.location.pathname).toBe('/my-visitors');
});
```

Add to the imports at the top of `App.test.tsx` (if not present): `import { render } from '@testing-library/react';`, `import App from './App';`, `import { mockFetch } from './test-utils';`.

- [ ] **Step 2: Run — expect failure**

`php tests/php/test_users.php` → fatal `Call to undefined function db_transaction()`. `cd frontend && npx vitest run src/App.test.tsx` → the backslash test fails (navigates away from `/my-visitors`).

- [ ] **Step 3: Implement**

Append to `lib/db.php`:

```php
/** Runs $fn in a transaction: commits on success, rolls back and rethrows on any error. */
function db_transaction(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}
```

In `lib/users.php`, rename the existing `function user_update(int $id, array $input, array $actor): array` to `function user_update_locked(int $id, array $input, array $actor): array` (body unchanged) and add above it:

```php
/**
 * Locks the row first so a concurrent change (e.g. IT promoting this user) commits before we read it:
 * the permission check then sees the current role, never a stale one.
 */
function user_update(int $id, array $input, array $actor): array
{
    return db_transaction(function () use ($id, $input, $actor) {
        db_one('SELECT id FROM users WHERE id = ? FOR UPDATE', [$id]);
        return user_update_locked($id, $input, $actor);
    });
}
```

In `frontend/src/pages/auth/LoginPage.tsx` line 24 change `/^\/(?!\/)/` to `/^\/(?![/\\])/`.

- [ ] **Step 4: Run — expect pass**

`tests/run.sh` (all files 0 failed); `cd frontend && npx tsc -b && npm test`.

- [ ] **Step 5: Commit**

`git commit -am "fix: lock the user row during updates; reject backslash redirect targets"` (add new files explicitly if any).

---

### Task 2: Visit validation, creation, hosts and listing (API)

**Files:** Modify `lib/validator.php`, `lib/app.php`, `tests/php/fixtures.php`; Create `lib/visits.php`, `lib/routes/visits.php`, `tests/php/test_visits.php`

**Interfaces:**
- `const VISITOR_TYPES`, `const VISIT_STATUSES = ['booked','checked_in','checked_out','cancelled','no_show']`, `const VISITS_LIST_LIMIT = 500`.
- `validate_time(mixed $v): ?string`, `validate_date(mixed $v): ?string` (strict `Y-m-d` or null), `validate_visit(array $in): array` (throws validation; returns `visitor_name, visitor_phone, visitor_email (?string), visitor_company (?string), visitor_type, visit_date, expected_arrival, expected_departure (?string), purpose, party_size (int)`).
- `visits_sweep_no_shows(): void`, `visit_row(array $row, ?array $viewer = null): array`, `visit_find(int $id, ?array $viewer = null): ?array`, `visit_validate_with_host(array $in, mixed $hostId): array` → `[$data, $host]` with `$host = ['id' => int, 'department_id' => ?int]`, `visit_create(array $in, array $actor): array`, `visits_list(array $query, array $viewer): array`, `hosts_list(): array`.
- A visit array: `id, visitor_name, visitor_phone, visitor_email, visitor_company, visitor_type, host_user_id, host_name, department_id, department_name, booked_by_user_id, booked_by_name, channel, visit_date, expected_arrival (HH:MM), expected_departure (HH:MM|null), purpose, party_size, status, checked_in_at, checked_in_by, checked_in_by_name, checked_out_at, checked_out_by, checked_out_by_name, badge_number, id_type, id_number, cancelled_at, cancelled_by, created_at, overstayed (bool)`.
- Routes: `POST /visits` (staff, reception, admin) → 201 `{visit}`; `GET /visits?date_from&date_to&status&q&activity_date` (any signed-in role, scoped) → `{visits}`; `GET /hosts` (reception, admin) → `{hosts: [{id, full_name, department_name}]}`.
- Fixture `make_visit(array $o = []): array` — defaults: new staff host, booked by host, `visit_date` today, arrival `10:00`, status `booked`; overrides any column.

- [ ] **Step 1: Fixture**

Append to `tests/php/fixtures.php`:

```php
function make_visit(array $o = []): array
{
    $host = isset($o['host_user_id']) ? user_find($o['host_user_id']) : make_user('staff');
    $row = array_merge([
        'visitor_name' => 'Tola Ade',
        'visitor_phone' => '08031234567',
        'visitor_email' => null,
        'visitor_company' => 'Acme Ltd',
        'visitor_type' => 'client',
        'host_user_id' => $host['id'],
        'department_id' => $host['department_id'],
        'booked_by_user_id' => $host['id'],
        'channel' => 'staff',
        'visit_date' => date('Y-m-d'),
        'expected_arrival' => '10:00',
        'expected_departure' => null,
        'purpose' => 'Quarterly review',
        'party_size' => 0,
        'status' => 'booked',
    ], $o);
    $columns = array_keys($row);
    $id = db_insert(
        'INSERT INTO visits (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
        array_values($row)
    );
    return visit_find($id);
}

function visit_body(array $o = []): array
{
    return array_merge([
        'visitor_name' => 'Tola Ade',
        'visitor_phone' => '0803 123 4567',
        'visitor_email' => 'tola@acme.example',
        'visitor_company' => 'Acme Ltd',
        'visitor_type' => 'client',
        'visit_date' => date('Y-m-d', strtotime('+1 day')),
        'expected_arrival' => '10:30',
        'expected_departure' => '11:30',
        'purpose' => 'Quarterly review',
        'party_size' => 1,
    ], $o);
}
```

- [ ] **Step 2: Failing tests**

Create `tests/php/test_visits.php`:

```php
<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

const TOMORROW_OFFSET = '+1 day';

function tomorrow(): string
{
    return date('Y-m-d', strtotime(TOMORROW_OFFSET));
}

// ---- create ----

db_test('staff book visitors for themselves; host_user_id in the body is ignored', function () {
    $finance = make_department('Finance');
    $staff = make_user('staff', ['department_id' => $finance['id'], 'full_name' => 'Chidi Okafor']);
    $other = make_user('staff');
    act_as($staff);
    $response = request('POST', '/visits', visit_body(['host_user_id' => $other['id']]));
    assert_status(201, $response);
    $visit = $response->body['visit'];
    assert_equal($staff['id'], $visit['host_user_id']);
    assert_equal('Chidi Okafor', $visit['host_name']);
    assert_equal('Finance', $visit['department_name']);
    assert_equal('staff', $visit['channel']);
    assert_equal('booked', $visit['status']);
    assert_equal('08031234567', $visit['visitor_phone']);
    assert_equal('10:30', $visit['expected_arrival']);
    assert_equal('11:30', $visit['expected_departure']);
    assert_equal(1, $visit['party_size']);
    assert_equal(false, $visit['overstayed']);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.create'")['n']);
});

db_test('reception and admin book for a chosen host; the host department is copied', function () {
    $legal = make_department('Legal');
    $host = make_user('staff', ['department_id' => $legal['id']]);
    foreach (['reception', 'admin'] as $role) {
        act_as(make_user($role));
        $response = request('POST', '/visits', visit_body(['host_user_id' => $host['id']]));
        assert_status(201, $response);
        assert_equal($host['id'], $response->body['visit']['host_user_id']);
        assert_equal($legal['id'], $response->body['visit']['department_id']);
        assert_equal('reception', $response->body['visit']['channel']);
    }
});

db_test('the host must be an active staff member', function () {
    $inactive = make_user('staff', ['active' => false]);
    $security = make_user('security');
    act_as(make_user('reception'));
    foreach ([null, 999, '5', $inactive['id'], $security['id']] as $hostId) {
        $body = visit_body();
        if ($hostId !== null) {
            $body['host_user_id'] = $hostId;
        }
        $response = request('POST', '/visits', $body);
        assert_status(422, $response);
        assert_equal('Choose the person being visited.', $response->body['error']['fields']['host_user_id']);
    }
});

db_test('every visit field is validated with the spec messages', function () {
    act_as(make_user('staff'));
    $response = request('POST', '/visits', [
        'visitor_name' => 'A', 'visitor_phone' => '123', 'visitor_email' => 'nope', 'visitor_company' => str_repeat('x', 121),
        'visitor_type' => 'friend', 'visit_date' => '2026-02-30', 'expected_arrival' => '25:00',
        'expected_departure' => '9am', 'purpose' => 'hi', 'party_size' => 51,
    ]);
    assert_status(422, $response);
    assert_equal([
        'visitor_name' => "Enter the visitor's full name (2–120 characters).",
        'visitor_phone' => 'Enter a valid phone number.',
        'visitor_email' => 'Enter a valid email address.',
        'visitor_company' => 'Use 120 characters or fewer.',
        'visitor_type' => 'Choose a visitor type.',
        'visit_date' => 'Enter a valid date.',
        'expected_arrival' => 'Enter the expected arrival time (HH:MM).',
        'expected_departure' => 'Enter a valid time (HH:MM).',
        'purpose' => 'Enter the purpose of the visit (3–255 characters).',
        'party_size' => 'Enter a number from 0 to 50.',
    ], $response->body['error']['fields']);
});

db_test('dates before today are refused; today with any arrival time is fine; departure must follow arrival', function () {
    act_as(make_user('staff'));
    $past = request('POST', '/visits', visit_body(['visit_date' => date('Y-m-d', strtotime('-1 day'))]));
    assert_equal('Choose today or a later date.', $past->body['error']['fields']['visit_date']);
    assert_status(201, request('POST', '/visits', visit_body(['visit_date' => date('Y-m-d'), 'expected_arrival' => '00:05', 'expected_departure' => null])));
    $backwards = request('POST', '/visits', visit_body(['expected_arrival' => '14:00', 'expected_departure' => '14:00']));
    assert_equal('Departure must be after arrival.', $backwards->body['error']['fields']['expected_departure']);
});

db_test('optional fields may be empty and party size defaults to 0', function () {
    act_as(make_user('staff'));
    $body = visit_body(['visitor_email' => '', 'visitor_company' => '', 'expected_departure' => '']);
    unset($body['party_size']);
    $visit = request('POST', '/visits', $body)->body['visit'];
    assert_equal(null, $visit['visitor_email']);
    assert_equal(null, $visit['visitor_company']);
    assert_equal(null, $visit['expected_departure']);
    assert_equal(0, $visit['party_size']);
});

db_test('security and IT cannot book visitors', function () {
    $host = make_user('staff');
    foreach (['security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('POST', '/visits', visit_body(['host_user_id' => $host['id']])));
    }
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM visits')['n']);
});

// ---- hosts ----

db_test('hosts are active staff, sorted by name, for reception and admin only', function () {
    $finance = make_department('Finance');
    make_user('staff', ['full_name' => 'Zainab Bello', 'department_id' => $finance['id']]);
    make_user('staff', ['full_name' => 'Ade Cole', 'department_id' => $finance['id']]);
    make_user('staff', ['full_name' => 'Gone Person', 'active' => false]);
    make_user('security', ['full_name' => 'Sam Guard']);
    act_as(make_user('reception'));
    $hosts = request('GET', '/hosts')->body['hosts'];
    assert_equal(['Ade Cole', 'Zainab Bello'], array_column($hosts, 'full_name'));
    assert_equal(['id', 'full_name', 'department_name'], array_keys($hosts[0]));
    assert_equal('Finance', $hosts[0]['department_name']);
    act_as(make_user('admin'));
    assert_status(200, request('GET', '/hosts'));
    foreach (['staff', 'security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/hosts'));
    }
});

// ---- list ----

db_test('staff see only their own visits, without ID details', function () {
    $staff = make_user('staff');
    make_visit(['host_user_id' => $staff['id'], 'id_type' => 'Passport', 'id_number' => 'A123']);
    make_visit();
    act_as($staff);
    $visits = request('GET', '/visits')->body['visits'];
    assert_equal(1, count($visits));
    assert_equal($staff['id'], $visits[0]['host_user_id']);
    assert_equal(null, $visits[0]['id_type']);
    assert_equal(null, $visits[0]['id_number']);
});

db_test('every other role sees all visits, including ID details', function () {
    make_visit(['id_type' => 'Passport', 'id_number' => 'A123']);
    make_visit();
    foreach (['reception', 'security', 'it', 'admin'] as $role) {
        act_as(make_user($role));
        $visits = request('GET', '/visits')->body['visits'];
        assert_equal(2, count($visits), $role);
    }
    act_as(make_user('security'));
    $withId = array_values(array_filter(request('GET', '/visits')->body['visits'], fn($v) => $v['id_number'] !== null));
    assert_equal('A123', $withId[0]['id_number']);
});

db_test('date range, status list and search filters', function () {
    $host = make_user('staff', ['full_name' => 'Kemi Host']);
    make_visit(['visit_date' => date('Y-m-d'), 'visitor_name' => 'Today Person']);
    make_visit(['visit_date' => tomorrow(), 'visitor_name' => 'Tomorrow Person', 'host_user_id' => $host['id']]);
    make_visit(['visit_date' => tomorrow(), 'visitor_name' => 'Cancelled Person', 'status' => 'cancelled', 'visitor_company' => 'Zeta Co']);
    act_as(make_user('reception'));
    $names = fn(array $q) => array_column(request('GET', '/visits', [], $q)->body['visits'], 'visitor_name');
    assert_equal(['Today Person'], $names(['date_from' => date('Y-m-d'), 'date_to' => date('Y-m-d')]));
    assert_equal(['Tomorrow Person'], $names(['date_from' => tomorrow(), 'status' => 'booked']));
    assert_equal(2, count($names(['status' => 'booked,cancelled', 'date_from' => tomorrow()])));
    assert_equal(['Cancelled Person'], $names(['q' => 'zeta']));
    assert_equal(['Tomorrow Person'], $names(['q' => 'kemi']));
    assert_status(422, request('GET', '/visits', [], ['date_from' => '07/10/2026']));
    $badStatus = request('GET', '/visits', [], ['status' => 'gone']);
    assert_status(422, $badStatus);
    assert_equal('Choose a valid status.', $badStatus->body['error']['fields']['status']);
});

db_test('search treats % and _ literally', function () {
    make_visit(['visitor_name' => 'Percent 100% Ltd']);
    make_visit(['visitor_name' => 'Plain Name']);
    act_as(make_user('reception'));
    assert_equal(['Percent 100% Ltd'], array_column(request('GET', '/visits', [], ['q' => '100%'])->body['visits'], 'visitor_name'));
    assert_equal([], request('GET', '/visits', [], ['q' => '_'])->body['visits']);
});

db_test('activity_date returns visits checked in or out that day', function () {
    make_visit(['visitor_name' => 'In Today', 'status' => 'checked_in', 'checked_in_at' => date('Y-m-d') . ' 09:00:00']);
    make_visit(['visitor_name' => 'Out Today', 'status' => 'checked_out', 'visit_date' => date('Y-m-d', strtotime('-1 day')),
        'checked_in_at' => date('Y-m-d', strtotime('-1 day')) . ' 15:00:00', 'checked_out_at' => date('Y-m-d') . ' 08:00:00']);
    make_visit(['visitor_name' => 'Just Booked']);
    act_as(make_user('security'));
    $names = array_column(request('GET', '/visits', [], ['activity_date' => date('Y-m-d')])->body['visits'], 'visitor_name');
    sort($names);
    assert_equal(['In Today', 'Out Today'], $names);
});

db_test('booked visits from earlier days become no-shows on the next visits request', function () {
    $old = make_visit(['visit_date' => date('Y-m-d', strtotime('-1 day'))]);
    $today = make_visit();
    act_as(make_user('reception'));
    request('GET', '/visits');
    assert_equal('no_show', visit_find($old['id'])['status']);
    assert_equal('booked', visit_find($today['id'])['status']);
});

db_test('overstay is derived from the expected departure', function () {
    $late = make_visit(['status' => 'checked_in', 'checked_in_at' => date('Y-m-d') . ' 00:01:00',
        'expected_arrival' => '00:00', 'expected_departure' => '00:01']);
    $fine = make_visit(['status' => 'checked_in', 'visit_date' => tomorrow(), 'expected_departure' => '23:59']);
    $gone = make_visit(['status' => 'checked_out', 'expected_arrival' => '00:00', 'expected_departure' => '00:01']);
    assert_equal(true, visit_find($late['id'])['overstayed']);
    assert_equal(false, visit_find($fine['id'])['overstayed']);
    assert_equal(false, visit_find($gone['id'])['overstayed']);
});

test_summary();
```

Note the overstay test relies on the clock being past 00:01 WAT, which is always true except during the first minute of the day.

- [ ] **Step 3: Run — expect failure**

`php tests/php/test_visits.php` → fatal `Call to undefined function visit_find()` (from the fixture) or 404s.

- [ ] **Step 4: Implement validation**

Append to `lib/validator.php`:

```php
const VISITOR_TYPES = ['client', 'vendor', 'interviewee', 'contractor', 'guest'];

function validate_time(mixed $value): ?string
{
    return is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) ? $value : null;
}

/** A strict YYYY-MM-DD calendar date, or null. */
function validate_date(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date !== false && $date->format('Y-m-d') === $value ? $value : null;
}

/** Shape and format checks for a visit (spec §5). Host rules live in the visits service. */
function validate_visit(array $input): array
{
    $errors = [];

    $name = clean_text($input['visitor_name'] ?? '');
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        $errors['visitor_name'] = "Enter the visitor's full name (2–120 characters).";
    }

    $phone = normalize_phone(clean_text($input['visitor_phone'] ?? ''));
    if ($phone === null) {
        $errors['visitor_phone'] = 'Enter a valid phone number.';
    }

    $email = normalize_email($input['visitor_email'] ?? '');
    if ($email !== '' && (strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
        $errors['visitor_email'] = 'Enter a valid email address.';
    }

    $company = clean_text($input['visitor_company'] ?? '');
    if (mb_strlen($company) > 120) {
        $errors['visitor_company'] = 'Use 120 characters or fewer.';
    }

    $type = $input['visitor_type'] ?? '';
    if (!in_array($type, VISITOR_TYPES, true)) {
        $errors['visitor_type'] = 'Choose a visitor type.';
    }

    $date = validate_date($input['visit_date'] ?? null);
    if ($date === null) {
        $errors['visit_date'] = 'Enter a valid date.';
    } elseif ($date < date('Y-m-d')) {
        $errors['visit_date'] = 'Choose today or a later date.';
    }

    $arrival = validate_time($input['expected_arrival'] ?? null);
    if ($arrival === null) {
        $errors['expected_arrival'] = 'Enter the expected arrival time (HH:MM).';
    }

    $departure = null;
    $rawDeparture = $input['expected_departure'] ?? null;
    if ($rawDeparture !== null && $rawDeparture !== '') {
        $departure = validate_time($rawDeparture);
        if ($departure === null) {
            $errors['expected_departure'] = 'Enter a valid time (HH:MM).';
        } elseif ($arrival !== null && $departure <= $arrival) {
            $errors['expected_departure'] = 'Departure must be after arrival.';
        }
    }

    $purpose = clean_text($input['purpose'] ?? '');
    if (mb_strlen($purpose) < 3 || mb_strlen($purpose) > 255) {
        $errors['purpose'] = 'Enter the purpose of the visit (3–255 characters).';
    }

    $party = $input['party_size'] ?? 0;
    if (!is_int($party) || $party < 0 || $party > 50) {
        $errors['party_size'] = 'Enter a number from 0 to 50.';
    }

    if ($errors) {
        throw HttpError::validation($errors);
    }
    return [
        'visitor_name' => $name,
        'visitor_phone' => $phone,
        'visitor_email' => $email === '' ? null : $email,
        'visitor_company' => $company === '' ? null : $company,
        'visitor_type' => $type,
        'visit_date' => $date,
        'expected_arrival' => $arrival,
        'expected_departure' => $departure,
        'purpose' => $purpose,
        'party_size' => $party,
    ];
}
```

- [ ] **Step 5: Implement the service and routes**

`lib/visits.php`:

```php
<?php
declare(strict_types=1);

const VISIT_STATUSES = ['booked', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
const VISITS_LIST_LIMIT = 500;

const VISIT_SELECT = "SELECT v.*, h.full_name AS host_name, d.name AS department_name, b.full_name AS booked_by_name,
        ci.full_name AS checked_in_by_name, co.full_name AS checked_out_by_name,
        (v.status = 'checked_in' AND v.expected_departure IS NOT NULL
            AND TIMESTAMP(v.visit_date, v.expected_departure) < NOW()) AS overstayed
    FROM visits v
    JOIN users h ON h.id = v.host_user_id
    JOIN users b ON b.id = v.booked_by_user_id
    LEFT JOIN departments d ON d.id = v.department_id
    LEFT JOIN users ci ON ci.id = v.checked_in_by
    LEFT JOIN users co ON co.id = v.checked_out_by";

/** Spec §4: booked visits from earlier days are no-shows. Idempotent and index-backed, so it runs on every visits request. */
function visits_sweep_no_shows(): void
{
    db_exec("UPDATE visits SET status = 'no_show' WHERE status = 'booked' AND visit_date < CURDATE()");
}

function visit_row(array $row, ?array $viewer = null): array
{
    $row['overstayed'] = (bool) $row['overstayed'];
    $row['expected_arrival'] = substr($row['expected_arrival'], 0, 5);
    $row['expected_departure'] = $row['expected_departure'] === null ? null : substr($row['expected_departure'], 0, 5);
    if ($viewer !== null && $viewer['role'] === 'staff') {
        // ID details are for reception, security, IT and admin only.
        $row['id_type'] = null;
        $row['id_number'] = null;
    }
    unset($row['updated_at']);
    return $row;
}

function visit_find(int $id, ?array $viewer = null): ?array
{
    $row = db_one(VISIT_SELECT . ' WHERE v.id = ?', [$id]);
    return $row === null ? null : visit_row($row, $viewer);
}

/** Validates the visit fields and the host together, so the form gets every error at once. */
function visit_validate_with_host(array $input, mixed $hostId): array
{
    $fields = [];
    $data = null;
    try {
        $data = validate_visit($input);
    } catch (HttpError $e) {
        $fields = $e->fields;
    }
    $host = is_int($hostId)
        ? db_one("SELECT id, department_id FROM users WHERE id = ? AND role = 'staff' AND active = 1", [$hostId])
        : null;
    if ($host === null) {
        $fields['host_user_id'] = 'Choose the person being visited.';
    }
    if ($fields) {
        throw HttpError::validation($fields);
    }
    return [$data, $host];
}

function visit_create(array $input, array $actor): array
{
    $isStaff = $actor['role'] === 'staff';
    [$data, $host] = visit_validate_with_host($input, $isStaff ? $actor['id'] : ($input['host_user_id'] ?? null));
    $id = db_insert(
        'INSERT INTO visits (visitor_name, visitor_phone, visitor_email, visitor_company, visitor_type, host_user_id,
            department_id, booked_by_user_id, channel, visit_date, expected_arrival, expected_departure, purpose, party_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $data['visitor_name'], $data['visitor_phone'], $data['visitor_email'], $data['visitor_company'], $data['visitor_type'],
            $host['id'], $host['department_id'], $actor['id'], $isStaff ? 'staff' : 'reception',
            $data['visit_date'], $data['expected_arrival'], $data['expected_departure'], $data['purpose'], $data['party_size'],
        ]
    );
    audit($actor['id'], 'visit.create', 'visit', $id, ['host_user_id' => $host['id']]);
    return visit_find($id, $actor);
}

function visit_query_date(array $query, string $key): ?string
{
    $value = $query[$key] ?? null;
    if ($value === null || $value === '') {
        return null;
    }
    return validate_date($value) ?? throw HttpError::validation([$key => 'Enter a valid date.']);
}

function visits_list(array $query, array $viewer): array
{
    $where = [];
    $params = [];
    if ($viewer['role'] === 'staff') {
        $where[] = 'v.host_user_id = ?';
        $params[] = $viewer['id'];
    }
    if ($from = visit_query_date($query, 'date_from')) {
        $where[] = 'v.visit_date >= ?';
        $params[] = $from;
    }
    if ($to = visit_query_date($query, 'date_to')) {
        $where[] = 'v.visit_date <= ?';
        $params[] = $to;
    }
    if ($day = visit_query_date($query, 'activity_date')) {
        $where[] = '(DATE(v.checked_in_at) = ? OR DATE(v.checked_out_at) = ?)';
        array_push($params, $day, $day);
    }
    $status = $query['status'] ?? '';
    if (is_string($status) && $status !== '') {
        $statuses = explode(',', $status);
        if (array_diff($statuses, VISIT_STATUSES)) {
            throw HttpError::validation(['status' => 'Choose a valid status.']);
        }
        $where[] = 'v.status IN (' . implode(', ', array_fill(0, count($statuses), '?')) . ')';
        array_push($params, ...$statuses);
    }
    $search = clean_text($query['q'] ?? '');
    if ($search !== '') {
        $like = '%' . addcslashes($search, '%_\\') . '%';
        $where[] = '(v.visitor_name LIKE ? OR v.visitor_company LIKE ? OR v.visitor_phone LIKE ? OR h.full_name LIKE ?)';
        array_push($params, $like, $like, $like, $like);
    }
    $sql = VISIT_SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY v.visit_date DESC, v.expected_arrival DESC, v.id DESC LIMIT ' . VISITS_LIST_LIMIT;
    return array_map(fn(array $row) => visit_row($row, $viewer), db_all($sql, $params));
}

function hosts_list(): array
{
    return db_all(
        "SELECT u.id, u.full_name, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.role = 'staff' AND u.active = 1 ORDER BY u.full_name, u.id"
    );
}
```

`lib/routes/visits.php`:

```php
<?php
declare(strict_types=1);

function register_visit_routes(Router $r): void
{
    $r->add('GET', '/visits', function (Request $req) {
        $viewer = require_user();
        visits_sweep_no_shows();
        return ['visits' => visits_list($req->query, $viewer)];
    });
    $r->add('POST', '/visits', function (Request $req) {
        $actor = require_role('staff', 'reception', 'admin');
        visits_sweep_no_shows();
        return new Response(201, ['visit' => visit_create($req->body, $actor)]);
    });
    $r->add('GET', '/hosts', function (Request $req) {
        require_role('reception', 'admin');
        return ['hosts' => hosts_list()];
    });
}
```

In `lib/app.php` `app_router()` add `register_visit_routes($router);` after `register_user_routes($router);`.

- [ ] **Step 6: Run — expect pass**

`php tests/php/test_visits.php` → all pass; `tests/run.sh` all files 0 failed.

- [ ] **Step 7: Commit**

```bash
git add lib tests
git commit -m "feat: visit booking, host list and role-scoped visit search API"
```

---

### Task 3: Edit, cancel, check-in and check-out (API)

**Files:** Modify `lib/validator.php`, `lib/visits.php`, `lib/routes/visits.php`; Test `tests/php/test_visits.php`

**Interfaces:**
- `validate_check_in(array $in): array` → `['badge_number' => ?string, 'id_type' => ?string, 'id_number' => ?string]`.
- `visit_update(int $id, array $in, array $actor): array`, `visit_check_in(int $id, array $in, array $actor): array`, `visit_check_out(int $id, array $actor): array`.
- Routes: `PATCH /visits/{id}` (staff own, reception, admin; staff on another's visit → 404) → `{visit}`; `POST /visits/{id}/check-in` and `/check-out` (reception only) → `{visit}`.
- Messages: 404 `'Visit not found.'`; 409 `'Only booked visits can be changed.'`, `'Only visitors booked for today can be checked in.'`, `'Only visitors on site can be checked out.'`; 422 `status` `'Invalid value.'`.
- Audit: `visit.update` (`fields`), `visit.cancel`, `visit.check_in`, `visit.check_out`.

- [ ] **Step 1: Failing tests** — append to `tests/php/test_visits.php` before `test_summary();`:

```php
// ---- edit / cancel ----

db_test('staff edit their own booked visit but cannot move it to another host', function () {
    $staff = make_user('staff');
    $other = make_user('staff');
    $visit = make_visit(['host_user_id' => $staff['id'], 'visit_date' => tomorrow()]);
    act_as($staff);
    $response = request('PATCH', "/visits/{$visit['id']}", ['visitor_name' => 'Renamed Visitor', 'expected_arrival' => '15:00', 'host_user_id' => $other['id']]);
    assert_status(200, $response);
    assert_equal('Renamed Visitor', $response->body['visit']['visitor_name']);
    assert_equal('15:00', $response->body['visit']['expected_arrival']);
    assert_equal($staff['id'], $response->body['visit']['host_user_id']);
    $audit = json_decode(db_one("SELECT details FROM audit_log WHERE action = 'visit.update'")['details'], true);
    assert_equal(['visitor_name', 'expected_arrival'], $audit['fields']);
});

db_test("staff cannot see or change another staff member's visit", function () {
    $visit = make_visit();
    act_as(make_user('staff'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['visitor_name' => 'Hijacked']);
    assert_status(404, $response);
    assert_equal('Visit not found.', $response->body['error']['message']);
    assert_status(404, request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']));
    assert_equal('Tola Ade', visit_find($visit['id'])['visitor_name']);
});

db_test('reception moves a visit to another host and the department follows', function () {
    $legal = make_department('Legal');
    $newHost = make_user('staff', ['department_id' => $legal['id']]);
    $visit = make_visit(['visit_date' => tomorrow()]);
    act_as(make_user('reception'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['host_user_id' => $newHost['id']]);
    assert_status(200, $response);
    assert_equal($newHost['id'], $response->body['visit']['host_user_id']);
    assert_equal($legal['id'], $response->body['visit']['department_id']);
});

db_test('edits are validated like new bookings', function () {
    $visit = make_visit(['visit_date' => tomorrow()]);
    act_as(make_user('admin'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['expected_departure' => '09:00', 'expected_arrival' => '10:00']);
    assert_status(422, $response);
    assert_equal('Departure must be after arrival.', $response->body['error']['fields']['expected_departure']);
});

db_test('cancelling records who and when; only booked visits can change', function () {
    $visit = make_visit();
    $reception = make_user('reception');
    act_as($reception);
    $response = request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']);
    assert_status(200, $response);
    assert_equal('cancelled', $response->body['visit']['status']);
    assert_equal($reception['id'], $response->body['visit']['cancelled_by']);
    assert_true($response->body['visit']['cancelled_at'] !== null);
    $again = request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']);
    assert_status(409, $again);
    assert_equal('Only booked visits can be changed.', $again->body['error']['message']);
    assert_status(409, request('PATCH', "/visits/{$visit['id']}", ['visitor_name' => 'Too Late']));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.cancel'")['n']);
});

db_test('status can only be set to cancelled', function () {
    $visit = make_visit();
    act_as(make_user('reception'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['status' => 'checked_in']);
    assert_status(422, $response);
    assert_equal('Invalid value.', $response->body['error']['fields']['status']);
});

db_test('security and IT cannot edit visits; a missing visit is 404', function () {
    $visit = make_visit();
    foreach (['security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']));
    }
    act_as(make_user('reception'));
    assert_status(404, request('PATCH', '/visits/999', ['status' => 'cancelled']));
});

// ---- check-in / check-out ----

db_test('reception checks in a visitor booked for today and records the details', function () {
    $visit = make_visit();
    $reception = make_user('reception', ['full_name' => 'Rita Desk']);
    act_as($reception);
    $response = request('POST', "/visits/{$visit['id']}/check-in", ['badge_number' => ' V-12 ', 'id_type' => 'Passport', 'id_number' => 'A1234567']);
    assert_status(200, $response);
    $checked = $response->body['visit'];
    assert_equal('checked_in', $checked['status']);
    assert_equal('V-12', $checked['badge_number']);
    assert_equal('Passport', $checked['id_type']);
    assert_equal('A1234567', $checked['id_number']);
    assert_equal('Rita Desk', $checked['checked_in_by_name']);
    assert_true($checked['checked_in_at'] !== null);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.check_in'")['n']);
});

db_test('check-in details are optional and length-limited', function () {
    $visit = make_visit();
    act_as(make_user('reception'));
    $tooLong = request('POST', "/visits/{$visit['id']}/check-in", ['badge_number' => str_repeat('b', 31), 'id_type' => str_repeat('t', 41), 'id_number' => str_repeat('n', 41)]);
    assert_status(422, $tooLong);
    assert_equal(['badge_number' => 'Use 30 characters or fewer.', 'id_type' => 'Use 40 characters or fewer.', 'id_number' => 'Use 40 characters or fewer.'], $tooLong->body['error']['fields']);
    $plain = request('POST', "/visits/{$visit['id']}/check-in");
    assert_status(200, $plain);
    assert_equal(null, $plain->body['visit']['badge_number']);
});

db_test('only visitors booked for today can be checked in, and only once', function () {
    $future = make_visit(['visit_date' => tomorrow()]);
    $cancelled = make_visit(['status' => 'cancelled']);
    $today = make_visit();
    act_as(make_user('reception'));
    foreach ([$future, $cancelled] as $visit) {
        $response = request('POST', "/visits/{$visit['id']}/check-in");
        assert_status(409, $response);
        assert_equal('Only visitors booked for today can be checked in.', $response->body['error']['message']);
    }
    assert_status(200, request('POST', "/visits/{$today['id']}/check-in", ['badge_number' => 'FIRST']));
    assert_status(409, request('POST', "/visits/{$today['id']}/check-in", ['badge_number' => 'SECOND']));
    assert_equal('FIRST', visit_find($today['id'])['badge_number']);
});

db_test('reception checks visitors out; only visitors on site can be checked out', function () {
    $visit = make_visit(['status' => 'checked_in', 'checked_in_at' => date('Y-m-d') . ' 09:00:00']);
    $booked = make_visit();
    act_as(make_user('reception'));
    $response = request('POST', "/visits/{$visit['id']}/check-out");
    assert_status(200, $response);
    assert_equal('checked_out', $response->body['visit']['status']);
    assert_true($response->body['visit']['checked_out_at'] !== null);
    $again = request('POST', "/visits/{$visit['id']}/check-out");
    assert_status(409, $again);
    assert_equal('Only visitors on site can be checked out.', $again->body['error']['message']);
    assert_status(409, request('POST', "/visits/{$booked['id']}/check-out"));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.check_out'")['n']);
});

db_test('a visitor checked in yesterday can be checked out today', function () {
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $visit = make_visit(['visit_date' => $yesterday, 'status' => 'checked_in', 'checked_in_at' => $yesterday . ' 17:00:00']);
    act_as(make_user('reception'));
    assert_status(200, request('POST', "/visits/{$visit['id']}/check-out"));
});

db_test('only reception may check visitors in or out', function () {
    $visit = make_visit();
    foreach (['staff', 'security', 'it', 'admin'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('POST', "/visits/{$visit['id']}/check-in"));
        assert_status(403, request('POST', "/visits/{$visit['id']}/check-out"));
    }
    assert_equal('booked', visit_find($visit['id'])['status']);
});
```

- [ ] **Step 2: Run — expect failure** (`php tests/php/test_visits.php` → new tests 404/405).

- [ ] **Step 3: Implement**

Append to `lib/validator.php`:

```php
/** Optional details reception records at check-in (spec §5). */
function validate_check_in(array $input): array
{
    $limits = ['badge_number' => 30, 'id_type' => 40, 'id_number' => 40];
    $errors = [];
    $data = [];
    foreach ($limits as $field => $max) {
        $value = clean_text($input[$field] ?? '');
        if (mb_strlen($value) > $max) {
            $errors[$field] = "Use {$max} characters or fewer.";
        }
        $data[$field] = $value === '' ? null : $value;
    }
    if ($errors) {
        throw HttpError::validation($errors);
    }
    return $data;
}
```

Append to `lib/visits.php`:

```php
const VISIT_EDITABLE_FIELDS = ['visitor_name', 'visitor_phone', 'visitor_email', 'visitor_company', 'visitor_type',
    'visit_date', 'expected_arrival', 'expected_departure', 'purpose', 'party_size'];

/** Staff may only act on visits they host; to them, anyone else's visit does not exist. */
function visit_for_editor(int $id, array $actor): array
{
    $visit = visit_find($id);
    if ($visit === null || ($actor['role'] === 'staff' && $visit['host_user_id'] !== $actor['id'])) {
        throw HttpError::notFound('Visit not found.');
    }
    return $visit;
}

function visit_update(int $id, array $input, array $actor): array
{
    $visit = visit_for_editor($id, $actor);
    if ($visit['status'] !== 'booked') {
        throw HttpError::conflict('Only booked visits can be changed.');
    }
    if (array_key_exists('status', $input)) {
        if ($input['status'] !== 'cancelled') {
            throw HttpError::validation(['status' => 'Invalid value.']);
        }
        $changed = db_exec(
            "UPDATE visits SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ? WHERE id = ? AND status = 'booked'",
            [$actor['id'], $id]
        );
        if ($changed !== 1) {
            throw HttpError::conflict('Only booked visits can be changed.');
        }
        audit($actor['id'], 'visit.cancel', 'visit', $id);
        return visit_find($id, $actor);
    }

    $merged = array_intersect_key($visit, array_flip(VISIT_EDITABLE_FIELDS));
    foreach (VISIT_EDITABLE_FIELDS as $field) {
        if (array_key_exists($field, $input)) {
            $merged[$field] = $input[$field];
        }
    }
    $hostId = $actor['role'] !== 'staff' && array_key_exists('host_user_id', $input) ? $input['host_user_id'] : $visit['host_user_id'];
    [$data, $host] = visit_validate_with_host($merged, $hostId);
    $departmentId = $host['id'] === $visit['host_user_id'] ? $visit['department_id'] : $host['department_id'];

    $changed = db_exec(
        'UPDATE visits SET visitor_name = ?, visitor_phone = ?, visitor_email = ?, visitor_company = ?, visitor_type = ?,
            host_user_id = ?, department_id = ?, visit_date = ?, expected_arrival = ?, expected_departure = ?, purpose = ?, party_size = ?
         WHERE id = ? AND status = ?',
        [
            $data['visitor_name'], $data['visitor_phone'], $data['visitor_email'], $data['visitor_company'], $data['visitor_type'],
            $host['id'], $departmentId, $data['visit_date'], $data['expected_arrival'], $data['expected_departure'],
            $data['purpose'], $data['party_size'], $id, 'booked',
        ]
    );
    if ($changed === 0 && visit_find($id)['status'] !== 'booked') {
        throw HttpError::conflict('Only booked visits can be changed.');
    }
    $fields = [];
    foreach (VISIT_EDITABLE_FIELDS as $field) {
        if ($data[$field] !== $visit[$field]) {
            $fields[] = $field;
        }
    }
    if ($host['id'] !== $visit['host_user_id']) {
        $fields[] = 'host_user_id';
    }
    if ($fields) {
        audit($actor['id'], 'visit.update', 'visit', $id, ['fields' => $fields]);
    }
    return visit_find($id, $actor);
}

function visit_check_in(int $id, array $input, array $actor): array
{
    $details = validate_check_in($input);
    if (visit_find($id) === null) {
        throw HttpError::notFound('Visit not found.');
    }
    // The conditional UPDATE makes a double click from two desks safe: only one of them wins.
    $changed = db_exec(
        "UPDATE visits SET status = 'checked_in', checked_in_at = NOW(), checked_in_by = ?, badge_number = ?, id_type = ?, id_number = ?
         WHERE id = ? AND status = 'booked' AND visit_date = CURDATE()",
        [$actor['id'], $details['badge_number'], $details['id_type'], $details['id_number'], $id]
    );
    if ($changed !== 1) {
        throw HttpError::conflict('Only visitors booked for today can be checked in.');
    }
    audit($actor['id'], 'visit.check_in', 'visit', $id);
    return visit_find($id, $actor);
}

function visit_check_out(int $id, array $actor): array
{
    if (visit_find($id) === null) {
        throw HttpError::notFound('Visit not found.');
    }
    $changed = db_exec(
        "UPDATE visits SET status = 'checked_out', checked_out_at = NOW(), checked_out_by = ? WHERE id = ? AND status = 'checked_in'",
        [$actor['id'], $id]
    );
    if ($changed !== 1) {
        throw HttpError::conflict('Only visitors on site can be checked out.');
    }
    audit($actor['id'], 'visit.check_out', 'visit', $id);
    return visit_find($id, $actor);
}
```

Append inside `register_visit_routes()`:

```php
    $r->add('PATCH', '/visits/{id}', function (Request $req) {
        $actor = require_role('staff', 'reception', 'admin');
        visits_sweep_no_shows();
        return ['visit' => visit_update($req->params['id'], $req->body, $actor)];
    });
    $r->add('POST', '/visits/{id}/check-in', function (Request $req) {
        $actor = require_role('reception');
        visits_sweep_no_shows();
        return ['visit' => visit_check_in($req->params['id'], $req->body, $actor)];
    });
    $r->add('POST', '/visits/{id}/check-out', function (Request $req) {
        $actor = require_role('reception');
        return ['visit' => visit_check_out($req->params['id'], $actor)];
    });
```

- [ ] **Step 4: Run — expect pass** (`tests/run.sh`).

- [ ] **Step 5: Commit**

```bash
git add lib tests
git commit -m "feat: edit, cancel, check-in and check-out visits with race-safe status changes"
```

---

### Task 4: Front-end foundations — types, Lagos dates, visit validation, status pill, data hook

**Files:** Modify `frontend/src/types.ts`, `frontend/src/lib/format.ts`, `frontend/src/components/Pill.tsx`, `frontend/src/test-utils.tsx`; Create `frontend/src/lib/visits.ts`, `frontend/src/lib/useVisits.ts`, `frontend/src/components/VisitStatusPill.tsx`; Test `frontend/src/lib/visits.test.ts`, `frontend/src/components/VisitStatusPill.test.tsx`

**Interfaces:**
- `types.ts`: `VisitorType`, `VISITOR_TYPES`, `VisitStatus`, `interface Visit` (fields per Task 2), `interface Host { id: number; full_name: string; department_name: string | null }`.
- `lib/visits.ts`: `VISITOR_TYPE_LABELS`, `todayInLagos(now?: Date): string`, `timeInLagos(now?: Date): string`, `addDays(date: string, days: number): string`, `interface VisitFormValues` (all strings), `emptyVisitForm(today: string): VisitFormValues`, `visitToForm(v: Visit): VisitFormValues`, `validateVisitForm(v, opts: { needsHost: boolean; today: string }): FieldErrors`, `type VisitPayload`, `visitPayload(v, needsHost): VisitPayload`, `visitsQuery(params: Record<string, string | undefined>): string` (`''` or `?a=b…`, skipping empty values), `matchesVisit(v: Visit, query: string): boolean`.
- `lib/format.ts`: `formatDate('2026-10-07') → '7 Oct 2026'`, `formatTime('2026-10-07 14:05:00') → '14:05'` (`'—'` for null).
- `useVisits(query: string | null, refreshMs?: number)` → `{ visits: Visit[] | null; error: string | null; reload(): Promise<void>; replace(v): void; upsert(v): void; remove(id): void }`. `query` is appended to `/visits`; `null` = don't load.
- `VisitStatusPill({ visit })`: overstayed → copper "Overstayed"; booked → accent "Booked"; checked_in → primary "On site"; checked_out → muted "Checked out"; cancelled → struck "Cancelled"; no_show → muted "No-show".
- `test-utils.tsx`: mockFetch falls back to the route key without the query string; fixtures `RECEPTION` (id 5), `SECURITY` (id 6); `makeVisit(o?: Partial<Visit>): Visit`.

- [ ] **Step 1: Failing tests**

`frontend/src/lib/visits.test.ts`:

```ts
import { addDays, matchesVisit, timeInLagos, todayInLagos, validateVisitForm, visitPayload, visitsQuery, emptyVisitForm } from './visits';
import { formatDate, formatTime } from './format';
import { makeVisit } from '../test-utils';

const valid = {
  ...emptyVisitForm('2026-10-07'),
  visitor_name: 'Tola Ade', visitor_phone: '0803 123 4567', visitor_type: 'client' as const,
  expected_arrival: '10:30', purpose: 'Quarterly review',
};

test('today and now follow Lagos, not the device clock', () => {
  expect(todayInLagos(new Date('2026-10-07T23:30:00Z'))).toBe('2026-10-08');
  expect(timeInLagos(new Date('2026-10-07T23:30:00Z'))).toBe('00:30');
  expect(timeInLagos(new Date('2026-10-07T08:05:00Z'))).toBe('09:05');
});

test('addDays crosses month ends', () => {
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  expect(addDays('2026-10-01', -7)).toBe('2026-09-24');
});

test('a valid form has no errors', () => {
  expect(validateVisitForm(valid, { needsHost: false, today: '2026-10-07' })).toEqual({});
});

test('form errors match the server messages', () => {
  expect(
    validateVisitForm(
      { visitor_name: 'A', visitor_phone: '1', visitor_email: 'x', visitor_company: 'c'.repeat(121), visitor_type: '', host_user_id: '',
        visit_date: '2026-10-06', expected_arrival: '', expected_departure: '9am', purpose: 'hi', party_size: '51' },
      { needsHost: true, today: '2026-10-07' },
    ),
  ).toEqual({
    visitor_name: "Enter the visitor's full name (2–120 characters).",
    visitor_phone: 'Enter a valid phone number.',
    visitor_email: 'Enter a valid email address.',
    visitor_company: 'Use 120 characters or fewer.',
    visitor_type: 'Choose a visitor type.',
    host_user_id: 'Choose the person being visited.',
    visit_date: 'Choose today or a later date.',
    expected_arrival: 'Enter the expected arrival time (HH:MM).',
    expected_departure: 'Enter a valid time (HH:MM).',
    purpose: 'Enter the purpose of the visit (3–255 characters).',
    party_size: 'Enter a number from 0 to 50.',
  });
});

test('departure must be after arrival', () => {
  expect(validateVisitForm({ ...valid, expected_departure: '10:30' }, { needsHost: false, today: '2026-10-07' })).toEqual({
    expected_departure: 'Departure must be after arrival.',
  });
});

test('the payload converts numbers and blanks', () => {
  expect(visitPayload({ ...valid, host_user_id: '7', party_size: '2' }, true)).toEqual({
    visitor_name: 'Tola Ade', visitor_phone: '0803 123 4567', visitor_email: '', visitor_company: '', visitor_type: 'client',
    visit_date: '2026-10-07', expected_arrival: '10:30', expected_departure: null, purpose: 'Quarterly review',
    party_size: 2, host_user_id: 7,
  });
  expect('host_user_id' in visitPayload(valid, false)).toBe(false);
});

test('visitsQuery skips empty values', () => {
  expect(visitsQuery({})).toBe('');
  expect(visitsQuery({ date_from: '2026-10-07', q: '', status: 'booked' })).toBe('?date_from=2026-10-07&status=booked');
});

test('matchesVisit searches visitor, company, phone and host', () => {
  const v = makeVisit({ visitor_name: 'Tola Ade', visitor_company: 'Acme', host_name: 'Chidi Okafor', visitor_phone: '08031234567' });
  expect(matchesVisit(v, 'acme')).toBe(true);
  expect(matchesVisit(v, 'chidi')).toBe(true);
  expect(matchesVisit(v, '0803')).toBe(true);
  expect(matchesVisit(v, 'zeta')).toBe(false);
  expect(matchesVisit(v, '  ')).toBe(true);
});

test('date and time formatting', () => {
  expect(formatDate('2026-10-07')).toBe('7 Oct 2026');
  expect(formatTime('2026-10-07 14:05:00')).toBe('14:05');
  expect(formatTime(null)).toBe('—');
});
```

`frontend/src/components/VisitStatusPill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { makeVisit } from '../test-utils';
import { VisitStatusPill } from './VisitStatusPill';

test.each([
  [{ status: 'booked' as const }, 'Booked'],
  [{ status: 'checked_in' as const }, 'On site'],
  [{ status: 'checked_in' as const, overstayed: true }, 'Overstayed'],
  [{ status: 'checked_out' as const }, 'Checked out'],
  [{ status: 'cancelled' as const }, 'Cancelled'],
  [{ status: 'no_show' as const }, 'No-show'],
])('%o shows %s', (overrides, label) => {
  render(<VisitStatusPill visit={makeVisit(overrides)} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect failure** (`cd frontend && npx vitest run src/lib/visits.test.ts src/components/VisitStatusPill.test.tsx` → unresolved imports).

- [ ] **Step 3: Implement**

Append to `frontend/src/types.ts`:

```ts
export type VisitorType = 'client' | 'vendor' | 'interviewee' | 'contractor' | 'guest';
export const VISITOR_TYPES: VisitorType[] = ['client', 'vendor', 'interviewee', 'contractor', 'guest'];
export type VisitStatus = 'booked' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface Visit {
  id: number;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string | null;
  visitor_company: string | null;
  visitor_type: VisitorType;
  host_user_id: number;
  host_name: string;
  department_id: number | null;
  department_name: string | null;
  booked_by_user_id: number;
  booked_by_name: string;
  channel: 'staff' | 'reception';
  visit_date: string;
  expected_arrival: string;
  expected_departure: string | null;
  purpose: string;
  party_size: number;
  status: VisitStatus;
  checked_in_at: string | null;
  checked_in_by_name: string | null;
  checked_out_at: string | null;
  checked_out_by_name: string | null;
  badge_number: string | null;
  id_type: string | null;
  id_number: string | null;
  cancelled_at: string | null;
  created_at: string;
  overstayed: boolean;
}

export interface Host {
  id: number;
  full_name: string;
  department_name: string | null;
}
```

Append to `frontend/src/lib/format.ts`:

```ts
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatTime(value: string | null): string {
  if (!value) return '—';
  const m = /(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  return m ? `${m[1]}:${m[2]}` : value;
}
```

`frontend/src/lib/visits.ts`:

```ts
import type { FieldErrors } from './validation';
import { isValidPhone } from './validation';
import { VISITOR_TYPES, type Visit, type VisitorType } from '../types';

export const VISITOR_TYPE_LABELS: Record<VisitorType, string> = {
  client: 'Client',
  vendor: 'Vendor',
  interviewee: 'Interviewee',
  contractor: 'Contractor',
  guest: 'Guest',
};

const LAGOS = 'Africa/Lagos';

/** "Today" for the office, whatever timezone the device is set to. */
export function todayInLagos(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function timeInLagos(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: LAGOS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface VisitFormValues {
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string;
  visitor_company: string;
  visitor_type: VisitorType | '';
  host_user_id: string;
  visit_date: string;
  expected_arrival: string;
  expected_departure: string;
  purpose: string;
  party_size: string;
}

export function emptyVisitForm(today: string): VisitFormValues {
  return {
    visitor_name: '', visitor_phone: '', visitor_email: '', visitor_company: '', visitor_type: '', host_user_id: '',
    visit_date: today, expected_arrival: '', expected_departure: '', purpose: '', party_size: '0',
  };
}

export function visitToForm(v: Visit): VisitFormValues {
  return {
    visitor_name: v.visitor_name,
    visitor_phone: v.visitor_phone,
    visitor_email: v.visitor_email ?? '',
    visitor_company: v.visitor_company ?? '',
    visitor_type: v.visitor_type,
    host_user_id: String(v.host_user_id),
    visit_date: v.visit_date,
    expected_arrival: v.expected_arrival,
    expected_departure: v.expected_departure ?? '',
    purpose: v.purpose,
    party_size: String(v.party_size),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const length = (s: string) => [...s.trim().replace(/\s+/g, ' ')].length;

/** Mirrors validate_visit() in lib/validator.php; the server stays authoritative. */
export function validateVisitForm(v: VisitFormValues, opts: { needsHost: boolean; today: string }): FieldErrors {
  const e: FieldErrors = {};
  if (length(v.visitor_name) < 2 || length(v.visitor_name) > 120) e.visitor_name = "Enter the visitor's full name (2–120 characters).";
  if (!isValidPhone(v.visitor_phone)) e.visitor_phone = 'Enter a valid phone number.';
  if (v.visitor_email.trim() !== '' && !EMAIL_RE.test(v.visitor_email.trim())) e.visitor_email = 'Enter a valid email address.';
  if (length(v.visitor_company) > 120) e.visitor_company = 'Use 120 characters or fewer.';
  if (!VISITOR_TYPES.includes(v.visitor_type as VisitorType)) e.visitor_type = 'Choose a visitor type.';
  if (opts.needsHost && v.host_user_id === '') e.host_user_id = 'Choose the person being visited.';
  if (!DATE_RE.test(v.visit_date) || Number.isNaN(Date.parse(`${v.visit_date}T00:00:00Z`))) e.visit_date = 'Enter a valid date.';
  else if (v.visit_date < opts.today) e.visit_date = 'Choose today or a later date.';
  if (!TIME_RE.test(v.expected_arrival)) e.expected_arrival = 'Enter the expected arrival time (HH:MM).';
  if (v.expected_departure !== '') {
    if (!TIME_RE.test(v.expected_departure)) e.expected_departure = 'Enter a valid time (HH:MM).';
    else if (TIME_RE.test(v.expected_arrival) && v.expected_departure <= v.expected_arrival) e.expected_departure = 'Departure must be after arrival.';
  }
  if (length(v.purpose) < 3 || length(v.purpose) > 255) e.purpose = 'Enter the purpose of the visit (3–255 characters).';
  if (!/^\d+$/.test(v.party_size) || Number(v.party_size) > 50) e.party_size = 'Enter a number from 0 to 50.';
  return e;
}

export interface VisitPayload {
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string;
  visitor_company: string;
  visitor_type: VisitorType | '';
  visit_date: string;
  expected_arrival: string;
  expected_departure: string | null;
  purpose: string;
  party_size: number;
  host_user_id?: number;
}

export function visitPayload(v: VisitFormValues, needsHost: boolean): VisitPayload {
  const payload: VisitPayload = {
    visitor_name: v.visitor_name,
    visitor_phone: v.visitor_phone,
    visitor_email: v.visitor_email,
    visitor_company: v.visitor_company,
    visitor_type: v.visitor_type,
    visit_date: v.visit_date,
    expected_arrival: v.expected_arrival,
    expected_departure: v.expected_departure === '' ? null : v.expected_departure,
    purpose: v.purpose,
    party_size: Number(v.party_size || 0),
  };
  if (needsHost) payload.host_user_id = Number(v.host_user_id);
  return payload;
}

export function visitsQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function matchesVisit(v: Visit, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [v.visitor_name, v.visitor_company ?? '', v.visitor_phone, v.host_name].some((s) => s.toLowerCase().includes(q));
}
```

`frontend/src/lib/useVisits.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { Visit } from '../types';
import { api, messageOf } from './api';

/** Loads /visits{query}; refreshes every refreshMs when given. Mutators keep the list in step with actions. */
export function useVisits(query: string | null, refreshMs?: number) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (query === null) return;
    try {
      const r = await api<{ visits: Visit[] }>('GET', `/visits${query}`);
      setVisits(r.visits);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [query]);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(timer);
  }, [reload, refreshMs]);

  const replace = useCallback((v: Visit) => setVisits((list) => (list ?? []).map((x) => (x.id === v.id ? v : x))), []);
  const upsert = useCallback(
    (v: Visit) => setVisits((list) => ((list ?? []).some((x) => x.id === v.id) ? (list ?? []).map((x) => (x.id === v.id ? v : x)) : [...(list ?? []), v])),
    [],
  );
  const remove = useCallback((id: number) => setVisits((list) => (list ?? []).filter((x) => x.id !== id)), []);

  return { visits, error, reload, replace, upsert, remove };
}
```

In `frontend/src/components/Pill.tsx` extend `TONES`:

```ts
const TONES = {
  neutral: 'border-primary/25 text-primary',
  accent: 'border-accent bg-accent/40 text-primary',
  muted: 'border-ink/15 bg-cream text-ink/60',
  error: 'border-error/30 bg-error/5 text-error',
  primary: 'border-primary bg-primary text-white',
  copper: 'border-copper/40 bg-copper/15 text-copper-dark',
  struck: 'border-ink/15 bg-cream text-ink/50 line-through',
};
```

`frontend/src/components/VisitStatusPill.tsx`:

```tsx
import type { Visit } from '../types';
import { Pill } from './Pill';

// Spec §8: booked = tan, on site = brown, overstayed = copper, checked out = grey, cancelled/no-show = muted.
export function VisitStatusPill({ visit }: { visit: Visit }) {
  if (visit.status === 'checked_in' && visit.overstayed) return <Pill tone="copper">Overstayed</Pill>;
  switch (visit.status) {
    case 'booked':
      return <Pill tone="accent">Booked</Pill>;
    case 'checked_in':
      return <Pill tone="primary">On site</Pill>;
    case 'checked_out':
      return <Pill tone="muted">Checked out</Pill>;
    case 'cancelled':
      return <Pill tone="struck">Cancelled</Pill>;
    case 'no_show':
      return <Pill tone="muted">No-show</Pill>;
  }
}
```

In `frontend/src/test-utils.tsx`:
- in `mockFetch`, replace `const handler = routes[\`${method} ${path}\`];` with:

```ts
      const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
```

- after the `IT` fixture add:

```tsx
export const RECEPTION: User = { ...BASE_USER, id: 5, full_name: 'Rita Desk', email: 'rita@woodhallcap.com', role: 'reception' };
export const SECURITY: User = { ...BASE_USER, id: 6, full_name: 'Sam Guard', email: 'sam@woodhallcap.com', role: 'security' };

let nextVisitId = 100;
export function makeVisit(o: Partial<Visit> = {}): Visit {
  return {
    id: nextVisitId++,
    visitor_name: 'Tola Ade',
    visitor_phone: '08031234567',
    visitor_email: null,
    visitor_company: 'Acme Ltd',
    visitor_type: 'client',
    host_user_id: STAFF.id,
    host_name: STAFF.full_name,
    department_id: 1,
    department_name: 'Finance',
    booked_by_user_id: STAFF.id,
    booked_by_name: STAFF.full_name,
    channel: 'staff',
    visit_date: todayInLagos(),
    expected_arrival: '10:00',
    expected_departure: null,
    purpose: 'Quarterly review',
    party_size: 0,
    status: 'booked',
    checked_in_at: null,
    checked_in_by_name: null,
    checked_out_at: null,
    checked_out_by_name: null,
    badge_number: null,
    id_type: null,
    id_number: null,
    cancelled_at: null,
    created_at: '2026-10-01 09:00:00',
    overstayed: false,
    ...o,
  };
}
```

and update its imports: `import type { User, Visit } from './types';` and `import { todayInLagos } from './lib/visits';`.

- [ ] **Step 4: Run — expect pass** (`cd frontend && npx tsc -b && npm test`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: visit types, Lagos-time helpers, form validation, status pill and visits hook"
```

---

### Task 5: Booking — visit form, staff booking, walk-ins, My visitors

**Files:** Create `frontend/src/components/VisitForm.tsx`, `frontend/src/components/VisitTable.tsx`, `frontend/src/components/ConfirmDialog.tsx`, `frontend/src/lib/useManageVisits.tsx`, `frontend/src/pages/staff/BookVisitorPage.tsx`, `frontend/src/pages/staff/MyVisitorsPage.tsx`, `frontend/src/pages/reception/WalkInPage.tsx`; Modify `frontend/src/App.tsx`; Test `frontend/src/pages/staff/booking.test.tsx`

**Interfaces:**
- `VisitForm({ initial?: Visit; hosts?: Host[]; defaults?: Partial<VisitFormValues>; submitLabel: string; onSubmit(payload: VisitPayload): Promise<void>; onCancel?(): void })` — a host picker appears when `hosts` is given; shows client and server field errors.
- `VisitTable({ visits: Visit[]; showHost?: boolean; caption: string; actions?(v: Visit): ReactNode; empty: string })`.
- `ConfirmDialog({ title, body, confirmLabel, cancelLabel, busy?, error?, onConfirm, onClose })`.
- `useManageVisits({ onChanged(v: Visit): void; hosts?: Host[] })` → `{ actions(v: Visit): ReactNode; dialogs: ReactNode }` — Edit and Cancel buttons for `booked` visits (accessible names "Edit visit by {name}", "Cancel visit by {name}").
- Routes: `/book` (staff), `/my-visitors` (staff), `/reception/walk-in` (reception, admin).

- [ ] **Step 1: Failing tests** — `frontend/src/pages/staff/booking.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import { ADMIN, RECEPTION, STAFF, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const tomorrow = addDays(today, 1);

async function fillVisitor() {
  await userEvent.type(screen.getByLabelText("Visitor's full name"), 'Tola Ade');
  await userEvent.type(screen.getByLabelText('Phone'), '0803 123 4567');
  await userEvent.selectOptions(screen.getByLabelText('Visitor type'), 'client');
  await userEvent.type(screen.getByLabelText('Expected arrival'), '10:30');
  await userEvent.type(screen.getByLabelText('Purpose of visit'), 'Quarterly review');
}

test('staff book a visitor for themselves', async () => {
  const created = makeVisit({ visit_date: today, expected_arrival: '10:30' });
  const { calls } = renderApp('/book', { ...signedInAs(STAFF), 'POST /visits': () => [201, { visit: created }] });
  await screen.findByRole('heading', { name: 'Book a visitor' });
  expect(screen.queryByLabelText('Person being visited')).not.toBeInTheDocument();
  await fillVisitor();
  await userEvent.click(screen.getByRole('button', { name: 'Book visitor' }));
  expect(await screen.findByText(/Tola Ade is booked for/)).toBeInTheDocument();
  const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>;
  expect(body).toMatchObject({ visitor_name: 'Tola Ade', visitor_type: 'client', visit_date: today, expected_arrival: '10:30', party_size: 0, expected_departure: null });
  expect(body).not.toHaveProperty('host_user_id');
  expect(screen.getByLabelText("Visitor's full name")).toHaveValue('');
});

test('booking checks the form before calling the API', async () => {
  const { calls } = renderApp('/book', signedInAs(STAFF));
  await userEvent.click(await screen.findByRole('button', { name: 'Book visitor' }));
  expect(screen.getByText("Enter the visitor's full name (2–120 characters).")).toBeInTheDocument();
  expect(screen.getByText('Enter the expected arrival time (HH:MM).')).toBeInTheDocument();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('server field errors appear on the form', async () => {
  renderApp('/book', {
    ...signedInAs(STAFF),
    'POST /visits': () => [422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { visitor_phone: 'Enter a valid phone number.' } } }],
  });
  await screen.findByRole('heading', { name: 'Book a visitor' });
  await fillVisitor();
  await userEvent.click(screen.getByRole('button', { name: 'Book visitor' }));
  expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument();
});

test('reception books a walk-in for a chosen host and returns to Today', async () => {
  const hosts = [{ id: 2, full_name: 'Chidi Okafor', department_name: 'Finance' }];
  const { calls } = renderApp('/reception/walk-in', {
    ...signedInAs(RECEPTION),
    'GET /hosts': () => [200, { hosts }],
    'POST /visits': () => [201, { visit: makeVisit() }],
    'GET /visits': () => [200, { visits: [] }],
  });
  await screen.findByRole('heading', { name: 'Book a walk-in' });
  expect(screen.getByLabelText('Visit date')).toHaveValue(today);
  expect(screen.getByLabelText('Expected arrival')).not.toHaveValue('');
  await userEvent.type(screen.getByLabelText("Visitor's full name"), 'Tola Ade');
  await userEvent.type(screen.getByLabelText('Phone'), '08031234567');
  await userEvent.selectOptions(screen.getByLabelText('Visitor type'), 'vendor');
  await userEvent.selectOptions(screen.getByLabelText('Person being visited'), '2');
  await userEvent.type(screen.getByLabelText('Purpose of visit'), 'Delivery');
  await userEvent.click(screen.getByRole('button', { name: 'Book walk-in' }));
  await screen.findByRole('heading', { name: 'Today' });
  expect(window.location.pathname).toBe('/reception/today');
  expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ host_user_id: 2, visitor_type: 'vendor', visit_date: today });
});

test('a walk-in needs a host', async () => {
  renderApp('/reception/walk-in', { ...signedInAs(ADMIN), 'GET /hosts': () => [200, { hosts: [] }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Book walk-in' }));
  expect(screen.getByText('Choose the person being visited.')).toBeInTheDocument();
});

test('My visitors splits upcoming and past visits', async () => {
  const upcoming = makeVisit({ visitor_name: 'Future Guest', visit_date: tomorrow });
  const past = makeVisit({ visitor_name: 'Old Guest', visit_date: addDays(today, -2), status: 'checked_out' });
  renderApp('/my-visitors', { ...signedInAs(STAFF), 'GET /visits': () => [200, { visits: [past, upcoming] }] });
  const upcomingTable = await screen.findByRole('table', { name: 'Upcoming visits' });
  expect(within(upcomingTable).getByText('Future Guest')).toBeInTheDocument();
  expect(within(screen.getByRole('table', { name: 'Past visits' })).getByText('Old Guest')).toBeInTheDocument();
  expect(within(screen.getByRole('table', { name: 'Past visits' })).queryByRole('button', { name: /cancel visit/i })).not.toBeInTheDocument();
});

test('staff cancel a booked visit after confirming', async () => {
  const visit = makeVisit({ visitor_name: 'Future Guest', visit_date: tomorrow });
  const { calls } = renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'GET /visits': () => [200, { visits: [visit] }],
    [`PATCH /visits/${visit.id}`]: () => [200, { visit: { ...visit, status: 'cancelled' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel visit by Future Guest' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel visit' }));
  expect(await screen.findByText('Cancelled')).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'cancelled' });
});

test('staff edit a booked visit', async () => {
  const visit = makeVisit({ visitor_name: 'Future Guest', visit_date: tomorrow, expected_arrival: '10:00' });
  const { calls } = renderApp('/my-visitors', {
    ...signedInAs(STAFF),
    'GET /visits': () => [200, { visits: [visit] }],
    [`PATCH /visits/${visit.id}`]: (body) => [200, { visit: { ...visit, ...(body as object) } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Edit visit by Future Guest' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit visit' });
  const arrival = within(dialog).getByLabelText('Expected arrival');
  await userEvent.clear(arrival);
  await userEvent.type(arrival, '14:15');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('14:15')).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ expected_arrival: '14:15' });
});
```

- [ ] **Step 2: Run — expect failure** (pages show "Coming soon").

- [ ] **Step 3: Implement**

`frontend/src/components/VisitForm.tsx`:

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError, messageOf } from '../lib/api';
import type { FieldErrors } from '../lib/validation';
import {
  VISITOR_TYPE_LABELS, emptyVisitForm, todayInLagos, validateVisitForm, visitPayload, visitToForm,
  type VisitFormValues, type VisitPayload,
} from '../lib/visits';
import { VISITOR_TYPES, type Host, type Visit } from '../types';
import { Banner } from './Banner';
import { Button } from './Button';
import { SelectInput } from './SelectInput';
import { TextInput } from './TextInput';

interface VisitFormProps {
  initial?: Visit;
  /** Given for reception and admin: shows the host picker. */
  hosts?: Host[];
  defaults?: Partial<VisitFormValues>;
  submitLabel: string;
  onSubmit: (payload: VisitPayload) => Promise<void>;
  onCancel?: () => void;
}

export function VisitForm({ initial, hosts, defaults, submitLabel, onSubmit, onCancel }: VisitFormProps) {
  const today = todayInLagos();
  const needsHost = hosts !== undefined;
  const [values, setValues] = useState<VisitFormValues>(() => ({
    ...emptyVisitForm(today),
    ...(initial ? visitToForm(initial) : {}),
    ...defaults,
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof VisitFormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next = validateVisitForm(values, { needsHost, today });
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onSubmit(visitPayload(values, needsHost));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {error && <Banner tone="error">{error}</Banner>}
      <h3 className="mb-4 text-lg">Visitor</h3>
      <div className="grid gap-x-5 sm:grid-cols-2">
        <TextInput label="Visitor's full name" name="visitor_name" value={values.visitor_name} onChange={set('visitor_name')} error={errors.visitor_name} autoComplete="off" />
        <TextInput label="Phone" name="visitor_phone" type="tel" value={values.visitor_phone} onChange={set('visitor_phone')} error={errors.visitor_phone} autoComplete="off" />
        <TextInput label="Email (optional)" name="visitor_email" type="email" value={values.visitor_email} onChange={set('visitor_email')} error={errors.visitor_email} autoComplete="off" />
        <TextInput label="Company or organization (optional)" name="visitor_company" value={values.visitor_company} onChange={set('visitor_company')} error={errors.visitor_company} />
        <SelectInput label="Visitor type" name="visitor_type" value={values.visitor_type} onChange={set('visitor_type')} error={errors.visitor_type}>
          <option value="">Choose a type</option>
          {VISITOR_TYPES.map((type) => (
            <option key={type} value={type}>
              {VISITOR_TYPE_LABELS[type]}
            </option>
          ))}
        </SelectInput>
      </div>
      <h3 className="mt-2 mb-4 text-lg">Visit</h3>
      <div className="grid gap-x-5 sm:grid-cols-2">
        {needsHost && (
          <SelectInput label="Person being visited" name="host_user_id" value={values.host_user_id} onChange={set('host_user_id')} error={errors.host_user_id}>
            <option value="">Choose a person</option>
            {hosts.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {h.department_name ? `${h.full_name} — ${h.department_name}` : h.full_name}
              </option>
            ))}
          </SelectInput>
        )}
        <TextInput label="Visit date" name="visit_date" type="date" min={today} value={values.visit_date} onChange={set('visit_date')} error={errors.visit_date} />
        <TextInput label="Expected arrival" name="expected_arrival" type="time" value={values.expected_arrival} onChange={set('expected_arrival')} error={errors.expected_arrival} hint="24-hour, Lagos time." />
        <TextInput label="Expected departure (optional)" name="expected_departure" type="time" value={values.expected_departure} onChange={set('expected_departure')} error={errors.expected_departure} />
        <TextInput label="Purpose of visit" name="purpose" value={values.purpose} onChange={set('purpose')} error={errors.purpose} />
        <TextInput label="Accompanying people" name="party_size" type="number" min={0} max={50} inputMode="numeric" value={values.party_size} onChange={set('party_size')} error={errors.party_size} />
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-3">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

`frontend/src/components/VisitTable.tsx`:

```tsx
import type { ReactNode } from 'react';
import { formatDate } from '../lib/format';
import { VISITOR_TYPE_LABELS } from '../lib/visits';
import type { Visit } from '../types';
import { VisitStatusPill } from './VisitStatusPill';

interface VisitTableProps {
  visits: Visit[];
  caption: string;
  empty: string;
  showHost?: boolean;
  actions?: (v: Visit) => ReactNode;
}

export function VisitTable({ visits, caption, empty, showHost = false, actions }: VisitTableProps) {
  if (visits.length === 0) return <p className="mb-0 text-ink/70">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table aria-label={caption} className="w-full border-collapse text-left text-[15px]">
        <thead>
          <tr className="border-b border-bg-alt text-sm text-ink/60">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Visitor</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            {showHost && <th className="py-2 pr-4 font-medium">Host</th>}
            <th className="py-2 pr-4 font-medium">Status</th>
            {actions && (
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id} className="border-b border-bg-alt align-top last:border-0">
              <td className="py-3 pr-4 whitespace-nowrap">
                <span className="block">{formatDate(v.visit_date)}</span>
                <span className="block text-sm text-ink/60">
                  {v.expected_arrival}
                  {v.expected_departure ? `–${v.expected_departure}` : ''}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="block font-medium">{v.visitor_name}</span>
                <span className="block text-sm text-ink/60">{v.visitor_company ?? v.visitor_phone}</span>
              </td>
              <td className="py-3 pr-4">{VISITOR_TYPE_LABELS[v.visitor_type]}</td>
              {showHost && (
                <td className="py-3 pr-4">
                  <span className="block">{v.host_name}</span>
                  {v.department_name && <span className="block text-sm text-ink/60">{v.department_name}</span>}
                </td>
              )}
              <td className="py-3 pr-4">
                <VisitStatusPill visit={v} />
              </td>
              {actions && <td className="py-3 text-right whitespace-nowrap">{actions(v)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`frontend/src/components/ConfirmDialog.tsx`:

```tsx
import { Banner } from './Banner';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, busy = false, error, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onClose}>
      {error && <Banner tone="error">{error}</Banner>}
      <p>{body}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
```

`frontend/src/lib/useManageVisits.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { VisitForm } from '../components/VisitForm';
import type { Host, Visit } from '../types';
import { api, messageOf } from './api';
import { formatDate } from './format';

const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-primary underline underline-offset-2';

/** Edit and cancel for booked visits: the buttons for a row, plus the dialogs they open. */
export function useManageVisits({ onChanged, hosts }: { onChanged: (v: Visit) => void; hosts?: Host[] }): {
  actions: (v: Visit) => ReactNode;
  dialogs: ReactNode;
} {
  const [editing, setEditing] = useState<Visit | null>(null);
  const [cancelling, setCancelling] = useState<Visit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = (v: Visit) =>
    v.status !== 'booked' ? null : (
      <span className="inline-flex gap-4">
        <button type="button" className={linkButton} aria-label={`Edit visit by ${v.visitor_name}`} onClick={() => setEditing(v)}>
          Edit
        </button>
        <button type="button" className={linkButton} aria-label={`Cancel visit by ${v.visitor_name}`} onClick={() => { setError(null); setCancelling(v); }}>
          Cancel
        </button>
      </span>
    );

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      const r = await api<{ visit: Visit }>('PATCH', `/visits/${cancelling.id}`, { status: 'cancelled' });
      onChanged(r.visit);
      setCancelling(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const dialogs = (
    <>
      {editing && (
        <Dialog title="Edit visit" onClose={() => setEditing(null)}>
          <VisitForm
            initial={editing}
            hosts={hosts}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            onSubmit={async (payload) => {
              const r = await api<{ visit: Visit }>('PATCH', `/visits/${editing.id}`, payload);
              onChanged(r.visit);
              setEditing(null);
            }}
          />
        </Dialog>
      )}
      {cancelling && (
        <ConfirmDialog
          title="Cancel this visit?"
          body={`${cancelling.visitor_name} on ${formatDate(cancelling.visit_date)} at ${cancelling.expected_arrival} will be cancelled.`}
          confirmLabel="Cancel visit"
          cancelLabel="Keep it"
          busy={busy}
          error={error}
          onConfirm={confirmCancel}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  );

  return { actions, dialogs };
}
```

The `Dialog` used for editing renders a wide form: in `frontend/src/components/Dialog.tsx` change the panel's `max-w-lg` to `max-w-2xl` so two-column fields fit.

`frontend/src/pages/staff/BookVisitorPage.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitForm } from '../../components/VisitForm';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Visit } from '../../types';

export function BookVisitorPage() {
  const [booked, setBooked] = useState<Visit | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <PageHeader title="Book a visitor" description="You'll be recorded as the host. Reception will see the visit on the day." />
      {booked && (
        <Banner tone="success" onDismiss={() => setBooked(null)}>
          {booked.visitor_name} is booked for {formatDate(booked.visit_date)} at {booked.expected_arrival}.{' '}
          <Link to="/my-visitors" className="font-semibold underline underline-offset-2">
            See my visitors
          </Link>
        </Banner>
      )}
      <Card>
        <VisitForm
          key={formKey}
          submitLabel="Book visitor"
          onSubmit={async (payload) => {
            const r = await api<{ visit: Visit }>('POST', '/visits', payload);
            setBooked(r.visit);
            setFormKey((k) => k + 1);
          }}
        />
      </Card>
    </>
  );
}
```

`frontend/src/pages/reception/WalkInPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitForm } from '../../components/VisitForm';
import { api, messageOf } from '../../lib/api';
import { timeInLagos, todayInLagos } from '../../lib/visits';
import type { Host, Visit } from '../../types';

export function WalkInPage() {
  const navigate = useNavigate();
  const [hosts, setHosts] = useState<Host[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ hosts: Host[] }>('GET', '/hosts')
      .then((r) => setHosts(r.hosts))
      .catch((err) => setError(messageOf(err)));
  }, []);

  return (
    <>
      <PageHeader title="Book a walk-in" description="For visitors who arrive without a booking. Check them in from Today once they're booked." />
      {error && <Banner tone="error">{error}</Banner>}
      <Card>
        {hosts === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : (
          <VisitForm
            hosts={hosts ?? []}
            defaults={{ visit_date: todayInLagos(), expected_arrival: timeInLagos() }}
            submitLabel="Book walk-in"
            onSubmit={async (payload) => {
              await api<{ visit: Visit }>('POST', '/visits', payload);
              navigate('/reception/today');
            }}
          />
        )}
      </Card>
    </>
  );
}
```

`frontend/src/pages/staff/MyVisitorsPage.tsx`:

```tsx
import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitTable } from '../../components/VisitTable';
import { useManageVisits } from '../../lib/useManageVisits';
import { useVisits } from '../../lib/useVisits';
import { todayInLagos } from '../../lib/visits';

export function MyVisitorsPage() {
  const today = todayInLagos();
  const { visits, error, replace } = useVisits('');
  const { actions, dialogs } = useManageVisits({ onChanged: replace });

  const all = visits ?? [];
  const upcoming = all
    .filter((v) => v.visit_date >= today && (v.status === 'booked' || v.status === 'checked_in'))
    .sort((a, b) => (a.visit_date + a.expected_arrival).localeCompare(b.visit_date + b.expected_arrival));
  const past = all
    .filter((v) => !upcoming.includes(v))
    .sort((a, b) => (b.visit_date + b.expected_arrival).localeCompare(a.visit_date + a.expected_arrival));

  return (
    <>
      <PageHeader
        title="My visitors"
        description="Visitors booked with you as the host."
        actions={
          <Link to="/book" className="inline-flex items-center rounded-full bg-primary px-7 py-3 text-[15px] font-semibold text-white no-underline hover:bg-primary-dark">
            Book a visitor
          </Link>
        }
      />
      {error && <Banner tone="error">{error}</Banner>}
      {visits === null && !error ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-4 text-xl">Upcoming</h2>
            <VisitTable visits={upcoming} caption="Upcoming visits" empty="No upcoming visitors." actions={actions} />
          </Card>
          <Card>
            <h2 className="mb-4 text-xl">Past</h2>
            <VisitTable visits={past} caption="Past visits" empty="No past visitors yet." />
          </Card>
        </>
      )}
      {dialogs}
    </>
  );
}
```

`frontend/src/App.tsx`: import the three pages and add, inside the protected layout before `<Route path="*" …>`:

```tsx
            <Route path="book" element={<RequireRole roles={['staff']}><BookVisitorPage /></RequireRole>} />
            <Route path="my-visitors" element={<RequireRole roles={['staff']}><MyVisitorsPage /></RequireRole>} />
            <Route path="reception/walk-in" element={<RequireRole roles={['reception', 'admin']}><WalkInPage /></RequireRole>} />
```

Plan 1's `App.test.tsx` expects "Coming soon" on `/my-visitors` and `/book` for staff. Update those tests: where they await `findByRole('heading', { name: 'Coming soon' })` after a staff sign-in, await `findByRole('heading', { name: 'My visitors' })` (for `/my-visitors`) or `'Book a visitor'` (for `/book`) instead, and add `'GET /visits': () => [200, { visits: [] }]` to their mocked routes. The "session expires mid-use" test mocks `GET /visits` as 401 — it now fires on page load, so replace its body with: render `/my-visitors` as STAFF with `'GET /visits'` → 401 and expect the Sign in heading.

- [ ] **Step 4: Run — expect pass** (`cd frontend && npx tsc -b && npm test`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: visit form, staff booking, walk-ins and My visitors with edit and cancel"
```

---

### Task 6: Reception Today board with check-in and check-out

**Files:** Create `frontend/src/components/CheckInDialog.tsx`, `frontend/src/pages/reception/TodayPage.tsx`; Modify `frontend/src/App.tsx`; Test `frontend/src/pages/reception/TodayPage.test.tsx`

**Interfaces:**
- `CheckInDialog({ visit: Visit; onClose(): void; onCheckedIn(v: Visit): void })`.
- Route `/reception/today` (reception, admin, IT). Only reception sees Check in / Check out.
- Data: `useVisits('?date_from=T&date_to=T', 30000)` and `useVisits('?status=checked_in', 30000)`, merged by id. Expected = booked dated today (by arrival); On site = checked_in any date (by arrival); Left = checked_out dated today (latest first).

- [ ] **Step 1: Failing tests** — `frontend/src/pages/reception/TodayPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import { ADMIN, IT, RECEPTION, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const dayKey = `GET /visits?date_from=${today}&date_to=${today}`;
const onSiteKey = 'GET /visits?status=checked_in';

const expected = makeVisit({ visitor_name: 'Ada Expected', expected_arrival: '11:00' });
const early = makeVisit({ visitor_name: 'Bola Early', expected_arrival: '09:00' });
const here = makeVisit({ visitor_name: 'Cole Here', status: 'checked_in', checked_in_at: `${today} 09:05:00`, badge_number: 'V-7' });
const late = makeVisit({ visitor_name: 'Dayo Late', status: 'checked_in', overstayed: true, checked_in_at: `${today} 08:00:00` });
const yesterdays = makeVisit({ visitor_name: 'Efe Overnight', status: 'checked_in', visit_date: addDays(today, -1), checked_in_at: `${addDays(today, -1)} 18:00:00` });
const gone = makeVisit({ visitor_name: 'Femi Gone', status: 'checked_out', checked_out_at: `${today} 10:00:00` });

const routes = {
  [dayKey]: () => [200, { visits: [expected, early, here, late, gone] }] as [number, unknown],
  [onSiteKey]: () => [200, { visits: [here, late, yesterdays] }] as [number, unknown],
};

function column(name: string) {
  return screen.getByRole('region', { name });
}

test('the board sorts visits into Expected, On site and Left', async () => {
  renderApp('/reception/today', { ...signedInAs(RECEPTION), ...routes });
  await screen.findByText('Ada Expected');
  const expectedNames = within(column('Expected')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(expectedNames).toEqual(['Bola Early', 'Ada Expected']);
  expect(within(column('On site')).getByText('Efe Overnight')).toBeInTheDocument();
  expect(within(column('On site')).getByText('Overstayed')).toBeInTheDocument();
  expect(within(column('On site')).getByText(/V-7/)).toBeInTheDocument();
  expect(within(column('Left')).getByText('Femi Gone')).toBeInTheDocument();
});

test('reception checks a visitor in with a badge number', async () => {
  const { calls } = renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${expected.id}/check-in`]: () => [200, { visit: { ...expected, status: 'checked_in', badge_number: 'V-9', checked_in_at: `${today} 11:02:00` } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check in Ada Expected' }));
  const dialog = screen.getByRole('dialog', { name: 'Check in Ada Expected' });
  await userEvent.type(within(dialog).getByLabelText('Badge or tag number (optional)'), 'V-9');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Check in' }));
  expect(await within(column('On site')).findByText('Ada Expected')).toBeInTheDocument();
  expect(within(column('Expected')).queryByText('Ada Expected')).not.toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ badge_number: 'V-9', id_type: '', id_number: '' });
});

test('a failed check-in keeps the dialog open with the message', async () => {
  renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${expected.id}/check-in`]: () => [409, { error: { code: 'conflict', message: 'Only visitors booked for today can be checked in.' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check in Ada Expected' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Check in' }));
  expect(await within(screen.getByRole('dialog')).findByText('Only visitors booked for today can be checked in.')).toBeInTheDocument();
});

test('reception checks a visitor out', async () => {
  renderApp('/reception/today', {
    ...signedInAs(RECEPTION),
    ...routes,
    [`POST /visits/${here.id}/check-out`]: () => [200, { visit: { ...here, status: 'checked_out', checked_out_at: `${today} 12:00:00` } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Check out Cole Here' }));
  expect(await within(column('Left')).findByText('Cole Here')).toBeInTheDocument();
  expect(within(column('On site')).queryByText('Cole Here')).not.toBeInTheDocument();
});

test('search filters every column', async () => {
  renderApp('/reception/today', { ...signedInAs(RECEPTION), ...routes });
  await screen.findByText('Ada Expected');
  await userEvent.type(screen.getByLabelText('Search today'), 'cole');
  expect(screen.queryByText('Ada Expected')).not.toBeInTheDocument();
  expect(screen.getByText('Cole Here')).toBeInTheDocument();
});

test.each([['admin', ADMIN], ['IT', IT]])('%s sees the board without check-in or check-out', async (_label, user) => {
  renderApp('/reception/today', { ...signedInAs(user), ...routes });
  await screen.findByText('Ada Expected');
  expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /check out/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement**

`frontend/src/components/CheckInDialog.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { ApiError, api, messageOf } from '../lib/api';
import type { FieldErrors } from '../lib/validation';
import type { Visit } from '../types';
import { Banner } from './Banner';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TextInput } from './TextInput';

interface CheckInDialogProps {
  visit: Visit;
  onClose: () => void;
  onCheckedIn: (v: Visit) => void;
}

export function CheckInDialog({ visit, onClose, onCheckedIn }: CheckInDialogProps) {
  const [badge, setBadge] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ visit: Visit }>('POST', `/visits/${visit.id}/check-in`, { badge_number: badge, id_type: idType, id_number: idNumber });
      onCheckedIn(r.visit);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Check in ${visit.visitor_name}`} onClose={onClose}>
      <p className="text-ink/70">
        Visiting {visit.host_name}
        {visit.visitor_company ? ` · ${visit.visitor_company}` : ''}
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate>
        <TextInput label="Badge or tag number (optional)" name="badge_number" maxLength={30} value={badge} onChange={(e) => setBadge(e.target.value)} error={errors.badge_number} autoFocus />
        <TextInput label="ID type seen (optional)" name="id_type" maxLength={40} placeholder="e.g. Passport, Driver's licence" value={idType} onChange={(e) => setIdType(e.target.value)} error={errors.id_type} />
        <TextInput label="ID number (optional)" name="id_number" maxLength={40} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} error={errors.id_number} />
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Checking in…' : 'Check in'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

`frontend/src/pages/reception/TodayPage.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { CheckInDialog } from '../../components/CheckInDialog';
import { inputClass } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { VisitStatusPill } from '../../components/VisitStatusPill';
import { api, messageOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatTime } from '../../lib/format';
import { useVisits } from '../../lib/useVisits';
import { VISITOR_TYPE_LABELS, matchesVisit, todayInLagos } from '../../lib/visits';
import type { Visit } from '../../types';

const byArrival = (a: Visit, b: Visit) => a.expected_arrival.localeCompare(b.expected_arrival);

function Column({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-brand bg-white p-5 shadow-card">
      <h2 className="mb-4 flex items-center justify-between text-xl">
        {title} <Pill>{count}</Pill>
      </h2>
      {count === 0 ? <p className="mb-0 text-sm text-ink/60">{empty}</p> : <ul className="m-0 list-none space-y-3 p-0">{children}</ul>}
    </section>
  );
}

function VisitCard({ visit, action }: { visit: Visit; action?: ReactNode }) {
  return (
    <li className={`rounded-2xl border p-4 ${visit.overstayed ? 'border-copper bg-copper/5' : 'border-bg-alt'}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="mb-1 text-base font-semibold">{visit.visitor_name}</h3>
        <VisitStatusPill visit={visit} />
      </div>
      <p className="mb-1 text-sm text-ink/70">
        {visit.host_name}
        {visit.visitor_company ? ` · ${visit.visitor_company}` : ''}
      </p>
      <p className="mb-0 text-sm text-ink/70">
        {VISITOR_TYPE_LABELS[visit.visitor_type]} · expected {visit.expected_arrival}
        {visit.expected_departure ? `–${visit.expected_departure}` : ''}
        {visit.checked_in_at ? ` · in ${formatTime(visit.checked_in_at)}` : ''}
        {visit.badge_number ? ` · badge ${visit.badge_number}` : ''}
        {visit.checked_out_at ? ` · out ${formatTime(visit.checked_out_at)}` : ''}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </li>
  );
}

export function TodayPage() {
  const { user } = useAuth();
  const today = todayInLagos();
  const day = useVisits(`?date_from=${today}&date_to=${today}`, 30_000);
  const onSite = useVisits('?status=checked_in', 30_000);
  const [query, setQuery] = useState('');
  const [checkingIn, setCheckingIn] = useState<Visit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAct = user?.role === 'reception';

  const merged = new Map<number, Visit>();
  for (const v of [...(day.visits ?? []), ...(onSite.visits ?? [])]) merged.set(v.id, v);
  const visible = [...merged.values()].filter((v) => matchesVisit(v, query));
  const expected = visible.filter((v) => v.status === 'booked' && v.visit_date === today).sort(byArrival);
  const here = visible.filter((v) => v.status === 'checked_in').sort(byArrival);
  const left = visible
    .filter((v) => v.status === 'checked_out' && v.visit_date === today)
    .sort((a, b) => (b.checked_out_at ?? '').localeCompare(a.checked_out_at ?? ''));

  const applied = (v: Visit) => {
    day.replace(v);
    if (v.status === 'checked_in') onSite.upsert(v);
    else onSite.remove(v.id);
  };

  const checkOut = async (v: Visit) => {
    setError(null);
    try {
      applied((await api<{ visit: Visit }>('POST', `/visits/${v.id}/check-out`)).visit);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const loading = day.visits === null && onSite.visits === null && !day.error;

  return (
    <>
      <PageHeader title="Today" description={canAct ? 'Check visitors in when they arrive and out when they leave. Updates every 30 seconds.' : 'Who is expected, on site and gone today. Updates every 30 seconds.'} />
      {(error || day.error || onSite.error) && <Banner tone="error">{error ?? day.error ?? onSite.error}</Banner>}
      <div className="mb-6 max-w-sm">
        <input aria-label="Search today" placeholder="Search by visitor, company, phone or host" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass(false)} />
      </div>
      {loading ? (
        <p role="status">Loading…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Column title="Expected" count={expected.length} empty="No one else is expected today.">
            {expected.map((v) => (
              <VisitCard key={v.id} visit={v} action={canAct && <Button aria-label={`Check in ${v.visitor_name}`} onClick={() => setCheckingIn(v)}>Check in</Button>} />
            ))}
          </Column>
          <Column title="On site" count={here.length} empty="No visitors on site.">
            {here.map((v) => (
              <VisitCard key={v.id} visit={v} action={canAct && <Button variant="secondary" aria-label={`Check out ${v.visitor_name}`} onClick={() => checkOut(v)}>Check out</Button>} />
            ))}
          </Column>
          <Column title="Left" count={left.length} empty="No one has left yet.">
            {left.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </Column>
        </div>
      )}
      {checkingIn && (
        <CheckInDialog
          visit={checkingIn}
          onClose={() => setCheckingIn(null)}
          onCheckedIn={(v) => {
            applied(v);
            setCheckingIn(null);
          }}
        />
      )}
    </>
  );
}
```

`frontend/src/App.tsx`: add `<Route path="reception/today" element={<RequireRole roles={['reception', 'admin', 'it']}><TodayPage /></RequireRole>} />`.

The walk-in test in Task 5 navigates to `/reception/today`; its mock `'GET /visits'` fallback (any query) returns `[]`, so the Today page renders there.

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: reception Today board with check-in and check-out"
```

---

### Task 7: All visits search and security views

**Files:** Create `frontend/src/pages/visits/VisitSearchPage.tsx`, `frontend/src/pages/security/OnSitePage.tsx`, `frontend/src/pages/security/TodayLogPage.tsx`; Modify `frontend/src/App.tsx`; Test `frontend/src/pages/visits/VisitSearchPage.test.tsx`, `frontend/src/pages/security/security.test.tsx`

**Interfaces:**
- `VisitSearchPage({ title: string; description: string })` — date range (default today−7 → today+30) and search; manage actions only for reception and admin (who also load `/hosts` for the edit form).
- Routes: `/visits` (reception, admin, IT) and `/security/history` (security) → `VisitSearchPage`; `/security/on-site`, `/security/log` (security).
- Security pages refresh every 30 s.

- [ ] **Step 1: Failing tests**

`frontend/src/pages/visits/VisitSearchPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInLagos } from '../../lib/visits';
import { IT, RECEPTION, SECURITY, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const defaultKey = `GET /visits?date_from=${addDays(today, -7)}&date_to=${addDays(today, 30)}`;
const booked = makeVisit({ visitor_name: 'Booked Person', visit_date: addDays(today, 2) });
const done = makeVisit({ visitor_name: 'Done Person', status: 'checked_out' });

test('All visits loads the default range and searches on submit', async () => {
  const { calls } = renderApp('/visits', {
    ...signedInAs(RECEPTION),
    'GET /hosts': () => [200, { hosts: [] }],
    [defaultKey]: () => [200, { visits: [booked, done] }],
    [`GET /visits?date_from=${addDays(today, -7)}&date_to=${addDays(today, 30)}&q=done`]: () => [200, { visits: [done] }],
  });
  const table = await screen.findByRole('table', { name: 'Visits' });
  expect(within(table).getByText('Booked Person')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Search'), 'done');
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await within(screen.getByRole('table', { name: 'Visits' })).findByText('Done Person')).toBeInTheDocument();
  expect(screen.queryByText('Booked Person')).not.toBeInTheDocument();
  expect(calls.some((c) => c.path.includes('q=done'))).toBe(true);
});

test('reception can cancel a booked visit from the list', async () => {
  renderApp('/visits', {
    ...signedInAs(RECEPTION),
    'GET /hosts': () => [200, { hosts: [] }],
    [defaultKey]: () => [200, { visits: [booked] }],
    [`PATCH /visits/${booked.id}`]: () => [200, { visit: { ...booked, status: 'cancelled' } }],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel visit by Booked Person' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel visit' }));
  expect(await screen.findByText('Cancelled')).toBeInTheDocument();
});

test('IT sees visits read-only', async () => {
  renderApp('/visits', { ...signedInAs(IT), [defaultKey]: () => [200, { visits: [booked] }] });
  await screen.findByText('Booked Person');
  expect(screen.queryByRole('button', { name: /cancel visit/i })).not.toBeInTheDocument();
});

test('an end date before the start date is caught', async () => {
  renderApp('/visits', { ...signedInAs(IT), [defaultKey]: () => [200, { visits: [] }] });
  const to = await screen.findByLabelText('To');
  await userEvent.clear(to);
  await userEvent.type(to, addDays(today, -30));
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByText('The end date must be on or after the start date.')).toBeInTheDocument();
});

test('security history is the same search, read-only', async () => {
  renderApp('/security/history', { ...signedInAs(SECURITY), [defaultKey]: () => [200, { visits: [booked] }] });
  expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
  await screen.findByText('Booked Person');
  expect(screen.queryByRole('button', { name: /edit visit/i })).not.toBeInTheDocument();
});
```

`frontend/src/pages/security/security.test.tsx`:

```tsx
import { act, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { todayInLagos } from '../../lib/visits';
import { SECURITY, makeVisit, renderApp, signedInAs } from '../../test-utils';

const today = todayInLagos();
const onSite = [
  makeVisit({ visitor_name: 'Second In', status: 'checked_in', checked_in_at: `${today} 10:00:00`, badge_number: 'V-2' }),
  makeVisit({ visitor_name: 'First In', status: 'checked_in', checked_in_at: `${today} 08:30:00`, overstayed: true }),
];

afterEach(() => vi.useRealTimers());

test('On site now lists checked-in visitors, earliest first, with overstay flags', async () => {
  renderApp('/security/on-site', { ...signedInAs(SECURITY), 'GET /visits?status=checked_in': () => [200, { visits: onSite }] });
  const table = await screen.findByRole('table', { name: 'Visitors on site' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([expect.stringContaining('First In'), expect.stringContaining('Second In')]);
  expect(within(rows[0]).getByText('Overstayed')).toBeInTheDocument();
  expect(within(rows[1]).getByText('V-2')).toBeInTheDocument();
  expect(screen.getByText('2 on site')).toBeInTheDocument();
});

test('On site now refreshes every 30 seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { calls } = renderApp('/security/on-site', { ...signedInAs(SECURITY), 'GET /visits?status=checked_in': () => [200, { visits: onSite }] });
  await screen.findByText('First In');
  const before = calls.filter((c) => c.path === '/visits?status=checked_in').length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(calls.filter((c) => c.path === '/visits?status=checked_in').length).toBe(before + 1);
});

test("Today's log shows every check-in and check-out in time order", async () => {
  const visit = makeVisit({ visitor_name: 'Tola Ade', status: 'checked_out', checked_in_at: `${today} 09:00:00`, checked_out_at: `${today} 11:30:00`, checked_in_by_name: 'Rita Desk', checked_out_by_name: 'Rita Desk' });
  const other = makeVisit({ visitor_name: 'Uche Obi', status: 'checked_in', checked_in_at: `${today} 10:15:00`, checked_in_by_name: 'Rita Desk' });
  renderApp('/security/log', { ...signedInAs(SECURITY), [`GET /visits?activity_date=${today}`]: () => [200, { visits: [visit, other] }] });
  const table = await screen.findByRole('table', { name: "Today's check-ins and check-outs" });
  const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent);
  expect(rows).toEqual([
    expect.stringMatching(/09:00.*Checked in.*Tola Ade/),
    expect.stringMatching(/10:15.*Checked in.*Uche Obi/),
    expect.stringMatching(/11:30.*Checked out.*Tola Ade/),
  ]);
});
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement**

`frontend/src/pages/visits/VisitSearchPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { TextInput } from '../../components/TextInput';
import { VisitTable } from '../../components/VisitTable';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useManageVisits } from '../../lib/useManageVisits';
import { useVisits } from '../../lib/useVisits';
import { addDays, todayInLagos, visitsQuery } from '../../lib/visits';
import type { Host } from '../../types';

export function VisitSearchPage({ title, description }: { title: string; description: string }) {
  const { user } = useAuth();
  const canManage = user?.role === 'reception' || user?.role === 'admin';
  const today = todayInLagos();
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(addDays(today, 30));
  const [q, setQ] = useState('');
  const [rangeError, setRangeError] = useState<string | undefined>();
  const [query, setQuery] = useState(() => visitsQuery({ date_from: addDays(today, -7), date_to: addDays(today, 30) }));
  const [hosts, setHosts] = useState<Host[] | undefined>();
  const { visits, error, replace } = useVisits(query);
  const { actions, dialogs } = useManageVisits({ onChanged: replace, hosts });

  useEffect(() => {
    if (!canManage) return;
    api<{ hosts: Host[] }>('GET', '/hosts')
      .then((r) => setHosts(r.hosts))
      .catch(() => setHosts([]));
  }, [canManage]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (from && to && to < from) {
      setRangeError('The end date must be on or after the start date.');
      return;
    }
    setRangeError(undefined);
    setQuery(visitsQuery({ date_from: from, date_to: to, q: q.trim() }));
  };

  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="mb-6">
        <form onSubmit={search} noValidate className="grid gap-x-5 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-start">
          <TextInput label="From" name="date_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextInput label="To" name="date_to" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={rangeError} />
          <TextInput label="Search" name="q" placeholder="Visitor, company, phone or host" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" className="sm:mt-8">
            Search
          </Button>
        </form>
      </Card>
      <Card>
        {error && <Banner tone="error">{error}</Banner>}
        {visits === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : (
          <VisitTable visits={visits ?? []} caption="Visits" empty="No visits match." showHost actions={canManage ? actions : undefined} />
        )}
        {visits && visits.length >= 500 && <p className="mt-4 mb-0 text-sm text-ink/60">Showing the first 500 visits. Narrow the dates to see the rest.</p>}
      </Card>
      {dialogs}
    </>
  );
}
```

`frontend/src/pages/security/OnSitePage.tsx`:

```tsx
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { VisitStatusPill } from '../../components/VisitStatusPill';
import { formatDateTime } from '../../lib/format';
import { useVisits } from '../../lib/useVisits';

export function OnSitePage() {
  const { visits, error } = useVisits('?status=checked_in', 30_000);
  const rows = [...(visits ?? [])].sort((a, b) => (a.checked_in_at ?? '').localeCompare(b.checked_in_at ?? ''));

  return (
    <>
      <PageHeader title="On site now" description="Everyone checked in and not yet checked out. Updates every 30 seconds." actions={visits && <p className="mb-0 text-lg font-semibold text-primary">{rows.length} on site</p>} />
      <Card>
        {error && <Banner tone="error">{error}</Banner>}
        {visits === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mb-0 text-ink/70">No visitors on site.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Visitors on site" className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Visitor</th>
                  <th className="py-2 pr-4 font-medium">Host</th>
                  <th className="py-2 pr-4 font-medium">Checked in</th>
                  <th className="py-2 pr-4 font-medium">Badge</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className={`border-b border-bg-alt align-top last:border-0 ${v.overstayed ? 'bg-copper/5' : ''}`}>
                    <td className="py-3 pr-4">
                      <span className="block font-medium">{v.visitor_name}</span>
                      {v.visitor_company && <span className="block text-sm text-ink/60">{v.visitor_company}</span>}
                    </td>
                    <td className="py-3 pr-4">{v.host_name}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {formatDateTime(v.checked_in_at)}
                      {v.expected_departure && <span className="block text-sm text-ink/60">expected out {v.expected_departure}</span>}
                    </td>
                    <td className="py-3 pr-4">{v.badge_number ?? '—'}</td>
                    <td className="py-3">
                      <VisitStatusPill visit={v} />
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

`frontend/src/pages/security/TodayLogPage.tsx`:

```tsx
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { formatTime } from '../../lib/format';
import { useVisits } from '../../lib/useVisits';
import { todayInLagos } from '../../lib/visits';
import type { Visit } from '../../types';

interface LogEvent {
  key: string;
  at: string;
  kind: 'in' | 'out';
  visit: Visit;
  by: string | null;
}

export function TodayLogPage() {
  const today = todayInLagos();
  const { visits, error } = useVisits(`?activity_date=${today}`, 30_000);

  const events: LogEvent[] = [];
  for (const v of visits ?? []) {
    if (v.checked_in_at?.startsWith(today)) events.push({ key: `${v.id}-in`, at: v.checked_in_at, kind: 'in', visit: v, by: v.checked_in_by_name });
    if (v.checked_out_at?.startsWith(today)) events.push({ key: `${v.id}-out`, at: v.checked_out_at, kind: 'out', visit: v, by: v.checked_out_by_name });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <PageHeader title="Today's log" description="Every check-in and check-out today, in time order. Updates every 30 seconds." />
      <Card>
        {error && <Banner tone="error">{error}</Banner>}
        {visits === null && !error ? (
          <p role="status" className="mb-0">Loading…</p>
        ) : events.length === 0 ? (
          <p className="mb-0 text-ink/70">No check-ins or check-outs yet today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Today's check-ins and check-outs" className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Event</th>
                  <th className="py-2 pr-4 font-medium">Visitor</th>
                  <th className="py-2 pr-4 font-medium">Host</th>
                  <th className="py-2 pr-4 font-medium">Badge</th>
                  <th className="py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.key} className="border-b border-bg-alt last:border-0">
                    <td className="py-3 pr-4 whitespace-nowrap">{formatTime(e.at)}</td>
                    <td className="py-3 pr-4">{e.kind === 'in' ? <Pill tone="primary">Checked in</Pill> : <Pill tone="muted">Checked out</Pill>}</td>
                    <td className="py-3 pr-4">{e.visit.visitor_name}</td>
                    <td className="py-3 pr-4">{e.visit.host_name}</td>
                    <td className="py-3 pr-4">{e.visit.badge_number ?? '—'}</td>
                    <td className="py-3">{e.by ?? '—'}</td>
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

`frontend/src/App.tsx` add:

```tsx
            <Route path="visits" element={<RequireRole roles={['reception', 'admin', 'it']}><VisitSearchPage title="All visits" description="Search every visit by date, visitor, company or host." /></RequireRole>} />
            <Route path="security/on-site" element={<RequireRole roles={['security']}><OnSitePage /></RequireRole>} />
            <Route path="security/log" element={<RequireRole roles={['security']}><TodayLogPage /></RequireRole>} />
            <Route path="security/history" element={<RequireRole roles={['security']}><VisitSearchPage title="History" description="Look up past and upcoming visits." /></RequireRole>} />
```

- [ ] **Step 4: Run — expect pass** (`cd frontend && npx tsc -b && npm test && npm run build`; `tests/run.sh`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: all-visits search and security on-site, today's log and history views"
```

---

### Task 8: README status and verification

**Files:** Modify `README.md`

- [ ] **Step 1:** In `README.md` replace the **Status** paragraph with:

```markdown
**Status:** sign-in, user management (IT and admins), departments (admins), booking (staff and reception walk-ins),
the reception Today board with check-in and check-out, and the security views (on site now, today's log, history) are
built. The IT dashboard and CSV export show "Coming soon". Email is deliberately not built yet; admins share one-time
set-password links instead.
```

- [ ] **Step 2:** Run `tests/run.sh` and `cd frontend && npx tsc -b && npm test && npm run build` — all green.

- [ ] **Step 3:** Smoke-test against the dev stack (`php -S localhost:8000 api/index.php`): as the dev IT account create a staff user and a reception user (or reuse), then with curl: staff books a visitor for today (201), reception lists today (200, includes it), reception checks in (200), a second check-in (409), check-out (200), security `GET /visits?status=checked_in` (200, empty). If the Chrome extension responds, also walk the UI: staff books → reception sees it under Expected → check in → On site → check out → Left; security sees On site and Today's log; 390 px width works.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README status after booking, reception and security views"
```
