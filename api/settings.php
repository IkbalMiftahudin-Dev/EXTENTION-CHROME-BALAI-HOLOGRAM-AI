<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = getDB();
    $cfg = getConfig();

    if ($method === 'GET') {
        $settings = getAllSettings($pdo);
        $dbKey = trim((string) ($settings['gemini_api_key'] ?? ''));
        $envKey = trim((string) ($cfg['gemini']['api_key'] ?? ''));
        $effectiveKey = $dbKey !== '' ? $dbKey : $envKey;

        $masked = '';
        if ($effectiveKey !== '') {
            $len = strlen($effectiveKey);
            $masked = $len > 10
                ? substr($effectiveKey, 0, 6) . str_repeat('*', 8) . substr($effectiveKey, -4)
                : '********';
        }

        $sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($_GET['session_id'] ?? 'default')) ?: 'default';
        $histStmt = $pdo->prepare(
            'SELECT id, role, content, emotion, tool_used, DATE_FORMAT(created_at, "%H:%i") AS time_label
             FROM chat_history WHERE session_id = ? ORDER BY id DESC LIMIT 30'
        );
        $histStmt->execute([$sessionId]);
        $history = array_reverse($histStmt->fetchAll());

        jsonResponse([
            'ok' => true,
            'settings' => [
                'assistant_name' => $settings['assistant_name'] ?? 'BALAI',
                'gemini_model' => $settings['gemini_model'] ?? ($cfg['gemini']['model'] ?? 'gemini-2.5-flash'),
                'hologram_theme' => $settings['hologram_theme'] ?? 'cyan',
                'voice_rate' => (float) ($settings['voice_rate'] ?? 1.05),
                'voice_pitch' => (float) ($settings['voice_pitch'] ?? 1.0),
                'has_api_key' => $effectiveKey !== '',
                'api_key_source' => $dbKey !== '' ? 'database' : ($envKey !== '' ? 'env' : 'none'),
                'api_key_masked' => $masked,
            ],
            'history' => $history,
        ]);
    }

    if ($method === 'POST') {
        $body = getJsonBody();
        $action = (string) ($body['action'] ?? 'save');

        if ($action === 'clear_chat') {
            $sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($body['session_id'] ?? 'default')) ?: 'default';
            $stmt = $pdo->prepare('DELETE FROM chat_history WHERE session_id = ?');
            $stmt->execute([$sessionId]);
            jsonResponse(['ok' => true, 'message' => 'Riwayat percakapan dihapus.']);
        }

        $allowed = ['assistant_name', 'gemini_model', 'hologram_theme', 'voice_rate', 'voice_pitch'];
        $upsert = $pdo->prepare(
            'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );

        foreach ($allowed as $key) {
            if (array_key_exists($key, $body)) {
                $upsert->execute([$key, trim((string) $body[$key])]);
            }
        }

        // Only update API key if explicitly provided (empty string with clear_api_key=true clears it)
        if (!empty($body['clear_api_key'])) {
            $upsert->execute(['gemini_api_key', '']);
        } elseif (isset($body['gemini_api_key']) && trim((string) $body['gemini_api_key']) !== '') {
            $upsert->execute(['gemini_api_key', trim((string) $body['gemini_api_key'])]);
        }

        jsonResponse(['ok' => true, 'message' => 'Pengaturan berhasil disimpan.']);
    }

    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'error' => $e->getMessage()], 500);
}
