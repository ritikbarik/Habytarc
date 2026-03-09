export const isNotificationSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
  } catch (_) {
    return 'denied';
  }
};

const sendViaServiceWorker = async (title, options) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
    if (!reg || typeof reg.showNotification !== 'function') return false;
    await reg.showNotification(title, options || {});
    return true;
  } catch (_) {
    return false;
  }
};

export const sendAppNotification = async (title, options = {}) => {
  if (!isNotificationSupported()) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission' };
  }

  try {
    // Constructor works in most desktop browsers.
    new Notification(title, options);
    return { ok: true };
  } catch (_) {
    // Fallback for environments that require SW notification API.
    const swOk = await sendViaServiceWorker(title, options);
    return swOk ? { ok: true } : { ok: false, reason: 'delivery' };
  }
};
