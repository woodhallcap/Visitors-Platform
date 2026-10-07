<?php
declare(strict_types=1);

const STATS_MAX_DAYS = 366;
const STATS_TOP_DEPARTMENTS = 8;

/** ?from&to, defaulting to the 30 days ending today (WAT). */
function stats_range(array $query): array
{
    $to = visit_query_date($query, 'to') ?? date('Y-m-d');
    $from = visit_query_date($query, 'from') ?? date('Y-m-d', strtotime($to . ' -29 days'));
    if ($from > $to) {
        throw HttpError::validation(['to' => 'The end date must be on or after the start date.']);
    }
    if ((new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days + 1 > STATS_MAX_DAYS) {
        throw HttpError::validation(['from' => 'Choose a range of at most 366 days.']);
    }
    return [$from, $to];
}

function stats_count(string $sql, array $params = []): int
{
    return (int) db_one($sql, $params)['n'];
}

function stats_summary(string $from, string $to): array
{
    $range = [$from, $to];

    $average = db_one(
        "SELECT AVG(TIMESTAMPDIFF(MINUTE, checked_in_at, checked_out_at)) AS m FROM visits
         WHERE status = 'checked_out' AND visit_date BETWEEN ? AND ?",
        $range
    )['m'];
    $outcomes = db_one(
        "SELECT SUM(status = 'no_show') AS no_show, COUNT(*) AS total FROM visits
         WHERE visit_date BETWEEN ? AND ? AND status IN ('checked_in', 'checked_out', 'no_show')",
        $range
    );
    $total = (int) $outcomes['total'];

    $cards = [
        'visitors_today' => stats_count("SELECT COUNT(*) AS n FROM visits WHERE visit_date = ? AND status <> 'cancelled'", [date('Y-m-d')]),
        'on_site_now' => stats_count("SELECT COUNT(*) AS n FROM visits WHERE status = 'checked_in'"),
        'visits_in_range' => stats_count("SELECT COUNT(*) AS n FROM visits WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled'", $range),
        'average_visit_minutes' => $average === null ? null : (int) round((float) $average),
        'no_show_rate' => $total === 0 ? null : round((int) $outcomes['no_show'] / $total, 3),
    ];

    $byDate = array_column(db_all(
        "SELECT visit_date AS d, COUNT(*) AS n FROM visits WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled' GROUP BY visit_date",
        $range
    ), 'n', 'd');
    $perDay = [];
    for ($day = new DateTimeImmutable($from); $day->format('Y-m-d') <= $to; $day = $day->modify('+1 day')) {
        $key = $day->format('Y-m-d');
        $perDay[] = ['date' => $key, 'count' => (int) ($byDate[$key] ?? 0)];
    }

    $byTypeCounts = array_column(db_all(
        "SELECT visitor_type AS t, COUNT(*) AS n FROM visits WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled' GROUP BY visitor_type",
        $range
    ), 'n', 't');
    $byType = array_map(fn(string $type) => ['type' => $type, 'count' => (int) ($byTypeCounts[$type] ?? 0)], VISITOR_TYPES);

    $byDepartment = array_map(
        fn(array $row) => ['department' => $row['department'], 'count' => (int) $row['n']],
        db_all(
            "SELECT COALESCE(d.name, 'No department') AS department, COUNT(*) AS n
             FROM visits v LEFT JOIN departments d ON d.id = v.department_id
             WHERE v.visit_date BETWEEN ? AND ? AND v.status <> 'cancelled'
             GROUP BY COALESCE(d.name, 'No department') ORDER BY n DESC, department LIMIT " . STATS_TOP_DEPARTMENTS,
            $range
        )
    );

    $byHourCounts = array_column(db_all(
        'SELECT HOUR(checked_in_at) AS h, COUNT(*) AS n FROM visits
         WHERE checked_in_at IS NOT NULL AND visit_date BETWEEN ? AND ? GROUP BY HOUR(checked_in_at)',
        $range
    ), 'n', 'h');
    $byHour = array_map(fn(int $hour) => ['hour' => $hour, 'count' => (int) ($byHourCounts[$hour] ?? 0)], range(0, 23));

    return [
        'from' => $from,
        'to' => $to,
        'cards' => $cards,
        'per_day' => $perDay,
        'by_type' => $byType,
        'by_department' => $byDepartment,
        'by_hour' => $byHour,
    ];
}

const CSV_COLUMNS = [
    'Visit date' => 'visit_date',
    'Expected arrival' => 'expected_arrival',
    'Expected departure' => 'expected_departure',
    'Visitor' => 'visitor_name',
    'Phone' => 'visitor_phone',
    'Email' => 'visitor_email',
    'Company' => 'visitor_company',
    'Type' => 'visitor_type',
    'Host' => 'host_name',
    'Department' => 'department_name',
    'Purpose' => 'purpose',
    'Accompanying people' => 'party_size',
    'Status' => 'status',
    'Checked in at' => 'checked_in_at',
    'Checked out at' => 'checked_out_at',
    'Badge' => 'badge_number',
    'ID type' => 'id_type',
    'ID number' => 'id_number',
    'Booked by' => 'booked_by_name',
    'Channel' => 'channel',
];

/** Quotes a cell; a leading =, +, -, @, tab or CR would run as a spreadsheet formula, so it gets a ' — plain numbers excepted. */
function csv_cell(mixed $value): string
{
    $text = $value === null ? '' : (string) $value;
    if ($text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+-]?\d+(\.\d+)?$/', $text)) {
        $text = "'" . $text;
    }
    return '"' . str_replace('"', '""', $text) . '"';
}

/** Phones and numeric IDs: written as ="…" so Excel keeps them as text (no 2.34803E+12, no lost leading zero). Only for digit strings, so nothing else can ride along as a formula. */
function csv_text_cell(mixed $value): string
{
    $text = $value === null ? '' : (string) $value;
    if (preg_match('/^\+?\d+$/', $text)) {
        return '"=""' . $text . '"""';
    }
    return csv_cell($value);
}

const CSV_TEXT_FIELDS = ['visitor_phone', 'id_number'];

function visits_export_csv(string $from, string $to): string
{
    $rows = db_all(VISIT_SELECT . ' WHERE v.visit_date BETWEEN ? AND ? ORDER BY v.visit_date, v.expected_arrival, v.id', [$from, $to]);
    $lines = [implode(',', array_map('csv_cell', array_keys(CSV_COLUMNS)))];
    foreach ($rows as $row) {
        $visit = visit_row($row);
        $lines[] = implode(',', array_map(
            fn(string $field) => in_array($field, CSV_TEXT_FIELDS, true) ? csv_text_cell($visit[$field]) : csv_cell($visit[$field]),
            CSV_COLUMNS
        ));
    }
    // The BOM makes Excel read the file as UTF-8 (names with accents, ₦, etc.).
    return "\u{FEFF}" . implode("\r\n", $lines) . "\r\n";
}
