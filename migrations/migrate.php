<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$applied = migrate(db(), MIGRATIONS_DIR);
echo $applied ? 'Applied: ' . implode(', ', $applied) . "\n" : "Nothing to apply.\n";
