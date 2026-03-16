import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import app from '../config/firebase';
import { savePushToken, updateUserProfile } from './firebaseService';
import { requestNotificationPermission, isNotificationSupported } from './notificationService';

let foregroundListenerAttached = false;

const getTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (_) {
    return '';
  }
};

export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  isNotificationSupported() &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export const ensurePushRegistration = async (uid) => {
  if (!uid || !isPushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission' };
  }

  const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
  if (!vapidKey) {
    return { ok: false, reason: 'missing_vapid_key' };
  }

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });

  if (!token) return { ok: false, reason: 'missing_token' };

  const timeZone = getTimeZone();
  await Promise.all([
    savePushToken(uid, token, {
      userAgent: navigator.userAgent,
      platform: navigator.platform || '',
      timeZone
    }),
    updateUserProfile(uid, { timeZone })
  ]);

  return { ok: true, token };
};

export const ensureForegroundPushListener = (onPayload) => {
  if (foregroundListenerAttached) return;
  if (!isPushSupported()) return;
  try {
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      if (typeof onPayload === 'function') onPayload(payload);
    });
    foregroundListenerAttached = true;
  } catch (error) {
    console.error('Foreground messaging listener setup failed:', error);
  }
};
