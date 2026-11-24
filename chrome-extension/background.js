/**
 * BALAI Chrome Extension Service Worker (Manifest V3)
 * - Opens BALAI 3D Hologram in Chrome Side Panel when toolbar icon is clicked.
 * - Checks upcoming schedules every minute and sends desktop reminder notifications.
 */

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  chrome.alarms.create('balai_schedule_reminder', { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  chrome.alarms.create('balai_schedule_reminder', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'balai_schedule_reminder') return;
  try {
    const syncData = await chrome.storage.sync.get(['balai_schedules']);
    const localData = await chrome.storage.local.get(['balai_notified_ids']);
    const schedules = Array.isArray(syncData.balai_schedules) ? syncData.balai_schedules : [];
    const notified = localData.balai_notified_ids || {};

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let changed = false;
    for (const s of schedules) {
      if (s.status !== 'upcoming' || s.event_date !== todayIso) continue;
      const [hh, mm] = String(s.start_time || '00:00').split(':').map(Number);
      const schedMinutes = hh * 60 + mm;
      const diff = schedMinutes - nowMinutes;
      const key = `${s.id}_${s.event_date}_${s.start_time}`;

      // Notify 0 to 10 minutes before schedule starts
      if (diff >= 0 && diff <= 10 && !notified[key]) {
        notified[key] = Date.now();
        changed = true;
        chrome.notifications.create(`balai_${s.id}_${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `BALAI Pengingat Jadwal (${s.start_time})`,
          message: `${s.title}${s.location ? ' — ' + s.location : ''}`,
          priority: 2,
        });
      }
    }

    if (changed) {
      await chrome.storage.local.set({ balai_notified_ids: notified });
    }
  } catch {
    // ignore background alarm errors
  }
});
