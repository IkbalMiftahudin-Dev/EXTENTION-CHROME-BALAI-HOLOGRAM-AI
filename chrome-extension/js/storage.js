/**
 * BALAI Cross-Device Storage Engine
 * Uses chrome.storage.sync (automatically syncs across user's Chrome devices!)
 * with graceful fallback to localStorage when previewed outside Chrome Extension.
 */

const HAS_CHROME_STORAGE = typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);

function getLocalIsoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatIndonesianDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${days[dt.getDay()]}, ${d} ${months[m - 1]} ${y}`;
}

export function getTodayIso() {
  return getLocalIsoDate(0);
}

export function getTomorrowIso() {
  return getLocalIsoDate(1);
}

const DEFAULT_SETTINGS = {
  assistant_name: 'BALAI',
  gemini_api_key: '',
  gemini_model: 'gemini-3-flash-preview',
  hologram_theme: 'cyan',
  voice_rate: 1.05,
  voice_pitch: 1.0,
  voice_uri: '',
};

function createSeedSchedules() {
  const today = getTodayIso();
  const tomorrow = getTomorrowIso();
  return [
    {
      id: 1,
      title: 'Standup Meeting Tim AI',
      description: 'Review progres asisten holografik BALAI.',
      event_date: today,
      start_time: '09:30',
      end_time: '10:00',
      location: 'Google Meet',
      category: 'work',
      status: 'done',
    },
    {
      id: 2,
      title: 'Presentasi Demo Hologram BALAI',
      description: 'Demo ekstensi Chrome BALAI lintas perangkat.',
      event_date: today,
      start_time: '14:00',
      end_time: '15:30',
      location: 'Ruang Meeting Lt. 3',
      category: 'work',
      status: 'upcoming',
    },
    {
      id: 3,
      title: 'Olahraga Sore / Gym',
      description: 'Latihan kardio rutin.',
      event_date: today,
      start_time: '17:30',
      end_time: '18:30',
      location: 'Fitness Center',
      category: 'personal',
      status: 'upcoming',
    },
    {
      id: 4,
      title: 'Diskusi Pengembangan Fitur',
      description: 'Perencanaan integrasi kalender & dokumen.',
      event_date: tomorrow,
      start_time: '10:00',
      end_time: '11:30',
      location: 'Kantor Utama',
      category: 'work',
      status: 'upcoming',
    },
  ];
}

function createSeedTasks() {
  const today = getTodayIso();
  return [
    {
      id: 1,
      title: 'Pasang Gemini API Key di Pengaturan BALAI',
      notes: 'Gratis dari Google AI Studio agar BALAI bisa berdialog penuh.',
      due_date: today,
      priority: 'high',
      is_completed: false,
    },
    {
      id: 2,
      title: 'Coba unggah model avatar manusia 3D (.VRM)',
      notes: 'Opsional — bisa buat di VRoid Studio lalu drag & drop ke BALAI.',
      due_date: getLocalIsoDate(2),
      priority: 'medium',
      is_completed: false,
    },
    {
      id: 3,
      title: 'Kirim laporan mingguan proyek',
      notes: 'Rekap hasil pengembangan.',
      due_date: today,
      priority: 'high',
      is_completed: false,
    },
  ];
}

async function getRaw(area, keys) {
  if (HAS_CHROME_STORAGE) {
    const store = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    return await store.get(keys);
  }
  const out = {};
  for (const k of keys) {
    const val = localStorage.getItem(k);
    if (val !== null) {
      try {
        out[k] = JSON.parse(val);
      } catch {
        out[k] = val;
      }
    }
  }
  return out;
}

async function setRaw(area, obj) {
  if (HAS_CHROME_STORAGE) {
    const store = area === 'local' ? chrome.storage.local : chrome.storage.sync;
    await store.set(obj);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    localStorage.setItem(k, JSON.stringify(v));
  }
}

export const BalaiStorage = {
  isChromeSync: HAS_CHROME_STORAGE,

  async initIfNeeded() {
    const res = await getRaw('sync', ['balai_initialized', 'balai_schedules', 'balai_tasks', 'balai_settings']);
    if (!res.balai_initialized) {
      await setRaw('sync', {
        balai_initialized: true,
        balai_schedules: Array.isArray(res.balai_schedules) ? res.balai_schedules : createSeedSchedules(),
        balai_tasks: Array.isArray(res.balai_tasks) ? res.balai_tasks : createSeedTasks(),
        balai_settings: { ...DEFAULT_SETTINGS, ...(res.balai_settings || {}) },
      });
    }
  },

  async getSettings() {
    const res = await getRaw('sync', ['balai_settings']);
    return { ...DEFAULT_SETTINGS, ...(res.balai_settings || {}) };
  },

  async saveSettings(partial) {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await setRaw('sync', { balai_settings: updated });
    return updated;
  },

  async getSchedules() {
    const res = await getRaw('sync', ['balai_schedules']);
    const list = Array.isArray(res.balai_schedules) ? res.balai_schedules : [];
    return list.sort((a, b) =>
      `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`)
    );
  },

  async saveSchedules(list) {
    await setRaw('sync', { balai_schedules: list });
  },

  async getTasks() {
    const res = await getRaw('sync', ['balai_tasks']);
    const list = Array.isArray(res.balai_tasks) ? res.balai_tasks : [];
    const prioRank = { high: 0, medium: 1, low: 2 };
    return list.sort((a, b) => {
      if (Boolean(a.is_completed) !== Boolean(b.is_completed)) {
        return a.is_completed ? 1 : -1;
      }
      return (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1);
    });
  },

  async saveTasks(list) {
    await setRaw('sync', { balai_tasks: list });
  },

  async getChatHistory() {
    const res = await getRaw('local', ['balai_chat_history']);
    return Array.isArray(res.balai_chat_history) ? res.balai_chat_history : [];
  },

  async appendChat(entry) {
    const hist = await this.getChatHistory();
    hist.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      time_label: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      ...entry,
    });
    const trimmed = hist.slice(-40);
    await setRaw('local', { balai_chat_history: trimmed });
    return trimmed;
  },

  async clearChat() {
    await setRaw('local', { balai_chat_history: [] });
  },

  async exportBackup() {
    const [schedules, tasks, settings] = await Promise.all([
      this.getSchedules(),
      this.getTasks(),
      this.getSettings(),
    ]);
    const safeSettings = { ...settings, gemini_api_key: '' };
    return {
      app: 'BALAI Hologram AI',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      schedules,
      tasks,
      settings: safeSettings,
    };
  },

  async importBackup(jsonObj) {
    if (!jsonObj || typeof jsonObj !== 'object') {
      throw new Error('Format file backup tidak valid.');
    }
    if (Array.isArray(jsonObj.schedules)) await this.saveSchedules(jsonObj.schedules);
    if (Array.isArray(jsonObj.tasks)) await this.saveTasks(jsonObj.tasks);
    if (jsonObj.settings && typeof jsonObj.settings === 'object') {
      const current = await this.getSettings();
      await this.saveSettings({
        ...jsonObj.settings,
        gemini_api_key: current.gemini_api_key, // keep existing key
      });
    }
  },
};
