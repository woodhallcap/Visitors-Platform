<?php
declare(strict_types=1);

// Demo data for local testing: one account per role and a visit in every state. Never for the live site.

const DEMO_LIVE_SITE = 'https://visitor.woodhallcap.com';
const DEMO_DEPARTMENTS = ['Finance', 'Legal', 'Operations'];
const DEMO_ACCOUNTS = [
    ['role' => 'it', 'full_name' => 'Demo IT', 'email' => 'demo-it@example.test', 'department' => null],
    ['role' => 'admin', 'full_name' => 'Demo Admin', 'email' => 'demo-admin@example.test', 'department' => null],
    ['role' => 'reception', 'full_name' => 'Demo Reception', 'email' => 'demo-reception@example.test', 'department' => null],
    ['role' => 'security', 'full_name' => 'Demo Security', 'email' => 'demo-security@example.test', 'department' => null],
    ['role' => 'staff', 'full_name' => 'Demo Staff (Finance)', 'email' => 'demo-staff@example.test', 'department' => 'Finance'],
    ['role' => 'staff', 'full_name' => 'Demo Staff (Legal)', 'email' => 'demo-staff2@example.test', 'department' => 'Legal'],
];

/** Why seeding must not run against $siteUrl, or null when it may. */
function demo_guard(string $siteUrl): ?string
{
    return rtrim($siteUrl, '/') === DEMO_LIVE_SITE ? 'Refusing to seed demo data: site_url points at the live site.' : null;
}

/**
 * Creates or resets the demo departments, accounts (all with $password) and sample visits.
 * Safe to re-run: demo visits are replaced, real users and their visits are untouched.
 *
 * @return list<array{role: string, full_name: string, email: string}>
 */
function demo_seed(string $password): array
{
    return db_transaction(function () use ($password) {
        $departments = [];
        foreach (DEMO_DEPARTMENTS as $name) {
            db_exec('INSERT IGNORE INTO departments (name) VALUES (?)', [$name]);
            $departments[$name] = db_one('SELECT id FROM departments WHERE name = ?', [$name])['id'];
        }

        $hash = password_hash($password, PASSWORD_BCRYPT, PASSWORD_OPTIONS);
        $ids = [];
        foreach (DEMO_ACCOUNTS as $account) {
            db_exec(
                'INSERT INTO users (full_name, email, role, department_id, password_hash, active) VALUES (?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), department_id = VALUES(department_id),
                     password_hash = VALUES(password_hash), active = 1',
                [$account['full_name'], $account['email'], $account['role'], $account['department'] === null ? null : $departments[$account['department']], $hash]
            );
            $ids[$account['email']] = db_one('SELECT id FROM users WHERE email = ?', [$account['email']])['id'];
        }

        $finance = ['host' => $ids['demo-staff@example.test'], 'dept' => $departments['Finance']];
        $legal = ['host' => $ids['demo-staff2@example.test'], 'dept' => $departments['Legal']];
        $reception = $ids['demo-reception@example.test'];
        db_exec('DELETE FROM visits WHERE host_user_id IN (?, ?)', [$finance['host'], $legal['host']]);

        $today = date('Y-m-d');
        foreach (demo_visit_specs() as $spec) {
            $host = $spec['host'] === 'finance' ? $finance : $legal;
            $row = [
                'visitor_name' => $spec['name'],
                'visitor_phone' => $spec['phone'],
                'visitor_company' => $spec['company'],
                'visitor_type' => $spec['type'],
                'visitor_gender' => $spec['gender'],
                'host_user_id' => $host['host'],
                'department_id' => $host['dept'],
                'booked_by_user_id' => $spec['channel'] === 'reception' ? $reception : $host['host'],
                'channel' => $spec['channel'],
                'visit_date' => date('Y-m-d', strtotime(sprintf('%+d days', $spec['day']))),
                'expected_arrival' => $spec['arrival'],
                'expected_departure' => $spec['departure'],
                'purpose' => $spec['purpose'],
                'status' => $spec['status'],
            ];
            foreach ($spec['times'] as $column => $time) {
                $row[$column] = "{$today} {$time}";
            }
            $row += demo_actor_columns($spec, $host['host'], $reception);
            $row += $spec['details'];
            $columns = array_keys($row);
            db_exec(
                'INSERT INTO visits (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
                array_values($row)
            );
        }

        return array_map(fn(array $a) => ['role' => $a['role'], 'full_name' => $a['full_name'], 'email' => $a['email']], DEMO_ACCOUNTS);
    });
}

