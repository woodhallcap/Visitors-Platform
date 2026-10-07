<?php
declare(strict_types=1);

const DEPARTMENT_SELECT = 'SELECT d.id, d.name, d.active, COUNT(u.id) AS user_count
    FROM departments d LEFT JOIN users u ON u.department_id = d.id';

function department_row(array $row): array
{
    return ['id' => $row['id'], 'name' => $row['name'], 'active' => (bool) $row['active'], 'user_count' => (int) $row['user_count']];
}

function department_find(int $id): ?array
{
    $row = db_one(DEPARTMENT_SELECT . ' WHERE d.id = ? GROUP BY d.id, d.name, d.active', [$id]);
    return $row === null ? null : department_row($row);
}

function departments_list(bool $includeInactive): array
{
    $where = $includeInactive ? '' : ' WHERE d.active = 1';
    return array_map('department_row', db_all(DEPARTMENT_SELECT . $where . ' GROUP BY d.id, d.name, d.active ORDER BY d.name'));
}

function validate_department_name(mixed $value): string
{
    $name = clean_text($value);
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        throw HttpError::validation(['name' => 'Enter a department name (2–120 characters).']);
    }
    return $name;
}

function department_create(array $input, array $actor): array
{
    $name = validate_department_name($input['name'] ?? '');
    try {
        $id = db_insert('INSERT INTO departments (name) VALUES (?)', [$name]);
    } catch (PDOException $e) {
        if (is_duplicate_key($e)) {
            throw HttpError::validation(['name' => 'A department with this name already exists.']);
        }
        throw $e;
    }
    audit($actor['id'], 'department.create', 'department', $id, ['name' => $name]);
    return department_find($id);
}

function department_update(int $id, array $input, array $actor): array
{
    if (department_find($id) === null) {
        throw HttpError::notFound('Department not found.');
    }
    $changes = [];
    if (array_key_exists('name', $input)) {
        $changes['name'] = validate_department_name($input['name']);
    }
    if (array_key_exists('active', $input)) {
        if (!is_bool($input['active'])) {
            throw HttpError::validation(['active' => 'Invalid value.']);
        }
        $changes['active'] = $input['active'] ? 1 : 0;
    }
    if ($changes) {
        $sets = implode(', ', array_map(fn(string $column) => "{$column} = ?", array_keys($changes)));
        try {
            db_exec("UPDATE departments SET {$sets} WHERE id = ?", [...array_values($changes), $id]);
        } catch (PDOException $e) {
            if (is_duplicate_key($e)) {
                throw HttpError::validation(['name' => 'A department with this name already exists.']);
            }
            throw $e;
        }
        audit($actor['id'], 'department.update', 'department', $id, $changes);
    }
    return department_find($id);
}
