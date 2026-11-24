import { BalaiStorage, formatIndonesianDate, getTodayIso, getTomorrowIso } from './storage.js';

/**
 * BALAI AI Engine — Direct Gemini Function Calling + Local Indonesian Fallback
 * Runs 100% inside Chrome Extension on any device (no local XAMPP server required!)
 */

function getToolDeclarations() {
  return [
    {
      functionDeclarations: [
        {
          name: 'get_current_datetime',
          description: 'Mendapatkan tanggal, hari, dan jam lokal saat ini beserta ringkasan jadwal hari ini dan tugas aktif.',
          parameters: { type: 'OBJECT', properties: {} },
        },
        {
          name: 'get_active_tab',
          description: 'Mendapatkan judul dan URL tab Chrome yang sedang dibuka pengguna saat ini.',
          parameters: { type: 'OBJECT', properties: {} },
        },
        {
          name: 'get_schedules',
          description: 'Mengambil daftar jadwal atau agenda pengguna yang tersinkron di BALAI.',
          parameters: {
            type: 'OBJECT',
            properties: {
              date_filter: {
                type: 'STRING',
                description: 'Filter waktu: "today", "tomorrow", "week", "upcoming", "all", atau tanggal YYYY-MM-DD.',
              },
              search: {
                type: 'STRING',
                description: 'Kata kunci opsional untuk mencari jadwal.',
              },
            },
          },
        },
        {
          name: 'add_schedule',
          description: 'Menambahkan jadwal atau agenda baru ke BALAI.',
          parameters: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Judul jadwal.' },
              event_date: { type: 'STRING', description: 'Tanggal format YYYY-MM-DD.' },
              start_time: { type: 'STRING', description: 'Jam mulai format 24-jam HH:MM.' },
              end_time: { type: 'STRING', description: 'Jam selesai opsional HH:MM.' },
              location: { type: 'STRING', description: 'Lokasi atau link meeting opsional.' },
              description: { type: 'STRING', description: 'Deskripsi singkat opsional.' },
              category: { type: 'STRING', description: 'Kategori: work, personal, meeting, health, general.' },
            },
            required: ['title', 'event_date', 'start_time'],
          },
        },
        {
          name: 'update_schedule_status',
          description: 'Mengubah status jadwal (done, cancelled, upcoming) atau menghapus (delete).',
          parameters: {
            type: 'OBJECT',
            properties: {
              schedule_id: { type: 'INTEGER', description: 'ID jadwal jika diketahui.' },
              title_query: { type: 'STRING', description: 'Kata kunci judul jadwal.' },
              status: { type: 'STRING', description: 'Status baru: done, cancelled, upcoming, atau delete.' },
            },
            required: ['status'],
          },
        },
        {
          name: 'get_tasks',
          description: 'Mengambil daftar tugas (to-do list) pengguna.',
          parameters: {
            type: 'OBJECT',
            properties: {
              status_filter: { type: 'STRING', description: '"pending", "completed", atau "all".' },
            },
          },
        },
        {
          name: 'add_task',
          description: 'Menambahkan tugas baru.',
          parameters: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Judul tugas.' },
              due_date: { type: 'STRING', description: 'Tenggat format YYYY-MM-DD opsional.' },
              priority: { type: 'STRING', description: 'low, medium, atau high.' },
              notes: { type: 'STRING', description: 'Catatan opsional.' },
            },
            required: ['title'],
          },
        },
        {
          name: 'complete_task',
          description: 'Menandai tugas selesai atau belum selesai.',
          parameters: {
            type: 'OBJECT',
            properties: {
              task_id: { type: 'INTEGER', description: 'ID tugas.' },
              title_query: { type: 'STRING', description: 'Kata kunci judul tugas.' },
              is_completed: { type: 'BOOLEAN', description: 'True untuk selesai.' },
            },
          },
        },
      ],
    },
  ];
}

