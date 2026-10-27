/** Проверка, восстановление и объединение резервных копий; экспорт журнала в CSV. */
import { z } from 'zod';
import {
  assessmentSchema,
  academicPlanSchema,
  historySchema,
  lessonSchema,
  normalizeName,
  lessonSlot,
  kinds,
  statuses,
  profileSchema,
  subjectSchema,
  workSchema,
  type Snapshot,
} from '../domain/model';
import type { StudyRepository } from '../persistence/repository';
const schema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.iso.datetime(),
  profile: profileSchema,
  seeded: z.boolean(),
  plans: z.array(academicPlanSchema).max(20).default([]),
  subjects: z.array(subjectSchema).max(500),
  works: z.array(workSchema).max(10000),
  assessments: z.array(assessmentSchema).max(1000),
  lessons: z.array(lessonSchema).max(5000),
  history: z.array(historySchema).max(100000),
});
export type Backup = z.infer<typeof schema>;
// Проверка структуры и уникальности выполняется до любых операций восстановления.
export function parseBackup(json: string): Backup {
  if (json.length > 20_000_000) throw new Error('Резервная копия слишком большая');
  let backup: Backup;
  try {
    backup = schema.parse(JSON.parse(json));
  } catch {
    throw new Error('Повреждённая резервная копия или неподдерживаемая версия');
  }
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (
    !unique(backup.subjects.map((s) => s.id)) ||
    !unique(backup.subjects.map((s) => `${s.semester}:${normalizeName(s.name)}`)) ||
    !unique(backup.works.map((w) => w.id)) ||
    !unique(backup.works.map((w) => JSON.stringify([w.subjectId, w.kind, w.number]))) ||
    !unique(backup.lessons.map((l) => l.id)) ||
    !unique(backup.history.map((h) => h.id)) ||
    !unique(backup.assessments.map((a) => `${a.subjectId}:${a.kind}`))
  )
    throw new Error('Копия содержит дубликаты');
  const subjects = new Set(backup.subjects.map((s) => s.id));
  const works = new Set(backup.works.map((w) => w.id));
  if (
    [...backup.works, ...backup.lessons, ...backup.assessments].some(
      (r) => r.subjectId !== null && !subjects.has(r.subjectId),
    ) ||
    backup.history.some((h) => !works.has(h.workId))
  )
    throw new Error('Копия содержит ссылки на отсутствующие записи');
  return backup;
}
export const exportBackup = (snapshot: Snapshot) =>
  JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...snapshot }, null, 2);
export async function restoreBackup(repo: StudyRepository, json: string, confirmed: boolean) {
  const backup = parseBackup(json);
  if (!confirmed) return; // Preview/cancel never mutates persistence.
  await repo.transaction(async (tx) => {
    await tx.clear();
    await tx.profile(backup.profile);
    await tx.setting('seeded', String(backup.seeded));
    await tx.setting('plans', JSON.stringify(backup.plans));
    for (const s of backup.subjects) await tx.subject(s);
    for (const w of backup.works) await tx.work(w);
    for (const a of backup.assessments) await tx.assessment(a);
    for (const l of backup.lessons) await tx.lesson(l);
    for (const h of backup.history) await tx.history(h);
  });
}
// Конфликт прерывает всю транзакцию: частично объединённая копия не сохраняется.
export async function mergeBackup(repo: StudyRepository, json: string, confirmed: boolean) {
  const backup = parseBackup(json);
  if (!confirmed) return;
  await repo.transaction(async (tx) => {
    const current = await tx.snapshot();
    const subjects = new Map<string, string>();
    const workIds = new Map<string, string>();
    const conflict = (name: string): never => {
      throw new Error(
        `Конфликт резервной копии: ${name}. Объединение отменено полностью; текущие данные сохранены.`,
      );
    };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (const s of backup.subjects) {
      const byId = current.subjects.find((v) => v.id === s.id);
      const byName = current.subjects.find(
        (v) => v.semester === s.semester && normalizeName(v.name) === normalizeName(s.name),
      );
      if (byId && byId.id !== byName?.id) conflict(s.name);
      const existing = byId ?? byName;
      subjects.set(s.id, existing?.id ?? s.id);
      if (!existing) {
        await tx.subject(s);
        current.subjects.push(s);
      }
      // Existing subject metadata and profile deliberately remain local.
    }
    for (const original of backup.works) {
      const w = { ...original, subjectId: subjects.get(original.subjectId)! };
      const existing =
        current.works.find((v) => v.id === w.id) ??
        current.works.find(
          (v) => v.subjectId === w.subjectId && v.kind === w.kind && v.number === w.number,
        );
      if (existing) {
        if (!same({ ...existing, id: w.id, position: w.position }, w)) conflict(w.title);
        workIds.set(original.id, existing.id);
      } else {
        workIds.set(original.id, w.id);
        w.position =
          Math.max(
            -1,
            ...current.works.filter((v) => v.subjectId === w.subjectId).map((v) => v.position),
          ) + 1;
        await tx.work(w);
        current.works.push(w);
      }
    }
    for (const original of backup.lessons) {
      const l = {
        ...original,
        subjectId: original.subjectId ? subjects.get(original.subjectId)! : null,
      };
      const existing =
        current.lessons.find((v) => v.id === l.id) ??
        current.lessons.find((v) => lessonSlot(v) === lessonSlot(l));
      if (existing) {
        if (
          !same({ ...existing, id: l.id, date: existing.date ?? '' }, { ...l, date: l.date ?? '' })
        )
          conflict('занятие');
      } else {
        await tx.lesson(l);
        current.lessons.push(l);
      }
    }
    for (const original of backup.assessments) {
      const a = { ...original, subjectId: subjects.get(original.subjectId)! };
      const existing = current.assessments.find(
        (v) => v.subjectId === a.subjectId && v.kind === a.kind,
      );
      if (existing && !same(existing, a)) conflict('аттестация / курсовая');
      if (!existing) {
        await tx.assessment(a);
        current.assessments.push(a);
      }
    }
    for (const original of backup.history) {
      const h = { ...original, workId: workIds.get(original.workId)! };
      const existing = current.history.find((v) => v.id === h.id);
      if (existing && !same(existing, h)) conflict('история статусов');
      if (!existing && !current.history.some((v) => same({ ...v, id: h.id }, h))) {
        await tx.history(h);
        current.history.push(h);
      }
    }
    const plans = [...(current.plans ?? [])];
    for (const p of backup.plans) {
      const old = plans.find((v) => v.url === p.url);
      if (old && !same(old, p)) conflict('учебный план');
      if (!old) plans.push(p);
    }
    await tx.setting('plans', JSON.stringify(plans));
    await tx.setting('seeded', String(current.seeded || backup.seeded));
  });
}
// Экспорт учитывает кавычки и значения, которые табличный редактор может принять за формулу.
export function exportCsv(snapshot: Snapshot) {
  const escape = (v: string) => `"${v.replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const rows = [
    ['Дисциплина', 'Работа', 'Тип', 'Статус', 'Дедлайн', 'Оценка'],
    ...snapshot.works.map((w) => [
      snapshot.subjects.find((s) => s.id === w.subjectId)?.name ?? '',
      w.title,
      kinds[w.kind],
      statuses[w.status],
      w.deadline,
      w.grade,
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(escape).join(';')).join('\r\n');
}
