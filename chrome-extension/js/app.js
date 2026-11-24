import { HologramEngine } from './hologram.js';
import { VoiceEngine } from './voice.js';
import { BalaiStorage, getTodayIso } from './storage.js';
import { askBalai, executeBalaiTool } from './gemini.js';

const dom = {
  canvas: document.getElementById('hologram-canvas'),
  brandTitle: document.getElementById('brand-title'),
  statusPill: document.getElementById('status-pill'),
  modeBanner: document.getElementById('mode-banner'),
  subtitleBox: document.getElementById('subtitle-box'),
  previewCard: document.getElementById('holo-preview-card'),
  previewTitle: document.getElementById('holo-preview-title'),
  previewList: document.getElementById('holo-preview-list'),
  closePreviewBtn: document.getElementById('close-preview-btn'),
  micPermBanner: document.getElementById('mic-perm-banner'),
  grantMicBtn: document.getElementById('grant-mic-btn'),

  leftPanel: document.getElementById('left-panel'),
  rightPanel: document.getElementById('right-panel'),
  toggleLeftBtn: document.getElementById('toggle-left-btn'),
  toggleRightBtn: document.getElementById('toggle-right-btn'),
  closeLeftBtn: document.getElementById('close-left-btn'),
  closeRightBtn: document.getElementById('close-right-btn'),
  scheduleList: document.getElementById('schedule-list'),
  taskList: document.getElementById('task-list'),
  tabSchedules: document.getElementById('tab-schedules'),
  tabTasks: document.getElementById('tab-tasks'),
  chatList: document.getElementById('chat-list'),

  commandInput: document.getElementById('command-input'),
  sendBtn: document.getElementById('send-btn'),
  micBtn: document.getElementById('mic-btn'),
  stopSpeakBtn: document.getElementById('stop-speak-btn'),
  handsFreeBtn: document.getElementById('handsfree-btn'),
  peppersBtn: document.getElementById('peppers-btn'),
  expandTabBtn: document.getElementById('expand-tab-btn'),
  vrmInput: document.getElementById('vrm-file-input'),
  vrmBtn: document.getElementById('vrm-upload-btn'),
  vrmShaderToggleBtn: document.getElementById('vrm-shader-btn'),
  vrmDropOverlay: document.getElementById('vrm-drop-overlay'),
  openAddScheduleBtn: document.getElementById('open-add-schedule-btn'),
  openSettingsBtn: document.getElementById('open-settings-btn'),
  clearChatBtn: document.getElementById('clear-chat-btn'),

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
  exportBackupBtn: document.getElementById('export-backup-btn'),
  importBackupBtn: document.getElementById('import-backup-btn'),
  importFileInput: document.getElementById('import-file-input'),

  addModal: document.getElementById('add-modal'),
  closeAddModalBtn: document.getElementById('close-add-modal-btn'),
  addScheduleForm: document.getElementById('add-schedule-form'),
  addTypeSelect: document.getElementById('add-type'),
  scheduleFields: document.getElementById('schedule-only-fields'),
  taskFields: document.getElementById('task-only-fields'),
};

let handsFreeMode = false;
let isBusy = false;

// Show side panels automatically on wide desktop tab
if (window.innerWidth > 960) {
  dom.leftPanel.classList.remove('collapsed');
  dom.rightPanel.classList.remove('collapsed');
  dom.toggleLeftBtn.classList.add('active');
  dom.toggleRightBtn.classList.add('active');
}

const hologram = new HologramEngine(dom.canvas);

const voice = new VoiceEngine({
  onListeningStart() {
    dom.micPermBanner.classList.remove('show');
    setStatus('listening', 'Mendengarkan...');
    dom.micBtn.classList.add('listening');
    hologram.setState('listening');
    showSubtitle('Silakan bicara... ("Coba cek jadwal saya hari ini")');
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
    handleUserMessage(text);
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
        if (handsFreeMode && !voice.isSpeaking && !isBusy) voice.startListening();
      }, 450);
    }
  },
  onLipSync(level, viseme) {
    hologram.setAudioLevel(level, viseme);
  },
  onMicPermissionNeeded() {
    dom.micPermBanner.classList.add('show');
    showSubtitle('Klik "Izinkan Mikrofon" di atas agar BALAI bisa mendengar suara Anda.');
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

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  hologram.setTheme(theme);
}

