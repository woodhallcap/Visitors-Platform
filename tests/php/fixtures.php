<?php
declare(strict_types=1);

const TEST_PASSWORD = 'correct horse battery';
const TEST_IP = '10.0.0.1';

function make_department(string $name, bool $active = true): array
{
    $id = db_insert('INSERT INTO departments (name, active) VALUES (?, ?)', [$name, $active ? 1 : 0]);
    return ['id' => $id, 'name' => $name];
}

function make_user(string $role = 'staff', array $o = []): array
{
    static $n = 0;
    $n++;
    $departmentId = array_key_exists('department_id', $o)
        ? $o['department_id']
        : ($role === 'staff' ? make_department("Department {$n}")['id'] : null);
    $password = array_key_exists('password', $o) ? $o['password'] : TEST_PASSWORD;
    $id = db_insert(
        'INSERT INTO users (full_name, email, phone, role, department_id, password_hash, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            $o['full_name'] ?? "User {$n}",
            $o['email'] ?? "user{$n}@example.com",
            $o['phone'] ?? null,
            $role,
            $departmentId,
            // Cost 4 keeps the suite fast; production uses bcrypt cost 12 (PASSWORD_OPTIONS).
            $password === null ? null : password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]),
            ($o['active'] ?? true) ? 1 : 0,
        ]
    );
    return user_find($id);
}

function act_as(array $user): void
{
    $hash = db_one('SELECT password_hash FROM users WHERE id = ?', [$user['id']])['password_hash'] ?? null;
    $_SESSION = ['user_id' => $user['id'], 'pw' => password_fingerprint($hash), 'last_seen' => time(), 'csrf' => bin2hex(random_bytes(32))];
}

function request(string $method, string $path, array $body = [], array $query = [], ?array $headers = null): Response
{
    $headers ??= ['content-type' => 'application/json'] + (isset($_SESSION['csrf']) ? ['x-csrf-token' => $_SESSION['csrf']] : []);
    return handle_request($method, $path, $body, $query, $headers, TEST_IP);
}

function make_visit(array $o = []): array
{
    $host = isset($o['host_user_id']) ? user_find($o['host_user_id']) : make_user('staff');
    $row = array_merge([
        'visitor_name' => 'Tola Ade',
        'visitor_phone' => '08031234567',
        'visitor_email' => null,
        'visitor_company' => 'Acme Ltd',
        'visitor_type' => 'client',
        'host_user_id' => $host['id'],
        'department_id' => $host['department_id'],
        'booked_by_user_id' => $host['id'],
        'channel' => 'staff',
        'visit_date' => date('Y-m-d'),
        'expected_arrival' => '10:00',
        'expected_departure' => null,
        'purpose' => 'Quarterly review',
        'party_size' => 0,
        'status' => 'booked',
    ], $o);
    $columns = array_keys($row);
    $id = db_insert(
        'INSERT INTO visits (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')',
        array_values($row)
    );
    return visit_find($id);
}

function visit_body(array $o = []): array
{
    return array_merge([
        'visitor_name' => 'Tola Ade',
        'visitor_phone' => '0803 123 4567',
        'visitor_email' => 'tola@acme.example',
        'visitor_company' => 'Acme Ltd',
        'visitor_type' => 'client',
        'visitor_gender' => 'female',
        'visit_date' => date('Y-m-d', strtotime('+1 day')),
        'expected_arrival' => '10:30',
        'expected_departure' => '11:30',
        'purpose' => 'Quarterly review',
        'party_size' => 1,
    ], $o);
}
