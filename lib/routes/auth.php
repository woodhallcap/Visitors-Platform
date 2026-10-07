<?php
declare(strict_types=1);

function register_auth_routes(Router $r): void
{
    $r->add('POST', '/auth/login', 'auth_login', ['public' => true]);
    $r->add('POST', '/auth/logout', 'auth_logout');
    $r->add('GET', '/auth/me', 'auth_me');
    $r->add('POST', '/auth/set-password', 'auth_set_password', ['public' => true]);
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
    $verified = password_verify($password, $hash ?? dummy_password_hash());
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
