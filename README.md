# BALAI — Holographic AI Assistant (Chrome Extension & Web App)

**BALAI** adalah asisten AI holografik 3D berbentuk manusia dengan interaksi suara Bahasa Indonesia (*Speech-to-Text*, *Text-to-Speech*, dan *Lip-Sync*), pengingat jadwal & tugas otomatis, dukungan avatar `.VRM`, serta mode proyeksi piramida 4-sisi (*Pepper's Ghost*).

---

## 1. Cara Pasang Ekstensi Chrome BALAI (Berbagai Perangkat)

Ekstensi **BALAI** berjalan **100% mandiri** (tidak butuh XAMPP di perangkat lain) dan otomatis menyinkronkan jadwal, tugas, serta pengaturan ke semua perangkat Chrome Anda melalui `chrome.storage.sync`.

1. Unduh file **`downloads/BALAI-Chrome-Extension.zip`** (atau langsung gunakan folder **`chrome-extension/`**).
2. Ekstrak file `.zip` tersebut ke folder mana saja di komputer/laptop/Chromebook Anda.
3. Buka Google Chrome / Microsoft Edge / Brave, lalu ketik di address bar:
   ```
   chrome://extensions
   ```
4. Aktifkan **Developer mode** (Mode Pengembang) di pojok kanan atas.
5. Klik **Load unpacked** (Muat yang belum dibuka paketnya), lalu pilih folder hasil ekstrak (yang berisi file `manifest.json`).
6. Pin ikon **BALAI** di toolbar Chrome lalu klik untuk membuka **BALAI Hologram AI** di Chrome Side Panel!
7. *(Opsional)* Klik tombol **⚙️ Pengaturan** → masukkan **Gemini API Key** (gratis dari https://aistudio.google.com/apikey) agar BALAI bisa berdialog bebas dengan Gemini Function Calling. Tanpa API key, BALAI tetap bisa cek & tambah jadwal/tugas di Mode Lokal.

> **Tips Mikrofon di Side Panel:** Saat pertama kali klik tombol mikrofon di Side Panel, klik **"Izinkan Mikrofon"** sekali saja agar Chrome memberikan izin mikrofon ke ekstensi BALAI.

---

## 2. Distribusi ke Banyak Perangkat / Publik

- **Antar perangkat pribadi (Windows, Mac, Linux, Chromebook):** Cukup salin/unduh `BALAI-Chrome-Extension.zip` lalu *Load unpacked*. Selama login akun Google Chrome yang sama, jadwal & tugas BALAI otomatis sinkron.
- **Publikasi ke Chrome Web Store (agar siapa saja bisa klik 1 tombol "Add to Chrome"):** File `downloads/BALAI-Chrome-Extension.zip` sudah menggunakan **Manifest V3** dengan seluruh aset lokal (tanpa CDN eksternal) sehingga siap langsung diunggah ke Chrome Web Store Developer Dashboard.

---

## 3. Versi Web Lokal (XAMPP)

Buka `http://localhost/hologram-AI/` — di pojok kanan atas juga tersedia tombol **🧩 Ekstensi Chrome** untuk mengunduh paket `.zip` BALAI secara langsung.
