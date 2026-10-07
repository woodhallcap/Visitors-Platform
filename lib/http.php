<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = [],
    ) {
        parent::__construct($message);
    }

    public static function validation(array $fields): self
    {
        return new self(422, 'validation_failed', 'Please correct the highlighted fields.', $fields);
    }

    public static function unauthenticated(): self
    {
        return new self(401, 'unauthenticated', 'Please sign in.');
    }

    public static function forbidden(): self
    {
        return new self(403, 'forbidden', "You don't have permission to do that.");
    }

    public static function notFound(string $message = 'Not found.'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function conflict(string $message): self
    {
        return new self(409, 'conflict', $message);
    }
}

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $params,
        public readonly array $body,
        public readonly array $query,
        public readonly string $ip,
    ) {
    }
}

final class Response
{
    public function __construct(public int $status, public array $body)
    {
    }
}

/** Request headers with lower-case names, including on servers without getallheaders(). */
function request_headers(): array
{
    if (function_exists('getallheaders')) {
        return array_change_key_case(getallheaders(), CASE_LOWER);
    }
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (str_starts_with($key, 'HTTP_')) {
            $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
        }
    }
    return $headers;
}
