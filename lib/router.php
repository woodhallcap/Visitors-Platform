<?php
declare(strict_types=1);

final class Router
{
    /** @var list<array{method: string, regex: string, handler: callable, options: array}> */
    private array $routes = [];

    /** Pattern placeholders like {id} match digits only and are passed to handlers as ints. */
    public function add(string $method, string $pattern, callable $handler, array $options = []): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', $pattern) . '$#';
        $this->routes[] = ['method' => $method, 'regex' => $regex, 'handler' => $handler, 'options' => $options];
    }

    public function match(string $method, string $path): ?array
    {
        $pathMatched = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $method) {
                continue;
            }
            $params = [];
            foreach ($m as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = (int) $value;
                }
            }
            return ['handler' => $route['handler'], 'params' => $params, 'options' => $route['options']];
        }
        if ($pathMatched) {
            throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
        }
        return null;
    }
}
