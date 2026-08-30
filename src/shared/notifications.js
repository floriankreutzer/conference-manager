import { notificationRepository } from '../core/storage.js';
import { notificationText } from './notification-presentation.js';

export { notificationText };

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

export function recentNotifications(limit = 4) {
  return notificationRepository.all().slice(0, limit);
}