export async function executeBalaiTool(name, args = {}) {
  const today = getTodayIso();
  const tomorrow = getTomorrowIso();

  switch (name) {
    case 'get_current_datetime': {
      const now = new Date();
      const [schedules, tasks] = await Promise.all([
        BalaiStorage.getSchedules(),
        BalaiStorage.getTasks(),
      ]);
      const todayCount = schedules.filter((s) => s.event_date === today && s.status !== 'cancelled').length;
      const pendingTasks = tasks.filter((t) => !t.is_completed).length;
      return {
        ok: true,
        date: today,
        formatted_date: formatIndonesianDate(today),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        today_schedules_count: todayCount,
        pending_tasks_count: pendingTasks,
      };
    }

    case 'get_active_tab': {
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab) {
            return { ok: true, title: tab.title || '', url: tab.url || '' };
          }
        } catch {
          // ignore
        }
      }
      return { ok: false, error: 'Informasi tab aktif tidak tersedia.' };
    }

    case 'get_schedules': {
      const filter = String(args.date_filter || 'today').toLowerCase().trim();
      const search = String(args.search || '').toLowerCase().trim();
      const all = await BalaiStorage.getSchedules();

      const weekLimit = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      let items = all.filter((s) => {
        if (filter === 'today' || filter === '') return s.event_date === today;
        if (filter === 'tomorrow') return s.event_date === tomorrow;
        if (filter === 'week') return s.event_date >= today && s.event_date <= weekLimit;
        if (filter === 'upcoming') return s.event_date >= today && s.status === 'upcoming';
        if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) return s.event_date === filter;
        return true;
      });

      if (search) {
        items = items.filter((s) =>
          `${s.title} ${s.description || ''} ${s.location || ''}`.toLowerCase().includes(search)
        );
      }

      return {
        ok: true,
        type: 'schedules',
        filter,
        count: items.length,
        items: items.map((s) => ({ ...s, formatted_date: formatIndonesianDate(s.event_date) })),
      };
    }

    case 'add_schedule': {
      const title = String(args.title || '').trim();
      if (!title) return { ok: false, error: 'Judul jadwal wajib diisi.' };
      const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.event_date || '')) ? args.event_date : today;
      let startTime = String(args.start_time || '09:00').trim();
      if (/^\d{1,2}:\d{2}$/.test(startTime)) {
        const [h, m] = startTime.split(':');
        startTime = `${h.padStart(2, '0')}:${m}`;
      } else {
        startTime = '09:00';
      }

      const list = await BalaiStorage.getSchedules();
      const nextId = list.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;
      const item = {
        id: nextId,
        title,
        description: String(args.description || '').trim(),
        event_date: eventDate,
        start_time: startTime,
        end_time: args.end_time ? String(args.end_time).trim() : '',
        location: String(args.location || '').trim(),
        category: String(args.category || 'general').trim(),
        status: 'upcoming',
      };
      list.push(item);
      await BalaiStorage.saveSchedules(list);
      return {
        ok: true,
        mutated: true,
        type: 'schedule_created',
        schedule: { ...item, formatted_date: formatIndonesianDate(eventDate) },
      };
    }

    case 'update_schedule_status': {
      const status = String(args.status || 'done').toLowerCase().trim();
      const list = await BalaiStorage.getSchedules();
      let idx = -1;
      if (args.schedule_id) {
        idx = list.findIndex((s) => Number(s.id) === Number(args.schedule_id));
      } else if (args.title_query) {
        const q = String(args.title_query).toLowerCase();
        idx = list.findIndex((s) => s.title.toLowerCase().includes(q));
      }
      if (idx === -1) return { ok: false, error: 'Jadwal tidak ditemukan.' };

      if (status === 'delete') {
        const [removed] = list.splice(idx, 1);
        await BalaiStorage.saveSchedules(list);
        return { ok: true, mutated: true, deleted_id: removed.id };
      }

      list[idx].status = ['upcoming', 'done', 'cancelled'].includes(status) ? status : 'done';
      await BalaiStorage.saveSchedules(list);
      return { ok: true, mutated: true, updated_id: list[idx].id, status: list[idx].status };
    }

    case 'get_tasks': {
      const filter = String(args.status_filter || 'pending').toLowerCase().trim();
      const all = await BalaiStorage.getTasks();
      const items = all.filter((t) => {
        if (filter === 'pending') return !t.is_completed;
        if (filter === 'completed') return Boolean(t.is_completed);
        return true;
      });
      return { ok: true, type: 'tasks', filter, count: items.length, items };
    }

    case 'add_task': {
      const title = String(args.title || '').trim();
      if (!title) return { ok: false, error: 'Judul tugas wajib diisi.' };
      const list = await BalaiStorage.getTasks();
      const nextId = list.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;
      const priority = ['low', 'medium', 'high'].includes(String(args.priority || '').toLowerCase())
        ? String(args.priority).toLowerCase()
        : 'medium';
      const item = {
        id: nextId,
        title,
        notes: String(args.notes || '').trim(),
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(args.due_date || '')) ? args.due_date : '',
        priority,
        is_completed: false,
      };
      list.push(item);
      await BalaiStorage.saveTasks(list);
      return { ok: true, mutated: true, type: 'task_created', task: item };
    }

    case 'complete_task': {
      const list = await BalaiStorage.getTasks();
      let idx = -1;
      if (args.task_id) {
        idx = list.findIndex((t) => Number(t.id) === Number(args.task_id));
      } else if (args.title_query) {
        const q = String(args.title_query).toLowerCase();
        idx = list.findIndex((t) => t.title.toLowerCase().includes(q));
      }
      if (idx === -1) return { ok: false, error: 'Tugas tidak ditemukan.' };
      list[idx].is_completed = args.is_completed !== undefined ? Boolean(args.is_completed) : true;
      await BalaiStorage.saveTasks(list);
      return { ok: true, mutated: true, task_id: list[idx].id, is_completed: list[idx].is_completed };
    }

    default:
      return { ok: false, error: `Fungsi "${name}" tidak dikenal.` };
  }
}

