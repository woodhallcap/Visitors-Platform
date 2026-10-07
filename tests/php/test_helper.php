<?php
declare(strict_types=1);

$GLOBALS['__test_count'] = 0;
$GLOBALS['__test_failures'] = 0;

function test_case(string $name, callable $fn): void
{
    $GLOBALS['__test_count']++;
    try {
        $fn();
        echo "PASS: {$name}\n";
    } catch (Throwable $e) {
        $GLOBALS['__test_failures']++;
        echo "FAIL: {$name} — {$e->getMessage()}\n";
    }
}

function assert_true($condition, string $message = 'Expected true'): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function assert_equal($expected, $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        $expectedStr = var_export($expected, true);
        $actualStr = var_export($actual, true);
        throw new RuntimeException($message ?: "Expected {$expectedStr}, got {$actualStr}");
    }
}

/** $response is a Response (defined in lib/http.php from Task 2 on). */
function assert_status(int $expected, object $response): void
{
    if ($response->status !== $expected) {
        throw new RuntimeException("Expected HTTP {$expected}, got {$response->status}: " . json_encode($response->body));
    }
}

function test_summary(): void
{
    $count = $GLOBALS['__test_count'];
    $failures = $GLOBALS['__test_failures'];
    echo "\n{$count} tests, " . ($count - $failures) . " passed, {$failures} failed\n";
    if ($failures > 0) {
        exit(1);
    }
}
