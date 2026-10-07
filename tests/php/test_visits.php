<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

const TOMORROW_OFFSET = '+1 day';

function tomorrow(): string
{
    return date('Y-m-d', strtotime(TOMORROW_OFFSET));
}

// ---- create ----

db_test('staff book visitors for themselves; host_user_id in the body is ignored', function () {
    $finance = make_department('Finance');
    $staff = make_user('staff', ['department_id' => $finance['id'], 'full_name' => 'Chidi Okafor']);
    $other = make_user('staff');
    act_as($staff);
    $response = request('POST', '/visits', visit_body(['host_user_id' => $other['id']]));
    assert_status(201, $response);
    $visit = $response->body['visit'];
    assert_equal($staff['id'], $visit['host_user_id']);
    assert_equal('Chidi Okafor', $visit['host_name']);
    assert_equal('Finance', $visit['department_name']);
    assert_equal('staff', $visit['channel']);
    assert_equal('booked', $visit['status']);
    assert_equal('08031234567', $visit['visitor_phone']);
    assert_equal('10:30', $visit['expected_arrival']);
    assert_equal('11:30', $visit['expected_departure']);
    assert_equal(1, $visit['party_size']);
    assert_equal(false, $visit['overstayed']);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.create'")['n']);
});

db_test('reception and admin book for a chosen host; the host department is copied', function () {
    $legal = make_department('Legal');
    $host = make_user('staff', ['department_id' => $legal['id']]);
    foreach (['reception', 'admin'] as $role) {
        act_as(make_user($role));
        $response = request('POST', '/visits', visit_body(['host_user_id' => $host['id']]));
        assert_status(201, $response);
        assert_equal($host['id'], $response->body['visit']['host_user_id']);
        assert_equal($legal['id'], $response->body['visit']['department_id']);
        assert_equal('reception', $response->body['visit']['channel']);
    }
});

db_test('the host must be an active staff member', function () {
    $inactive = make_user('staff', ['active' => false]);
    $security = make_user('security');
    act_as(make_user('reception'));
    foreach ([null, 999, '5', $inactive['id'], $security['id']] as $hostId) {
        $body = visit_body();
        if ($hostId !== null) {
            $body['host_user_id'] = $hostId;
        }
        $response = request('POST', '/visits', $body);
        assert_status(422, $response);
        assert_equal('Choose the person being visited.', $response->body['error']['fields']['host_user_id']);
    }
});

db_test('every visit field is validated with the spec messages', function () {
    act_as(make_user('staff'));
    $response = request('POST', '/visits', [
        'visitor_name' => 'A', 'visitor_phone' => '123', 'visitor_email' => 'nope', 'visitor_company' => str_repeat('x', 121),
        'visitor_type' => 'friend', 'visit_date' => '2026-02-30', 'expected_arrival' => '25:00',
        'expected_departure' => '9am', 'purpose' => 'hi', 'party_size' => 51,
    ]);
    assert_status(422, $response);
    assert_equal([
        'visitor_name' => "Enter the visitor's full name (2–120 characters).",
        'visitor_phone' => 'Enter a valid phone number.',
        'visitor_email' => 'Enter a valid email address.',
        'visitor_company' => 'Use 120 characters or fewer.',
        'visitor_type' => 'Choose a visitor type.',
        'visit_date' => 'Enter a valid date.',
        'expected_arrival' => 'Enter the expected arrival time (HH:MM).',
        'expected_departure' => 'Enter a valid time (HH:MM).',
        'purpose' => 'Enter the purpose of the visit (3–255 characters).',
        'party_size' => 'Enter a number from 0 to 50.',
    ], $response->body['error']['fields']);
});

db_test('dates before today are refused; today with any arrival time is fine; departure must follow arrival', function () {
    act_as(make_user('staff'));
    $past = request('POST', '/visits', visit_body(['visit_date' => date('Y-m-d', strtotime('-1 day'))]));
    assert_equal('Choose today or a later date.', $past->body['error']['fields']['visit_date']);
    assert_status(201, request('POST', '/visits', visit_body(['visit_date' => date('Y-m-d'), 'expected_arrival' => '00:05', 'expected_departure' => null])));
    $backwards = request('POST', '/visits', visit_body(['expected_arrival' => '14:00', 'expected_departure' => '14:00']));
    assert_equal('Departure must be after arrival.', $backwards->body['error']['fields']['expected_departure']);
});

db_test('optional fields may be empty and party size defaults to 0', function () {
    act_as(make_user('staff'));
    $body = visit_body(['visitor_email' => '', 'visitor_company' => '', 'expected_departure' => '']);
    unset($body['party_size']);
    $visit = request('POST', '/visits', $body)->body['visit'];
    assert_equal(null, $visit['visitor_email']);
    assert_equal(null, $visit['visitor_company']);
    assert_equal(null, $visit['expected_departure']);
    assert_equal(0, $visit['party_size']);
});