/**
 * The sample visits, relative to today: one in every state (expected, on site, overstayed, checked out, cancelled,
 * yesterday's no-show, future). Shared by demo_seed() and demo_seed_sql() so the two cannot drift apart.
 */
function demo_visit_specs(): array
{
    $v = fn(string $host, string $name, string $phone, ?string $company, string $type, string $gender, int $day, string $arrival,
        ?string $departure, string $purpose, string $status, string $channel, array $times = [], array $details = []) => compact(
        'host', 'name', 'phone', 'company', 'type', 'gender', 'day', 'arrival', 'departure', 'purpose', 'status', 'channel', 'times', 'details'
    );
    return [
        $v('finance', 'Adaeze Nwosu', '08031110001', 'Kora Advisory', 'client', 'female', 0, '14:00', '15:00', 'Quarterly portfolio review', 'booked', 'staff'),
        $v('legal', 'Musa Bello', '08031110002', 'Swift Couriers', 'vendor', 'male', 0, '16:30', null, 'Document delivery', 'booked', 'reception'),
        $v('finance', 'Tolu Adeyemi', '08031110003', null, 'interviewee', 'male', 0, '09:00', '23:59', 'Interview: financial analyst', 'checked_in', 'staff',
            ['checked_in_at' => '09:05:00'], ['badge_number' => 'V-101', 'id_type' => 'National ID']),
        $v('legal', 'Grace Okon', '08031110004', 'BuildRight Ltd', 'contractor', 'female', 0, '00:00', '00:01', 'Office maintenance', 'checked_in', 'reception',
            ['checked_in_at' => '07:45:00'], ['badge_number' => 'V-102']),
        $v('finance', 'Ifeanyi Obi', '08031110005', 'Obi & Partners', 'client', 'male', 0, '09:30', '10:30', 'Loan documentation', 'checked_out', 'staff',
            ['checked_in_at' => '09:32:00', 'checked_out_at' => '10:20:00'], ['badge_number' => 'V-099']),
        $v('legal', 'Fatima Sani', '08031110006', null, 'guest', 'female', 1, '12:00', null, 'Lunch meeting', 'cancelled', 'staff',
            ['cancelled_at' => '08:00:00']),
        $v('finance', 'Chuka Eze', '08031110007', 'Meridian Capital', 'client', 'male', -1, '11:00', null, 'Introductory meeting', 'booked', 'staff'),
        $v('finance', 'Ngozi Lawal', '08031110008', 'Kora Advisory', 'client', 'female', 1, '11:00', '12:00', 'Follow-up review', 'booked', 'staff'),
        $v('legal', 'Samuel Ade', '08031110009', 'Lex Chambers', 'vendor', 'male', 7, '10:00', '11:30', 'Contract signing', 'booked', 'staff'),
    ];
}

/** Who checked the visitor in/out or cancelled, matching the timestamps a spec sets. */
function demo_actor_columns(array $spec, int|string $host, int|string $reception): array
{
    $columns = [];
    if (isset($spec['times']['checked_in_at'])) {
        $columns['checked_in_by'] = $reception;
    }
    if (isset($spec['times']['checked_out_at'])) {
        $columns['checked_out_by'] = $reception;
    }
    if (isset($spec['times']['cancelled_at'])) {
        $columns['cancelled_by'] = $host;
    }
    return $columns;
}

function demo_sql_value(mixed $value): string
{
    if ($value === null) {
        return 'NULL';
    }
    if (is_int($value)) {
        return (string) $value;
    }
    return "'" . str_replace(['\\', "'"], ['\\\\', "''"], (string) $value) . "'";
}

/**
 * The demo data as a SQL script for phpMyAdmin (for a host without Terminal). Safe to re-run.
 * Dates are relative to the day it is imported, in Lagos time. Only the bcrypt hash of $password is included.
 */
