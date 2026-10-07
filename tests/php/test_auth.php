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
    act_as(make_user('admin'));
    $missing = request('POST', '/departments', ['name' => 'Legal'], [], []);
    $wrong = request('POST', '/departments', ['name' => 'Legal'], [], ['x-csrf-token' => str_repeat('0', 64)]);
    assert_status(403, $missing);
    assert_equal('csrf_failed', $missing->body['error']['code']);
    assert_status(403, $wrong);
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM departments')['n']);
});

db_test('logout works without a CSRF header and ends the session', function () {
    act_as(make_user('staff'));
    assert_status(200, request('POST', '/auth/logout', [], [], []));
    assert_true(!isset($_SESSION['user_id']));
    assert_status(401, request('GET', '/auth/me'));
});

db_test('logout still requires a session', function () {
    assert_status(401, request('POST', '/auth/logout', [], [], []));
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

db_test('login needs a JSON content type', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    $body = ['email' => 'ada@example.com', 'password' => TEST_PASSWORD];
    assert_status(415, request('POST', '/auth/login', $body, [], []));
    assert_status(415, request('POST', '/auth/login', $body, [], ['content-type' => 'text/plain']));
    assert_status(200, request('POST', '/auth/login', $body, [], ['content-type' => 'application/json; charset=utf-8']));
});

db_test('20 failures for one email across IPs block it from a new IP', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    for ($i = 1; $i <= 20; $i++) {
        db_exec("INSERT INTO login_attempts (email, ip, created_at) VALUES ('ada@example.com', ?, NOW())", ["192.0.2.{$i}"]);
    }
    $response = request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => TEST_PASSWORD]);
    assert_status(429, $response);
    assert_equal('rate_limited', $response->body['error']['code']);
});

db_test('4 failures from one IP do not block a correct login from another', function () {
    make_user('staff', ['email' => 'ada@example.com']);
    for ($i = 0; $i < 4; $i++) {
        db_exec("INSERT INTO login_attempts (email, ip, created_at) VALUES ('ada@example.com', '192.0.2.99', NOW())");
    }
    assert_status(200, request('POST', '/auth/login', ['email' => 'ada@example.com', 'password' => TEST_PASSWORD]));
});

db_test('the dummy hash costs the same as real password hashes', function () {
    assert_equal(PASSWORD_OPTIONS['cost'], password_get_info(DUMMY_PASSWORD_HASH)['options']['cost']);
    assert_true(password_verify('not-a-real-password', DUMMY_PASSWORD_HASH), 'dummy hash must be a real hash');
});

db_test('a password changed in the database ends the existing session', function () {
    $user = make_user('staff', ['email' => 'pw@example.com']);
    assert_status(200, request('POST', '/auth/login', ['email' => 'pw@example.com', 'password' => TEST_PASSWORD]));
    assert_status(200, request('GET', '/auth/me'));
    db_exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash('something else entirely', PASSWORD_BCRYPT, ['cost' => 4]), $user['id']]);
    assert_status(401, request('GET', '/auth/me'));
    assert_equal([], $_SESSION);
});

db_test('using a reset link signs out the old sessions', function () {
    $user = make_user('staff');
    act_as($user);
    $old = $_SESSION;
    assert_status(200, request('GET', '/auth/me'));
    $token = token_issue($user['id'], 'reset')['token'];
    $_SESSION = [];
    assert_status(200, request('POST', '/auth/set-password', ['token' => $token, 'password' => 'a brand new pass']));
    $_SESSION = $old;
    assert_status(401, request('GET', '/auth/me'));
});

test_summary();
