<?php
declare(strict_types=1);

const VISIT_STATUSES = ['booked', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
const VISITS_LIST_LIMIT = 500;

const VISIT_SELECT = "SELECT v.*, h.full_name AS host_name, d.name AS department_name, b.full_name AS booked_by_name,
        ci.full_name AS checked_in_by_name, co.full_name AS checked_out_by_name,
        (v.status = 'checked_in' AND v.expected_departure IS NOT NULL
            AND TIMESTAMP(v.visit_date, v.expected_departure) < NOW()) AS overstayed
    FROM visits v
    JOIN users h ON h.id = v.host_user_id
    JOIN users b ON b.id = v.booked_by_user_id
    LEFT JOIN departments d ON d.id = v.department_id
    LEFT JOIN users ci ON ci.id = v.checked_in_by
    LEFT JOIN users co ON co.id = v.checked_out_by";

/** Spec §4: booked visits from earlier days are no-shows. Idempotent and index-backed, so it runs on every visits request. */
function visits_sweep_no_shows(): void
{
    db_exec("UPDATE visits SET status = 'no_show' WHERE status = 'booked' AND visit_date < CURDATE()");
}

function visit_row(array $row, ?array $viewer = null): array
{
    $row['overstayed'] = (bool) $row['overstayed'];
    $row['expected_arrival'] = substr($row['expected_arrival'], 0, 5);
    $row['expected_departure'] = $row['expected_departure'] === null ? null : substr($row['expected_departure'], 0, 5);
    if ($viewer !== null && $viewer['role'] === 'staff') {
        // ID details are for reception, security, IT and admin only.
        $row['id_type'] = null;
        $row['id_number'] = null;
    }
    unset($row['updated_at']);
    return $row;
}

function visit_find(int $id, ?array $viewer = null): ?array
{
    $row = db_one(VISIT_SELECT . ' WHERE v.id = ?', [$id]);
    return $row === null ? null : visit_row($row, $viewer);
}

/** Validates the visit fields and the host together, so the form gets every error at once. */
function visit_validate_with_host(array $input, mixed $hostId): array
{
    $fields = [];
    $data = null;
    try {
        $data = validate_visit($input);
    } catch (HttpError $e) {
        $fields = $e->fields;
    }
    $host = is_int($hostId)
        ? db_one("SELECT id, department_id FROM users WHERE id = ? AND role = 'staff' AND active = 1", [$hostId])
        : null;
    if ($host === null) {
        $fields['host_user_id'] = 'Choose the person being visited.';
    }
    if ($fields) {
        throw HttpError::validation($fields);
    }
    return [$data, $host];
}

function visit_create(array $input, array $actor): array
{
    $isStaff = $actor['role'] === 'staff';
    [$data, $host] = visit_validate_with_host($input, $isStaff ? $actor['id'] : ($input['host_user_id'] ?? null));
    $id = db_insert(
        'INSERT INTO visits (visitor_name, visitor_phone, visitor_email, visitor_company, visitor_type, host_user_id,
            department_id, booked_by_user_id, channel, visit_date, expected_arrival, expected_departure, purpose, party_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $data['visitor_name'], $data['visitor_phone'], $data['visitor_email'], $data['visitor_company'], $data['visitor_type'],
            $host['id'], $host['department_id'], $actor['id'], $isStaff ? 'staff' : 'reception',
            $data['visit_date'], $data['expected_arrival'], $data['expected_departure'], $data['purpose'], $data['party_size'],
        ]
    );
    audit($actor['id'], 'visit.create', 'visit', $id, ['host_user_id' => $host['id']]);
    return visit_find($id, $actor);
}

function visit_query_date(array $query, string $key): ?string
{
    $value = $query[$key] ?? null;
    if ($value === null || $value === '') {
        return null;
    }
    return validate_date($value) ?? throw HttpError::validation([$key => 'Enter a valid date.']);
}

function visits_list(array $query, array $viewer): array
{
    $where = [];
    $params = [];
    if ($viewer['role'] === 'staff') {
        $where[] = 'v.host_user_id = ?';
        $params[] = $viewer['id'];
    }
    if ($from = visit_query_date($query, 'date_from')) {
        $where[] = 'v.visit_date >= ?';
        $params[] = $from;
    }
    if ($to = visit_query_date($query, 'date_to')) {
        $where[] = 'v.visit_date <= ?';
        $params[] = $to;
    }
    if ($day = visit_query_date($query, 'activity_date')) {
        $where[] = '(DATE(v.checked_in_at) = ? OR DATE(v.checked_out_at) = ?)';
        array_push($params, $day, $day);
    }
    $status = $query['status'] ?? '';
    if (is_string($status) && $status !== '') {
        $statuses = explode(',', $status);
        if (array_diff($statuses, VISIT_STATUSES)) {
            throw HttpError::validation(['status' => 'Choose a valid status.']);
        }
        $where[] = 'v.status IN (' . implode(', ', array_fill(0, count($statuses), '?')) . ')';
        array_push($params, ...$statuses);
    }
    $search = clean_text($query['q'] ?? '');
    if ($search !== '') {
        $like = '%' . addcslashes($search, '%_\\') . '%';
        $where[] = '(v.visitor_name LIKE ? OR v.visitor_company LIKE ? OR v.visitor_phone LIKE ? OR h.full_name LIKE ?)';
        array_push($params, $like, $like, $like, $like);
    }
    $sql = VISIT_SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY v.visit_date DESC, v.expected_arrival DESC, v.id DESC LIMIT ' . VISITS_LIST_LIMIT;
    return array_map(fn(array $row) => visit_row($row, $viewer), db_all($sql, $params));
}

function hosts_list(): array
{
    return db_all(
        "SELECT u.id, u.full_name, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.role = 'staff' AND u.active = 1 ORDER BY u.full_name, u.id"
    );
}