async function renderSettingsAndChat() {
  const [settings, history] = await Promise.all([
    BalaiStorage.getSettings(),
    BalaiStorage.getChatHistory(),
  ]);

  const name = settings.assistant_name || 'BALAI';
  dom.brandTitle.textContent = name;
  applyTheme(settings.hologram_theme || 'cyan');

  voice.setVoiceConfig({
    rate: Number(settings.voice_rate) || 1.05,
    pitch: Number(settings.voice_pitch) || 1.0,
    voiceURI: settings.voice_uri || '',
  });

  dom.inputAssistantName.value = name;
  dom.inputModel.value = settings.gemini_model || 'gemini-3-flash-preview';
  dom.inputTheme.value = settings.hologram_theme || 'cyan';
  dom.inputVoiceRate.value = settings.voice_rate ?? 1.05;
  dom.inputVoicePitch.value = settings.voice_pitch ?? 1.0;

  const syncBadge = BalaiStorage.isChromeSync ? '☁️ Chrome Sync Aktif' : '💾 Mode Lokal';
  if (settings.gemini_api_key) {
    const k = settings.gemini_api_key;
    const masked = k.length > 10 ? `${k.slice(0, 6)}******${k.slice(-4)}` : '********';
    dom.apiKeyStatus.textContent = `Aktif (${masked})`;
    dom.modeBanner.innerHTML = `${syncBadge} • Gemini (${escapeHtml(settings.gemini_model)})`;
  } else {
    dom.apiKeyStatus.textContent = 'Belum diatur (Mode Lokal Aktif)';
    dom.modeBanner.innerHTML = `${syncBadge} • Mode Lokal • <button type="button" id="banner-set-key">Pasang Gemini API Key</button>`;
    document.getElementById('banner-set-key')?.addEventListener('click', openSettingsModal);
  }

  dom.chatList.innerHTML = '';
  if (history.length > 0) {
    history.forEach((m) => appendChatBubble(m.role, m.content, m.tool_used, m.time_label));
  } else {
    appendChatBubble(
      'assistant',
      `Halo! Saya ${name}, asisten AI holografik Anda di Chrome. Klik mikrofon lalu coba katakan: "Coba cek jadwal saya hari ini".`
    );
  }
}

async function renderSchedulesAndTasks() {
  const [schedules, tasks] = await Promise.all([
    BalaiStorage.getSchedules(),
    BalaiStorage.getTasks(),
  ]);
  const today = getTodayIso();
  const todayCount = schedules.filter((s) => s.event_date === today && s.status !== 'cancelled').length;
  const pendingCount = tasks.filter((t) => !t.is_completed).length;

  dom.tabSchedules.textContent = `Jadwal (${todayCount} hari ini)`;
  dom.tabTasks.textContent = `Tugas (${pendingCount})`;

  dom.scheduleList.innerHTML = schedules.length
    ? schedules
        .map((s) => {
          const isToday = s.event_date === today;
          const timeRange = s.end_time ? `${s.start_time}–${s.end_time}` : s.start_time;
          return `
            <div class="data-card ${isToday ? 'today' : ''} ${s.status === 'done' ? 'done' : ''}">
              <div class="data-card-top">
                <div class="data-card-title">${escapeHtml(s.title)}</div>
                <div class="card-actions">
                  <button class="icon-mini-btn" data-action="toggle-schedule" data-id="${s.id}" data-status="${s.status === 'done' ? 'upcoming' : 'done'}">✓</button>
                  <button class="icon-mini-btn" data-action="delete-schedule" data-id="${s.id}">×</button>
                </div>
              </div>
              <div class="data-card-meta">
                <span class="badge">${isToday ? 'Hari Ini' : escapeHtml(s.event_date)} • ${escapeHtml(timeRange)}</span>
                ${s.location ? `<span>📍 ${escapeHtml(s.location)}</span>` : ''}
              </div>
            </div>`;
        })
        .join('')
    : `<div class="hint-text" style="padding:12px;text-align:center;">Belum ada jadwal tercatat.</div>`;

  dom.taskList.innerHTML = tasks.length
    ? tasks
        .map(
          (t) => `
          <div class="data-card ${t.is_completed ? 'done' : ''}">
            <div class="data-card-top">
              <div class="data-card-title">${escapeHtml(t.title)}</div>
              <div class="card-actions">
                <button class="icon-mini-btn" data-action="toggle-task" data-id="${t.id}" data-completed="${t.is_completed ? '0' : '1'}">${t.is_completed ? '↺' : '✓'}</button>
                <button class="icon-mini-btn" data-action="delete-task" data-id="${t.id}">×</button>
              </div>
            </div>
            <div class="data-card-meta">
              <span class="badge ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
              ${t.due_date ? `<span>📅 ${escapeHtml(t.due_date)}</span>` : ''}
            </div>
          </div>`
        )
        .join('')
    : `<div class="hint-text" style="padding:12px;text-align:center;">Belum ada tugas tercatat.</div>`;
}

