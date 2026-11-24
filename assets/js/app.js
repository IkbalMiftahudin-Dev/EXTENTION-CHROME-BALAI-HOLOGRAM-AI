import { HologramEngine } from './hologram.js';
import { VoiceEngine } from './voice.js';

const SESSION_ID = 'main_session';

const dom = {
  canvas: document.getElementById('hologram-canvas'),
  brandTitle: document.getElementById('brand-title'),
  statusPill: document.getElementById('status-pill'),
  liveClock: document.getElementById('live-clock'),
  modeBanner: document.getElementById('mode-banner'),
  subtitleBox: document.getElementById('subtitle-box'),
  previewCard: document.getElementById('holo-preview-card'),
  previewTitle: document.getElementById('holo-preview-title'),
  previewList: document.getElementById('holo-preview-list'),
  closePreviewBtn: document.getElementById('close-preview-btn'),

  // Panels
  leftPanel: document.getElementById('left-panel'),
  rightPanel: document.getElementById('right-panel'),
  toggleLeftBtn: document.getElementById('toggle-left-btn'),
  toggleRightBtn: document.getElementById('toggle-right-btn'),
  scheduleList: document.getElementById('schedule-list'),
  taskList: document.getElementById('task-list'),
  tabSchedules: document.getElementById('tab-schedules'),
  tabTasks: document.getElementById('tab-tasks'),
  chatList: document.getElementById('chat-list'),

  // Controls
  commandInput: document.getElementById('command-input'),
  sendBtn: document.getElementById('send-btn'),
  micBtn: document.getElementById('mic-btn'),
  stopSpeakBtn: document.getElementById('stop-speak-btn'),
  handsFreeBtn: document.getElementById('handsfree-btn'),
  peppersBtn: document.getElementById('peppers-btn'),
  vrmInput: document.getElementById('vrm-file-input'),
  vrmBtn: document.getElementById('vrm-upload-btn'),
  vrmShaderToggleBtn: document.getElementById('vrm-shader-btn'),
  vrmDropOverlay: document.getElementById('vrm-drop-overlay'),
  openAddScheduleBtn: document.getElementById('open-add-schedule-btn'),
  openSettingsBtn: document.getElementById('open-settings-btn'),
  clearChatBtn: document.getElementById('clear-chat-btn'),

  // Settings Modal
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  settingsForm: document.getElementById('settings-form'),
  inputAssistantName: document.getElementById('set-assistant-name'),
  inputApiKey: document.getElementById('set-api-key'),
  apiKeyStatus: document.getElementById('api-key-status'),
  inputModel: document.getElementById('set-model'),
  inputTheme: document.getElementById('set-theme'),
  inputVoiceSelect: document.getElementById('set-voice'),
  inputVoiceRate: document.getElementById('set-voice-rate'),
  inputVoicePitch: document.getElementById('set-voice-pitch'),
  resetAvatarBtn: document.getElementById('reset-avatar-btn'),

  // Add Schedule / Task Modal
  addModal: document.getElementById('add-modal'),
  closeAddModalBtn: document.getElementById('close-add-modal-btn'),
  addScheduleForm: document.getElementById('add-schedule-form'),
  addTypeSelect: document.getElementById('add-type'),
  scheduleFields: document.getElementById('schedule-only-fields'),
  taskFields: document.getElementById('task-only-fields'),
};

let handsFreeMode = false;
let isBusy = false;
let currentSettings = {};
let activeLeftTab = 'schedules';

// 1. Initialize 3D Hologram Engine
const hologram = new HologramEngine(dom.canvas);