async function runLocalFallback(message, assistantName) {
  const lower = message.toLowerCase().trim();
  const today = getTodayIso();
  const tomorrow = getTomorrowIso();
  const toolCalls = [];
  let dataPreview = null;
  let mutatesData = false;
  let emotion = 'neutral';

  // 1. Add schedule
  const addSchedMatch = message.match(/(?:tambah|buat|jadwalkan|catat)\s+(?:jadwal|agenda|meeting|acara)\s+(.+)/i);
  if (addSchedMatch) {
    let raw = addSchedMatch[1].trim();
    let eventDate = today;
    if (/\bbesok\b/i.test(raw)) {
      eventDate = tomorrow;
      raw = raw.replace(/\bbesok\b/gi, '').trim();
    } else if (/\bhari ini\b/i.test(raw)) {
      raw = raw.replace(/\bhari ini\b/gi, '').trim();
    }
    let startTime = '09:00';
    const tm = raw.match(/(?:jam|pukul)\s*(\d{1,2})(?:[:.](\d{2}))?/i);
    if (tm) {
      startTime = `${tm[1].padStart(2, '0')}:${tm[2] || '00'}`;
      raw = raw.replace(/(?:jam|pukul)\s*\d{1,2}(?:[:.]\d{2})?/gi, '').trim();
    }
    const title = raw.replace(/\s+/g, ' ').trim() || 'Agenda Baru';
    const res = await executeBalaiTool('add_schedule', { title, event_date: eventDate, start_time: startTime });
    toolCalls.push({ name: 'add_schedule', result: res });
    mutatesData = true;
    emotion = 'happy';
    dataPreview = await executeBalaiTool('get_schedules', { date_filter: eventDate });
    const dLabel = eventDate === today ? 'hari ini' : eventDate === tomorrow ? 'besok' : formatIndonesianDate(eventDate);
    return {
      reply: `Siap! Jadwal ${title} sudah saya simpan untuk ${dLabel} pukul ${startTime} dan otomatis tersinkron di perangkat Chrome Anda.`,
      emotion,
      toolCalls,
      dataPreview,
      mutatesData,
    };
  }

  // 2. Add task
  const addTaskMatch = message.match(/(?:tambah|buat|catat)\s+(?:tugas|todo|to-do|pengingat)\s+(.+)/i);
  if (addTaskMatch) {
    const title = addTaskMatch[1].trim();
    const res = await executeBalaiTool('add_task', { title, due_date: today, priority: 'medium' });
    toolCalls.push({ name: 'add_task', result: res });
    mutatesData = true;
    emotion = 'happy';
    dataPreview = await executeBalaiTool('get_tasks', { status_filter: 'pending' });
    return {
      reply: `Baik, tugas "${title}" sudah saya tambahkan ke daftar tugas BALAI Anda.`,
      emotion,
      toolCalls,
      dataPreview,
      mutatesData,
    };
  }

  // 3. Check schedules
  if (/(jadwal|agenda|acara|meeting|kegiatan)/i.test(lower)) {
    let filter = 'today';
    let label = `hari ini (${formatIndonesianDate(today)})`;
    if (lower.includes('besok')) {
      filter = 'tomorrow';
      label = `besok (${formatIndonesianDate(tomorrow)})`;
    } else if (lower.includes('minggu')) {
      filter = 'week';
      label = '7 hari ke depan';
    } else if (lower.includes('semua')) {
      filter = 'all';
      label = 'seluruh agenda Anda';
    }
    const res = await executeBalaiTool('get_schedules', { date_filter: filter });
    toolCalls.push({ name: 'get_schedules', result: res });
    dataPreview = res;
    if (res.count === 0) {
      return {
        reply: `Saya sudah memeriksa jadwal ${label}, dan saat ini belum ada agenda yang tercatat. Mau saya tambahkan jadwal baru?`,
        emotion: 'neutral',
        toolCalls,
        dataPreview,
        mutatesData,
      };
    }
    const itemsText = res.items
      .map((s, i) => `${i + 1}, pukul ${s.start_time} ada ${s.title}${s.location ? ' di ' + s.location : ''}${s.status === 'done' ? ' (sudah selesai)' : ''}`)
      .join('. ');
    return {
      reply: `Baik, untuk ${label} Anda memiliki ${res.count} jadwal: ${itemsText}.`,
      emotion: 'happy',
      toolCalls,
      dataPreview,
      mutatesData,
    };
  }

  // 4. Check tasks
  if (/(tugas|todo|to-do|pekerjaan|kerjakan|pr)/i.test(lower)) {
    const res = await executeBalaiTool('get_tasks', { status_filter: 'pending' });
    toolCalls.push({ name: 'get_tasks', result: res });
    dataPreview = res;
    if (res.count === 0) {
      return {
        reply: 'Keren! Semua tugas Anda sudah selesai, tidak ada tugas tertunda.',
        emotion: 'happy',
        toolCalls,
        dataPreview,
        mutatesData,
      };
    }
    const listText = res.items.map((t, i) => `${i + 1}, ${t.title}`).join('. ');
    return {
      reply: `Saat ini ada ${res.count} tugas yang belum selesai: ${listText}.`,
      emotion: 'thinking',
      toolCalls,
      dataPreview,
      mutatesData,
    };
  }

  // 5. Check active tab
  if (/(halaman apa|tab ini|web ini|situs ini)/i.test(lower)) {
    const res = await executeBalaiTool('get_active_tab', {});
    toolCalls.push({ name: 'get_active_tab', result: res });
    if (res.ok && res.title) {
      return {
        reply: `Saat ini Anda sedang membuka halaman "${res.title}".`,
        emotion: 'neutral',
        toolCalls,
        dataPreview,
        mutatesData,
      };
    }
  }

  // 6. Check datetime
  if (/(jam berapa|pukul berapa|tanggal berapa|hari apa)/i.test(lower)) {
    const res = await executeBalaiTool('get_current_datetime', {});
    toolCalls.push({ name: 'get_current_datetime', result: res });
    return {
      reply: `Sekarang hari ${res.formatted_date}, pukul ${res.time}. Hari ini Anda memiliki ${res.today_schedules_count} jadwal dan ${res.pending_tasks_count} tugas aktif.`,
      emotion: 'neutral',
      toolCalls,
      dataPreview,
      mutatesData,
    };
  }

  // 7. Greeting
  if (/^(halo|hallo|hai|hi|hello|selamat|pagi|siang|sore|malam|siapa kamu|nama kamu)/i.test(lower)) {
    return {
      reply: `Halo! Saya ${assistantName}, asisten AI holografik pribadi Anda di Chrome. Saya bisa mengecek jadwal hari ini, menambah agenda baru, atau melihat tugas Anda. Apa yang bisa saya bantu?`,
      emotion: 'happy',
      toolCalls,
      dataPreview,
      mutatesData,
    };
  }

  return {
    reply: `Saat ini ${assistantName} berjalan di mode lokal karena Gemini API Key belum dipasang. Untuk percakapan AI penuh, buka Pengaturan lalu tempel Gemini API Key Anda. Sementara ini, Anda tetap bisa meminta saya seperti: cek jadwal hari ini, cek tugas, atau tambah jadwal meeting besok jam 10.`,
    emotion: 'thinking',
    toolCalls,
    dataPreview,
    mutatesData,
  };
}

