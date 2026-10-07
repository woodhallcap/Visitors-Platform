<?php
declare(strict_types=1);

function audit(?int $userId, string $action, string $entity, ?int $entityId, array $details = []): void
{
    db_exec(
        'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [
            $userId,
            $action,
            $entity,
            $entityId,
            $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
            ($GLOBALS['__request_ip'] ?? '') ?: null,
        ]
    );
}
