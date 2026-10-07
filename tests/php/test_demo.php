<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

test_case('the demo seed refuses the live site', function () {
    assert_true(demo_guard('https://visitor.woodhallcap.com') !== null, 'live site must be refused');
    assert_true(demo_guard('https://visitor.woodhallcap.com/') !== null, 'trailing slash must still be refused');
    assert_equal(null, demo_guard('http://localhost:5174'));
    assert_equal(null, demo_guard('https://visitor.test'));
});

db_test('the demo seed creates one account per role and a visit in every state', function () {
    $accounts = demo_seed('Demo-Password-123');
    $roles = array_column($accounts, 'role');
    sort($roles);
    assert_equal(['admin', 'it', 'reception', 'security', 'staff', 'staff'], $roles);
    foreach ($accounts as $account) {
        assert_true(str_ends_with($account['email'], '@example.test'), $account['email']);
        $user = db_one('SELECT password_hash, active FROM users WHERE email = ?', [$account['email']]);
        assert_true(password_verify('Demo-Password-123', $user['password_hash']), "{$account['email']} password");
        assert_equal(1, $user['active']);
    }
    $staff = db_all("SELECT department_id FROM users WHERE role = 'staff'");
    assert_true(count(array_filter($staff, fn($u) => $u['department_id'] !== null)) === 2, 'staff need departments');

    visits_sweep_no_shows();
    $statuses = array_column(db_all('SELECT DISTINCT status FROM visits'), 'status');
    sort($statuses);
    assert_equal(['booked', 'cancelled', 'checked_in', 'checked_out', 'no_show'], $statuses);
    $overstayed = array_filter(array_map(fn($r) => visit_row($r), db_all(VISIT_SELECT)), fn($v) => $v['overstayed']);
    assert_equal(1, count($overstayed));
    assert_true(db_one("SELECT COUNT(*) AS n FROM visits WHERE status = 'booked' AND visit_date > CURDATE()")['n'] >= 2, 'future bookings expected');
});

db_test('running the demo seed twice resets passwords without duplicating anything', function () {
    demo_seed('First-Password-1');
    $visits = db_one('SELECT COUNT(*) AS n FROM visits')['n'];
    demo_seed('Second-Password-2');
    assert_equal(6, db_one("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@example.test'")['n']);
    assert_equal(3, db_one('SELECT COUNT(*) AS n FROM departments')['n']);
    assert_equal($visits, db_one('SELECT COUNT(*) AS n FROM visits')['n']);
    $hash = db_one("SELECT password_hash FROM users WHERE email = 'demo-it@example.test'")['password_hash'];
    assert_true(password_verify('Second-Password-2', $hash));
});

db_test('the demo seed leaves real users and their visits alone', function () {
    $real = make_user('staff', ['email' => 'real.person@woodhallcap.com']);
    $visit = make_visit(['host_user_id' => $real['id']]);
    demo_seed('Demo-Password-123');
    demo_seed('Demo-Password-123');
    assert_true(visit_find($visit['id']) !== null, 'real visit deleted');
    assert_true(user_find($real['id']) !== null, 'real user deleted');
});

/** Runs a generated SQL script the way phpMyAdmin would: one statement at a time. */
function run_sql_script(string $sql): void
{
    $sql = (string) preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (preg_split('/;\s*\n/', $sql) as $statement) {
        if (trim($statement) !== '') {
            db()->exec($statement);
        }
    }
}

db_test('the phpMyAdmin seed script creates the same demo data as demo_seed, in Lagos time', function () {
    $sql = demo_seed_sql('A-Long-Random-Password-42');
    assert_true(str_starts_with(ltrim(preg_replace('/^--.*\n/m', '', $sql)), "SET time_zone = '+01:00'"), 'must pin Lagos time');
    assert_true(!str_contains($sql, 'A-Long-Random-Password-42'), 'plaintext password in SQL');
    run_sql_script($sql);
    db()->exec("SET time_zone = '+01:00'");
    foreach (DEMO_ACCOUNTS as $account) {
        $hash = db_one('SELECT password_hash FROM users WHERE email = ?', [$account['email']])['password_hash'];
        assert_true(password_verify('A-Long-Random-Password-42', $hash), $account['email']);
    }
    visits_sweep_no_shows();
    $statuses = array_column(db_all('SELECT DISTINCT status FROM visits'), 'status');
    sort($statuses);
    assert_equal(['booked', 'cancelled', 'checked_in', 'checked_out', 'no_show'], $statuses);
    assert_equal(count(demo_visit_specs()), db_one('SELECT COUNT(*) AS n FROM visits')['n']);
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM visits WHERE visitor_gender IS NULL')['n']);
    run_sql_script($sql);
    assert_equal(count(demo_visit_specs()), db_one('SELECT COUNT(*) AS n FROM visits')['n'], 're-running must not duplicate');
});

db_test('the removal script deletes demo data and leaves real data alone', function () {
    $real = make_user('staff', ['email' => 'real.person@woodhallcap.com']);
    $realVisit = make_visit(['host_user_id' => $real['id']]);
    run_sql_script(demo_seed_sql('A-Long-Random-Password-42'));
    $receptionId = db_one("SELECT id FROM users WHERE email = 'demo-reception@example.test'")['id'];
    db_exec("UPDATE visits SET status = 'checked_in', checked_in_by = ? WHERE id = ?", [$receptionId, $realVisit['id']]);
    run_sql_script(demo_remove_sql());
    assert_equal(0, db_one("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@example.test'")['n']);
    assert_true(user_find($real['id']) !== null, 'real user removed');
    assert_true(visit_find($realVisit['id']) !== null, 'real visit removed');
    assert_equal(null, visit_find($realVisit['id'])['checked_in_by'], 'reference to a demo user must be cleared');
    assert_equal(0, db_one("SELECT COUNT(*) AS n FROM departments WHERE name IN ('Legal', 'Operations')")['n']);
    assert_equal(1, db_one('SELECT COUNT(*) AS n FROM departments WHERE id = ?', [$real['department_id']])['n'], 'a department in real use must stay');
});

test_summary();
