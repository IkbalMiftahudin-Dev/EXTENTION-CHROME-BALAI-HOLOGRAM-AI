<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/tools.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    $pdo = getDB();
    $cfg = getConfig();
    $settings = getAllSettings($pdo);

    $body = getJsonBody();
    $message = trim((string) ($body['message'] ?? ''));
    $sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($body['session_id'] ?? 'default')) ?: 'default';

    if ($message === '') {
        jsonResponse(['ok' => false, 'error' => 'Pesan tidak boleh kosong.'], 400);
    }

    $assistantName = trim((string) ($settings['assistant_name'] ?? 'BALAI')) ?: 'BALAI';
    $apiKey = trim((string) ($settings['gemini_api_key'] ?? ''));
    if ($apiKey === '') {
        $apiKey = trim((string) ($cfg['gemini']['api_key'] ?? ''));
    }
    $model = trim((string) ($settings['gemini_model'] ?? ''));
    if ($model === '' || $model === 'gemini-2.5-flash') {
        $model = trim((string) ($cfg['gemini']['model'] ?? 'gemini-3-flash-preview'));
    }

    // Save user message
    $insUser = $pdo->prepare('INSERT INTO chat_history (session_id, role, content) VALUES (?, "user", ?)');
    $insUser->execute([$sessionId, $message]);

    // If no Gemini API key, use built-in local fallback assistant
    if ($apiKey === '') {
        $local = runLocalFallbackAssistant($pdo, $message, $assistantName);
        $toolNames = implode(',', array_map(fn($t) => $t['name'], $local['toolCalls']));

        $insAst = $pdo->prepare(
            'INSERT INTO chat_history (session_id, role, content, emotion, tool_used) VALUES (?, "assistant", ?, ?, ?)'
        );
        $insAst->execute([$sessionId, $local['reply'], $local['emotion'], $toolNames ?: null]);

        jsonResponse([
            'ok' => true,
            'mode' => 'local_fallback',
            'reply' => $local['reply'],
            'emotion' => $local['emotion'],
            'tool_calls' => $local['toolCalls'],
            'data_preview' => $local['dataPreview'],
            'mutates_data' => $local['mutatesData'],
        ]);
    }

    // Load recent conversation context (last 10 turns excluding current message already fetched cleanly)
    $histStmt = $pdo->prepare(
        'SELECT role, content FROM chat_history WHERE session_id = ? ORDER BY id DESC LIMIT 12'
    );
    $histStmt->execute([$sessionId]);
    $historyRows = array_reverse($histStmt->fetchAll());

    $contents = [];
    foreach ($historyRows as $row) {
        $contents[] = [
            'role' => $row['role'] === 'assistant' ? 'model' : 'user',
            'parts' => [['text' => $row['content']]],
        ];
    }

    $now = new DateTimeImmutable('now');
    $todayFormatted = formatIndonesianDate($now->format('Y-m-d'));
    $todayIso = $now->format('Y-m-d');
    $tomorrowIso = $now->modify('+1 day')->format('Y-m-d');
    $timeNow = $now->format('H:i');

    $systemPrompt = <<<PROMPT
Kamu adalah {$assistantName}, asisten AI holografik berbentuk manusia 3D yang cerdas, ramah, dan responsif.
Konteks waktu saat ini: {$todayFormatted} ({$todayIso}), pukul {$timeNow} WIB. Tanggal besok adalah {$tomorrowIso}.

