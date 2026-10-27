/** Расчёт локальных сводок по срокам без обращения к системным API. */
import { isCompleted, localDate, reminderSchema, type Snapshot } from './model';

export interface Reminder {
  id: string;
  at: number;
  title: string;
  body: string;
  workId?: string;
  subjectId?: string;
}
// One digest per calendar day. No catch-up bursts for elapsed reminders.
export function planReminders(snapshot: Snapshot, now = new Date()): Reminder[] {
  const settings = reminderSchema.parse(snapshot.profile.reminders);
  if (!settings.enabled) return [];
  const groups = new Map<
    string,
    { at: number; names: string[]; targets: { workId?: string; subjectId?: string }[] }
  >();
  const add = (date: string, name: string, target: { workId?: string; subjectId?: string }) => {
    if (!date) return;
    const at = new Date(`${date}T${settings.time}:00`);
    at.setDate(at.getDate() - settings.daysBefore);
    if (!Number.isFinite(at.getTime()) || at.getTime() <= now.getTime()) return;
    const key = localDate(at);
    const group = groups.get(key) ?? { at: at.getTime(), names: [], targets: [] };
    group.names.push(name);
    group.targets.push(target);
    groups.set(key, group);
  };
  const subjectName = (id: string) => snapshot.subjects.find((s) => s.id === id)?.name ?? '';
  for (const work of snapshot.works) {
    if (!isCompleted(work))
      add(work.deadline, `${subjectName(work.subjectId)}: ${work.title}`, { workId: work.id });
  }
  for (const assessment of snapshot.assessments) {
    if (assessment.outcome === 'passed') continue;
    const subject = snapshot.subjects.find((s) => s.id === assessment.subjectId);
    if (
      !subject ||
      (assessment.kind === 'coursework'
        ? subject.coursework === 'none'
        : subject.control === 'none')
    )
      continue;
    add(
      assessment.date,
      `${subject.name}: ${assessment.kind === 'coursework' ? 'курсовая' : 'аттестация'}`,
      { subjectId: subject.id },
    );
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, 32)
    .map(([day, group]) => ({
      id: `studytrack-deadlines-${day}`,
      at: group.at,
      ...(group.targets.length === 1 ? group.targets[0] : {}),
      title:
        settings.daysBefore === 0
          ? 'StudyTrack · сроки сегодня'
          : `StudyTrack · до сроков ${settings.daysBefore} дн.`,
      body: `${group.names.length} срок(ов): ${group.names.slice().sort().slice(0, 3).join('; ')}${group.names.length > 3 ? '; …' : ''}`.slice(
        0,
        500,
      ),
    }));
}
