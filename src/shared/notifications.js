import { t } from '../core/i18n.js';
import { notificationRepository } from '../core/storage.js';

export function notify(key, request, values = {}) {
  const list = notificationRepository.all();
  list.unshift({
    id: crypto.randomUUID(),
    key,
    requestId: request?.id || null,
    values,
    at: new Date().toISOString(),
  });
  notificationRepository.save(list.slice(0, 30));
}

export function notificationText(notification) {
  if (notification.key) {
    const title = t(`notification.${notification.key}`);
    const textKey = `notification.${notification.key}Text`;
    const text = t(textKey, notification.values || {});
    return { title, text: text === textKey ? '' : text };
  }
  return { title: notification.title || '', text: notification.text || '' };
}

export function recentNotifications(limit = 4) {
  return notificationRepository.all().slice(0, limit);
}