db_test('security and IT cannot book visitors', function () {
    $host = make_user('staff');
    foreach (['security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('POST', '/visits', visit_body(['host_user_id' => $host['id']])));
    }
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM visits')['n']);
});

// ---- hosts ----

db_test('hosts are active staff, sorted by name, for reception and admin only', function () {
    $finance = make_department('Finance');
    make_user('staff', ['full_name' => 'Zainab Bello', 'department_id' => $finance['id']]);
    make_user('staff', ['full_name' => 'Ade Cole', 'department_id' => $finance['id']]);
    make_user('staff', ['full_name' => 'Gone Person', 'active' => false]);
    make_user('security', ['full_name' => 'Sam Guard']);
    act_as(make_user('reception'));
    $hosts = request('GET', '/hosts')->body['hosts'];
    assert_equal(['Ade Cole', 'Zainab Bello'], array_column($hosts, 'full_name'));
    assert_equal(['id', 'full_name', 'department_name'], array_keys($hosts[0]));
    assert_equal('Finance', $hosts[0]['department_name']);
    act_as(make_user('admin'));
    assert_status(200, request('GET', '/hosts'));
    foreach (['staff', 'security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/hosts'));
    }
});

// ---- list ----

db_test('staff see only their own visits, without ID details', function () {
    $staff = make_user('staff');
    make_visit(['host_user_id' => $staff['id'], 'id_type' => 'Passport', 'id_number' => 'A123']);
    make_visit();
    act_as($staff);
    $visits = request('GET', '/visits')->body['visits'];
    assert_equal(1, count($visits));
    assert_equal($staff['id'], $visits[0]['host_user_id']);
    assert_equal(null, $visits[0]['id_type']);
    assert_equal(null, $visits[0]['id_number']);
});

db_test('every other role sees all visits, including ID details', function () {
    make_visit(['id_type' => 'Passport', 'id_number' => 'A123']);
    make_visit();
    foreach (['reception', 'security', 'it', 'admin'] as $role) {
        act_as(make_user($role));
        $visits = request('GET', '/visits')->body['visits'];
        assert_equal(2, count($visits), $role);
    }
    act_as(make_user('security'));
    $withId = array_values(array_filter(request('GET', '/visits')->body['visits'], fn($v) => $v['id_number'] !== null));
    assert_equal('A123', $withId[0]['id_number']);
});

db_test('date range, status list and search filters', function () {
    $host = make_user('staff', ['full_name' => 'Kemi Host']);
    make_visit(['visit_date' => date('Y-m-d'), 'visitor_name' => 'Today Person']);
    make_visit(['visit_date' => tomorrow(), 'visitor_name' => 'Tomorrow Person', 'host_user_id' => $host['id']]);
    make_visit(['visit_date' => tomorrow(), 'visitor_name' => 'Cancelled Person', 'status' => 'cancelled', 'visitor_company' => 'Zeta Co']);
    act_as(make_user('reception'));
    $names = fn(array $q) => array_column(request('GET', '/visits', [], $q)->body['visits'], 'visitor_name');
    assert_equal(['Today Person'], $names(['date_from' => date('Y-m-d'), 'date_to' => date('Y-m-d')]));
    assert_equal(['Tomorrow Person'], $names(['date_from' => tomorrow(), 'status' => 'booked']));
    assert_equal(2, count($names(['status' => 'booked,cancelled', 'date_from' => tomorrow()])));
    assert_equal(['Cancelled Person'], $names(['q' => 'zeta']));
    assert_equal(['Tomorrow Person'], $names(['q' => 'kemi']));
    assert_status(422, request('GET', '/visits', [], ['date_from' => '07/10/2026']));
    $badStatus = request('GET', '/visits', [], ['status' => 'gone']);
    assert_status(422, $badStatus);
    assert_equal('Choose a valid status.', $badStatus->body['error']['fields']['status']);
});

db_test('search treats % and _ literally', function () {
    make_visit(['visitor_name' => 'Percent 100% Ltd']);
    make_visit(['visitor_name' => 'Plain Name']);
    act_as(make_user('reception'));
    assert_equal(['Percent 100% Ltd'], array_column(request('GET', '/visits', [], ['q' => '100%'])->body['visits'], 'visitor_name'));
    assert_equal([], request('GET', '/visits', [], ['q' => '_'])->body['visits']);
});

