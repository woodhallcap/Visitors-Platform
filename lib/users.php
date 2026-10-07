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

const USER_EDITABLE_FIELDS = ['full_name', 'email', 'phone', 'role', 'department_id', 'active'];
const PRIVILEGED_ROLES = ['admin', 'it'];

/** Spec §3: only IT may touch admin and IT accounts or hand out those roles. */
function assert_can_manage(array $actor, string ...$roles): void
{
    if ($actor['role'] !== 'it' && array_intersect($roles, PRIVILEGED_ROLES)) {
        throw new HttpError(403, 'forbidden', 'Only IT can manage admin and IT accounts.');
    }
}

function users_list(): array
{
    return array_map('user_row', db_all(USER_SELECT . ' ORDER BY u.full_name, u.id'));
}

/** A newly chosen department must exist and be active; a user may keep one that was deactivated later. */
function assert_assignable_department(?int $departmentId, ?int $currentDepartmentId = null): void
{
    if ($departmentId === null || $departmentId === $currentDepartmentId) {
        return;
    }
    $row = db_one('SELECT active FROM departments WHERE id = ?', [$departmentId]);
    if ($row === null || $row['active'] !== 1) {
        throw HttpError::validation(['department_id' => 'Choose a department.']);
    }
}

function user_create(array $input, ?array $actor): array
{
    $data = validate_user($input);
    if ($actor !== null) {
        assert_can_manage($actor, $data['role']);
    }
    assert_assignable_department($data['department_id']);
    try {
        $id = db_insert(
            'INSERT INTO users (full_name, email, phone, role, department_id) VALUES (?, ?, ?, ?, ?)',
            [$data['full_name'], $data['email'], $data['phone'], $data['role'], $data['department_id']]
        );
    } catch (PDOException $e) {
        if (is_duplicate_key($e)) {
            throw HttpError::validation(['email' => 'A user with this email already exists.']);
        }
        throw $e;
    }
    audit($actor['id'] ?? null, 'user.invite', 'user', $id, ['role' => $data['role']]);
    return user_find($id);
}

function user_update(int $id, array $input, array $actor): array
{
    $existing = user_find($id) ?? throw HttpError::notFound('User not found.');
    $merged = array_intersect_key($existing, array_flip(USER_EDITABLE_FIELDS));
    foreach (USER_EDITABLE_FIELDS as $field) {
        if (array_key_exists($field, $input)) {
            $merged[$field] = $input[$field];
        }
    }
    $data = validate_user($merged);
    assert_can_manage($actor, $existing['role'], $data['role']);
    assert_assignable_department($data['department_id'], $existing['department_id']);
    if ($existing['id'] === $actor['id'] && ($data['role'] !== $existing['role'] || $data['active'] !== $existing['active'])) {
        throw HttpError::conflict("You can't change your own role or disable your own account.");
    }

    try {
        db_exec(
            'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, department_id = ?, active = ? WHERE id = ?',
            [$data['full_name'], $data['email'], $data['phone'], $data['role'], $data['department_id'], $data['active'] ? 1 : 0, $id]
        );
    } catch (PDOException $e) {
        if (is_duplicate_key($e)) {
            throw HttpError::validation(['email' => 'A user with this email already exists.']);
        }
        throw $e;
    }

    $changed = [];
    foreach (['full_name', 'email', 'phone', 'role', 'department_id'] as $field) {
        if ($data[$field] !== $existing[$field]) {
            $changed[] = $field;
        }
    }
    if ($changed) {
        audit($actor['id'], 'user.update', 'user', $id, ['fields' => $changed]);
    }
    if ($data['active'] !== $existing['active']) {
        audit($actor['id'], $data['active'] ? 'user.enable' : 'user.disable', 'user', $id);
    }
    return user_find($id);
}

function user_reset_link(int $id, array $actor): array
{
    $user = user_find($id) ?? throw HttpError::notFound('User not found.');
    assert_can_manage($actor, $user['role']);
    if (!$user['active']) {
        throw HttpError::conflict('Enable this user before creating a set-password link.');
    }
    $purpose = $user['has_password'] ? 'reset' : 'invite';
    $link = set_password_link($id, $purpose);
    audit($actor['id'], 'user.reset_link', 'user', $id, ['purpose' => $purpose]);
    return $link;
}
