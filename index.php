<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BALAI — Holographic AI Assistant</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="assets/css/style.css" />
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/",
        "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.1.2/lib/three-vrm.module.min.js"
      }
    }
  </script>
</head>
<body data-theme="cyan">
  <!-- 3D Hologram Canvas -->
  <canvas id="hologram-canvas"></canvas>
  <div class="hud-scanlines"></div>

  <!-- Drag & Drop .VRM Overlay -->
  <div class="vrm-drop-overlay" id="vrm-drop-overlay">
    Lepaskan file avatar 3D (.VRM) di sini untuk memproyeksikan Hologram
  </div>

  <!-- Main Futuristic HUD Layer -->
  <div class="hud-layer">
    <!-- Top Header Bar -->
    <header class="top-bar">
      <div class="brand-cluster">
        <span class="brand-dot"></span>
        <span class="brand-title" id="brand-title">BALAI HOLOGRAM AI</span>
        <span class="status-pill" id="status-pill">Standby</span>
      </div>

      <div class="top-controls">
        <div class="clock-chip" id="live-clock">--:--:-- WIB</div>
        <button class="hud-btn active" id="toggle-left-btn" title="Tampilkan/Sembunyikan Jadwal">📅 Jadwal</button>
        <button class="hud-btn active" id="toggle-right-btn" title="Tampilkan/Sembunyikan Chat">💬 Log AI</button>
        <button class="hud-btn" id="vrm-upload-btn" title="Unggah Avatar Manusia 3D (.vrm)">🧍 Muat .VRM</button>
        <button class="hud-btn active" id="vrm-shader-btn" style="display:none;" title="Toggle Shader Hologram pada VRM">✨ Shader: Hologram</button>
        <button class="hud-btn" id="peppers-btn" title="Mode Piramida Hologram 4-Sisi (Pepper's Ghost)">🔺 Piramida</button>
        <a class="hud-btn" href="downloads/BALAI-Chrome-Extension.zip" download="BALAI-Chrome-Extension.zip" style="text-decoration:none;" title="Unduh BALAI sebagai Ekstensi Chrome untuk berbagai perangkat">🧩 Ekstensi Chrome</a>
        <button class="hud-btn" id="open-settings-btn" title="Pengaturan Gemini API & Suara">⚙️ Pengaturan</button>
        <input type="file" id="vrm-file-input" accept=".vrm" hidden />
      </div>
    </header>

    <!-- Middle Area: Left Schedule Panel | Center Hologram Stage | Right Chat Panel -->
    <main class="hud-main">
      <!-- Left HUD: Schedules & Tasks -->
      <aside class="hud-panel" id="left-panel">
        <div class="panel-header">
          <span class="panel-title">Database Jadwal &amp; Tugas</span>
          <button class="hud-btn" id="open-add-schedule-btn" style="padding:5px 10px;font-size:0.74rem;">+ Tambah</button>
        </div>
        <div class="tab-row">
          <button class="tab-btn active" id="tab-schedules">Jadwal</button>
          <button class="tab-btn" id="tab-tasks">Tugas</button>
        </div>
        <div class="panel-body" id="schedule-list"></div>
        <div class="panel-body" id="task-list" style="display:none;"></div>
      </aside>

      <!-- Center Transparent Stage Overlay -->
      <section class="center-stage-overlay">
        <div class="holo-preview-card hidden" id="holo-preview-card">
          <div class="holo-preview-header">
            <span id="holo-preview-title">PROYEKSI DATA</span>
            <button class="icon-mini-btn" id="close-preview-btn" title="Tutup">×</button>
          </div>
          <div class="holo-preview-list" id="holo-preview-list"></div>
        </div>
        <div class="subtitle-box empty" id="subtitle-box"></div>
      </section>

      <!-- Right HUD: Conversation Log -->
      <aside class="hud-panel" id="right-panel">
        <div class="panel-header">
          <span class="panel-title">Log Percakapan</span>
          <button class="icon-mini-btn" id="clear-chat-btn" title="Bersihkan Riwayat">🗑</button>
        </div>
        <div class="panel-body" id="chat-list"></div>
      </aside>
    </main>

    <!-- Bottom Voice & Command Dock -->
    <footer class="bottom-dock">
      <div class="quick-prompts">
        <button class="prompt-chip" data-prompt="Coba cek jadwal saya hari ini">📅 Cek jadwal hari ini</button>
        <button class="prompt-chip" data-prompt="Apa jadwal saya besok?">🗓️ Jadwal besok</button>
        <button class="prompt-chip" data-prompt="Cek daftar tugas saya yang belum selesai">✅ Cek tugas saya</button>
        <button class="prompt-chip" data-prompt="Tambah jadwal review kode besok jam 15:00">➕ Tambah jadwal cepat</button>
        <button class="prompt-chip" data-prompt="Jam berapa sekarang?">⏰ Cek jam &amp; ringkasan</button>
      </div>

      <div class="command-bar">
        <button class="mic-orb-btn" id="mic-btn" title="Klik untuk berbicara (Bahasa Indonesia)">🎙️</button>
        <input
          type="text"
          id="command-input"
          class="command-input"
          placeholder="Tanya lewat suara atau ketik di sini... (misal: coba cek jadwal saya hari ini)"
          autocomplete="off"
        />
        <button class="hud-btn" id="stop-speak-btn" style="display:none;border-radius:999px;">⏹ Diam</button>
        <button class="hud-btn" id="handsfree-btn" style="border-radius:999px;" title="Otomatis mendengarkan lagi setelah AI selesai bicara">🎙️ Auto-Listen</button>
        <button class="send-btn" id="send-btn">Kirim</button>
      </div>

      <div class="mode-banner" id="mode-banner">Memuat konfigurasi...</div>
    </footer>
  </div>

  <!-- Settings Modal -->
  <div class="modal-backdrop" id="settings-modal">
    <div class="modal-card">
      <div class="modal-header">
        <h2>⚙️ Pengaturan Hologram &amp; Gemini AI</h2>
        <button class="icon-mini-btn" id="close-settings-btn">×</button>
      </div>
      <form id="settings-form">
        <div class="form-group">
          <label for="set-assistant-name">Nama Asisten AI</label>
          <input type="text" id="set-assistant-name" class="form-control" value="BALAI" />
        </div>

        <div class="form-group">
          <label for="set-api-key">Gemini API Key</label>
          <input type="password" id="set-api-key" class="form-control" placeholder="Tempel API key baru (kosongkan jika tidak mengubah)" />
          <div class="hint-text">
            Status: <strong id="api-key-status">-</strong><br />
            Dapatkan gratis di <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>. Tanpa API key, mode lokal tetap bisa cek &amp; tambah jadwal.
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="set-model">Model Gemini</label>
            <select id="set-model" class="form-control">
              <option value="gemini-3-flash-preview">gemini-3-flash-preview (Cepat &amp; Cerdas)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Super Ringan)</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash (Terbaru)</option>
              <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Analisis Mendalam)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="set-theme">Warna Proyeksi Hologram</label>
            <select id="set-theme" class="form-control">
              <option value="cyan">Cyan Sci-Fi</option>
              <option value="violet">Violet Cortana</option>
              <option value="emerald">Emerald Matrix</option>
              <option value="gold">Gold Jarvis</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="set-voice">Suara Text-to-Speech</label>
          <select id="set-voice" class="form-control"></select>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="set-voice-rate">Kecepatan Bicara (0.7 - 1.4)</label>
            <input type="number" step="0.05" min="0.7" max="1.4" id="set-voice-rate" class="form-control" value="1.05" />
          </div>
          <div class="form-group">
            <label for="set-voice-pitch">Nada Suara / Pitch (0.7 - 1.4)</label>
            <input type="number" step="0.05" min="0.7" max="1.4" id="set-voice-pitch" class="form-control" value="1.0" />
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="hud-btn" id="reset-avatar-btn">Reset Avatar Bawaan</button>
          <button type="submit" class="send-btn">Simpan Pengaturan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Add Schedule / Task Modal -->
  <div class="modal-backdrop" id="add-modal">
    <div class="modal-card">
      <div class="modal-header">
        <h2>➕ Tambah Jadwal atau Tugas</h2>
        <button class="icon-mini-btn" id="close-add-modal-btn">×</button>
      </div>
      <form id="add-schedule-form">
        <div class="form-group">
          <label for="add-type">Tipe Data</label>
          <select id="add-type" class="form-control">
            <option value="schedule">Jadwal / Agenda</option>
            <option value="task">Tugas (To-Do)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="add-title">Judul</label>
          <input type="text" id="add-title" class="form-control" placeholder="Contoh: Meeting Klien / Selesaikan Presentasi" required />
        </div>

        <div id="schedule-only-fields">
          <div class="form-row">
            <div class="form-group">
              <label for="add-date">Tanggal</label>
              <input type="date" id="add-date" class="form-control" />
            </div>
            <div class="form-group">
              <label for="add-location">Lokasi / Link</label>
              <input type="text" id="add-location" class="form-control" placeholder="Google Meet / Kantor" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="add-start-time">Jam Mulai</label>
              <input type="time" id="add-start-time" class="form-control" value="09:00" />
            </div>
            <div class="form-group">
              <label for="add-end-time">Jam Selesai (Opsional)</label>
              <input type="time" id="add-end-time" class="form-control" />
            </div>
          </div>
        </div>

        <div id="task-only-fields" style="display:none;">
          <div class="form-row">
            <div class="form-group">
              <label for="add-due-date">Tenggat (Opsional)</label>
              <input type="date" id="add-due-date" class="form-control" />
            </div>
            <div class="form-group">
              <label for="add-priority">Prioritas</label>
              <select id="add-priority" class="form-control">
                <option value="high">Tinggi (High)</option>
                <option value="medium" selected>Sedang (Medium)</option>
                <option value="low">Rendah (Low)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="add-notes">Catatan</label>
            <input type="text" id="add-notes" class="form-control" placeholder="Catatan singkat tugas..." />
          </div>
        </div>

        <div class="modal-actions">
          <button type="submit" class="send-btn">Simpan ke Database</button>
        </div>
      </form>
    </div>
  </div>

  <script type="module" src="assets/js/app.js"></script>
</body>
</html>