// 2. Initialize Indonesian Voice Engine
const voice = new VoiceEngine({
  onListeningStart() {
    setStatus('listening', 'Mendengarkan...');
    dom.micBtn.classList.add('listening');
    hologram.setState('listening');
    showSubtitle('Silakan berbicara... ("Coba cek jadwal saya hari ini")');
  },
  onListeningEnd() {
    dom.micBtn.classList.remove('listening');
    if (!isBusy && !voice.isSpeaking) {
      setStatus('idle', 'Standby');
      hologram.setState('idle');
    }
  },
  onInterimTranscript(text) {
    showSubtitle(`"${text}"`);
    dom.commandInput.value = text;
  },
  onFinalTranscript(text) {
    dom.commandInput.value = '';
    sendMessage(text);
  },
  onSpeechStart() {
    setStatus('speaking', 'Berbicara');
    hologram.setState('speaking');
    dom.stopSpeakBtn.style.display = 'inline-flex';
  },
  onSpeechEnd() {
    dom.stopSpeakBtn.style.display = 'none';
    if (!isBusy) {
      setStatus('idle', 'Standby');
      hologram.setState('idle');
    }
    if (handsFreeMode && !isBusy) {
      setTimeout(() => {
        if (handsFreeMode && !voice.isSpeaking && !isBusy) {
          voice.startListening();
        }
      }, 450);
    }
  },
  onLipSync(level, viseme) {
    hologram.setAudioLevel(level, viseme);
  },
  onError(msg) {
    showSubtitle(msg);
  },
});

function setStatus(state, label) {
  dom.statusPill.className = `status-pill ${state}`;
  dom.statusPill.textContent = label;
}

function showSubtitle(text) {
  if (!text) {
    dom.subtitleBox.textContent = '';
    dom.subtitleBox.classList.add('empty');
    return;
  }
  dom.subtitleBox.textContent = text;
  dom.subtitleBox.classList.remove('empty');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Live WIB Clock
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  dom.liveClock.textContent = `${dateStr} • ${timeStr} WIB`;
}
updateClock();
setInterval(updateClock, 1000);

// Load Initial Data (Settings, Chat History, Schedules & Tasks)
async function loadSettingsAndHistory() {
  try {
    const res = await fetch(`api/settings.php?session_id=${encodeURIComponent(SESSION_ID)}`);
    const data = await res.json();
    if (!data.ok) return;

    currentSettings = data.settings;
    dom.brandTitle.textContent = `${currentSettings.assistant_name || 'BALAI'} HOLOGRAM AI`;
    applyTheme(currentSettings.hologram_theme || 'cyan');

    voice.setVoiceConfig({
      rate: currentSettings.voice_rate,
      pitch: currentSettings.voice_pitch,
    });

    // Populate Settings Form
    dom.inputAssistantName.value = currentSettings.assistant_name || 'BALAI';
    dom.inputModel.value = currentSettings.gemini_model || 'gemini-3-flash-preview';
    dom.inputTheme.value = currentSettings.hologram_theme || 'cyan';
    dom.inputVoiceRate.value = currentSettings.voice_rate ?? 1.05;
    dom.inputVoicePitch.value = currentSettings.voice_pitch ?? 1.0;

    if (currentSettings.has_api_key) {
      dom.apiKeyStatus.textContent = `Aktif (${currentSettings.api_key_masked}, sumber: ${currentSettings.api_key_source})`;
      dom.modeBanner.innerHTML = `Engine: <strong>Gemini API (${escapeHtml(currentSettings.gemini_model)})</strong> • Tekan tombol Mic atau ketik perintah`;
    } else {
      dom.apiKeyStatus.textContent = 'Belum diatur (berjalan di Mode Lokal Dasar)';
      dom.modeBanner.innerHTML = `Mode Lokal Aktif (Cek/Tambah Jadwal & Tugas siap pakai) • <button type="button" id="banner-set-key">Pasang Gemini API Key untuk AI penuh</button>`;
      document.getElementById('banner-set-key')?.addEventListener('click', openSettingsModal);
    }

    // Render chat history
    dom.chatList.innerHTML = '';
    if (Array.isArray(data.history) && data.history.length > 0) {
      data.history.forEach((m) => appendChatBubble(m.role, m.content, m.tool_used, m.time_label));
    } else {
      appendChatBubble(
        'assistant',
        `Halo! Saya ${currentSettings.assistant_name || 'BALAI'}, asisten AI holografik Anda. Klik mikrofon lalu coba katakan: "Coba cek jadwal saya hari ini".`
      );
    }
  } catch (err) {
    console.error('Failed loading settings:', err);
  }
}

