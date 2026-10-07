<?php
declare(strict_types=1);

function app_router(): Router
{
    static $router = null;
    if ($router === null) {
        $router = new Router();
        register_health_routes($router);
        register_auth_routes($router);
        register_department_routes($router);
        register_user_routes($router);
        register_visit_routes($router);
        register_stats_routes($router);
    }
    return $router;
}

/**
 * Handles one API request. A pure function of its arguments and $_SESSION, so tests call it directly.
 * $headers must have lower-case names. Non-public routes need a signed-in user, and their writes a CSRF token.
 */
function handle_request(
    string $method,
    string $path,
    array $body = [],
    array $query = [],
    array $headers = [],
    string $ip = '',
    ?Router $router = null,
): Response {
    $GLOBALS['__request_ip'] = $ip;
    try {
        $path = (string) parse_url($path, PHP_URL_PATH);
        $path = '/' . trim((string) preg_replace('#^/api(?=/|$)#', '', $path), '/');
        $route = ($router ?? app_router())->match($method, $path);
        if ($route === null) {
            throw HttpError::notFound();
        }
        if ($route['options']['public'] ?? false) {
            // Public writes skip CSRF tokens, so require JSON: a cross-site form cannot send it without a CORS preflight.
            if ($method !== 'GET' && stripos((string) ($headers['content-type'] ?? ''), 'application/json') !== 0) {
                throw new HttpError(415, 'unsupported_media_type', 'Send the request as JSON.');
            }
        } else {
            require_user();
            // Signing out is harmless, so a stale CSRF token must never keep a session alive.
            if ($method !== 'GET' && ($route['options']['csrf'] ?? true)) {
                csrf_verify($headers['x-csrf-token'] ?? null);
            }
        }
        $result = ($route['handler'])(new Request($method, $path, $route['params'], $body, $query, $ip));
        return $result instanceof Response ? $result : new Response(200, $result);
    } catch (HttpError $e) {
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->fields) {
            $error['fields'] = $e->fields;
        }
        return new Response($e->status, ['error' => $error]);
    } catch (Throwable $e) {
        error_log('[visitor] ' . $e);
        return new Response(500, ['error' => ['code' => 'server_error', 'message' => 'Something went wrong. Please try again.']]);
    }
}
