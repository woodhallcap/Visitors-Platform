<?php
declare(strict_types=1);

function db(): PDO
{
    if (!isset($GLOBALS['__db'])) {
        $c = config('db');
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['name']);
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Native prepares make mysqlnd return INT columns as PHP ints.
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        // WAT has no daylight saving, so a fixed offset is exact and needs no MySQL timezone tables.
        $pdo->exec("SET time_zone = '+01:00'");
        $GLOBALS['__db'] = $pdo;
    }
    return $GLOBALS['__db'];
}

function db_reset_connection(): void
{
    unset($GLOBALS['__db']);
}

function db_all(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function db_one(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/** Runs a write and returns the number of affected rows. */
function db_exec(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function db_insert(string $sql, array $params = []): int
{
    db_exec($sql, $params);
    return (int) db()->lastInsertId();
}

function is_duplicate_key(PDOException $e): bool
{
    return ($e->errorInfo[1] ?? null) === 1062;
}
