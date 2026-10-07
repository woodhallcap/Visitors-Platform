<?php
declare(strict_types=1);

function register_user_routes(Router $r): void
{
    $r->add('GET', '/users', function (Request $req) {
        require_role('admin', 'it');
        return ['users' => users_list()];
    });
    $r->add('POST', '/users', function (Request $req) {
        $actor = require_role('admin', 'it');
        $user = user_create($req->body, $actor);
        return new Response(201, ['user' => $user, 'link' => set_password_link($user['id'], 'invite')]);
    });
    $r->add('PATCH', '/users/{id}', function (Request $req) {
        $actor = require_role('admin', 'it');
        return ['user' => user_update($req->params['id'], $req->body, $actor)];
    });
    $r->add('POST', '/users/{id}/reset-link', function (Request $req) {
        $actor = require_role('admin', 'it');
        return ['link' => user_reset_link($req->params['id'], $actor)];
    });
}