ATURAN PENTING:
1. Jawablah dalam Bahasa Indonesia yang alami, sopan, hangat, dan ringkas seperti berbicara langsung melalui suara.
2. JANGAN gunakan format markdown berlebihan seperti tanda bintang (**), pagar (#), atau tabel karena jawabanmu akan langsung diucapkan oleh sistem suara (Text-to-Speech). Gunakan kalimat mengalir atau penomoran sederhana.
3. WAJIB gunakan fungsi/tools (get_schedules, add_schedule, update_schedule_status, get_tasks, add_task, complete_task, get_current_datetime) setiap kali pengguna menanyakan atau ingin mengubah jadwal, agenda, tugas, atau waktu. Jangan pernah mengarang isi jadwal!
4. Awali jawaban akhirmu dengan tepat satu tag emosi di dalam kurung siku: [neutral], [happy], [thinking], atau [alert]. Contoh: "[happy] Baik, hari ini Anda punya dua jadwal..."
PROMPT;

    $tools = getGeminiToolDeclarations();
    $executedTools = [];
    $dataPreview = null;
    $mutatesData = false;
    $finalText = '';

    // Function calling loop (max 4 iterations)
    for ($step = 0; $step < 4; $step++) {
        $payload = [
            'systemInstruction' => [
                'parts' => [['text' => $systemPrompt]],
            ],
            'contents' => $contents,
            'tools' => $tools,
            'generationConfig' => [
                'temperature' => 0.6,
                'maxOutputTokens' => 600,
            ],
        ];

        $response = callGeminiApi($apiKey, $model, $payload);

        // Automatic fallback to gemini-3.1-flash-lite if primary model returns transient 503/429/404
        if (!$response['ok'] && $model !== 'gemini-3.1-flash-lite') {
            $fallbackRes = callGeminiApi($apiKey, 'gemini-3.1-flash-lite', $payload);
            if ($fallbackRes['ok']) {
                $response = $fallbackRes;
                $model = 'gemini-3.1-flash-lite';
            }
        }

        if (!$response['ok']) {
            // If Gemini fails, return helpful error
            jsonResponse([
                'ok' => false,
                'mode' => 'gemini_error',
                'error' => $response['error'],
            ], 502);
        }

        $candidate = $response['data']['candidates'][0] ?? null;
        $parts = $candidate['content']['parts'] ?? [];

        $functionCalls = [];
        $textBuffer = '';
        foreach ($parts as $part) {
            if (isset($part['functionCall'])) {
                $functionCalls[] = $part['functionCall'];
            }
            if (isset($part['text'])) {
                $textBuffer .= $part['text'];
            }
        }

        if (empty($functionCalls)) {
            $finalText = trim($textBuffer);
            break;
        }

        // Append model's functionCall turn
        $contents[] = [
            'role' => 'model',
            'parts' => $parts,
        ];

        // Execute each requested tool and build functionResponse parts
        $responseParts = [];
        foreach ($functionCalls as $fc) {
            $fnName = (string) ($fc['name'] ?? '');
            $fnArgs = isset($fc['args']) && is_array($fc['args']) ? $fc['args'] : [];
            $toolResult = executeTool($pdo, $fnName, $fnArgs);

            $executedTools[] = [
                'name' => $fnName,
                'args' => $fnArgs,
                'result' => $toolResult,
            ];

            if (!empty($toolResult['mutated'])) {
                $mutatesData = true;
            }
            if (isset($toolResult['type']) && in_array($toolResult['type'], ['schedules', 'tasks'], true)) {
                $dataPreview = $toolResult;
            } elseif (isset($toolResult['type']) && $toolResult['type'] === 'schedule_created') {
                $dataPreview = executeTool($pdo, 'get_schedules', ['date_filter' => $toolResult['schedule']['event_date']]);
            } elseif (isset($toolResult['type']) && $toolResult['type'] === 'task_created') {
                $dataPreview = executeTool($pdo, 'get_tasks', ['status_filter' => 'pending']);
            }

            $responseParts[] = [
                'functionResponse' => [
                    'name' => $fnName,
                    'response' => $toolResult,
                ],
            ];
        }

        $contents[] = [
            'role' => 'user',
            'parts' => $responseParts,
        ];
    }

    if ($finalText === '') {
        $finalText = 'Maaf, saya belum bisa memproses permintaan tersebut. Bisa diulangi lagi?';
    }

    // Parse emotion tag e.g. [happy]
    $emotion = 'neutral';
    if (preg_match('/^\s*\[(neutral|happy|thinking|alert)\]\s*/i', $finalText, $em)) {
        $emotion = strtolower($em[1]);
        $finalText = trim((string) preg_replace('/^\s*\[(neutral|happy|thinking|alert)\]\s*/i', '', $finalText));
    }

    $toolNames = implode(',', array_map(fn($t) => $t['name'], $executedTools));

    $insAst = $pdo->prepare(
        'INSERT INTO chat_history (session_id, role, content, emotion, tool_used) VALUES (?, "assistant", ?, ?, ?)'
    );
    $insAst->execute([$sessionId, $finalText, $emotion, $toolNames ?: null]);

    jsonResponse([
        'ok' => true,
        'mode' => 'gemini',
        'model' => $model,
        'reply' => $finalText,
        'emotion' => $emotion,
        'tool_calls' => $executedTools,
        'data_preview' => $dataPreview,
        'mutates_data' => $mutatesData,
    ]);
} catch (Throwable $e) {
    jsonResponse([
        'ok' => false,
        'error' => 'Terjadi kesalahan server: ' . $e->getMessage(),
    ], 500);
}

/**
 * Sends a generateContent request to Google Gemini REST API via cURL.
 */
function callGeminiApi(string $apiKey, string $model, array $payload): array
{
    $url = sprintf(
        'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s',
        rawurlencode($model),
        rawurlencode($apiKey)
    );

    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Gagal menginisialisasi cURL.'];
    }

    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
    ];

    // Use XAMPP CA bundle if available to avoid SSL issues on Windows
    $caCandidates = [
        'C:\\xampp\\apache\\bin\\curl-ca-bundle.crt',
        'C:\\xampp\\php\\extras\\ssl\\cacert.pem',
    ];
    foreach ($caCandidates as $ca) {
        if (is_file($ca)) {
            $opts[CURLOPT_CAINFO] = $ca;
            break;
        }
    }

    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['ok' => false, 'error' => 'Koneksi ke Gemini gagal: ' . $curlErr];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'error' => 'Respons Gemini tidak valid (HTTP ' . $httpCode . ').'];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        $msg = $decoded['error']['message'] ?? ('HTTP ' . $httpCode);
        return ['ok' => false, 'error' => 'Gemini API error: ' . $msg];
    }

    return ['ok' => true, 'data' => $decoded];
}
