<?php
declare(strict_types=1);

const ROOT_DIR = __DIR__ . '/..';
const MIGRATIONS_DIR = ROOT_DIR . '/migrations';

// Every lib file only declares functions, classes and constants, so load order does not matter.
foreach ([...glob(__DIR__ . '/*.php'), ...glob(__DIR__ . '/routes/*.php')] as $file) {
    if (realpath($file) !== realpath(__FILE__)) {
        require_once $file;
    }
}

date_default_timezone_set(config('timezone'));
