<?php
declare(strict_types=1);

// Defaults for local development. Real values (DB credentials, site URL, cookie_secure) go in
// config.local.php, which is git-ignored and returns an array merged over these.
$config = [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'woodhall_visitor',
        'user' => 'root',
        'pass' => '',
    ],
    'site_url' => 'http://localhost:5173',
    'timezone' => 'Africa/Lagos',
    'session_idle_seconds' => 8 * 3600,
    'cookie_secure' => false,
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}

// Lets CLI tests point scripts at the test database. Web requests cannot set environment variables.
$dbName = getenv('VISITOR_DB_NAME');
if ($dbName !== false && $dbName !== '') {
    $config['db']['name'] = $dbName;
}

return $config;
