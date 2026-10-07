<?php
declare(strict_types=1);

// End-to-end walkthrough of every role against a running API (default http://localhost:8000/api).
// Prerequisites: php migrations/migrate.php && php scripts/seed-demo.php, and the API server running.
// Usage: php tests/e2e/run.php [base-url]
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$base = rtrim($argv[1] ?? 'http://localhost:8000/api', '/');
$accountsFile = __DIR__ . '/../../storage/demo-accounts.txt';
if (!is_file($accountsFile) || !preg_match('/^Password for every account: (\S+)$/m', (string) file_get_contents($accountsFile), $m)) {
    fwrite(STDERR, "Run php scripts/seed-demo.php first (storage/demo-accounts.txt not found).\n");
    exit(1);
}
$password = $m[1];

final class Client
{
    private string $jar;
    public string $csrf = '';

    public function __construct(private string $base)
    {
        $this->jar = tempnam(sys_get_temp_dir(), 'e2e-jar');
    }

    /** @return array{0: int, 1: mixed, 2: string} status, decoded JSON (or null), raw body */
    public function call(string $method, string $path, ?array $body = null): array
    {
        $ch = curl_init($this->base . $path);
        $headers = ['Accept: application/json'];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($method !== 'GET' && $this->csrf !== '') {
            $headers[] = 'X-CSRF-Token: ' . $this->csrf;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIEJAR => $this->jar,
            CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body === null ? null : json_encode($body),
        ]);
        $raw = (string) curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        return [$status, json_decode($raw, true), $raw];
    }

    public function login(string $email, string $password): int
    {
        [$status, $json] = $this->call('POST', '/auth/login', ['email' => $email, 'password' => $password]);
        $this->csrf = $json['csrf_token'] ?? '';
        return $status;
    }
}

$passed = 0;
$failed = 0;
function check(string $label, bool $ok, string $detail = ''): void
{
    global $passed, $failed;
    $ok ? $passed++ : $failed++;
    echo ($ok ? 'PASS' : 'FAIL') . ": {$label}" . ($ok || $detail === '' ? '' : " — {$detail}") . "\n";
}
function expect_status(string $label, int $expected, array $result): array
{
    check($label, $result[0] === $expected, "expected {$expected}, got {$result[0]}: " . substr($result[2], 0, 160));
    return $result;
}

$today = date('Y-m-d');
$tomorrow = date('Y-m-d', strtotime('+1 day'));
$stamp = date('His') . random_int(100, 999);
$visit = fn(array $o = []) => array_merge([
    'visitor_name' => "E2E Visitor {$stamp}", 'visitor_phone' => '08031234567', 'visitor_type' => 'client',
    'visit_date' => $today, 'expected_arrival' => '10:00', 'purpose' => 'End-to-end test',
], $o);

// ---- sign-in for every role ----
$roles = ['it', 'admin', 'reception', 'security', 'staff', 'staff2'];
$c = [];
foreach ($roles as $role) {
    $c[$role] = new Client($base);
    check("{$role} signs in", $c[$role]->login("demo-{$role}@example.test", $password) === 200);
}
check('a wrong password is refused', (new Client($base))->login('demo-staff@example.test', 'wrong-password-123') === 401);
[$s, $me] = $c['staff']->call('GET', '/auth/me');
check('staff /auth/me returns the staff role', $s === 200 && ($me['user']['role'] ?? '') === 'staff');

// ---- booking ----
[, $created] = expect_status('staff books a visitor for today', 201, $c['staff']->call('POST', '/visits', $visit()));
$visitId = $created['visit']['id'] ?? 0;
[, $mine] = $c['staff']->call('GET', '/visits');
check('staff sees their booking', in_array($visitId, array_column($mine['visits'] ?? [], 'id'), true));
[, $theirs] = $c['staff2']->call('GET', '/visits');
check("another staff member does not see it", !in_array($visitId, array_column($theirs['visits'] ?? [], 'id'), true));
expect_status("another staff member cannot edit it", 404, $c['staff2']->call('PATCH', "/visits/{$visitId}", ['visitor_name' => 'Hijack']));
expect_status('security cannot book', 403, $c['security']->call('POST', '/visits', $visit()));
expect_status('IT cannot book', 403, $c['it']->call('POST', '/visits', $visit()));
expect_status('a booking in the past is refused', 422, $c['staff']->call('POST', '/visits', $visit(['visit_date' => date('Y-m-d', strtotime('-1 day'))])));

[, $hosts] = expect_status('reception lists hosts', 200, $c['reception']->call('GET', '/hosts'));
expect_status('staff cannot list hosts', 403, $c['staff']->call('GET', '/hosts'));
$host2 = null;
foreach ($hosts['hosts'] ?? [] as $h) {
    if (str_contains($h['full_name'], 'Legal')) {
        $host2 = $h['id'];
    }
}
[, $walkIn] = expect_status('reception books a walk-in for another host', 201, $c['reception']->call('POST', '/visits', $visit(['host_user_id' => $host2, 'visitor_name' => "E2E Walk-in {$stamp}"])));
check('the walk-in is recorded as a reception booking', ($walkIn['visit']['channel'] ?? '') === 'reception');

