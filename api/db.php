<?php
declare(strict_types=1);

/**
 * PDO MySQL Connection + Helper utilities.
 */
function getConfig(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require __DIR__ . '/../config/config.php';
    }
    return $cfg;
}

function getDB(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = getConfig()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $cfg['host'],
        $cfg['port'],
        $cfg['name']
    );

    try {
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        // Attempt auto-creation if database doesn't exist yet (SQLSTATE 1049)
        if (str_contains($e->getMessage(), 'Unknown database') || (int) $e->getCode() === 1049) {
            $serverDsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $cfg['host'], $cfg['port']);
            $tmp = new PDO($serverDsn, $cfg['user'], $cfg['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $schemaSql = file_get_contents(__DIR__ . '/../database/schema.sql');
            if ($schemaSql !== false) {
                $tmp->exec($schemaSql);
            }
            $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
            return $pdo;
        }
        throw $e;
    }
}

function getAllSettings(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT setting_key, setting_value FROM settings');
    $rows = $stmt->fetchAll();
    $out = [];
    foreach ($rows as $row) {
        $out[$row['setting_key']] = $row['setting_value'];
    }
    return $out;
}

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}
