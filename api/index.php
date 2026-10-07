<?php
declare(strict_types=1);

// Web entry point for /api/*. Locally: php -S localhost:8000 api/index.php
require dirname(__DIR__) . '/lib/bootstrap.php';

// Never show PHP errors to visitors; log them privately instead.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
$logDir = dirname(__DIR__) . '/storage/logs';
if (ensure_private_dir($logDir)) {
    ini_set('error_log', $logDir . '/php-error.log');
}

$https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
ini_set('session.use_strict_mode', '1');
session_name('wvsid');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https || (bool) config('cookie_secure'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
// A private session dir: on shared hosts the system-wide cleanup uses php.ini's short gc_maxlifetime and would end sessions early.
$sessionDir = dirname(__DIR__) . '/storage/sessions';
if (ensure_private_dir($sessionDir)) {
    session_save_path($sessionDir);
}
ini_set('session.gc_maxlifetime', (string) config('session_idle_seconds'));
ini_set('session.gc_probability', '1');
ini_set('session.gc_divisor', '100');
session_start();

$raw = file_get_contents('php://input');
$decoded = $raw ? json_decode($raw, true) : null;

$response = handle_request(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $_SERVER['REQUEST_URI'] ?? '/',
    is_array($decoded) ? $decoded : [],
    $_GET,
    request_headers(),
    $_SERVER['REMOTE_ADDR'] ?? '',
);

http_response_code($response->status);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($response->raw !== null) {
    foreach ($response->headers as $name => $value) {
        header("{$name}: {$value}");
    }
    echo $response->raw;
} else {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($response->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
