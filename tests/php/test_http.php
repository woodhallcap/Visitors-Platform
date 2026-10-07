<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

test_case('router extracts numeric params as ints', function () {
    $router = new Router();
    $router->add('PATCH', '/users/{id}', fn() => []);
    $match = $router->match('PATCH', '/users/42');
    assert_equal(['id' => 42], $match['params']);
});

test_case('router returns null for an unknown path', function () {
    $router = new Router();
    $router->add('GET', '/users/{id}', fn() => []);
    assert_equal(null, $router->match('GET', '/users/abc'));
    assert_equal(null, $router->match('GET', '/nope'));
});

test_case('router reports a known path with the wrong method as 405', function () {
    $router = new Router();
    $router->add('GET', '/departments', fn() => []);
    try {
        $router->match('DELETE', '/departments');
        throw new LogicException('expected HttpError');
    } catch (HttpError $e) {
        assert_equal(405, $e->status);
        assert_equal('method_not_allowed', $e->errorCode);
    }
});

test_case('GET /api/health answers 200', function () {
    $response = handle_request('GET', '/api/health');
    assert_status(200, $response);
    assert_equal(['ok' => true], $response->body);
});

test_case('the /api prefix, trailing slash and query string are ignored when routing', function () {
    assert_status(200, handle_request('GET', '/api/health/?x=1'));
    assert_status(200, handle_request('GET', '/health'));
});

test_case('an unknown route gets the not_found envelope', function () {
    $response = handle_request('GET', '/api/nope');
    assert_status(404, $response);
    assert_equal('not_found', $response->body['error']['code']);
    assert_true(!isset($response->body['error']['fields']), 'fields must be omitted when empty');
});

test_case('validation errors carry their fields', function () {
    $router = new Router();
    $router->add('POST', '/thing', function () {
        throw HttpError::validation(['name' => 'Enter a name.']);
    }, ['public' => true]);
    $response = handle_request('POST', '/thing', [], [], ['content-type' => 'application/json'], '', $router);
    assert_status(422, $response);
    assert_equal('validation_failed', $response->body['error']['code']);
    assert_equal(['name' => 'Enter a name.'], $response->body['error']['fields']);
});

test_case('an unexpected exception becomes a generic 500 without leaking details', function () {
    $router = new Router();
    $router->add('GET', '/boom', function () {
        throw new RuntimeException('SQLSTATE secret detail');
    }, ['public' => true]);
    $response = handle_request('GET', '/boom', [], [], [], '', $router);
    assert_status(500, $response);
    assert_equal('server_error', $response->body['error']['code']);
    assert_true(!str_contains(json_encode($response->body), 'secret'), 'internal message leaked');
});

test_case('handlers can return a Response with a custom status', function () {
    $router = new Router();
    $router->add('POST', '/made', fn(Request $r) => new Response(201, ['id' => 7]), ['public' => true]);
    $response = handle_request('POST', '/made', [], [], ['content-type' => 'application/json'], '', $router);
    assert_status(201, $response);
    assert_equal(['id' => 7], $response->body);
});

test_case('handlers receive body, query, params and ip', function () {
    $router = new Router();
    $router->add('POST', '/echo/{id}', fn(Request $r) => [
        'id' => $r->params['id'], 'body' => $r->body, 'query' => $r->query, 'ip' => $r->ip,
    ], ['public' => true]);
    $response = handle_request('POST', '/echo/5', ['a' => 1], ['q' => 'x'], ['content-type' => 'application/json'], '10.1.2.3', $router);
    assert_equal(['id' => 5, 'body' => ['a' => 1], 'query' => ['q' => 'x'], 'ip' => '10.1.2.3'], $response->body);
});

test_summary();
