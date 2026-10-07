<?php
declare(strict_types=1);

const USER_SELECT = 'SELECT u.id, u.full_name, u.email, u.phone, u.role, u.department_id, d.name AS department_name,
        u.active, (u.password_hash IS NOT NULL) AS has_password, u.last_login_at, u.created_at
    FROM users u LEFT JOIN departments d ON d.id = u.department_id';

function user_row(array $row): array
{
    $row['active'] = (bool) $row['active'];
    $row['has_password'] = (bool) $row['has_password'];
    return $row;
}

function user_find(int $id): ?array
{
    $row = db_one(USER_SELECT . ' WHERE u.id = ?', [$id]);
    return $row === null ? null : user_row($row);
}
