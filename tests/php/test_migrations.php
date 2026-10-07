<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

test_case('migrations create every table', function () {
    $names = array_column(
        db_all('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()'),
        't'
    );
    foreach (['audit_log', 'auth_tokens', 'departments', 'login_attempts', 'schema_migrations', 'users', 'visits'] as $table) {
        assert_true(in_array($table, $names, true), "missing table {$table}");
    }
});

test_case('migrate is idempotent', function () {
    assert_equal([], migrate(db(), MIGRATIONS_DIR));
});

test_case('the database session runs in WAT', function () {
    assert_equal('+01:00', db_one('SELECT @@session.time_zone AS tz')['tz']);
});

test_case('PHP runs in Africa/Lagos', function () {
    assert_equal('Africa/Lagos', date_default_timezone_get());
});

test_case('config reads nested keys and names missing ones', function () {
    assert_equal('woodhall_visitor_test', config('db.name'));
    try {
        config('nope.missing');
        throw new LogicException('expected an exception');
    } catch (RuntimeException $e) {
        assert_true(str_contains($e->getMessage(), 'nope.missing'));
    }
});

db_test('unique keys ignore case', function () {
    db_exec("INSERT INTO departments (name) VALUES ('Finance')");
    try {
        db_exec("INSERT INTO departments (name) VALUES ('FINANCE')");
        throw new LogicException('expected a duplicate key error');
    } catch (PDOException $e) {
        assert_true(is_duplicate_key($e));
    }
});

test_summary();
