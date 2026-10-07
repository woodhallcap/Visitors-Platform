<?php
declare(strict_types=1);

function register_visit_routes(Router $r): void
{
    $r->add('GET', '/visits', function (Request $req) {
        $viewer = require_user();
        visits_sweep_no_shows();
        return ['visits' => visits_list($req->query, $viewer)];
    });
    $r->add('POST', '/visits', function (Request $req) {
        $actor = require_role('staff', 'reception', 'admin');
        visits_sweep_no_shows();
        return new Response(201, ['visit' => visit_create($req->body, $actor)]);
    });
    $r->add('GET', '/hosts', function (Request $req) {
        require_role('reception', 'admin');
        return ['hosts' => hosts_list()];
    });
    $r->add('PATCH', '/visits/{id}', function (Request $req) {
        $actor = require_role('staff', 'reception', 'admin');
        visits_sweep_no_shows();
        return ['visit' => visit_update($req->params['id'], $req->body, $actor)];
    });
    $r->add('POST', '/visits/{id}/check-in', function (Request $req) {
        $actor = require_role('reception');
        visits_sweep_no_shows();
        return ['visit' => visit_check_in($req->params['id'], $req->body, $actor)];
    });
    $r->add('POST', '/visits/{id}/check-out', function (Request $req) {
        $actor = require_role('reception');
        return ['visit' => visit_check_out($req->params['id'], $actor)];
    });
}