db_test('activity_date returns visits checked in or out that day', function () {
    make_visit(['visitor_name' => 'In Today', 'status' => 'checked_in', 'checked_in_at' => date('Y-m-d') . ' 09:00:00']);
    make_visit(['visitor_name' => 'Out Today', 'status' => 'checked_out', 'visit_date' => date('Y-m-d', strtotime('-1 day')),
        'checked_in_at' => date('Y-m-d', strtotime('-1 day')) . ' 15:00:00', 'checked_out_at' => date('Y-m-d') . ' 08:00:00']);
    make_visit(['visitor_name' => 'Just Booked']);
    act_as(make_user('security'));
    $names = array_column(request('GET', '/visits', [], ['activity_date' => date('Y-m-d')])->body['visits'], 'visitor_name');
    sort($names);
    assert_equal(['In Today', 'Out Today'], $names);
});

db_test('booked visits from earlier days become no-shows on the next visits request', function () {
    $old = make_visit(['visit_date' => date('Y-m-d', strtotime('-1 day'))]);
    $today = make_visit();
    act_as(make_user('reception'));
    request('GET', '/visits');
    assert_equal('no_show', visit_find($old['id'])['status']);
    assert_equal('booked', visit_find($today['id'])['status']);
});

db_test('overstay is derived from the expected departure', function () {
    $late = make_visit(['status' => 'checked_in', 'checked_in_at' => date('Y-m-d') . ' 00:01:00',
        'expected_arrival' => '00:00', 'expected_departure' => '00:01']);
    $fine = make_visit(['status' => 'checked_in', 'visit_date' => tomorrow(), 'expected_departure' => '23:59']);
    $gone = make_visit(['status' => 'checked_out', 'expected_arrival' => '00:00', 'expected_departure' => '00:01']);
    assert_equal(true, visit_find($late['id'])['overstayed']);
    assert_equal(false, visit_find($fine['id'])['overstayed']);
    assert_equal(false, visit_find($gone['id'])['overstayed']);
});

// ---- edit / cancel ----

db_test('staff edit their own booked visit but cannot move it to another host', function () {
    $staff = make_user('staff');
    $other = make_user('staff');
    $visit = make_visit(['host_user_id' => $staff['id'], 'visit_date' => tomorrow()]);
    act_as($staff);
    $response = request('PATCH', "/visits/{$visit['id']}", ['visitor_name' => 'Renamed Visitor', 'expected_arrival' => '15:00', 'host_user_id' => $other['id']]);
    assert_status(200, $response);
    assert_equal('Renamed Visitor', $response->body['visit']['visitor_name']);
    assert_equal('15:00', $response->body['visit']['expected_arrival']);
    assert_equal($staff['id'], $response->body['visit']['host_user_id']);
    $audit = json_decode(db_one("SELECT details FROM audit_log WHERE action = 'visit.update'")['details'], true);
    assert_equal(['visitor_name', 'expected_arrival'], $audit['fields']);
});

