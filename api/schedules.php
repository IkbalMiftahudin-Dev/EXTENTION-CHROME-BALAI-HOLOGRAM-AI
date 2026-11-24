<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/tools.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = getDB();
    $today = (new DateTimeImmutable('now'))->format('Y-m-d');

    if ($method === 'GET') {
        $sStmt = $pdo->query(
            'SELECT id, title, description, event_date, TIME_FORMAT(start_time, "%H:%i") AS start_time, TIME_FORMAT(end_time, "%H:%i") AS end_time, location, category, status
             FROM schedules
             ORDER BY event_date ASC, start_time ASC'
        );
        $schedules = $sStmt->fetchAll();
        foreach ($schedules as &$s) {
            $s['formatted_date'] = formatIndonesianDate($s['event_date']);
            $s['is_today'] = ($s['event_date'] === $today);
        }
        unset($s);

        $tStmt = $pdo->query(
            "SELECT id, title, notes, due_date, priority, is_completed
             FROM tasks
             ORDER BY is_completed ASC, FIELD(priority, 'high', 'medium', 'low'), due_date ASC"
        );
        $tasks = $tStmt->fetchAll();

        $todayCount = count(array_filter($schedules, fn($x) => $x['event_date'] === $today && $x['status'] !== 'cancelled'));
        $pendingTasks = count(array_filter($tasks, fn($x) => (int) $x['is_completed'] === 0));

        jsonResponse([
            'ok' => true,
            'today' => $today,
            'today_formatted' => formatIndonesianDate($today),
            'stats' => [
                'today_schedules' => $todayCount,
                'total_schedules' => count($schedules),
                'pending_tasks' => $pendingTasks,
                'total_tasks' => count($tasks),
            ],
            'schedules' => $schedules,
            'tasks' => $tasks,
        ]);
    }

    $body = getJsonBody();
    $type = strtolower(trim((string) ($body['type'] ?? $_GET['type'] ?? 'schedule')));

    if ($method === 'POST') {
        if ($type === 'task') {
            $res = executeTool($pdo, 'add_task', $body);
            jsonResponse($res, $res['ok'] ? 201 : 400);
        }
        $res = executeTool($pdo, 'add_schedule', $body);
        jsonResponse($res, $res['ok'] ? 201 : 400);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        if ($type === 'task') {
            $res = executeTool($pdo, 'complete_task', [
                'task_id' => (int) ($body['id'] ?? 0),
                'is_completed' => (bool) ($body['is_completed'] ?? true),
            ]);
            jsonResponse($res, $res['ok'] ? 200 : 400);
        }

        $res = executeTool($pdo, 'update_schedule_status', [
            'schedule_id' => (int) ($body['id'] ?? 0),
            'status' => (string) ($body['status'] ?? 'done'),
        ]);
        jsonResponse($res, $res['ok'] ? 200 : 400);
    }

    if ($method === 'DELETE') {
        $id = (int) ($body['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) {
            jsonResponse(['ok' => false, 'error' => 'ID tidak valid.'], 400);
        }

        if ($type === 'task') {
            $stmt = $pdo->prepare('DELETE FROM tasks WHERE id = ?');
            $stmt->execute([$id]);
            jsonResponse(['ok' => true, 'deleted_id' => $id]);
        }

        $stmt = $pdo->prepare('DELETE FROM schedules WHERE id = ?');
        $stmt->execute([$id]);
        jsonResponse(['ok' => true, 'deleted_id' => $id]);
    }

    jsonResponse(['ok' => false, 'error' => 'Method not allowed'], 405);
} catch (Throwable $e) {
    jsonResponse(['ok' => false, 'error' => $e->getMessage()], 500);
}
