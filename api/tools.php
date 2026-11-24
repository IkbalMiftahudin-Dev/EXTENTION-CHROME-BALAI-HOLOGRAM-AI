<?php
declare(strict_types=1);

/**
 * AI Tool Definitions (Gemini Function Calling) & Local Execution Engine
 */

function getIndonesianDayName(DateTimeInterface $dt): string
{
    $days = [
        'Sunday'    => 'Minggu',
        'Monday'    => 'Senin',
        'Tuesday'   => 'Selasa',
        'Wednesday' => 'Rabu',
        'Thursday'  => 'Kamis',
        'Friday'    => 'Jumat',
        'Saturday'  => 'Sabtu',
    ];
    return $days[$dt->format('l')] ?? $dt->format('l');
}

function getIndonesianMonthName(int $month): string
{
    $months = [
        1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April',
        5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus',
        9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
    ];
    return $months[$month] ?? (string) $month;
}

function formatIndonesianDate(string $ymd): string
{
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $ymd);
    if (!$dt) {
        return $ymd;
    }
    $day = getIndonesianDayName($dt);
    $month = getIndonesianMonthName((int) $dt->format('n'));
    return sprintf('%s, %d %s %s', $day, (int) $dt->format('j'), $month, $dt->format('Y'));
}

function getGeminiToolDeclarations(): array
{
    return [
        [
            'functionDeclarations' => [
                [
                    'name' => 'get_current_datetime',
                    'description' => 'Mendapatkan tanggal, hari, dan jam saat ini dalam waktu Indonesia Barat (WIB), beserta ringkasan jumlah jadwal hari ini dan tugas yang belum selesai.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => new stdClass(),
                    ],
                ],
                [
                    'name' => 'get_schedules',
                    'description' => 'Mengambil daftar jadwal atau agenda pengguna dari database. Gunakan ini saat pengguna menanyakan jadwal hari ini, besok, minggu ini, tanggal tertentu, atau mencari agenda tertentu.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'date_filter' => [
                                'type' => 'STRING',
                                'description' => 'Filter waktu: "today" (hari ini), "tomorrow" (besok), "week" (7 hari ke depan), "upcoming" (semua yang akan datang), "all" (semua jadwal), atau tanggal spesifik format YYYY-MM-DD.',
                            ],
                            'search' => [
                                'type' => 'STRING',
                                'description' => 'Kata kunci opsional untuk mencari judul, deskripsi, atau lokasi jadwal.',
                            ],
                        ],
                    ],
                ],
                [
                    'name' => 'add_schedule',
                    'description' => 'Menambahkan jadwal atau agenda baru ke database pengguna.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'title' => [
                                'type' => 'STRING',
                                'description' => 'Judul jadwal atau kegiatan.',
                            ],
                            'event_date' => [
                                'type' => 'STRING',
                                'description' => 'Tanggal kegiatan dalam format YYYY-MM-DD.',
                            ],
                            'start_time' => [
                                'type' => 'STRING',
                                'description' => 'Jam mulai dalam format 24-jam HH:MM (contoh: 14:00).',
                            ],
                            'end_time' => [
                                'type' => 'STRING',
                                'description' => 'Jam selesai opsional dalam format HH:MM.',
                            ],
                            'location' => [
                                'type' => 'STRING',
                                'description' => 'Lokasi atau link meeting opsional.',
                            ],
                            'description' => [
                                'type' => 'STRING',
                                'description' => 'Catatan atau deskripsi singkat jadwal.',
                            ],
                            'category' => [
                                'type' => 'STRING',
                                'description' => 'Kategori jadwal: work, personal, meeting, health, atau general.',
                            ],
                        ],
                        'required' => ['title', 'event_date', 'start_time'],
                    ],
                ],
                [
                    'name' => 'update_schedule_status',
                    'description' => 'Mengubah status jadwal (done, cancelled, upcoming) atau menghapusnya (delete) berdasarkan ID atau judul.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'schedule_id' => [
                                'type' => 'INTEGER',
                                'description' => 'ID jadwal jika diketahui.',
                            ],
                            'title_query' => [
                                'type' => 'STRING',
                                'description' => 'Sebagian atau seluruh judul jadwal untuk dicocokkan.',
                            ],
                            'status' => [
                                'type' => 'STRING',
                                'description' => 'Status baru: "done", "cancelled", "upcoming", atau "delete" untuk menghapus.',
                            ],
                        ],
                        'required' => ['status'],
                    ],
                ],
                [
                    'name' => 'get_tasks',
                    'description' => 'Mengambil daftar tugas (to-do list) milik pengguna dari database.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'status_filter' => [
                                'type' => 'STRING',
                                'description' => 'Filter tugas: "pending" (belum selesai), "completed" (sudah selesai), atau "all" (semua).',
                            ],
                        ],
                    ],
                ],
                [
                    'name' => 'add_task',
                    'description' => 'Menambahkan tugas atau pengingat (to-do) baru ke database pengguna.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'title' => [
                                'type' => 'STRING',
                                'description' => 'Judul tugas.',
                            ],
                            'due_date' => [
                                'type' => 'STRING',
                                'description' => 'Tenggat waktu opsional format YYYY-MM-DD.',
                            ],
                            'priority' => [
                                'type' => 'STRING',
                                'description' => 'Prioritas: "low", "medium", atau "high".',
                            ],
                            'notes' => [
                                'type' => 'STRING',
                                'description' => 'Catatan tambahan tugas.',
                            ],
                        ],
                        'required' => ['title'],
                    ],
                ],
                [
                    'name' => 'complete_task',
                    'description' => 'Menandai tugas sebagai selesai atau belum selesai berdasarkan ID atau judul.',
                    'parameters' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'task_id' => [
                                'type' => 'INTEGER',
                                'description' => 'ID tugas jika diketahui.',
                            ],
                            'title_query' => [
                                'type' => 'STRING',
                                'description' => 'Kata kunci judul tugas yang ingin ditandai selesai.',
                            ],
                            'is_completed' => [
                                'type' => 'BOOLEAN',
                                'description' => 'True untuk selesai, false untuk belum selesai.',
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ];
}