// ---- edit and cancel ----
[, $future] = $c['staff']->call('POST', '/visits', $visit(['visit_date' => $tomorrow, 'visitor_name' => "E2E Future {$stamp}"]));
$futureId = $future['visit']['id'] ?? 0;
[, $edited] = expect_status('staff edits their future booking', 200, $c['staff']->call('PATCH', "/visits/{$futureId}", ['expected_arrival' => '15:30']));
check('the edit is saved', ($edited['visit']['expected_arrival'] ?? '') === '15:30');
expect_status('staff cancels it', 200, $c['staff']->call('PATCH', "/visits/{$futureId}", ['status' => 'cancelled']));
expect_status('a second cancel is refused', 409, $c['staff']->call('PATCH', "/visits/{$futureId}", ['status' => 'cancelled']));

// ---- check-in / check-out ----
expect_status('security cannot check in', 403, $c['security']->call('POST', "/visits/{$visitId}/check-in", []));
expect_status('admin cannot check in', 403, $c['admin']->call('POST', "/visits/{$visitId}/check-in", []));
expect_status('reception checks the visitor in', 200, $c['reception']->call('POST', "/visits/{$visitId}/check-in", ['badge_number' => 'E2E-1']));
expect_status('a second check-in is refused', 409, $c['reception']->call('POST', "/visits/{$visitId}/check-in", ['badge_number' => 'E2E-2']));
[, $onSite] = $c['security']->call('GET', '/visits?status=checked_in');
check('security sees the visitor on site', in_array($visitId, array_column($onSite['visits'] ?? [], 'id'), true));
check('security sees the seeded overstayed visitor', count(array_filter($onSite['visits'] ?? [], fn($v) => $v['overstayed'])) >= 1);
[, $mineAgain] = $c['staff']->call('GET', '/visits');
$own = array_values(array_filter($mineAgain['visits'] ?? [], fn($v) => $v['id'] === $visitId))[0] ?? [];
check('staff do not see ID details', array_key_exists('id_number', $own) && $own['id_number'] === null);
expect_status('reception checks the visitor out', 200, $c['reception']->call('POST', "/visits/{$visitId}/check-out", []));
[, $log] = $c['security']->call('GET', "/visits?activity_date={$today}");
check("the visit is in today's log", in_array($visitId, array_column($log['visits'] ?? [], 'id'), true));

// ---- stats and export ----
[, $stats] = expect_status('IT loads the dashboard stats', 200, $c['it']->call('GET', '/stats'));
check('stats have cards and 30 days', isset($stats['cards']['visits_in_range']) && count($stats['per_day'] ?? []) === 30);
expect_status('admin loads the dashboard stats', 200, $c['admin']->call('GET', '/stats'));
expect_status('reception cannot load stats', 403, $c['reception']->call('GET', '/stats'));
[$csvStatus, , $csv] = $c['it']->call('GET', '/visits/export.csv');
check('IT downloads the CSV', $csvStatus === 200 && str_contains($csv, '"Visit date"') && str_contains($csv, "E2E Visitor {$stamp}"));
expect_status('security cannot download the CSV', 403, $c['security']->call('GET', '/visits/export.csv'));

// ---- departments and users ----
expect_status('admin adds a department', 201, $c['admin']->call('POST', '/departments', ['name' => "E2E Dept {$stamp}"]));
expect_status('IT cannot add a department', 403, $c['it']->call('POST', '/departments', ['name' => "E2E IT Dept {$stamp}"]));
expect_status('admin cannot create an admin', 403, $c['admin']->call('POST', '/users', ['full_name' => 'E2E Admin', 'email' => "e2e-admin-{$stamp}@example.test", 'role' => 'admin']));
expect_status('IT creates an admin', 201, $c['it']->call('POST', '/users', ['full_name' => 'E2E Admin', 'email' => "e2e-admin-{$stamp}@example.test", 'role' => 'admin']));
[, $invite] = expect_status('admin invites a security user', 201, $c['admin']->call('POST', '/users', ['full_name' => 'E2E Guard', 'email' => "e2e-guard-{$stamp}@example.test", 'role' => 'security']));
parse_str((string) parse_url($invite['link']['set_password_url'] ?? '', PHP_URL_QUERY), $q);
$new = new Client($base);
expect_status('the invited user sets a password from the link', 200, $new->call('POST', '/auth/set-password', ['token' => $q['token'] ?? '', 'password' => 'E2E-password-123']));
expect_status('the link cannot be used twice', 422, $new->call('POST', '/auth/set-password', ['token' => $q['token'] ?? '', 'password' => 'E2E-password-456']));
check('the invited user signs in', $new->login("e2e-guard-{$stamp}@example.test", 'E2E-password-123') === 200);
expect_status('admin disables the invited user', 200, $c['admin']->call('PATCH', "/users/{$invite['user']['id']}", ['active' => false]));
expect_status("the disabled user's session ends", 401, $new->call('GET', '/auth/me'));
[, $self] = $c['it']->call('GET', '/auth/me');
expect_status('IT cannot disable themselves', 409, $c['it']->call('PATCH', "/users/{$self['user']['id']}", ['active' => false]));

// ---- sign-out ----
expect_status('staff signs out', 200, $c['staff']->call('POST', '/auth/logout'));
expect_status('the signed-out session is refused', 401, $c['staff']->call('GET', '/auth/me'));

echo "\n" . ($passed + $failed) . " checks, {$passed} passed, {$failed} failed\n";
exit($failed > 0 ? 1 : 0);
