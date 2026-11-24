const btn = document.getElementById('request-mic-btn');
const statusEl = document.getElementById('perm-status');

btn.addEventListener('click', async () => {
  statusEl.textContent = 'Meminta izin mikrofon ke Chrome...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    statusEl.style.color = '#34d399';
    statusEl.textContent = '✅ Berhasil! Mikrofon BALAI sudah aktif. Anda bisa menutup tab ini dan kembali ke Side Panel BALAI.';
  } catch (err) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = `❌ Izin ditolak (${err.name}). Silakan klik ikon gembok/mikrofon di address bar Chrome lalu pilih Izinkan.`;
  }
});
