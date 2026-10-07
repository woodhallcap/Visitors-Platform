<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

function day(int $offset): string
{
    return date('Y-m-d', strtotime(($offset >= 0 ? '+' : '') . $offset . ' days'));
}

db_test('stats and export are for IT and admin only', function () {
    foreach (['staff', 'reception', 'security'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/stats'));
        assert_status(403, request('GET', '/visits/export.csv'));
    }
    foreach (['it', 'admin'] as $role) {
        act_as(make_user($role));
        assert_status(200, request('GET', '/stats'));
        assert_status(200, request('GET', '/visits/export.csv'));
    }
});

db_test('the default range is the 30 days ending today, zero-filled', function () {
    act_as(make_user('it'));
    $stats = request('GET', '/stats')->body;
    assert_equal(day(-29), $stats['from']);
    assert_equal(day(0), $stats['to']);
    assert_equal(30, count($stats['per_day']));
    assert_equal(day(0), $stats['per_day'][29]['date']);
    assert_equal(['visitors_today' => 0, 'on_site_now' => 0, 'visits_in_range' => 0, 'average_visit_minutes' => null, 'no_show_rate' => null], $stats['cards']);
    assert_equal(['client', 'vendor', 'interviewee', 'contractor', 'guest'], array_column($stats['by_type'], 'type'));
    assert_equal(24, count($stats['by_hour']));
    assert_equal([], $stats['by_department']);
});

db_test('stat cards follow the spec definitions', function () {
    $today = day(0);
    make_visit(['visitor_type' => 'vendor']);
    make_visit(['status' => 'cancelled']);
    make_visit(['status' => 'checked_in', 'checked_in_at' => "{$today} 09:00:00"]);
    make_visit(['status' => 'checked_out', 'visit_date' => day(-1), 'checked_in_at' => day(-1) . ' 10:00:00', 'checked_out_at' => day(-1) . ' 10:30:00']);
    make_visit(['status' => 'checked_out', 'visit_date' => day(-2), 'checked_in_at' => day(-2) . ' 14:00:00', 'checked_out_at' => day(-2) . ' 15:30:00']);
    make_visit(['status' => 'no_show', 'visit_date' => day(-3)]);
    make_visit(['status' => 'checked_in', 'visit_date' => day(-40), 'checked_in_at' => day(-40) . ' 08:00:00']);
    act_as(make_user('admin'));
    $cards = request('GET', '/stats')->body['cards'];
    assert_equal(2, $cards['visitors_today']);
    assert_equal(2, $cards['on_site_now']);
    assert_equal(5, $cards['visits_in_range']);
    assert_equal(60, $cards['average_visit_minutes']);
    assert_equal(0.25, $cards['no_show_rate']);
});

db_test('chart series count visits by day, type, department and check-in hour', function () {
    $finance = make_department('Finance');
    $host = make_user('staff', ['department_id' => $finance['id']]);
    make_visit(['host_user_id' => $host['id'], 'department_id' => $finance['id'], 'visitor_type' => 'vendor', 'status' => 'checked_in', 'checked_in_at' => day(0) . ' 09:15:00']);
    make_visit(['host_user_id' => $host['id'], 'department_id' => $finance['id'], 'visitor_type' => 'vendor', 'visit_date' => day(-1)]);
    make_visit(['department_id' => null, 'visitor_type' => 'guest']);
    make_visit(['visitor_type' => 'guest', 'status' => 'cancelled']);
    act_as(make_user('it'));
    $stats = request('GET', '/stats')->body;
    $perDay = array_column($stats['per_day'], 'count', 'date');
    assert_equal(2, $perDay[day(0)]);
    assert_equal(1, $perDay[day(-1)]);
    $byType = array_column($stats['by_type'], 'count', 'type');
    assert_equal(['client' => 0, 'vendor' => 2, 'interviewee' => 0, 'contractor' => 0, 'guest' => 1], $byType);
    assert_equal(['department' => 'Finance', 'count' => 2], $stats['by_department'][0]);
    assert_true(in_array(['department' => 'No department', 'count' => 1], $stats['by_department'], true), 'No department bucket missing');
    assert_equal(1, $stats['by_hour'][9]['count']);
    assert_equal(9, $stats['by_hour'][9]['hour']);
});

db_test('top departments are capped at 8', function () {
    for ($i = 1; $i <= 10; $i++) {
        $dept = make_department("Dept {$i}");
        make_visit(['department_id' => $dept['id']]);
    }
    act_as(make_user('it'));
    assert_equal(8, count(request('GET', '/stats')->body['by_department']));
});

db_test('ranges are validated: order, length and format', function () {
    act_as(make_user('it'));
    $backwards = request('GET', '/stats', [], ['from' => day(0), 'to' => day(-1)]);
    assert_status(422, $backwards);
    assert_equal('The end date must be on or after the start date.', $backwards->body['error']['fields']['to']);
    assert_status(200, request('GET', '/stats', [], ['from' => day(-365), 'to' => day(0)]));
    $tooLong = request('GET', '/stats', [], ['from' => day(-366), 'to' => day(0)]);
    assert_status(422, $tooLong);
    assert_equal('Choose a range of at most 366 days.', $tooLong->body['error']['fields']['from']);
    assert_status(422, request('GET', '/stats', [], ['from' => 'yesterday']));
});

db_test('the CSV export lists visits in range with safe cells', function () {
    $finance = make_department('Finance');
    $host = make_user('staff', ['department_id' => $finance['id'], 'full_name' => 'Chidi Okafor']);
    make_visit(['host_user_id' => $host['id'], 'department_id' => $finance['id'], 'visitor_name' => '=HYPERLINK("http://evil","x")',
        'visitor_phone' => '+2348031234567', 'purpose' => 'Says "hello"', 'expected_arrival' => '11:00']);
    make_visit(['host_user_id' => $host['id'], 'visitor_name' => 'Early Bird', 'expected_arrival' => '08:00']);
    make_visit(['visitor_name' => 'Too Old', 'visit_date' => day(-60)]);
    $it = make_user('it');
    act_as($it);
    $response = request('GET', '/visits/export.csv');
    assert_status(200, $response);
    assert_equal('text/csv; charset=utf-8', $response->headers['Content-Type']);
    assert_equal('attachment; filename="visits-' . day(-29) . '-to-' . day(0) . '.csv"', $response->headers['Content-Disposition']);
    assert_true(str_starts_with($response->raw, "\u{FEFF}\"Visit date\",\"Expected arrival\""), 'BOM + header row expected');
    $lines = explode("\r\n", trim(substr($response->raw, 3)));
    assert_equal(3, count($lines));
    assert_true(str_contains($lines[1], '"Early Bird"'), 'rows are ordered by arrival');
    assert_true(str_contains($lines[2], '"\'=HYPERLINK(""http://evil"",""x"")"'), 'formula must be neutralised: ' . $lines[2]);
    assert_true(str_contains($lines[2], '"+2348031234567"'), 'phone must stay readable');
    assert_true(str_contains($lines[2], '"Says ""hello"""'), 'quotes must be doubled');
    assert_true(str_contains($lines[2], '"Chidi Okafor","Finance"'), 'host and department expected');
    assert_true(!str_contains($response->raw, 'Too Old'), 'out-of-range visit leaked');
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visits.export' AND user_id = ?", [$it['id']])['n']);
});

test_case('csv_cell neutralises formulas but keeps plain numbers', function () {
    assert_equal('"\'=1+2"', csv_cell('=1+2'));
    assert_equal('"\'@SUM(A1)"', csv_cell('@SUM(A1)'));
    assert_equal('"\'-cmd"', csv_cell('-cmd'));
    assert_equal('"-12"', csv_cell('-12'));
    assert_equal('"+2348031234567"', csv_cell('+2348031234567'));
    assert_equal('""', csv_cell(null));
    assert_equal('"3"', csv_cell(3));
});

test_summary();