function executeTool(PDO $pdo, string $name, array $args): array
{
    $now = new DateTimeImmutable('now');
    $today = $now->format('Y-m-d');

    switch ($name) {
        case 'get_current_datetime': {
            $stmtS = $pdo->prepare("SELECT COUNT(*) FROM schedules WHERE event_date = ? AND status != 'cancelled'");
            $stmtS->execute([$today]);
            $todaySchedules = (int) $stmtS->fetchColumn();

            $stmtT = $pdo->query('SELECT COUNT(*) FROM tasks WHERE is_completed = 0');
            $pendingTasks = (int) $stmtT->fetchColumn();

            return [
                'ok' => true,
                'date' => $today,
                'formatted_date' => formatIndonesianDate($today),
                'time' => $now->format('H:i'),
                'timezone' => 'WIB (Asia/Jakarta)',
                'today_schedules_count' => $todaySchedules,
                'pending_tasks_count' => $pendingTasks,
            ];
        }

        case 'get_schedules': {
            $filter = strtolower(trim((string) ($args['date_filter'] ?? 'today')));
            $search = trim((string) ($args['search'] ?? ''));

            $where = [];
            $params = [];

            if ($filter === 'today' || $filter === '') {
                $where[] = 'event_date = ?';
                $params[] = $today;
            } elseif ($filter === 'tomorrow') {
                $where[] = 'event_date = ?';
                $params[] = $now->modify('+1 day')->format('Y-m-d');
            } elseif ($filter === 'week') {
                $where[] = 'event_date BETWEEN ? AND ?';
                $params[] = $today;
                $params[] = $now->modify('+7 days')->format('Y-m-d');
            } elseif ($filter === 'upcoming') {
                $where[] = "event_date >= ? AND status = 'upcoming'";
                $params[] = $today;
            } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $filter)) {
                $where[] = 'event_date = ?';
                $params[] = $filter;
            }
            // 'all' -> no date filter

            if ($search !== '') {
                $where[] = '(title LIKE ? OR description LIKE ? OR location LIKE ?)';
                $like = '%' . $search . '%';
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
            }

            $sql = 'SELECT id, title, description, event_date, TIME_FORMAT(start_time, "%H:%i") AS start_time, TIME_FORMAT(end_time, "%H:%i") AS end_time, location, category, status FROM schedules';
            if ($where) {
                $sql .= ' WHERE ' . implode(' AND ', $where);
            }
            $sql .= ' ORDER BY event_date ASC, start_time ASC LIMIT 30';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll();

            foreach ($items as &$item) {
                $item['formatted_date'] = formatIndonesianDate($item['event_date']);
            }
            unset($item);

            return [
                'ok' => true,
                'type' => 'schedules',
                'filter' => $filter,
                'count' => count($items),
                'items' => $items,
            ];
        }

        case 'add_schedule': {
            $title = trim((string) ($args['title'] ?? ''));
            $eventDate = trim((string) ($args['event_date'] ?? $today));
            $startTime = trim((string) ($args['start_time'] ?? '09:00'));
            $endTime = isset($args['end_time']) && trim((string) $args['end_time']) !== '' ? trim((string) $args['end_time']) : null;
            $location = isset($args['location']) ? trim((string) $args['location']) : null;
            $description = isset($args['description']) ? trim((string) $args['description']) : null;
            $category = trim((string) ($args['category'] ?? 'general'));

            if ($title === '') {
                return ['ok' => false, 'error' => 'Judul jadwal wajib diisi.'];
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $eventDate)) {
                $eventDate = $today;
            }
            if (preg_match('/^\d{1,2}:\d{2}$/', $startTime)) {
                $startTime = str_pad($startTime, 5, '0', STR_PAD_LEFT) . ':00';
            } else {
                $startTime = '09:00:00';
            }
            if ($endTime !== null && preg_match('/^\d{1,2}:\d{2}$/', $endTime)) {
                $endTime = str_pad($endTime, 5, '0', STR_PAD_LEFT) . ':00';
            }

            $stmt = $pdo->prepare(
                'INSERT INTO schedules (title, description, event_date, start_time, end_time, location, category, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, "upcoming")'
            );
            $stmt->execute([$title, $description, $eventDate, $startTime, $endTime, $location, $category]);
            $id = (int) $pdo->lastInsertId();

            return [
                'ok' => true,
                'mutated' => true,
                'type' => 'schedule_created',
                'schedule' => [
                    'id' => $id,
                    'title' => $title,
                    'event_date' => $eventDate,
                    'formatted_date' => formatIndonesianDate($eventDate),
                    'start_time' => substr($startTime, 0, 5),
                    'end_time' => $endTime ? substr($endTime, 0, 5) : null,
                    'location' => $location,
                    'category' => $category,
                    'status' => 'upcoming',
                ],
            ];
        }

        case 'update_schedule_status': {
            $status = strtolower(trim((string) ($args['status'] ?? 'done')));
            $scheduleId = isset($args['schedule_id']) ? (int) $args['schedule_id'] : 0;
            $titleQuery = trim((string) ($args['title_query'] ?? ''));

            if ($scheduleId <= 0 && $titleQuery !== '') {
                $stmt = $pdo->prepare('SELECT id, title FROM schedules WHERE title LIKE ? ORDER BY event_date DESC LIMIT 1');
                $stmt->execute(['%' . $titleQuery . '%']);
                $found = $stmt->fetch();
                if ($found) {
                    $scheduleId = (int) $found['id'];
                }
            }

            if ($scheduleId <= 0) {
                return ['ok' => false, 'error' => 'Jadwal tidak ditemukan.'];
            }

            if ($status === 'delete') {
                $stmt = $pdo->prepare('DELETE FROM schedules WHERE id = ?');
                $stmt->execute([$scheduleId]);
                return ['ok' => true, 'mutated' => true, 'deleted_id' => $scheduleId];
            }

            if (!in_array($status, ['upcoming', 'done', 'cancelled'], true)) {
                $status = 'done';
            }

            $stmt = $pdo->prepare('UPDATE schedules SET status = ? WHERE id = ?');
            $stmt->execute([$status, $scheduleId]);

            return ['ok' => true, 'mutated' => true, 'updated_id' => $scheduleId, 'status' => $status];
        }

        case 'get_tasks': {
            $filter = strtolower(trim((string) ($args['status_filter'] ?? 'pending')));
            $sql = 'SELECT id, title, notes, due_date, priority, is_completed FROM tasks';
            if ($filter === 'pending') {
                $sql .= ' WHERE is_completed = 0';
            } elseif ($filter === 'completed') {
                $sql .= ' WHERE is_completed = 1';
            }
            $sql .= " ORDER BY is_completed ASC, FIELD(priority, 'high', 'medium', 'low'), due_date ASC LIMIT 30";

            $stmt = $pdo->query($sql);
            $items = $stmt->fetchAll();

            return [
                'ok' => true,
                'type' => 'tasks',
                'filter' => $filter,
                'count' => count($items),
                'items' => $items,
            ];
        }

        case 'add_task': {
            $title = trim((string) ($args['title'] ?? ''));
            $dueDate = isset($args['due_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $args['due_date'])
                ? (string) $args['due_date']
                : null;
            $priority = strtolower(trim((string) ($args['priority'] ?? 'medium')));
            if (!in_array($priority, ['low', 'medium', 'high'], true)) {
                $priority = 'medium';
            }
            $notes = isset($args['notes']) ? trim((string) $args['notes']) : null;

            if ($title === '') {
                return ['ok' => false, 'error' => 'Judul tugas wajib diisi.'];
            }

            $stmt = $pdo->prepare(
                'INSERT INTO tasks (title, notes, due_date, priority, is_completed) VALUES (?, ?, ?, ?, 0)'
            );
            $stmt->execute([$title, $notes, $dueDate, $priority]);
            $id = (int) $pdo->lastInsertId();

            return [
                'ok' => true,
                'mutated' => true,
                'type' => 'task_created',
                'task' => [
                    'id' => $id,
                    'title' => $title,
                    'due_date' => $dueDate,
                    'priority' => $priority,
                    'notes' => $notes,
                    'is_completed' => 0,
                ],
            ];
        }

        case 'complete_task': {
            $taskId = isset($args['task_id']) ? (int) $args['task_id'] : 0;
            $titleQuery = trim((string) ($args['title_query'] ?? ''));
            $completed = isset($args['is_completed']) ? (bool) $args['is_completed'] : true;

            if ($taskId <= 0 && $titleQuery !== '') {
                $stmt = $pdo->prepare('SELECT id, title FROM tasks WHERE title LIKE ? ORDER BY is_completed ASC, id DESC LIMIT 1');
                $stmt->execute(['%' . $titleQuery . '%']);
                $found = $stmt->fetch();
                if ($found) {
                    $taskId = (int) $found['id'];
                }
            }

            if ($taskId <= 0) {
                return ['ok' => false, 'error' => 'Tugas tidak ditemukan.'];
            }

            $stmt = $pdo->prepare('UPDATE tasks SET is_completed = ? WHERE id = ?');
            $stmt->execute([$completed ? 1 : 0, $taskId]);

            return [
                'ok' => true,
                'mutated' => true,
                'task_id' => $taskId,
                'is_completed' => $completed,
            ];
        }

        default:
            return ['ok' => false, 'error' => "Tool '{$name}' tidak dikenal."];
    }
}

