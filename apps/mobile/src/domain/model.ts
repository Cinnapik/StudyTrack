/** Схемы данных и чистые правила: даты, статусы, прогресс и безопасное изменение количества работ. */
import { z } from 'zod';

export const statuses = {
  not_started: 'Не начато',
  in_progress: 'В процессе',
  done: 'Выполнено',
  submitted: 'Сдано',
  accepted: 'Принято',
  revision: 'На доработке',
} as const;
export const kinds = {
  lab: 'Лабораторная',
  practice: 'Практическая',
  control: 'Контрольная',
  coursework: 'Курсовая работа',
  project: 'Проект',
  other: 'Другое задание',
  unknown: 'Не уточнён',
} as const;
export const controls = {
  exam: 'Экзамен',
  credit: 'Зачёт',
  graded_credit: 'Дифзачёт',
  exam_coursework: 'Экзамен с курсовой',
  other: 'Другой контроль',
  none: 'Нет',
} as const;
export const outcomes = {
  unscheduled: 'Не назначен',
  pending: 'Ожидается',
  passed: 'Сдан',
  failed: 'Не сдан',
} as const;
export type Status = keyof typeof statuses;
export type Kind = keyof typeof kinds;
const text = z.string().trim().max(3000);
const id = z.string().min(1).max(100);
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const dateSchema = z
  .string()
  .refine((v) => v === '' || validDate(v), 'Дата должна быть в формате ГГГГ-ММ-ДД и существовать');
export const reminderSchema = z.object({
  enabled: z.boolean().default(false),
  daysBefore: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)]).default(1),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время: ЧЧ:ММ')
    .default('09:00'),
});
export type ReminderSettings = z.infer<typeof reminderSchema>;
export const profileSchema = z
  .object({
    lastName: text.optional(),
    firstName: text.optional(),
    patronymic: text.optional(),
    faculty: text.optional(),
    program: text.optional(),
    university: text,
    groupName: text,
    course: z.number().int().min(1).max(10),
    semester: z.number().int().min(1).max(20),
    startDate: dateSchema,
    endDate: dateSchema,
    onboarded: z.boolean(),
    theme: z.enum(['system', 'light', 'dark']),
    reminders: reminderSchema.default({ enabled: false, daysBefore: 1, time: '09:00' }),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    'Конец семестра раньше начала',
  );
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  university: '',
  groupName: '',
  course: 1,
  semester: 1,
  startDate: '',
  endDate: '',
  onboarded: false,
  theme: 'system',
  reminders: { enabled: false, daysBefore: 1, time: '09:00' },
};
export const subjectSchema = z.object({
  id,
  name: text.pipe(z.string().min(1, 'Введите название дисциплины').max(200)),
  teacher: text,
  semester: z.number().int().min(1).max(20),
  control: z.enum(['exam', 'credit', 'graded_credit', 'exam_coursework', 'other', 'none']),
  coursework: z.enum(['none', 'work', 'project', 'unknown']),
  notes: text,
  curriculum: z
    .object({
      sourceUrl: z.url(),
      course: z.number().int().min(1).max(10),
      totalHours: z.number().nonnegative().nullable(),
      lectureHours: z.number().nonnegative().nullable(),
      labHours: z.number().nonnegative().nullable(),
      practiceHours: z.number().nonnegative().nullable(),
      controlText: text,
    })
    .optional(),
});
export type Subject = z.infer<typeof subjectSchema>;
export const workSchema = z
  .object({
    id,
    subjectId: id,
    kind: z.enum(['lab', 'practice', 'control', 'coursework', 'project', 'other', 'unknown']),
    number: z.number().int().min(1).max(10000),
    title: text.pipe(z.string().min(1, 'Введите название работы').max(300)),
    issued: dateSchema,
    deadline: dateSchema,
    grade: text,
    comment: text,
    submitted: dateSchema,
    status: z.enum(['not_started', 'in_progress', 'done', 'submitted', 'accepted', 'revision']),
    position: z.number().int().min(0),
  })
  .refine((v) => !v.issued || !v.deadline || v.deadline >= v.issued, 'Дедлайн раньше даты выдачи');
export type Work = z.infer<typeof workSchema>;
export const assessmentSchema = z.object({
  subjectId: id,
  kind: z.enum(['final', 'coursework']),
  outcome: z.enum(['unscheduled', 'pending', 'passed', 'failed']),
  date: dateSchema,
  grade: text,
  notes: text,
});
export type Assessment = z.infer<typeof assessmentSchema>;
export const lessonSchema = z
  .object({
    id,
    subjectId: id.nullable(),
    subjectName: text.optional(),
    teacher: text.optional(),
    groupName: text.optional(),
    lessonType: text.optional(),
    linking: z.enum(['automatic', 'manual', 'independent']).optional(),
    weekday: z.number().int().min(0).max(7),
    date: dateSchema.optional(),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время: ЧЧ:ММ'),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время: ЧЧ:ММ'),
    room: text,
    notes: text,
  })
  .refine((v) => v.end > v.start, 'Окончание должно быть позже начала')
  .refine((v) => !!v.subjectId || !!v.subjectName?.trim(), 'Укажите дисциплину')
  .refine((v) => !!v.date || v.weekday >= 1, 'Выберите день недели или дату занятия')
  .transform((v) => ({
    ...v,
    weekday: v.date ? new Date(`${v.date}T12:00:00`).getDay() || 7 : v.weekday,
  }));
