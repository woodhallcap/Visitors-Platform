<?php
declare(strict_types=1);

/**
 * Applies every *.sql file in $dir not yet recorded in schema_migrations, in filename order.
 * Statements are split on ";" at end of line, so SQL files must not contain semicolons inside statements.
 *
 * @return list<string> the file names applied by this call
 */
function migrate(PDO $pdo, string $dir): array
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(190) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $done = $pdo->query('SELECT name FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);

    $files = glob(rtrim($dir, '/') . '/*.sql') ?: [];
    sort($files);
    $applied = [];
    foreach ($files as $file) {
        $name = basename($file);
        if (in_array($name, $done, true)) {
            continue;
        }
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
        foreach (preg_split('/;\s*(?:\R|$)/', $sql) as $statement) {
            if (trim($statement) !== '') {
                $pdo->exec($statement);
            }
        }
        $pdo->prepare('INSERT INTO schema_migrations (name) VALUES (?)')->execute([$name]);
        $applied[] = $name;
    }
    return $applied;
}
