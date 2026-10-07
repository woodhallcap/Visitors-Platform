<?php
declare(strict_types=1);

function config(?string $key = null): mixed
{
    if (!isset($GLOBALS['__config'])) {
        $GLOBALS['__config'] = require ROOT_DIR . '/config.php';
    }
    if ($key === null) {
        return $GLOBALS['__config'];
    }
    $value = $GLOBALS['__config'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            throw new RuntimeException("Missing config key: {$key}");
        }
        $value = $value[$part];
    }
    return $value;
}

/** Tests only: merge values over the loaded config. */
function config_override(array $values): void
{
    $GLOBALS['__config'] = array_replace_recursive(config(), $values);
}
