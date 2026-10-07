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

test_case('visit indexes for status sweeps and check-in/out times exist', function () {
    $names = array_column(db_all("SELECT DISTINCT index_name AS i FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'visits'"), 'i');
    foreach (['idx_visits_status_date', 'idx_visits_checked_in_at', 'idx_visits_checked_out_at'] as $index) {
        assert_true(in_array($index, $names, true), "missing index {$index}");
    }
});

test_case('visits have a nullable visitor_gender column limited to female and male', function () {
    $column = db_one("SELECT column_type AS t, is_nullable AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'visits' AND column_name = 'visitor_gender'");
    assert_true($column !== null, 'visitor_gender column missing');
    assert_equal("enum('female','male')", $column['t']);
    assert_equal('YES', $column['n']);
});

test_summary();
