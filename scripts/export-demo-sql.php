<?php
declare(strict_types=1);

// Writes the demo data as phpMyAdmin scripts for a host without Terminal, plus the matching removal script.
// Output goes to storage/demo-sql/ (git-ignored, never packaged; build/ is wiped by scripts/package.sh). The generated password is written to a file there, never printed.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$out = ROOT_DIR . '/storage/demo-sql';
ensure_private_dir($out);
// Long and random: these accounts sit on a public URL until the removal script is run.
$password = 'Wc-' . rtrim(strtr(base64_encode(random_bytes(15)), '+/', 'Kq'), '=');

file_put_contents("{$out}/1-seed-demo.sql", demo_seed_sql($password));
file_put_contents("{$out}/2-remove-demo.sql", demo_remove_sql());
$lines = ['Visitor Management demo accounts (live site — remove with 2-remove-demo.sql before real use)', "Password for every account: {$password}", ''];
foreach (DEMO_ACCOUNTS as $account) {
    $lines[] = str_pad($account['role'], 10) . $account['email'];
}
file_put_contents("{$out}/demo-accounts.txt", implode("\n", $lines) . "\n");
chmod("{$out}/demo-accounts.txt", 0600);

echo "Wrote storage/demo-sql/1-seed-demo.sql, 2-remove-demo.sql and demo-accounts.txt (password inside).\n";
