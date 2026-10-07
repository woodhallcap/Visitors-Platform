<?php
declare(strict_types=1);

function register_health_routes(Router $r): void
{
    $r->add('GET', '/health', fn(Request $req) => ['ok' => true], ['public' => true]);
}
