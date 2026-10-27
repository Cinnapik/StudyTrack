/** Согласование рассчитанных напоминаний с запланированными уведомлениями через независимый от платформы порт. */
import type { Reminder } from '../domain/reminders';

export interface ReminderPort {
  list(): Promise<{ id: string; fingerprint: string }[]>;
  cancel(id: string): Promise<void>;
  schedule(reminder: Reminder, fingerprint: string): Promise<void>;
}
export const reminderFingerprint = (r: Reminder) =>
  JSON.stringify([r.at, r.title, r.body, r.workId, r.subjectId]);
// Idempotent reconciliation keeps pending OS notifications across app restarts.
export async function reconcileReminders(port: ReminderPort, desired: Reminder[]) {
  const existing = await port.list();
  const byId = new Map(desired.map((r) => [r.id, r]));
  for (const item of existing) {
    if (!item.id.startsWith('studytrack-deadlines-')) continue;
    const wanted = byId.get(item.id);
    if (!wanted || item.fingerprint !== reminderFingerprint(wanted)) await port.cancel(item.id);
  }
  for (const reminder of desired) {
    const fingerprint = reminderFingerprint(reminder);
    if (!existing.some((r) => r.id === reminder.id && r.fingerprint === fingerprint))
      await port.schedule(reminder, fingerprint);
  }
}
