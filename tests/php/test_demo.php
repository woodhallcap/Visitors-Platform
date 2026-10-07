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

test_summary();