export type Lesson = z.infer<typeof lessonSchema>;
export const lessonOccursOn = (lesson: Lesson, day = new Date()) =>
  lesson.date ? lesson.date === localDate(day) : lesson.weekday === (day.getDay() || 7);
export const lessonSlot = (lesson: Lesson) =>
  `${lesson.subjectId ?? normalizeName(lesson.subjectName ?? '')}|${lesson.date || lesson.weekday}|${lesson.start}|${lesson.end}|${normalizeName(lesson.groupName ?? '')}|${normalizeName(lesson.room)}|${normalizeName(lesson.teacher ?? '')}|${normalizeName(lesson.lessonType ?? '')}`;
export const academicPlanSchema = z.object({
  url: z.url(),
  title: text,
  program: text,
  faculty: text,
  importedAt: z.iso.datetime(),
  subjects: z.array(subjectSchema).max(1000),
});
export type AcademicPlan = z.infer<typeof academicPlanSchema>;
export const historySchema = z.object({
  id,
  workId: id,
  fromStatus: z.enum(['not_started', 'in_progress', 'done', 'submitted', 'accepted', 'revision']),
  toStatus: z.enum(['not_started', 'in_progress', 'done', 'submitted', 'accepted', 'revision']),
  at: z.iso.datetime(),
});
export type History = z.infer<typeof historySchema>;
export interface Snapshot {
  profile: Profile;
  subjects: Subject[];
  works: Work[];
  assessments: Assessment[];
  lessons: Lesson[];
  history: History[];
  seeded: boolean;
  plans?: AcademicPlan[];
}
export type Counts = Record<'lab' | 'practice' | 'other' | 'unknown', number> &
  Partial<Record<'control' | 'coursework' | 'project', number>>;
export const emptyCounts = (): Counts => ({
  lab: 0,
  practice: 0,
  control: 0,
  coursework: 0,
  project: 0,
  other: 0,
  unknown: 0,
});
// Учебная дата берётся в локальном часовом поясе, без преобразования в UTC.
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
export const overdue = (work: Work, today = localDate()) =>
  !!work.deadline && work.deadline < today && !isCompleted(work);
// Выполнено, сдано и принято одинаково продвигают прогресс и очередь следующих работ.
export const isCompleted = (work: Pick<Work, 'status'>) =>
  ['done', 'submitted', 'accepted'].includes(work.status);
// Старый revision читается из истории, но не предлагается для новых изменений статуса.
export const activeStatuses = {
  not_started: statuses.not_started,
  in_progress: statuses.in_progress,
  done: statuses.done,
  submitted: statuses.submitted,
  accepted: statuses.accepted,
};
export function progress(works: Work[], today = localDate()) {
  const accepted = works.filter((w) => w.status === 'accepted').length;
  const completed = works.filter(isCompleted).length;
  return {
    total: works.length,
    accepted,
    completed,
    percent: works.length ? Math.round((completed / works.length) * 100) : null,
    waiting: works.filter((w) => w.status === 'submitted').length,
    overdue: works.filter((w) => overdue(w, today)).length,
    notStarted: works.filter((w) => w.status === 'not_started').length,
  };
}
export function countWorks(works: Work[]): Counts {
  return works.reduce((counts, w) => {
    counts[w.kind] = (counts[w.kind] ?? 0) + 1;
    return counts;
  }, emptyCounts());
}
export const untouched = (w: Work) =>
  w.status === 'not_started' &&
  !w.grade &&
  !w.comment &&
  !w.deadline &&
  !w.issued &&
  !w.submitted &&
  w.title === generatedTitle(w.kind, w.number);
export const generatedTitle = (kind: Kind, number: number) =>
  `${kind === 'unknown' ? 'Работа' : kinds[kind]} №${number}`;
// Уменьшение количества допускает только нетронутые заготовки без защищённой истории.
export function planCounts(
  works: Work[],
  counts: Counts,
  protectedIds: ReadonlySet<string> = new Set(),
) {
  const remove: Work[] = [];
  const add = emptyCounts();
  for (const kind of Object.keys(kinds) as Kind[]) {
    const count = counts[kind] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > 200)
      throw new Error('Количество работ должно быть целым числом от 0 до 200');
    const existing = works.filter((w) => w.kind === kind);
    if (count < existing.length) {
      const candidates = existing
        .filter((w) => untouched(w) && !protectedIds.has(w.id))
        .sort((a, b) => b.position - a.position)
        .slice(0, existing.length - count);
      if (candidates.length < existing.length - count)
        throw new Error(
          'Нельзя уменьшить количество: работы уже изменены. Измените их тип или удалите выбранную работу отдельно.',
        );
      remove.push(...candidates);
    } else add[kind] = count - existing.length;
  }
  return { remove, add };
}
export const nextStatus = (status: Status): Status =>
  (
    ({
      not_started: 'in_progress',
      in_progress: 'done',
      done: 'submitted',
      submitted: 'accepted',
      accepted: 'accepted',
      revision: 'in_progress',
    }) as const
  )[status];