function demo_seed_sql(string $password): string
{
    $hash = password_hash($password, PASSWORD_BCRYPT, PASSWORD_OPTIONS);
    $lines = [
        '-- Visitor Management demo data: one account per role and sample visits. Remove with the matching removal script.',
        "SET time_zone = '+01:00';",
    ];
    foreach (DEMO_DEPARTMENTS as $name) {
        $lines[] = 'INSERT IGNORE INTO departments (name) VALUES (' . demo_sql_value($name) . ');';
    }
    foreach (DEMO_ACCOUNTS as $account) {
        $department = $account['department'] === null ? 'NULL' : '(SELECT id FROM departments WHERE name = ' . demo_sql_value($account['department']) . ')';
        $lines[] = 'INSERT INTO users (full_name, email, role, department_id, password_hash, active) VALUES ('
            . implode(', ', [demo_sql_value($account['full_name']), demo_sql_value($account['email']), demo_sql_value($account['role']), $department, demo_sql_value($hash), '1'])
            . ') ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), department_id = VALUES(department_id), password_hash = VALUES(password_hash), active = 1;';
    }
    $lines[] = "SET @finance = (SELECT id FROM users WHERE email = 'demo-staff@example.test');";
    $lines[] = "SET @legal = (SELECT id FROM users WHERE email = 'demo-staff2@example.test');";
    $lines[] = "SET @reception = (SELECT id FROM users WHERE email = 'demo-reception@example.test');";
    $lines[] = "SET @finance_dept = (SELECT id FROM departments WHERE name = 'Finance');";
    $lines[] = "SET @legal_dept = (SELECT id FROM departments WHERE name = 'Legal');";
    $lines[] = 'DELETE FROM visits WHERE host_user_id IN (@finance, @legal);';
    foreach (demo_visit_specs() as $spec) {
        $host = $spec['host'] === 'finance' ? '@finance' : '@legal';
        $row = [
            'visitor_name' => demo_sql_value($spec['name']),
            'visitor_phone' => demo_sql_value($spec['phone']),
            'visitor_company' => demo_sql_value($spec['company']),
            'visitor_type' => demo_sql_value($spec['type']),
            'visitor_gender' => demo_sql_value($spec['gender']),
            'host_user_id' => $host,
            'department_id' => $spec['host'] === 'finance' ? '@finance_dept' : '@legal_dept',
            'booked_by_user_id' => $spec['channel'] === 'reception' ? '@reception' : $host,
            'channel' => demo_sql_value($spec['channel']),
            'visit_date' => sprintf('DATE_ADD(CURDATE(), INTERVAL %d DAY)', $spec['day']),
            'expected_arrival' => demo_sql_value($spec['arrival']),
            'expected_departure' => demo_sql_value($spec['departure']),
            'purpose' => demo_sql_value($spec['purpose']),
            'status' => demo_sql_value($spec['status']),
        ];
        foreach ($spec['times'] as $column => $time) {
            $row[$column] = 'TIMESTAMP(CURDATE(), ' . demo_sql_value($time) . ')';
        }
        $row += demo_actor_columns($spec, $host, '@reception');
        foreach ($spec['details'] as $column => $value) {
            $row[$column] = demo_sql_value($value);
        }
        $lines[] = 'INSERT INTO visits (' . implode(', ', array_keys($row)) . ') VALUES (' . implode(', ', $row) . ');';
    }
    return implode("\n", $lines) . "\n";
}

/**
 * Removes every demo account and anything that depends on it, keeping real users and their visits.
 * Run before real staff start using the site (after a real IT account exists).
 */
function demo_remove_sql(): string
{
    $emails = implode(', ', array_map(fn(array $a) => demo_sql_value($a['email']), DEMO_ACCOUNTS));
    $demo = "SELECT id FROM users WHERE email IN ({$emails})";
    $names = implode(', ', array_map('demo_sql_value', DEMO_DEPARTMENTS));
    return implode("\n", [
        '-- Removes the Visitor Management demo accounts and their visits. Real users and visits are kept.',
        "DELETE FROM visits WHERE host_user_id IN ({$demo}) OR booked_by_user_id IN ({$demo});",
        "UPDATE visits SET checked_in_by = NULL WHERE checked_in_by IN ({$demo});",
        "UPDATE visits SET checked_out_by = NULL WHERE checked_out_by IN ({$demo});",
        "UPDATE visits SET cancelled_by = NULL WHERE cancelled_by IN ({$demo});",
        "DELETE FROM users WHERE email IN ({$emails});",
        "DELETE FROM departments WHERE name IN ({$names})"
            . ' AND id NOT IN (SELECT department_id FROM users WHERE department_id IS NOT NULL)'
            . ' AND id NOT IN (SELECT department_id FROM visits WHERE department_id IS NOT NULL);',
    ]) . "\n";
}
