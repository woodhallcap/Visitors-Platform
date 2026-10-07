<?php
declare(strict_types=1);

// Seeds demo accounts (one per role) and sample visits for local testing. CLI only; refuses the live site.
// The shared demo password is written to storage/demo-accounts.txt (git-ignored, never served), not printed.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$refusal = demo_guard((string) config('site_url'));
if ($refusal !== null) {
    fwrite(STDERR, $refusal . "\n");
    exit(1);
}

$password = 'Demo-' . bin2hex(random_bytes(6));
$accounts = demo_seed($password);

$file = ROOT_DIR . '/storage/demo-accounts.txt';
ensure_private_dir(dirname($file));
$lines = ["Visitor Management demo accounts (local testing only)", "Password for every account: {$password}", ''];
foreach ($accounts as $account) {
    $lines[] = str_pad($account['role'], 10) . $account['email'];
}
file_put_contents($file, implode("\n", $lines) . "\n");
chmod($file, 0600);

echo "Seeded " . count($accounts) . " demo accounts and sample visits.\n";
foreach ($accounts as $account) {
    echo '  ' . str_pad($account['role'], 10) . $account['email'] . "\n";
}
echo "The shared password is in storage/demo-accounts.txt\n";