function appendChatBubble(role, text, toolUsed = '', timeLabel = '') {
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  const time = timeLabel || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const toolHtml = toolUsed ? `<span class="tool-tag">⚡ ${escapeHtml(toolUsed)}</span>` : '';
  div.innerHTML = `<div>${escapeHtml(text)}</div><div class="chat-meta"><span>${escapeHtml(time)}</span>${toolHtml}</div>`;
  dom.chatList.appendChild(div);
  dom.chatList.scrollTop = dom.chatList.scrollHeight;
}

function showHoloPreview(preview) {
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
            <span style="color:var(--text-muted);font-size:0.7rem;">${escapeHtml(s.location || s.event_date)}</span>
          </div>`
          )
          .join('')
      : `<div class="hint-text">Tidak ada jadwal di rentang ini.</div>`;
    dom.previewCard.classList.remove('hidden');
  } else if (preview.type === 'tasks') {
    dom.previewTitle.textContent = `PROYEKSI TUGAS (${preview.count})`;
    dom.previewList.innerHTML = preview.items.length
      ? preview.items
          .map(
            (t) => `
          <div class="holo-preview-item">
            <span>${t.is_completed ? '✅' : '⬜'} ${escapeHtml(t.title)}</span>
            <span class="badge ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
          </div>`
          )
          .join('')
      : `<div class="hint-text">Semua tugas sudah selesai!</div>`;
    dom.previewCard.classList.remove('hidden');
  }
}

async function handleUserMessage(message) {
  const clean = message.trim();
  if (!clean || isBusy) return;

  isBusy = true;
  voice.stopSpeaking();
  appendChatBubble('user', clean);
  setStatus('thinking', 'Memeriksa...');
  hologram.setState('thinking');
  hologram.setEmotion('thinking');
  showSubtitle('BALAI sedang memproses...');

  try {
    const res = await askBalai(clean);
    if (!res.ok) {
      appendChatBubble('assistant', res.error || 'Terjadi kesalahan.');
      showSubtitle(res.error || 'Terjadi kesalahan.');
      hologram.setEmotion('alert');
      hologram.setState('idle');
      setStatus('idle', 'Standby');
      isBusy = false;
      return;
    }

    const toolList = (res.toolCalls || []).map((t) => t.name).join(', ');
    appendChatBubble('assistant', res.reply, toolList);
    showSubtitle(res.reply);
    hologram.setEmotion(res.emotion || 'neutral');

    if (res.dataPreview) showHoloPreview(res.dataPreview);
    if (res.mutatesData) await renderSchedulesAndTasks();

    isBusy = false;
    voice.speak(res.reply);
  } catch (err) {
    const msg = `Gagal memproses: ${err.message}`;
    appendChatBubble('assistant', msg);
    showSubtitle(msg);
    hologram.setState('idle');
    setStatus('idle', 'Error');
    isBusy = false;
  }
}

function populateVoiceDropdown() {
  const voices = voice.getVoices();
  dom.inputVoiceSelect.innerHTML =
    `<option value="">Otomatis (Bahasa Indonesia Terbaik)</option>` +
    voices
      .map(
        (v) =>
          `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === voice.selectedVoiceURI ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`
      )
      .join('');
}

function openSettingsModal() {
  populateVoiceDropdown();
  dom.inputApiKey.value = '';
  dom.settingsModal.classList.add('open');
}

// Panel Toggle Helpers (auto-close opposite panel on narrow Side Panel)
function togglePanel(panel, btn, otherPanel, otherBtn) {
  const willOpen = panel.classList.contains('collapsed');
  if (willOpen && window.innerWidth <= 960) {
    otherPanel.classList.add('collapsed');
    otherBtn.classList.remove('active');
  }
  panel.classList.toggle('collapsed', !willOpen);
  btn.classList.toggle('active', willOpen);
}

dom.toggleLeftBtn.addEventListener('click', () =>
  togglePanel(dom.leftPanel, dom.toggleLeftBtn, dom.rightPanel, dom.toggleRightBtn)
);
dom.toggleRightBtn.addEventListener('click', () =>
  togglePanel(dom.rightPanel, dom.toggleRightBtn, dom.leftPanel, dom.toggleLeftBtn)
);
dom.closeLeftBtn.addEventListener('click', () => {
  dom.leftPanel.classList.add('collapsed');
  dom.toggleLeftBtn.classList.remove('active');
});
dom.closeRightBtn.addEventListener('click', () => {
  dom.rightPanel.classList.add('collapsed');
  dom.toggleRightBtn.classList.remove('active');
});

// Expand into full Chrome tab
dom.expandTabBtn.addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  } else {
    window.open(window.location.href, '_blank');
  }
});

// Grant mic permission helper tab
dom.grantMicBtn.addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') });
  } else {
    navigator.mediaDevices?.getUserMedia({ audio: true }).then(() => {
      dom.micPermBanner.classList.remove('show');
    });
  }
});

dom.sendBtn.addEventListener('click', () => {
  const txt = dom.commandInput.value;
  dom.commandInput.value = '';
  handleUserMessage(txt);
});
dom.commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const txt = dom.commandInput.value;
    dom.commandInput.value = '';
    handleUserMessage(txt);
  }
});
dom.micBtn.addEventListener('click', () => {
  if (voice.isListening) voice.stopListening();
  else voice.startListening();
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
  if (handsFreeMode && !voice.isListening && !voice.isSpeaking) voice.startListening();
});
dom.peppersBtn.addEventListener('click', () => {
  const active = !document.body.classList.contains('peppers-ghost');
  document.body.classList.toggle('peppers-ghost', active);
  dom.peppersBtn.classList.toggle('active', active);
  hologram.setPeppersGhostMode(active);
});
dom.closePreviewBtn.addEventListener('click', () => dom.previewCard.classList.add('hidden'));

dom.tabSchedules.addEventListener('click', () => {
  dom.tabSchedules.classList.add('active');
  dom.tabTasks.classList.remove('active');
  dom.scheduleList.style.display = 'flex';
  dom.taskList.style.display = 'none';
});
dom.tabTasks.addEventListener('click', () => {
  dom.tabTasks.classList.add('active');
  dom.tabSchedules.classList.remove('active');
  dom.taskList.style.display = 'flex';
  dom.scheduleList.style.display = 'none';
});

document.querySelectorAll('.prompt-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const p = chip.getAttribute('data-prompt');
    if (p) handleUserMessage(p);
  });
});

dom.leftPanel.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);
  if (action === 'toggle-schedule') {
    await executeBalaiTool('update_schedule_status', { schedule_id: id, status: btn.dataset.status });
  } else if (action === 'delete-schedule') {
    await executeBalaiTool('update_schedule_status', { schedule_id: id, status: 'delete' });
  } else if (action === 'toggle-task') {
    await executeBalaiTool('complete_task', { task_id: id, is_completed: btn.dataset.completed === '1' });
  } else if (action === 'delete-task') {
    const list = (await BalaiStorage.getTasks()).filter((t) => Number(t.id) !== id);
    await BalaiStorage.saveTasks(list);
  }
  await renderSchedulesAndTasks();
});

// VRM Upload & Drag-and-Drop
async function handleVrmFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.vrm')) {
    showSubtitle('Harap pilih file avatar 3D berformat .VRM');
    return;
  }
  showSubtitle(`Memuat avatar "${file.name}" ke BALAI...`);
  try {
    await hologram.loadVrmFromFile(file);
    dom.vrmShaderToggleBtn.style.display = 'inline-flex';
    showSubtitle(`Avatar "${file.name}" siap!`);
  } catch (err) {
    showSubtitle(`Gagal memuat VRM: ${err.message}`);
  }
}

dom.vrmBtn.addEventListener('click', () => dom.vrmInput.click());
dom.vrmInput.addEventListener('change', (e) => {
  if (e.target.files?.[0]) handleVrmFile(e.target.files[0]);
  dom.vrmInput.value = '';
});
dom.vrmShaderToggleBtn.addEventListener('click', () => {
  const next = !hologram.vrmHologramShader;
  hologram.setVrmHologramShader(next);
  dom.vrmShaderToggleBtn.classList.toggle('active', next);
});

window.addEventListener('dragover', (e) => { e.preventDefault(); dom.vrmDropOverlay.classList.add('active'); });
window.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) dom.vrmDropOverlay.classList.remove('active'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.vrmDropOverlay.classList.remove('active');
  if (e.dataTransfer?.files?.[0]) handleVrmFile(e.dataTransfer.files[0]);
});

// Settings Modal
dom.openSettingsBtn.addEventListener('click', openSettingsModal);
dom.closeSettingsBtn.addEventListener('click', () => dom.settingsModal.classList.remove('open'));
dom.settingsModal.addEventListener('click', (e) => { if (e.target === dom.settingsModal) dom.settingsModal.classList.remove('open'); });

dom.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const updates = {
    assistant_name: dom.inputAssistantName.value.trim() || 'BALAI',
    gemini_model: dom.inputModel.value,
    hologram_theme: dom.inputTheme.value,
    voice_rate: parseFloat(dom.inputVoiceRate.value) || 1.05,
    voice_pitch: parseFloat(dom.inputVoicePitch.value) || 1.0,
    voice_uri: dom.inputVoiceSelect.value,
  };
  const newKey = dom.inputApiKey.value.trim();
  if (newKey) updates.gemini_api_key = newKey;
  await BalaiStorage.saveSettings(updates);
  dom.settingsModal.classList.remove('open');
  await renderSettingsAndChat();
  showSubtitle('Pengaturan BALAI tersimpan & tersinkron.');
});

dom.resetAvatarBtn.addEventListener('click', () => {
  hologram.resetToDefaultAvatar();
  dom.vrmShaderToggleBtn.style.display = 'none';
  dom.settingsModal.classList.remove('open');
  showSubtitle('Avatar dikembalikan ke Hologram Humanoid BALAI.');
});

dom.exportBackupBtn.addEventListener('click', async () => {
  const backup = await BalaiStorage.exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `balai-backup-${getTodayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

dom.importBackupBtn.addEventListener('click', () => dom.importFileInput.click());
dom.importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    await BalaiStorage.importBackup(parsed);
    await renderSettingsAndChat();
    await renderSchedulesAndTasks();
    showSubtitle('Data backup BALAI berhasil diimpor!');
  } catch (err) {
    showSubtitle(`Gagal impor: ${err.message}`);
  }
  dom.importFileInput.value = '';
});

