<?php
declare(strict_types=1);

/**
 * Simple .env file parser & application configuration.
 */
function loadEnvFile(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }
        $pos = strpos($trimmed, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($trimmed, 0, $pos));
        $val = trim(substr($trimmed, $pos + 1));
        $val = trim($val, "\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv("{$key}={$val}");
            $_ENV[$key] = $val;
        }
    }
}

loadEnvFile(__DIR__ . '/../.env');

$timezone = getenv('APP_TIMEZONE') ?: 'Asia/Jakarta';
date_default_timezone_set($timezone);

return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('DB_PORT') ?: 3306),
        'name' => getenv('DB_NAME') ?: 'hologram_ai',
        'user' => getenv('DB_USER') ?: 'root',
        'pass' => getenv('DB_PASS') !== false ? (string) getenv('DB_PASS') : '',
    ],
    'gemini' => [
        'api_key' => getenv('GEMINI_API_KEY') ?: '',
        'model'   => getenv('GEMINI_MODEL') ?: 'gemini-3-flash-preview',
    ],
    'timezone' => $timezone,
];
