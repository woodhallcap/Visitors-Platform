<?php
declare(strict_types=1);

function register_stats_routes(Router $r): void
{
    $r->add('GET', '/stats', function (Request $req) {
        require_role('it', 'admin');
        visits_sweep_no_shows();
        [$from, $to] = stats_range($req->query);
        return stats_summary($from, $to);
    });
    $r->add('GET', '/visits/export.csv', function (Request $req) {
        $actor = require_role('it', 'admin');
        visits_sweep_no_shows();
        [$from, $to] = stats_range($req->query);
        $csv = visits_export_csv($from, $to);
        audit($actor['id'], 'visits.export', 'visit', null, ['from' => $from, 'to' => $to]);
        return new Response(200, [], $csv, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"visits-{$from}-to-{$to}.csv\"",
        ]);
    });
}