export async function askBalai(userMessage) {
  const settings = await BalaiStorage.getSettings();
  const assistantName = settings.assistant_name || 'BALAI';
  const apiKey = (settings.gemini_api_key || '').trim();
  let model = settings.gemini_model || 'gemini-3-flash-preview';
  if (model === 'gemini-2.5-flash') model = 'gemini-3-flash-preview';

  await BalaiStorage.appendChat({ role: 'user', content: userMessage });

  if (!apiKey) {
    const local = await runLocalFallback(userMessage, assistantName);
    const toolNames = local.toolCalls.map((t) => t.name).join(', ');
    await BalaiStorage.appendChat({
      role: 'assistant',
      content: local.reply,
      emotion: local.emotion,
      tool_used: toolNames,
    });
    return { ok: true, mode: 'local_fallback', ...local };
  }

  // Build Gemini multi-turn conversation history
  const hist = await BalaiStorage.getChatHistory();
  const recent = hist.slice(-12);
  const contents = recent.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const today = getTodayIso();
  const tomorrow = getTomorrowIso();
  const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const systemPrompt = `Kamu adalah ${assistantName}, asisten AI holografik berbentuk manusia 3D yang hadir sebagai ekstensi Google Chrome lintas perangkat.
Waktu lokal pengguna saat ini: ${formatIndonesianDate(today)} (${today}), pukul ${nowTime}. Tanggal besok adalah ${tomorrow}.

ATURAN PENTING:
1. Jawablah dalam Bahasa Indonesia yang alami, hangat, cerdas, dan ringkas agar nyaman diucapkan oleh sistem suara (Text-to-Speech).
2. JANGAN gunakan tanda markdown seperti **, ##, atau tabel karena akan langsung dibacakan suara.
3. WAJIB panggil tools (get_schedules, add_schedule, update_schedule_status, get_tasks, add_task, complete_task, get_current_datetime, get_active_tab) saat pengguna bertanya soal jadwal, tugas, waktu, atau halaman tab yang sedang dibuka. Jangan mengarang data!
4. Awali jawaban akhirmu dengan tepat satu tag emosi: [neutral], [happy], [thinking], atau [alert].`;

  const tools = getToolDeclarations();
  const toolCalls = [];
  let dataPreview = null;
  let mutatesData = false;
  let finalText = '';

  const callModel = async (targetModel) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      }),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  };

  for (let step = 0; step < 4; step++) {
    let callRes = await callModel(model);
    if (!callRes.ok && model !== 'gemini-3.1-flash-lite') {
      const fb = await callModel('gemini-3.1-flash-lite');
      if (fb.ok) {
        callRes = fb;
        model = 'gemini-3.1-flash-lite';
      }
    }

    if (!callRes.ok) {
      const msg = callRes.data?.error?.message || `HTTP ${callRes.status}`;
      return { ok: false, error: `Gemini API Error: ${msg}` };
    }

    const data = callRes.data;

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const fnCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    const textChunk = parts.filter((p) => p.text).map((p) => p.text).join('');

    if (fnCalls.length === 0) {
      finalText = textChunk.trim();
      break;
    }

    contents.push({ role: 'model', parts });

    const fnResponses = [];
    for (const fc of fnCalls) {
      const result = await executeBalaiTool(fc.name, fc.args || {});
      toolCalls.push({ name: fc.name, args: fc.args || {}, result });
      if (result.mutated) mutatesData = true;
      if (result.type === 'schedules' || result.type === 'tasks') {
        dataPreview = result;
      } else if (result.type === 'schedule_created') {
        dataPreview = await executeBalaiTool('get_schedules', { date_filter: result.schedule.event_date });
      } else if (result.type === 'task_created') {
        dataPreview = await executeBalaiTool('get_tasks', { status_filter: 'pending' });
      }
      fnResponses.push({
        functionResponse: { name: fc.name, response: result },
      });
    }

    contents.push({ role: 'user', parts: fnResponses });
  }

  if (!finalText) {
    finalText = 'Maaf, saya belum bisa memproses permintaan itu. Bisa diulangi lagi?';
  }

  let emotion = 'neutral';
  const emMatch = finalText.match(/^\s*\[(neutral|happy|thinking|alert)\]\s*/i);
  if (emMatch) {
    emotion = emMatch[1].toLowerCase();
    finalText = finalText.replace(/^\s*\[(neutral|happy|thinking|alert)\]\s*/i, '').trim();
  }

  const toolNames = toolCalls.map((t) => t.name).join(', ');
  await BalaiStorage.appendChat({
    role: 'assistant',
    content: finalText,
    emotion,
    tool_used: toolNames,
  });

  return {
    ok: true,
    mode: 'gemini',
    model,
    reply: finalText,
    emotion,
    toolCalls,
    dataPreview,
    mutatesData,
  };
}
