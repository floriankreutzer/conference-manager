import { t } from '../core/i18n.js';

export function notificationText(notification) {
  if (notification?.key) {
    const title = t(`notification.${notification.key}`);
    const textKey = `notification.${notification.key}Text`;
    const text = t(textKey, notification.values || {});
    return { title, text: text === textKey ? '' : text };
  }
  return {
    title: typeof notification?.title === 'string' ? notification.title : '',
    text: typeof notification?.text === 'string' ? notification.text : '',
  };
}