dom.clearChatBtn.addEventListener('click', async () => {
  await BalaiStorage.clearChat();
  dom.chatList.innerHTML = '';
  appendChatBubble('assistant', 'Riwayat percakapan BALAI telah dibersihkan.');
});

// Add Modal
dom.openAddScheduleBtn.addEventListener('click', () => {
  const todayIso = getTodayIso();
  document.getElementById('add-date').value = todayIso;
  document.getElementById('add-due-date').value = todayIso;
  dom.addModal.classList.add('open');
});
dom.closeAddModalBtn.addEventListener('click', () => dom.addModal.classList.remove('open'));
dom.addModal.addEventListener('click', (e) => { if (e.target === dom.addModal) dom.addModal.classList.remove('open'); });
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
  if (type === 'task') {
    await executeBalaiTool('add_task', {
      title,
      due_date: document.getElementById('add-due-date').value || '',
      priority: document.getElementById('add-priority').value,
      notes: document.getElementById('add-notes').value.trim(),
    });
  } else {
    await executeBalaiTool('add_schedule', {
      title,
      event_date: document.getElementById('add-date').value,
      start_time: document.getElementById('add-start-time').value,
      end_time: document.getElementById('add-end-time').value || '',
      location: document.getElementById('add-location').value.trim(),
    });
  }
  dom.addScheduleForm.reset();
  dom.addModal.classList.remove('open');
  await renderSchedulesAndTasks();
});

// Live Cross-Device / Cross-Tab Sync Listener
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener(() => {
    renderSchedulesAndTasks();
  });
}

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

// Boot BALAI
(async () => {
  await BalaiStorage.initIfNeeded();
  await renderSettingsAndChat();
  await renderSchedulesAndTasks();
})();
