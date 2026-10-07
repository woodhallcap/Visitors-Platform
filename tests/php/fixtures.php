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
