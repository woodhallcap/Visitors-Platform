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
