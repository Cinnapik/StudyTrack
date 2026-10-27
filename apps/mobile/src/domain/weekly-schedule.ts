/** Разбор дней и времени, проверка занятий и выбор расписания на календарную дату. */
import { normalizeName, type Lesson, type Subject } from './model';
import { matchingSubjects } from './subject-matching';
export const weekdays = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];
export function parseWeekday(value: string): number {
  const name = normalizeName(value).replace(/[.\s]/g, '');
  if (/^[1-7]$/.test(name)) return Number(name);
  return (
    weekdays.findIndex(
      (day, i) =>
        normalizeName(day) === name || ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][i] === name,
    ) + 1
  );
}
export function parseTime(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  if (/^0[.,]\d+$/.test(raw) || raw === '0') {
    const total = Math.round(Number(raw.replace(',', '.')) * 1440);
    if (total >= 1440) return '';
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  const match = /^(\d{1,2})[:.](\d{2})(?::00)?$/.exec(raw);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? `${match[1]!.padStart(2, '0')}:${match[2]}`
    : '';
}
export interface ScheduleRow {
  row: number;
  lesson: Lesson;
  include: boolean;
  errors: string[];
  duplicate: boolean;
}
export function scheduleErrors(lesson: Lesson): string[] {
  return [
    !lesson.weekday && 'Укажите день недели',
    !lesson.subjectName?.trim() && 'Укажите дисциплину',
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(lesson.start) && 'Укажите время начала',
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(lesson.end) && 'Укажите время окончания',
    !!lesson.start && !!lesson.end && lesson.end <= lesson.start && 'Окончание раньше начала',
  ].filter((v): v is string => typeof v === 'string');
}
export function subjectSuggestions(name: string, subjects: Subject[]): Subject[] {
  return matchingSubjects(name, subjects).suggestions;
}
export function lessonsForDate(lessons: Lesson[], date: Date): Lesson[] {
  return lessons
    .filter((l) => !l.date && l.weekday === (date.getDay() || 7))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