async function loadSchedulesAndTasks() {
  try {
    const res = await fetch('api/schedules.php');
    const data = await res.json();
    if (!data.ok) return;

    dom.tabSchedules.textContent = `Jadwal (${data.stats.today_schedules} hari ini)`;
    dom.tabTasks.textContent = `Tugas (${data.stats.pending_tasks})`;

    // Render schedules
    if (!data.schedules.length) {
      dom.scheduleList.innerHTML = `<div class="hint-text" style="padding:12px;text-align:center;">Belum ada jadwal tercatat.</div>`;
    } else {
      dom.scheduleList.innerHTML = data.schedules
        .map((s) => {
          const doneClass = s.status === 'done' ? 'done' : '';
          const todayClass = s.is_today ? 'today' : '';
          const timeRange = s.end_time ? `${s.start_time}–${s.end_time}` : s.start_time;
          return `
            <div class="data-card ${todayClass} ${doneClass}">
              <div class="data-card-top">
                <div class="data-card-title">${escapeHtml(s.title)}</div>
                <div class="card-actions">
                  <button class="icon-mini-btn" title="Tandai Selesai" data-action="toggle-schedule" data-id="${s.id}" data-status="${s.status === 'done' ? 'upcoming' : 'done'}">✓</button>
                  <button class="icon-mini-btn" title="Hapus" data-action="delete-schedule" data-id="${s.id}">×</button>
                </div>
              </div>
              <div class="data-card-meta">
                <span class="badge">${s.is_today ? 'Hari Ini' : escapeHtml(s.event_date)} • ${escapeHtml(timeRange)}</span>
                ${s.location ? `<span>📍 ${escapeHtml(s.location)}</span>` : ''}
              </div>
            </div>
          `;
        })
        .join('');
    }

    // Render tasks
    if (!data.tasks.length) {
      dom.taskList.innerHTML = `<div class="hint-text" style="padding:12px;text-align:center;">Belum ada tugas tercatat.</div>`;
    } else {
      dom.taskList.innerHTML = data.tasks
        .map((t) => {
          const completed = Number(t.is_completed) === 1;
          return `
            <div class="data-card ${completed ? 'done' : ''}">
              <div class="data-card-top">
                <div class="data-card-title">${escapeHtml(t.title)}</div>
                <div class="card-actions">
                  <button class="icon-mini-btn" title="Toggle Selesai" data-action="toggle-task" data-id="${t.id}" data-completed="${completed ? '0' : '1'}">${completed ? '↺' : '✓'}</button>
                  <button class="icon-mini-btn" title="Hapus" data-action="delete-task" data-id="${t.id}">×</button>
                </div>
              </div>
              <div class="data-card-meta">
                <span class="badge ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
                ${t.due_date ? `<span>📅 ${escapeHtml(t.due_date)}</span>` : ''}
              </div>
            </div>
          `;
        })
        .join('');
    }
  } catch (err) {
    console.error('Failed loading schedules:', err);
  }
}

