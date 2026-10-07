<?php
declare(strict_types=1);

const ROLES = ['staff', 'reception', 'security', 'it', 'admin'];

/** Trims and collapses runs of whitespace. Non-strings become ''. */
function clean_text(mixed $value): string
{
    return is_string($value) ? trim((string) preg_replace('/\s+/u', ' ', $value)) : '';
}

function normalize_email(mixed $value): string
{
    return is_string($value) ? strtolower(trim($value)) : '';
}

/** Strips spaces and dashes; returns null unless what is left is an optional + and 7–20 digits. */
function normalize_phone(string $value): ?string
{
    $stripped = str_replace([' ', '-'], '', trim($value));
    return preg_match('/^\+?\d{7,20}$/', $stripped) ? $stripped : null;
}

/** bcrypt ignores bytes past 72, so longer passwords are refused rather than silently truncated. */
function validate_password(mixed $value): ?string
{
    if (!is_string($value) || $value === '') {
        return 'Enter a password.';
    }
    if (mb_strlen($value) < 10) {
        return 'Use at least 10 characters.';
    }
    if (strlen($value) > 72) {
        return 'Use 72 characters or fewer.';
    }
    return null;
}

/** Shape and format checks for a user. Department existence is checked by the users service. */
function validate_user(array $input): array
{
    $errors = [];

    $name = clean_text($input['full_name'] ?? '');
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        $errors['full_name'] = 'Enter a full name (2–120 characters).';
    }

    $email = normalize_email($input['email'] ?? '');
    if (strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $errors['email'] = 'Enter a valid email address.';
    }

    $phone = null;
    $rawPhone = clean_text($input['phone'] ?? '');
    if ($rawPhone !== '') {
        $phone = normalize_phone($rawPhone);
        if ($phone === null) {
            $errors['phone'] = 'Enter a valid phone number.';
        }
    }

    $role = $input['role'] ?? '';
    if (!in_array($role, ROLES, true)) {
        $errors['role'] = 'Choose a role.';
    }

    $departmentId = $input['department_id'] ?? null;
    if ($departmentId !== null && !is_int($departmentId)) {
        $errors['department_id'] = 'Choose a department.';
        $departmentId = null;
    } elseif ($role === 'staff' && $departmentId === null) {
        $errors['department_id'] = 'Staff need a department.';
    }

    $active = $input['active'] ?? true;
    if (!is_bool($active)) {
        $errors['active'] = 'Invalid value.';
    }

    if ($errors) {
        throw HttpError::validation($errors);
    }
    return ['full_name' => $name, 'email' => $email, 'phone' => $phone, 'role' => $role, 'department_id' => $departmentId, 'active' => $active];
}