db_test("staff cannot see or change another staff member's visit", function () {
    $visit = make_visit();
    act_as(make_user('staff'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['visitor_name' => 'Hijacked']);
    assert_status(404, $response);
    assert_equal('Visit not found.', $response->body['error']['message']);
    assert_status(404, request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']));
    assert_equal('Tola Ade', visit_find($visit['id'])['visitor_name']);
});

db_test('reception moves a visit to another host and the department follows', function () {
    $legal = make_department('Legal');
    $newHost = make_user('staff', ['department_id' => $legal['id']]);
    $visit = make_visit(['visit_date' => tomorrow()]);
    act_as(make_user('reception'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['host_user_id' => $newHost['id']]);
    assert_status(200, $response);
    assert_equal($newHost['id'], $response->body['visit']['host_user_id']);
    assert_equal($legal['id'], $response->body['visit']['department_id']);
});

db_test('edits are validated like new bookings', function () {
    $visit = make_visit(['visit_date' => tomorrow()]);
    act_as(make_user('admin'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['expected_departure' => '09:00', 'expected_arrival' => '10:00']);
    assert_status(422, $response);
    assert_equal('Departure must be after arrival.', $response->body['error']['fields']['expected_departure']);
});

db_test('cancelling records who and when; only booked visits can change', function () {
    $visit = make_visit();
    $reception = make_user('reception');
    act_as($reception);
    $response = request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']);
    assert_status(200, $response);
    assert_equal('cancelled', $response->body['visit']['status']);
    assert_equal($reception['id'], $response->body['visit']['cancelled_by']);
    assert_true($response->body['visit']['cancelled_at'] !== null);
    $again = request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']);
    assert_status(409, $again);
    assert_equal('Only booked visits can be changed.', $again->body['error']['message']);
    assert_status(409, request('PATCH', "/visits/{$visit['id']}", ['visitor_name' => 'Too Late']));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.cancel'")['n']);
});

db_test('status can only be set to cancelled', function () {
    $visit = make_visit();
    act_as(make_user('reception'));
    $response = request('PATCH', "/visits/{$visit['id']}", ['status' => 'checked_in']);
    assert_status(422, $response);
    assert_equal('Invalid value.', $response->body['error']['fields']['status']);
});

db_test('security and IT cannot edit visits; a missing visit is 404', function () {
    $visit = make_visit();
    foreach (['security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('PATCH', "/visits/{$visit['id']}", ['status' => 'cancelled']));
    }
    act_as(make_user('reception'));
    assert_status(404, request('PATCH', '/visits/999', ['status' => 'cancelled']));
});

// ---- check-in / check-out ----

db_test('reception checks in a visitor booked for today and records the details', function () {
    $visit = make_visit();
    $reception = make_user('reception', ['full_name' => 'Rita Desk']);
    act_as($reception);
    $response = request('POST', "/visits/{$visit['id']}/check-in", ['badge_number' => ' V-12 ', 'id_type' => 'Passport', 'id_number' => 'A1234567']);
    assert_status(200, $response);
    $checked = $response->body['visit'];
    assert_equal('checked_in', $checked['status']);
    assert_equal('V-12', $checked['badge_number']);
    assert_equal('Passport', $checked['id_type']);
    assert_equal('A1234567', $checked['id_number']);
    assert_equal('Rita Desk', $checked['checked_in_by_name']);
    assert_true($checked['checked_in_at'] !== null);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.check_in'")['n']);
});

db_test('check-in details are optional and length-limited', function () {
    $visit = make_visit();
    act_as(make_user('reception'));
    $tooLong = request('POST', "/visits/{$visit['id']}/check-in", ['badge_number' => str_repeat('b', 31), 'id_type' => str_repeat('t', 41), 'id_number' => str_repeat('n', 41)]);
    assert_status(422, $tooLong);
    assert_equal(['badge_number' => 'Use 30 characters or fewer.', 'id_type' => 'Use 40 characters or fewer.', 'id_number' => 'Use 40 characters or fewer.'], $tooLong->body['error']['fields']);
    $plain = request('POST', "/visits/{$visit['id']}/check-in");
    assert_status(200, $plain);
    assert_equal(null, $plain->body['visit']['badge_number']);
});

db_test('only visitors booked for today can be checked in, and only once', function () {
    $future = make_visit(['visit_date' => tomorrow()]);
    $cancelled = make_visit(['status' => 'cancelled']);
    $today = make_visit();
    act_as(make_user('reception'));
    foreach ([$future, $cancelled] as $visit) {
        $response = request('POST', "/visits/{$visit['id']}/check-in");
        assert_status(409, $response);
        assert_equal('Only visitors booked for today can be checked in.', $response->body['error']['message']);
    }
    assert_status(200, request('POST', "/visits/{$today['id']}/check-in", ['badge_number' => 'FIRST']));
    assert_status(409, request('POST', "/visits/{$today['id']}/check-in", ['badge_number' => 'SECOND']));
    assert_equal('FIRST', visit_find($today['id'])['badge_number']);
});

db_test('reception checks visitors out; only visitors on site can be checked out', function () {
    $visit = make_visit(['status' => 'checked_in', 'checked_in_at' => date('Y-m-d') . ' 09:00:00']);
    $booked = make_visit();
    act_as(make_user('reception'));
    $response = request('POST', "/visits/{$visit['id']}/check-out");
    assert_status(200, $response);
    assert_equal('checked_out', $response->body['visit']['status']);
    assert_true($response->body['visit']['checked_out_at'] !== null);
    $again = request('POST', "/visits/{$visit['id']}/check-out");
    assert_status(409, $again);
    assert_equal('Only visitors on site can be checked out.', $again->body['error']['message']);
    assert_status(409, request('POST', "/visits/{$booked['id']}/check-out"));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'visit.check_out'")['n']);
});

db_test('a visitor checked in yesterday can be checked out today', function () {
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $visit = make_visit(['visit_date' => $yesterday, 'status' => 'checked_in', 'checked_in_at' => $yesterday . ' 17:00:00']);
    act_as(make_user('reception'));
    assert_status(200, request('POST', "/visits/{$visit['id']}/check-out"));
});

db_test('only reception may check visitors in or out', function () {
    $visit = make_visit();
    foreach (['staff', 'security', 'it', 'admin'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('POST', "/visits/{$visit['id']}/check-in"));
        assert_status(403, request('POST', "/visits/{$visit['id']}/check-out"));
    }
    assert_equal('booked', visit_find($visit['id'])['status']);
});

test_summary();