/**
 * Built-in Indonesian intent fallback when Gemini API Key is not configured yet.
 * Ensures the Holographic Assistant works immediately out of the box!
 */
function runLocalFallbackAssistant(PDO $pdo, string $message, string $assistantName): array
{
    $lower = mb_strtolower(trim($message), 'UTF-8');
    $now = new DateTimeImmutable('now');
    $today = $now->format('Y-m-d');
    $tomorrow = $now->modify('+1 day')->format('Y-m-d');

    $toolCalls = [];
    $dataPreview = null;
    $mutatesData = false;
    $emotion = 'neutral';

    // 1. Tambah jadwal cepat: "tambah jadwal [judul] (besok|hari ini) jam HH:MM"
    if (preg_match('/(tambah|buat|jadwalkan|catat)\s+(jadwal|agenda|meeting|acara)\s+(.+)/iu', $message, $m)) {
        $raw = trim($m[3]);
        $eventDate = $today;
        if (preg_match('/\bbesok\b/iu', $raw)) {
            $eventDate = $tomorrow;
            $raw = trim((string) preg_replace('/\bbesok\b/iu', '', $raw));
        } elseif (preg_match('/\bhari ini\b/iu', $raw)) {
            $raw = trim((string) preg_replace('/\bhari ini\b/iu', '', $raw));
        }

        $startTime = '09:00';
        if (preg_match('/(?:jam|pukul)\s*(\d{1,2})(?:[:.](\d{2}))?/iu', $raw, $tm)) {
            $hh = str_pad($tm[1], 2, '0', STR_PAD_LEFT);
            $mm = isset($tm[2]) && $tm[2] !== '' ? $tm[2] : '00';
            $startTime = "{$hh}:{$mm}";
            $raw = trim((string) preg_replace('/(?:jam|pukul)\s*\d{1,2}(?:[:.]\d{2})?/iu', '', $raw));
        }

        $title = trim((string) preg_replace('/\s+/', ' ', $raw));
        if ($title === '') {
            $title = 'Agenda Baru';
        }

        $res = executeTool($pdo, 'add_schedule', [
            'title' => $title,
            'event_date' => $eventDate,
            'start_time' => $startTime,
            'category' => 'general',
        ]);
        $toolCalls[] = ['name' => 'add_schedule', 'result' => $res];
        $mutatesData = true;
        $emotion = 'happy';
        $dataPreview = executeTool($pdo, 'get_schedules', ['date_filter' => $eventDate]);

        $dateLabel = $eventDate === $today ? 'hari ini' : ($eventDate === $tomorrow ? 'besok' : formatIndonesianDate($eventDate));
        $reply = "Siap! Jadwal {$title} sudah saya tambahkan untuk {$dateLabel} pukul {$startTime} WIB.";

        return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
    }

    // 2. Tambah tugas cepat
    if (preg_match('/(tambah|buat|catat)\s+(tugas|todo|to-do|pengingat)\s+(.+)/iu', $message, $m)) {
        $title = trim($m[3]);
        $res = executeTool($pdo, 'add_task', ['title' => $title, 'due_date' => $today, 'priority' => 'medium']);
        $toolCalls[] = ['name' => 'add_task', 'result' => $res];
        $mutatesData = true;
        $emotion = 'happy';
        $dataPreview = executeTool($pdo, 'get_tasks', ['status_filter' => 'pending']);

        $reply = "Baik, tugas \"{$title}\" sudah saya simpan ke daftar tugas Anda.";
        return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
    }

    // 3. Cek jadwal
    if (preg_match('/(jadwal|agenda|acara|meeting|kegiatan)/iu', $lower)) {
        $filter = 'today';
        $label = 'hari ini (' . formatIndonesianDate($today) . ')';

        if (str_contains($lower, 'besok')) {
            $filter = 'tomorrow';
            $label = 'besok (' . formatIndonesianDate($tomorrow) . ')';
        } elseif (str_contains($lower, 'minggu')) {
            $filter = 'week';
            $label = '7 hari ke depan';
        } elseif (str_contains($lower, 'semua')) {
            $filter = 'all';
            $label = 'seluruh catatan Anda';
        }

        $res = executeTool($pdo, 'get_schedules', ['date_filter' => $filter]);
        $toolCalls[] = ['name' => 'get_schedules', 'result' => $res];
        $dataPreview = $res;

        if ($res['count'] === 0) {
            $emotion = 'neutral';
            $reply = "Saya sudah memeriksa jadwal {$label}, dan saat ini tidak ada jadwal yang tercatat. Mau saya tambahkan jadwal baru?";
        } else {
            $emotion = 'happy';
            $parts = [];
            foreach ($res['items'] as $idx => $item) {
                $num = $idx + 1;
                $loc = !empty($item['location']) ? " di {$item['location']}" : '';
                $statusTxt = $item['status'] === 'done' ? ' (sudah selesai)' : '';
                $parts[] = "{$num}, pukul {$item['start_time']} ada {$item['title']}{$loc}{$statusTxt}";
            }
            $reply = "Baik, untuk {$label} Anda memiliki {$res['count']} jadwal: " . implode('. ', $parts) . '.';
        }

        return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
    }

    // 4. Cek tugas
    if (preg_match('/(tugas|todo|to-do|pekerjaan|kerjakan|pr)/iu', $lower)) {
        $res = executeTool($pdo, 'get_tasks', ['status_filter' => 'pending']);
        $toolCalls[] = ['name' => 'get_tasks', 'result' => $res];
        $dataPreview = $res;

        if ($res['count'] === 0) {
            $emotion = 'happy';
            $reply = 'Hebat! Semua tugas Anda sudah selesai, tidak ada tugas yang tertunda.';
        } else {
            $emotion = 'thinking';
            $list = [];
            foreach ($res['items'] as $idx => $t) {
                $list[] = ($idx + 1) . ', ' . $t['title'];
            }
            $reply = "Saat ini ada {$res['count']} tugas yang belum selesai: " . implode('. ', $list) . '.';
        }

        return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
    }

    // 5. Cek jam / tanggal
    if (preg_match('/(jam berapa|pukul berapa|tanggal berapa|hari apa)/iu', $lower)) {
        $res = executeTool($pdo, 'get_current_datetime', []);
        $toolCalls[] = ['name' => 'get_current_datetime', 'result' => $res];
        $emotion = 'neutral';
        $reply = "Sekarang hari {$res['formatted_date']}, pukul {$res['time']} WIB. Hari ini Anda punya {$res['today_schedules_count']} jadwal dan {$res['pending_tasks_count']} tugas aktif.";
        return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
    }

    // 6. Sapaan / perkenalan
    if (preg_match('/^(halo|hallo|hai|hi|hello|selamat|pagi|siang|sore|malam|siapa kamu|nama kamu)/iu', $lower)) {
        $emotion = 'happy';
        $reply = "Halo! Saya {$assistantName}, asisten AI holografik pribadi Anda. Anda bisa meminta saya mengecek jadwal hari ini, menambah agenda baru, atau melihat daftar tugas Anda. Apa yang bisa saya bantu sekarang?";
        return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
    }

    // Default fallback hint
    $emotion = 'thinking';
    $reply = "Saat ini saya berjalan dalam mode lokal dasar karena Gemini API Key belum diatur. Untuk percakapan bebas yang lebih cerdas, silakan masukkan Gemini API Key di menu Pengaturan. Sementara itu, Anda sudah bisa meminta saya seperti: cek jadwal hari ini, cek jadwal besok, cek tugas, atau tambah jadwal meeting besok jam 10.";
    return compact('reply', 'emotion', 'toolCalls', 'dataPreview', 'mutatesData');
}
