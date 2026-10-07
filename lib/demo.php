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
        $day = fn(int $offset) => date('Y-m-d', strtotime(($offset >= 0 ? '+' : '') . $offset . ' days'));
        $visits = [
            [$finance, 'Adaeze Nwosu', 'Kora Advisory', 'client', $today, '14:00', '15:00', 'Quarterly portfolio review', 'booked', [], 'staff'],
            [$legal, 'Musa Bello', 'Swift Couriers', 'vendor', $today, '16:30', null, 'Document delivery', 'booked', [], 'reception'],
            [$finance, 'Tolu Adeyemi', null, 'interviewee', $today, '09:00', '23:59', 'Interview: financial analyst', 'checked_in',
                ['checked_in_at' => "{$today} 09:05:00", 'badge_number' => 'V-101', 'id_type' => 'National ID'], 'staff'],
            [$legal, 'Grace Okon', 'BuildRight Ltd', 'contractor', $today, '00:00', '00:01', 'Office maintenance', 'checked_in',
                ['checked_in_at' => "{$today} 07:45:00", 'badge_number' => 'V-102'], 'reception'],
            [$finance, 'Ifeanyi Obi', 'Obi & Partners', 'client', $today, '09:30', '10:30', 'Loan documentation', 'checked_out',
                ['checked_in_at' => "{$today} 09:32:00", 'checked_out_at' => "{$today} 10:20:00", 'badge_number' => 'V-099'], 'staff'],
            [$legal, 'Fatima Sani', null, 'guest', $day(1), '12:00', null, 'Lunch meeting', 'cancelled',
                ['cancelled_at' => "{$today} 08:00:00"], 'staff'],
            [$finance, 'Chuka Eze', 'Meridian Capital', 'client', $day(-1), '11:00', null, 'Introductory meeting', 'booked', [], 'staff'],
            [$finance, 'Ngozi Lawal', 'Kora Advisory', 'client', $day(1), '11:00', '12:00', 'Follow-up review', 'booked', [], 'staff'],
            [$legal, 'Samuel Ade', 'Lex Chambers', 'vendor', $day(7), '10:00', '11:30', 'Contract signing', 'booked', [], 'staff'],
        ];
        foreach ($visits as [$host, $name, $company, $type, $date, $arrival, $departure, $purpose, $status, $extra, $channel]) {
            $row = array_merge([
                'visitor_name' => $name,
                'visitor_phone' => '0803' . random_int(1000000, 9999999),
                'visitor_company' => $company,
                'visitor_type' => $type,
                'host_user_id' => $host['host'],
                'department_id' => $host['dept'],
                'booked_by_user_id' => $channel === 'reception' ? $reception : $host['host'],
                'channel' => $channel,
                'visit_date' => $date,
                'expected_arrival' => $arrival,
                'expected_departure' => $departure,
                'purpose' => $purpose,
                'status' => $status,
            ], $extra);
            if (isset($row['checked_in_at'])) {
                $row['checked_in_by'] = $reception;
            }
            if (isset($row['checked_out_at'])) {
                $row['checked_out_by'] = $reception;
            }
            if (isset($row['cancelled_at'])) {
                $row['cancelled_by'] = $host['host'];
            }
            $columns = array_keys($row);
            db_exec(
                'INSERT INTO visits (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
                array_values($row)
            );
        }

        return array_map(fn(array $a) => ['role' => $a['role'], 'full_name' => $a['full_name'], 'email' => $a['email']], DEMO_ACCOUNTS);
    });
}
