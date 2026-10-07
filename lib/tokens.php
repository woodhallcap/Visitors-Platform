<?php
declare(strict_types=1);

const TOKEN_TTL_SECONDS = ['invite' => 72 * 3600, 'reset' => 3600];

/** @return array{token: string, expires_at: string} the raw token is never stored */
function token_issue(int $userId, string $purpose): array
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', time() + TOKEN_TTL_SECONDS[$purpose]);
    db_exec('UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [$userId, $purpose]);
    db_exec(
        'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        [$userId, $purpose, hash('sha256', $token), $expiresAt]
    );
    return ['token' => $token, 'expires_at' => $expiresAt];
}

/** Marks a valid token used and returns it, or null. The conditional UPDATE makes it single-use under races. */
function token_consume(string $raw): ?array
{
    if (!preg_match('/^[0-9a-f]{64}$/', $raw)) {
        return null;
    }
    $row = db_one(
        'SELECT t.id, t.user_id, t.purpose FROM auth_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > NOW() AND u.active = 1',
        [hash('sha256', $raw)]
    );
    if ($row === null) {
        return null;
    }
    $claimed = db_exec('UPDATE auth_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [$row['id']]);
    return $claimed === 1 ? $row : null;
}

function set_password_link(int $userId, string $purpose): array
{
    $issued = token_issue($userId, $purpose);
    return [
        'set_password_url' => rtrim((string) config('site_url'), '/') . '/set-password?token=' . $issued['token'],
        'expires_at' => $issued['expires_at'],
        'purpose' => $purpose,
    ];
}