function appendChatBubble(role, text, toolUsed = '', timeLabel = '') {
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  const nowTime =
    timeLabel ||
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const toolHtml = toolUsed
    ? `<span class="tool-tag">⚡ ${escapeHtml(toolUsed)}</span>`
    : '';
  div.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <div class="chat-meta"><span>${escapeHtml(nowTime)}</span>${toolHtml}</div>
  `;
  dom.chatList.appendChild(div);
  dom.chatList.scrollTop = dom.chatList.scrollHeight;
}

function showHoloDataPreview(preview) {
  if (!preview || !Array.isArray(preview.items)) {
    dom.previewCard.classList.add('hidden');
    return;
  }

  if (preview.type === 'schedules') {
    dom.previewTitle.textContent = `PROYEKSI JADWAL (${preview.count})`;
    dom.previewList.innerHTML = preview.items.length
      ? preview.items
          .map(
            (s) => `
          <div class="holo-preview-item">
            <span><strong>${escapeHtml(s.start_time)}</strong> • ${escapeHtml(s.title)}</span>
            <span style="color:var(--text-muted);font-size:0.74rem;">${escapeHtml(s.location || s.event_date)}</span>
          </div>`
          )
          .join('')
      : `<div class="hint-text">Tidak ada jadwal pada rentang waktu ini.</div>`;
    dom.previewCard.classList.remove('hidden');
  } else if (preview.type === 'tasks') {
    dom.previewTitle.textContent = `PROYEKSI TUGAS (${preview.count})`;
    dom.previewList.innerHTML = preview.items.length
      ? preview.items
          .map(
            (t) => `
          <div class="holo-preview-item">
            <span>${Number(t.is_completed) ? '✅' : '⬜'} ${escapeHtml(t.title)}</span>
            <span class="badge ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
          </div>`
          )
          .join('')
      : `<div class="hint-text">Semua tugas telah selesai!</div>`;
    dom.previewCard.classList.remove('hidden');
  }
}

async function sendMessage(message) {
  const clean = message.trim();
  if (!clean || isBusy) return;

  isBusy = true;
  voice.stopSpeaking();
  appendChatBubble('user', clean);
  setStatus('thinking', 'Memeriksa Data...');
  hologram.setState('thinking');
  hologram.setEmotion('thinking');
  showSubtitle('Memproses perintah dan memeriksa database...');

  try {
    const res = await fetch('api/chat.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: clean, session_id: SESSION_ID }),
    });
    const data = await res.json();

    if (!data.ok) {
      const errMsg = data.error || 'Gagal menghubungi server AI.';
      appendChatBubble('assistant', errMsg);
      showSubtitle(errMsg);
      hologram.setEmotion('alert');
      hologram.setState('idle');
      setStatus('idle', 'Standby');
      isBusy = false;
      return;
    }

    const toolList = (data.tool_calls || []).map((t) => t.name).join(', ');
    appendChatBubble('assistant', data.reply, toolList);
    showSubtitle(data.reply);
    hologram.setEmotion(data.emotion || 'neutral');

    if (data.data_preview) {
      showHoloDataPreview(data.data_preview);
    }
    if (data.mutates_data) {
      loadSchedulesAndTasks();
    }

    isBusy = false;
    voice.speak(data.reply);
  } catch (err) {
    const msg = 'Koneksi ke server gagal. Pastikan Apache & MySQL di XAMPP aktif.';
    appendChatBubble('assistant', msg);
    showSubtitle(msg);
    hologram.setState('idle');
    setStatus('idle', 'Error');
    isBusy = false;
  }
}

function applyTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  hologram.setTheme(themeName);
}

function populateVoiceDropdown() {
  const voices = voice.getVoices();
  if (!voices.length) return;
  dom.inputVoiceSelect.innerHTML =
    `<option value="">Otomatis (Bahasa Indonesia Terbaik)</option>` +
    voices
      .map(
        (v) =>
          `<option value="${escapeHtml(v.voiceURI)}" ${
            v.voiceURI === voice.selectedVoiceURI ? 'selected' : ''
          }>${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`
      )
      .join('');
}

function openSettingsModal() {
  populateVoiceDropdown();
  dom.inputApiKey.value = '';
  dom.settingsModal.classList.add('open');
}

// Event Bindings
dom.sendBtn.addEventListener('click', () => {
  const txt = dom.commandInput.value;
  dom.commandInput.value = '';
  sendMessage(txt);
});

dom.commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const txt = dom.commandInput.value;
    dom.commandInput.value = '';
    sendMessage(txt);
  }
});

dom.micBtn.addEventListener('click', () => {
  if (voice.isListening) {
    voice.stopListening();
  } else {
    voice.startListening();
  }
});

dom.stopSpeakBtn.addEventListener('click', () => {
  voice.stopSpeaking();
  setStatus('idle', 'Standby');
  hologram.setState('idle');
  dom.stopSpeakBtn.style.display = 'none';
});

dom.handsFreeBtn.addEventListener('click', () => {
  handsFreeMode = !handsFreeMode;
  dom.handsFreeBtn.classList.toggle('active', handsFreeMode);
  dom.handsFreeBtn.textContent = handsFreeMode ? '🎙️ Auto-Listen: ON' : '🎙️ Auto-Listen';
  if (handsFreeMode && !voice.isListening && !voice.isSpeaking) {
    voice.startListening();
  }
});

dom.peppersBtn.addEventListener('click', () => {
  const active = !document.body.classList.contains('peppers-ghost');
  document.body.classList.toggle('peppers-ghost', active);
  dom.peppersBtn.classList.toggle('active', active);
  hologram.setPeppersGhostMode(active);
});

dom.closePreviewBtn.addEventListener('click', () => {
  dom.previewCard.classList.add('hidden');
});

// Panel toggles
dom.toggleLeftBtn.addEventListener('click', () => {
  dom.leftPanel.classList.toggle('collapsed');
  dom.toggleLeftBtn.classList.toggle('active', !dom.leftPanel.classList.contains('collapsed'));
});

dom.toggleRightBtn.addEventListener('click', () => {
  dom.rightPanel.classList.toggle('collapsed');
  dom.toggleRightBtn.classList.toggle('active', !dom.rightPanel.classList.contains('collapsed'));
});

// Left panel tabs
dom.tabSchedules.addEventListener('click', () => {
  activeLeftTab = 'schedules';
  dom.tabSchedules.classList.add('active');
  dom.tabTasks.classList.remove('active');
  dom.scheduleList.style.display = 'flex';
  dom.taskList.style.display = 'none';
});

dom.tabTasks.addEventListener('click', () => {
  activeLeftTab = 'tasks';
  dom.tabTasks.classList.add('active');
  dom.tabSchedules.classList.remove('active');
  dom.taskList.style.display = 'flex';
  dom.scheduleList.style.display = 'none';
});

// Quick Prompt Chips
document.querySelectorAll('.prompt-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.getAttribute('data-prompt');
    if (prompt) sendMessage(prompt);
  });
});

// Inline Schedule & Task Actions
dom.leftPanel.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);

  if (action === 'toggle-schedule') {
    await fetch('api/schedules.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'schedule', id, status: btn.dataset.status }),
    });
  } else if (action === 'delete-schedule') {
    await fetch(`api/schedules.php?type=schedule&id=${id}`, { method: 'DELETE' });
  } else if (action === 'toggle-task') {
    await fetch('api/schedules.php', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'task', id, is_completed: btn.dataset.completed === '1' }),
    });
  } else if (action === 'delete-task') {
    await fetch(`api/schedules.php?type=task&id=${id}`, { method: 'DELETE' });
  }
  loadSchedulesAndTasks();
});

// VRM Avatar Upload & Drag-and-Drop
async function handleVrmFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.vrm')) {
    showSubtitle('Harap pilih file avatar 3D berformat .VRM');
    return;
  }
  showSubtitle(`Memuat avatar 3D "${file.name}" ke proyektor hologram...`);
  try {
    await hologram.loadVrmFromFile(file);
    dom.vrmShaderToggleBtn.style.display = 'inline-flex';
    showSubtitle(`Avatar "${file.name}" berhasil dimuat!`);
  } catch (err) {
    showSubtitle(`Gagal memuat VRM: ${err.message}`);
  }
}

dom.vrmBtn.addEventListener('click', () => dom.vrmInput.click());
dom.vrmInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleVrmFile(file);
  dom.vrmInput.value = '';
});

dom.vrmShaderToggleBtn.addEventListener('click', () => {
  const next = !hologram.vrmHologramShader;
  hologram.setVrmHologramShader(next);
  dom.vrmShaderToggleBtn.classList.toggle('active', next);
  dom.vrmShaderToggleBtn.textContent = next ? '✨ Shader: Hologram' : '🧍 Shader: Natural 3D';
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.vrmDropOverlay.classList.add('active');
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) dom.vrmDropOverlay.classList.remove('active');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.vrmDropOverlay.classList.remove('active');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleVrmFile(file);
});

// Settings Modal
dom.openSettingsBtn.addEventListener('click', openSettingsModal);
dom.closeSettingsBtn.addEventListener('click', () => dom.settingsModal.classList.remove('open'));
dom.settingsModal.addEventListener('click', (e) => {
  if (e.target === dom.settingsModal) dom.settingsModal.classList.remove('open');
});

dom.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    assistant_name: dom.inputAssistantName.value.trim() || 'BALAI',
    gemini_model: dom.inputModel.value,
    hologram_theme: dom.inputTheme.value,
    voice_rate: parseFloat(dom.inputVoiceRate.value) || 1.05,
    voice_pitch: parseFloat(dom.inputVoicePitch.value) || 1.0,
  };
  const newKey = dom.inputApiKey.value.trim();
  if (newKey) payload.gemini_api_key = newKey;

  await fetch('api/settings.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  voice.setVoiceConfig({
    rate: payload.voice_rate,
    pitch: payload.voice_pitch,
    voiceURI: dom.inputVoiceSelect.value,
  });

  dom.settingsModal.classList.remove('open');
  await loadSettingsAndHistory();
  showSubtitle('Pengaturan berhasil disimpan.');
});

dom.resetAvatarBtn.addEventListener('click', () => {
  hologram.resetToDefaultAvatar();
  dom.vrmShaderToggleBtn.style.display = 'none';
  dom.settingsModal.classList.remove('open');
  showSubtitle('Avatar dikembalikan ke Hologram Humanoid bawaan.');
});

dom.clearChatBtn.addEventListener('click', async () => {
  await fetch('api/settings.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear_chat', session_id: SESSION_ID }),
  });
  dom.chatList.innerHTML = '';
  appendChatBubble('assistant', 'Riwayat percakapan telah dibersihkan. Ada yang bisa saya bantu?');
});

// Add Schedule/Task Modal
dom.openAddScheduleBtn.addEventListener('click', () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  document.getElementById('add-date').value = todayIso;
  document.getElementById('add-due-date').value = todayIso;
  dom.addModal.classList.add('open');
});

dom.closeAddModalBtn.addEventListener('click', () => dom.addModal.classList.remove('open'));
dom.addModal.addEventListener('click', (e) => {
  if (e.target === dom.addModal) dom.addModal.classList.remove('open');
});

dom.addTypeSelect.addEventListener('change', () => {
  const isTask = dom.addTypeSelect.value === 'task';
  dom.scheduleFields.style.display = isTask ? 'none' : 'block';
  dom.taskFields.style.display = isTask ? 'block' : 'none';
});

dom.addScheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = dom.addTypeSelect.value;
  const title = document.getElementById('add-title').value.trim();
  if (!title) return;

  const payload =
    type === 'task'
      ? {
          type: 'task',
          title,
          due_date: document.getElementById('add-due-date').value || null,
          priority: document.getElementById('add-priority').value,
          notes: document.getElementById('add-notes').value.trim(),
        }
      : {
          type: 'schedule',
          title,
          event_date: document.getElementById('add-date').value,
          start_time: document.getElementById('add-start-time').value,
          end_time: document.getElementById('add-end-time').value || null,
          location: document.getElementById('add-location').value.trim(),
          category: 'general',
        };

  await fetch('api/schedules.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  dom.addScheduleForm.reset();
  dom.addModal.classList.remove('open');
  loadSchedulesAndTasks();
});

// Keyboard shortcut: Escape stops speech / exits Pepper's Ghost
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    voice.stopSpeaking();
    if (document.body.classList.contains('peppers-ghost')) {
      document.body.classList.remove('peppers-ghost');
      dom.peppersBtn.classList.remove('active');
      hologram.setPeppersGhostMode(false);
    }
  }
});

// Boot
loadSettingsAndHistory();
loadSchedulesAndTasks();
