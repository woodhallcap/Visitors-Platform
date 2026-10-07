<?php
declare(strict_types=1);

// Web entry point for /api/*. Locally: php -S localhost:8000 api/index.php
require dirname(__DIR__) . '/lib/bootstrap.php';

ini_set('session.use_strict_mode', '1');
session_name('wvsid');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => (bool) config('cookie_secure'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
ini_set('session.gc_maxlifetime', (string) config('session_idle_seconds'));
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
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo json_encode($response->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
