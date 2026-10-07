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
