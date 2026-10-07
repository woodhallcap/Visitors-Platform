<?php
declare(strict_types=1);

// Every stored password uses PASSWORD_BCRYPT with PASSWORD_OPTIONS so the dummy verify costs exactly the same as a real one on any PHP version.
const PASSWORD_OPTIONS = ['cost' => 12];
// password_hash('not-a-real-password', PASSWORD_BCRYPT, ['cost' => 12]); verified against when the email is unknown.
const DUMMY_PASSWORD_HASH = '$2y$12$GtatOUV8rnNDZfPVSN6uVOh4LQuZKIkuGbE8vVopLRSKXhX0vWaDq';
const LOGIN_MAX_FAILURES = 5;
const LOGIN_MAX_FAILURES_PER_EMAIL = 20;

function session_rotate(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}

function password_fingerprint(?string $hash): string
{
    return $hash === null ? '' : substr(hash('sha256', $hash), 0, 16);
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
    // A changed password (e.g. a reset) ends every session that was started with the old one.
    $current = db_one('SELECT password_hash FROM users WHERE id = ?', [$id])['password_hash'] ?? null;
    if (!hash_equals(password_fingerprint($current), (string) ($_SESSION['pw'] ?? ''))) {
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
    if ($row['n'] >= LOGIN_MAX_FAILURES) {
        return true;
    }
    $any = db_one(
        'SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND created_at > NOW() - INTERVAL 15 MINUTE',
        [$email]
    );
    return $any['n'] >= LOGIN_MAX_FAILURES_PER_EMAIL;
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
