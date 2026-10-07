<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

db_test('only admin, IT and reception can list departments', function () {
    foreach (['staff', 'security'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/departments'));
    }
});

db_test('admin and IT see every department with user counts; reception sees active ones', function () {
    $finance = make_department('Finance');
    make_department('Legal', false);
    make_user('staff', ['department_id' => $finance['id']]);
    make_user('staff', ['department_id' => $finance['id']]);

    act_as(make_user('admin'));
    $all = request('GET', '/departments')->body['departments'];
    assert_equal(['Finance', 'Legal'], array_column($all, 'name'));
    assert_equal(['id' => $finance['id'], 'name' => 'Finance', 'active' => true, 'user_count' => 2], $all[0]);
    assert_equal(false, $all[1]['active']);

    act_as(make_user('it'));
    assert_equal(['Finance', 'Legal'], array_column(request('GET', '/departments')->body['departments'], 'name'));

    act_as(make_user('reception'));
    assert_equal(['Finance'], array_column(request('GET', '/departments')->body['departments'], 'name'));
});

db_test('only admin can create or change departments', function () {
    $dept = make_department('Finance');
    foreach (['staff', 'reception', 'security', 'it'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('POST', '/departments', ['name' => 'New']));
        assert_status(403, request('PATCH', "/departments/{$dept['id']}", ['name' => 'X']));
    }
});

db_test('admin creates a department with a tidied name', function () {
    $admin = make_user('admin');
    act_as($admin);
    $response = request('POST', '/departments', ['name' => "  Human   Resources "]);
    assert_status(201, $response);
    assert_equal('Human Resources', $response->body['department']['name']);
    assert_equal(true, $response->body['department']['active']);
    assert_equal(0, $response->body['department']['user_count']);
    $audit = db_one("SELECT user_id, entity_id FROM audit_log WHERE action = 'department.create'");
    assert_equal($admin['id'], $audit['user_id']);
    assert_equal($response->body['department']['id'], $audit['entity_id']);
});

db_test('department names must be 2–120 characters', function () {
    act_as(make_user('admin'));
    foreach (['', 'A', str_repeat('x', 121), ['array']] as $bad) {
        $response = request('POST', '/departments', ['name' => $bad]);
        assert_status(422, $response);
        assert_equal('Enter a department name (2–120 characters).', $response->body['error']['fields']['name']);
    }
});

db_test('a duplicate name in any case is a validation error, not a crash', function () {
    make_department('Finance');
    act_as(make_user('admin'));
    $response = request('POST', '/departments', ['name' => 'FINANCE']);
    assert_status(422, $response);
    assert_equal('A department with this name already exists.', $response->body['error']['fields']['name']);
});

db_test('admin renames and deactivates a department', function () {
    $dept = make_department('Finanse');
    make_department('Legal');
    act_as(make_user('admin'));
    $renamed = request('PATCH', "/departments/{$dept['id']}", ['name' => 'Finance']);
    assert_status(200, $renamed);
    assert_equal('Finance', $renamed->body['department']['name']);
    $off = request('PATCH', "/departments/{$dept['id']}", ['active' => false]);
    assert_equal(false, $off->body['department']['active']);
    assert_status(422, request('PATCH', "/departments/{$dept['id']}", ['name' => 'legal']));
    assert_status(422, request('PATCH', "/departments/{$dept['id']}", ['active' => 'no']));
    assert_equal(2, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'department.update'")['n']);
});

db_test('patching a missing department is a 404', function () {
    act_as(make_user('admin'));
    $response = request('PATCH', '/departments/999', ['name' => 'Nope']);
    assert_status(404, $response);
    assert_equal('Department not found.', $response->body['error']['message']);
});

test_summary();
