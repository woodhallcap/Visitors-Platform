<?php
declare(strict_types=1);

// Copy to config.local.php on the server and fill in. config.local.php is never committed and never served.
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'CPANELUSER_visitor',
        'user' => 'CPANELUSER_visitor',
        'pass' => 'CHANGE-ME',
    ],
    'site_url' => 'https://visitor.woodhallcap.com',
    'cookie_secure' => true,
];
