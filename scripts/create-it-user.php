<?php
declare(strict_types=1);

// Creates an IT account (IT then invites admins and everyone else) and prints a one-time set-password link. CLI only.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../lib/bootstrap.php';

$opts = getopt('', ['name:', 'email:']);
if (empty($opts['name']) || empty($opts['email'])) {
    fwrite(STDERR, "Usage: php scripts/create-it-user.php --name=\"Full Name\" --email=\"person@woodhallcap.com\"\n");
    exit(1);
}

try {
    $user = user_create(['full_name' => $opts['name'], 'email' => $opts['email'], 'role' => 'it'], null);
} catch (HttpError $e) {
    fwrite(STDERR, implode("\n", $e->fields ?: [$e->getMessage()]) . "\n");
    exit(1);
}
$link = set_password_link($user['id'], 'invite');

echo "IT account created: {$user['full_name']} <{$user['email']}>\n";
echo "Open this link before {$link['expires_at']} (WAT) to set the password:\n{$link['set_password_url']}\n";
