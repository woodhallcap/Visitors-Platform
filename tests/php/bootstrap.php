<?php
declare(strict_types=1);

require __DIR__ . '/test_helper.php';
require dirname(__DIR__, 2) . '/lib/bootstrap.php';

config_override([
    'db' => ['name' => getenv('VISITOR_TEST_DB') ?: 'woodhall_visitor_test'],
    'site_url' => 'https://visitor.test',
]);
ini_set('error_log', sys_get_temp_dir() . '/woodhall-visitor-test-errors.log');

const TEST_TABLES = ['audit_log', 'auth_tokens', 'login_attempts', 'visits', 'users', 'departments'];

/** Drops and recreates the test database, then runs every migration. */
function test_db_setup(): void
{
    $c = config('db');
    if (!str_ends_with($c['name'], '_test')) {
        fwrite(STDERR, "Refusing to use database '{$c['name']}': test database names must end in _test.\n");
        exit(1);
    }
    $server = new PDO(
        sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['host'], $c['port']),
        $c['user'],
        $c['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $server->exec("DROP DATABASE IF EXISTS `{$c['name']}`");
    $server->exec("CREATE DATABASE `{$c['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    db_reset_connection();
    migrate(db(), MIGRATIONS_DIR);
}

function reset_tables(): void
{
    db()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (TEST_TABLES as $table) {
        db()->exec("TRUNCATE TABLE {$table}");
    }
    db()->exec('SET FOREIGN_KEY_CHECKS = 1');
    $_SESSION = [];
}

/** A test case that starts from empty tables and an empty session. */
function db_test(string $name, callable $fn): void
{
    test_case($name, function () use ($fn) {
        reset_tables();
        $fn();
    });
}

test_db_setup();
