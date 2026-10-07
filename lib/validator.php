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

const VISITOR_TYPES = ['client', 'vendor', 'interviewee', 'contractor', 'guest'];

function validate_time(mixed $value): ?string
{
    return is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) ? $value : null;
}

/** A strict YYYY-MM-DD calendar date, or null. */
function validate_date(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date !== false && $date->format('Y-m-d') === $value ? $value : null;
}

/** Shape and format checks for a visit (spec §5). Host rules live in the visits service. */
function validate_visit(array $input): array
{
    $errors = [];

    $name = clean_text($input['visitor_name'] ?? '');
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        $errors['visitor_name'] = "Enter the visitor's full name (2–120 characters).";
    }

    $phone = normalize_phone(clean_text($input['visitor_phone'] ?? ''));
    if ($phone === null) {
        $errors['visitor_phone'] = 'Enter a valid phone number.';
    }

    $email = normalize_email($input['visitor_email'] ?? '');
    if ($email !== '' && (strlen($email) > 190 || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
        $errors['visitor_email'] = 'Enter a valid email address.';
    }

    $company = clean_text($input['visitor_company'] ?? '');
    if (mb_strlen($company) > 120) {
        $errors['visitor_company'] = 'Use 120 characters or fewer.';
    }

    $type = $input['visitor_type'] ?? '';
    if (!in_array($type, VISITOR_TYPES, true)) {
        $errors['visitor_type'] = 'Choose a visitor type.';
    }

    $date = validate_date($input['visit_date'] ?? null);
    if ($date === null) {
        $errors['visit_date'] = 'Enter a valid date.';
    } elseif ($date < date('Y-m-d')) {
        $errors['visit_date'] = 'Choose today or a later date.';
    }

    $arrival = validate_time($input['expected_arrival'] ?? null);
    if ($arrival === null) {
        $errors['expected_arrival'] = 'Enter the expected arrival time (HH:MM).';
    }

    $departure = null;
    $rawDeparture = $input['expected_departure'] ?? null;
    if ($rawDeparture !== null && $rawDeparture !== '') {
        $departure = validate_time($rawDeparture);
        if ($departure === null) {
            $errors['expected_departure'] = 'Enter a valid time (HH:MM).';
        } elseif ($arrival !== null && $departure <= $arrival) {
            $errors['expected_departure'] = 'Departure must be after arrival.';
        }
    }

    $purpose = clean_text($input['purpose'] ?? '');
    if (mb_strlen($purpose) < 3 || mb_strlen($purpose) > 255) {
        $errors['purpose'] = 'Enter the purpose of the visit (3–255 characters).';
    }

    $party = $input['party_size'] ?? 0;
    if (!is_int($party) || $party < 0 || $party > 50) {
        $errors['party_size'] = 'Enter a number from 0 to 50.';
    }

    if ($errors) {
        throw HttpError::validation($errors);
    }
    return [
        'visitor_name' => $name,
        'visitor_phone' => $phone,
        'visitor_email' => $email === '' ? null : $email,
        'visitor_company' => $company === '' ? null : $company,
        'visitor_type' => $type,
        'visit_date' => $date,
        'expected_arrival' => $arrival,
        'expected_departure' => $departure,
        'purpose' => $purpose,
        'party_size' => $party,
    ];
}
