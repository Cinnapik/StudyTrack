/** Разрешения Android, канал уведомлений, синхронизация расписания и обработка нажатий. */
import { Platform } from 'react-native';
import type { Snapshot } from '../domain/model';
import { planReminders } from '../domain/reminders';
import { reconcileReminders, type ReminderPort } from '../application/reminders';

const channelId = 'studytrack-deadlines';
async function native() {
  const api = await import('expo-notifications');
  api.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android')
    await api.setNotificationChannelAsync(channelId, {
      name: 'Учебные сроки',
      importance: api.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
    });
  return api;
}
export async function requestReminderPermission() {
  if (Platform.OS === 'web')
    throw new Error('Локальные уведомления доступны в Android-приложении.');
  const api = await native();
  const current = await api.getPermissionsAsync();
  const permission = current.granted ? current : await api.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      'Разрешение на уведомления не получено. Его можно включить в настройках Android.',
    );
}
// Последовательная синхронизация предотвращает гонки отмены и создания одних и тех же уведомлений.
let tail: Promise<unknown> = Promise.resolve();
export function syncReminders(snapshot: Snapshot): Promise<string> {
  const task = tail.then(async () => {
    if (Platform.OS === 'web') return 'Уведомления доступны на Android.';
    const api = await native();
    const granted = (await api.getPermissionsAsync()).granted;
    const desired = granted ? planReminders(snapshot) : [];
    const port: ReminderPort = {
      list: async () =>
        (await api.getAllScheduledNotificationsAsync()).map((r) => ({
          id: r.identifier,
          fingerprint: String(r.content.data?.fingerprint ?? ''),
        })),
      cancel: (id) => api.cancelScheduledNotificationAsync(id),
      schedule: async (r, fingerprint) => {
        await api.scheduleNotificationAsync({
          identifier: r.id,
          content: {
            title: r.title,
            body: r.body,
            sound: false,
            data: { fingerprint, workId: r.workId ?? null, subjectId: r.subjectId ?? null },
          },
          trigger: {
            type: api.SchedulableTriggerInputTypes.DATE,
            date: new Date(r.at),
            channelId,
            delivery: 'bestEffort',
          },
        });
      },
    };
    await reconcileReminders(port, desired);
    if (!snapshot.profile.reminders.enabled) return 'Напоминания выключены.';
    if (!granted)
      return 'Android не разрешает уведомления. Включите разрешение в настройках устройства.';
    return `Запланировано сводок: ${desired.length}. Android может задержать доставку в режиме энергосбережения.`;
  });
  tail = task.catch(() => undefined);
  return task;
}
export async function subscribeReminderTaps(open: (data: Record<string, unknown>) => void) {
  if (Platform.OS === 'web') return () => {};
  const api = await native();
  let last = '';
  const handle = (response: import('expo-notifications').NotificationResponse | null) => {
    if (!response || !response.notification.request.identifier.startsWith('studytrack-deadlines-'))
      return;
    const key = response.notification.request.identifier + ':' + response.notification.date;
    if (last === key) return;
    last = key;
    open(response.notification.request.content.data ?? {});
    void api.clearLastNotificationResponseAsync();
  };
  const subscription = api.addNotificationResponseReceivedListener(handle);
  handle(await api.getLastNotificationResponseAsync());
  return () => subscription.remove();
}
