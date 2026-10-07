<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

db_test('users routes are for IT and admins only', function () {
    $target = make_user('staff');
    foreach (['staff', 'reception', 'security'] as $role) {
        act_as(make_user($role));
        assert_status(403, request('GET', '/users'));
        assert_status(403, request('POST', '/users', ['full_name' => 'X Y', 'email' => 'x@example.com', 'role' => 'security']));
        assert_status(403, request('PATCH', "/users/{$target['id']}", ['full_name' => 'Changed']));
        assert_status(403, request('POST', "/users/{$target['id']}/reset-link"));
    }
    assert_equal($target['full_name'], user_find($target['id'])['full_name']);
});

db_test('admin and IT list users with department names, sorted by name', function () {
    $finance = make_department('Finance');
    make_user('staff', ['full_name' => 'Zainab Bello', 'department_id' => $finance['id']]);
    $admin = make_user('admin', ['full_name' => 'Ada Obi']);
    act_as($admin);
    $users = request('GET', '/users')->body['users'];
    assert_equal(['Ada Obi', 'Zainab Bello'], array_column($users, 'full_name'));
    assert_equal('Finance', $users[1]['department_name']);
    assert_true(!array_key_exists('password_hash', $users[0]), 'password hash leaked');

    act_as(make_user('it', ['full_name' => 'Ife Eze']));
    assert_equal(['Ada Obi', 'Ife Eze', 'Zainab Bello'], array_column(request('GET', '/users')->body['users'], 'full_name'));
});

db_test('inviting a user returns a set-password link and stores no password', function () {
    $finance = make_department('Finance');
    $admin = make_user('admin');
    act_as($admin);
    $response = request('POST', '/users', [
        'full_name' => ' Chidi  Okafor ', 'email' => ' Chidi@WoodhallCap.com ', 'phone' => '0802 829 7772',
        'role' => 'staff', 'department_id' => $finance['id'],
    ]);
    assert_status(201, $response);
    $user = $response->body['user'];
    assert_equal('Chidi Okafor', $user['full_name']);
    assert_equal('chidi@woodhallcap.com', $user['email']);
    assert_equal('08028297772', $user['phone']);
    assert_equal('Finance', $user['department_name']);
    assert_equal(false, $user['has_password']);
    assert_equal(true, $user['active']);
    assert_equal('invite', $response->body['link']['purpose']);
    assert_true(str_starts_with($response->body['link']['set_password_url'], 'https://visitor.test/set-password?token='));
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.invite' AND user_id = ?", [$admin['id']])['n']);
});

db_test('an email that differs only in case is a duplicate', function () {
    make_user('security', ['email' => 'ada@example.com']);
    act_as(make_user('admin'));
    $response = request('POST', '/users', ['full_name' => 'Ada Two', 'email' => 'ADA@example.com', 'role' => 'security']);
    assert_status(422, $response);
    assert_equal('A user with this email already exists.', $response->body['error']['fields']['email']);
});

db_test('invite input is validated field by field', function () {
    $legal = make_department('Legal', false);
    act_as(make_user('admin'));
    $response = request('POST', '/users', ['full_name' => 'A', 'email' => 'not-an-email', 'phone' => '123', 'role' => 'boss']);
    assert_status(422, $response);
    assert_equal([
        'full_name' => 'Enter a full name (2–120 characters).',
        'email' => 'Enter a valid email address.',
        'phone' => 'Enter a valid phone number.',
        'role' => 'Choose a role.',
    ], $response->body['error']['fields']);

    $noDept = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff']);
    assert_equal('Staff need a department.', $noDept->body['error']['fields']['department_id']);
    $inactive = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff', 'department_id' => $legal['id']]);
    assert_equal('Choose a department.', $inactive->body['error']['fields']['department_id']);
    $missing = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff', 'department_id' => 999]);
    assert_equal('Choose a department.', $missing->body['error']['fields']['department_id']);
    $text = request('POST', '/users', ['full_name' => 'Staff Member', 'email' => 's@example.com', 'role' => 'staff', 'department_id' => '1']);
    assert_equal('Choose a department.', $text->body['error']['fields']['department_id']);
});

db_test('non-staff roles may have no department', function () {
    act_as(make_user('admin'));
    assert_status(201, request('POST', '/users', ['full_name' => 'Sam Guard', 'email' => 'sam@example.com', 'role' => 'security']));
});

db_test('admin edits name, role and department', function () {
    $finance = make_department('Finance');
    $target = make_user('reception', ['department_id' => null]);
    act_as(make_user('admin'));
    $response = request('PATCH', "/users/{$target['id']}", ['full_name' => 'New Name', 'role' => 'staff', 'department_id' => $finance['id']]);
    assert_status(200, $response);
    assert_equal('New Name', $response->body['user']['full_name']);
    assert_equal('staff', $response->body['user']['role']);
    assert_equal($finance['id'], $response->body['user']['department_id']);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.update'")['n']);
});

db_test('a user keeps a department that was later deactivated', function () {
    $legal = make_department('Legal');
    $target = make_user('staff', ['department_id' => $legal['id']]);
    db_exec('UPDATE departments SET active = 0 WHERE id = ?', [$legal['id']]);
    act_as(make_user('admin'));
    assert_status(200, request('PATCH', "/users/{$target['id']}", ['full_name' => 'Still In Legal']));
});

