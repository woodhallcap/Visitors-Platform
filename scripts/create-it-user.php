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

$name = clean_text($opts['name']);
$email = normalize_email($opts['email']);
if (mb_strlen($name) < 2 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "Enter a full name and a valid email address.\n");
    exit(1);
}
try {
    $id = db_insert("INSERT INTO users (full_name, email, role) VALUES (?, ?, 'it')", [$name, $email]);
} catch (PDOException $e) {
    fwrite(STDERR, is_duplicate_key($e) ? "A user with this email already exists.\n" : $e->getMessage() . "\n");
    exit(1);
}
audit(null, 'user.invite', 'user', $id, ['role' => 'it', 'via' => 'cli']);
$link = set_password_link($id, 'invite');

echo "IT account created: {$name} <{$email}>\n";
echo "Open this link before {$link['expires_at']} (WAT) to set the password:\n{$link['set_password_url']}\n";
