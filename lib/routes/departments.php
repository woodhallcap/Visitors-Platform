<?php
declare(strict_types=1);

function register_department_routes(Router $r): void
{
    $r->add('GET', '/departments', function (Request $req) {
        $user = require_role('admin', 'it', 'reception');
        return ['departments' => departments_list($user['role'] !== 'reception')];
    });
    $r->add('POST', '/departments', function (Request $req) {
        $actor = require_role('admin');
        return new Response(201, ['department' => department_create($req->body, $actor)]);
    });
    $r->add('PATCH', '/departments/{id}', function (Request $req) {
        $actor = require_role('admin');
        return ['department' => department_update($req->params['id'], $req->body, $actor)];
    });
}