db_test('disabling a user ends their session; enabling restores access', function () {
    $target = make_user('reception');
    $admin = make_user('admin');
    act_as($admin);
    $off = request('PATCH', "/users/{$target['id']}", ['active' => false]);
    assert_equal(false, $off->body['user']['active']);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.disable'")['n']);

    act_as($target);
    assert_status(401, request('GET', '/auth/me'));

    act_as($admin);
    request('PATCH', "/users/{$target['id']}", ['active' => true]);
    assert_equal(1, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.enable'")['n']);
    act_as($target);
    assert_status(200, request('GET', '/auth/me'));
});

db_test('re-enabling a user does not revive links issued before the disable', function () {
    $target = make_user('reception');
    act_as(make_user('admin'));
    $issued = token_issue($target['id'], 'reset');
    request('PATCH', "/users/{$target['id']}", ['active' => false]);
    request('PATCH', "/users/{$target['id']}", ['active' => true]);
    assert_equal(null, token_consume($issued['token']));
});

db_test('IT users cannot disable themselves or change their own role', function () {
    $it = make_user('it');
    act_as($it);
    $disable = request('PATCH', "/users/{$it['id']}", ['active' => false]);
    assert_status(409, $disable);
    assert_equal("You can't change your own role or disable your own account.", $disable->body['error']['message']);
    assert_status(409, request('PATCH', "/users/{$it['id']}", ['role' => 'admin']));
    assert_equal('it', user_find($it['id'])['role']);
    assert_equal(true, user_find($it['id'])['active']);
    assert_status(200, request('PATCH', "/users/{$it['id']}", ['full_name' => 'Renamed IT']));
});

db_test('admins cannot edit their own account at all (IT manages admin accounts)', function () {
    $admin = make_user('admin');
    act_as($admin);
    $response = request('PATCH', "/users/{$admin['id']}", ['active' => false]);
    assert_status(403, $response);
    assert_equal('Only IT can manage admin and IT accounts.', $response->body['error']['message']);
    assert_equal(true, user_find($admin['id'])['active']);
});

db_test('admins cannot create, edit, reset or grant admin and IT accounts', function () {
    $otherAdmin = make_user('admin');
    $it = make_user('it');
    $staff = make_user('staff');
    act_as(make_user('admin'));
    $create = request('POST', '/users', ['full_name' => 'New Admin', 'email' => 'na@example.com', 'role' => 'admin']);
    assert_status(403, $create);
    assert_equal('Only IT can manage admin and IT accounts.', $create->body['error']['message']);
    assert_status(403, request('POST', '/users', ['full_name' => 'New IT', 'email' => 'ni@example.com', 'role' => 'it']));
    assert_status(403, request('PATCH', "/users/{$otherAdmin['id']}", ['full_name' => 'Renamed']));
    assert_status(403, request('PATCH', "/users/{$it['id']}", ['active' => false]));
    assert_status(403, request('PATCH', "/users/{$staff['id']}", ['role' => 'admin']));
    assert_status(403, request('POST', "/users/{$it['id']}/reset-link"));
    assert_equal('staff', user_find($staff['id'])['role']);
    assert_equal(true, user_find($it['id'])['active']);
    assert_equal(0, db_one('SELECT COUNT(*) AS n FROM users WHERE email IN (?, ?)', ['na@example.com', 'ni@example.com'])['n']);
});

db_test('IT creates, promotes, demotes, disables and resets admins and IT accounts', function () {
    $staff = make_user('staff');
    $admin = make_user('admin');
    act_as(make_user('it'));
    assert_status(201, request('POST', '/users', ['full_name' => 'New Admin', 'email' => 'na@example.com', 'role' => 'admin']));
    assert_status(201, request('POST', '/users', ['full_name' => 'New IT', 'email' => 'ni@example.com', 'role' => 'it']));
    assert_equal('admin', request('PATCH', "/users/{$staff['id']}", ['role' => 'admin'])->body['user']['role']);
    assert_equal('reception', request('PATCH', "/users/{$admin['id']}", ['role' => 'reception'])->body['user']['role']);
    assert_equal(false, request('PATCH', "/users/{$staff['id']}", ['active' => false])->body['user']['active']);
    $other = make_user('admin');
    assert_status(200, request('POST', "/users/{$other['id']}/reset-link"));
});

db_test('changing an email to one already used is a 422', function () {
    make_user('security', ['email' => 'taken@example.com']);
    $target = make_user('security', ['email' => 'mine@example.com']);
    act_as(make_user('admin'));
    $response = request('PATCH', "/users/{$target['id']}", ['email' => 'Taken@example.com']);
    assert_status(422, $response);
    assert_equal('A user with this email already exists.', $response->body['error']['fields']['email']);
});

db_test('patching a missing user is a 404', function () {
    act_as(make_user('admin'));
    assert_status(404, request('PATCH', '/users/999', ['full_name' => 'Nobody Here']));
    assert_status(404, request('POST', '/users/999/reset-link'));
});

db_test('reset-link gives an invite link before a password exists and a reset link after', function () {
    $invited = make_user('security', ['password' => null]);
    $active = make_user('security');
    act_as(make_user('admin'));
    $first = request('POST', "/users/{$invited['id']}/reset-link");
    assert_status(200, $first);
    assert_equal('invite', $first->body['link']['purpose']);
    assert_equal('reset', request('POST', "/users/{$active['id']}/reset-link")->body['link']['purpose']);
    assert_equal(2, db_one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.reset_link'")['n']);
});

db_test('reset-link refuses a disabled user', function () {
    $target = make_user('security', ['active' => false]);
    act_as(make_user('admin'));
    $response = request('POST', "/users/{$target['id']}/reset-link");
    assert_status(409, $response);
    assert_equal('Enable this user before creating a set-password link.', $response->body['error']['message']);
});

test_summary();
