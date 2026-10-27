/** Подготовка редактируемого черновика импорта без записи в базу. */
import type { ImportProposal } from '../../../../packages/contracts/src';
import {
  emptyCounts,
  normalizeName,
  type Counts,
  type Lesson,
  type Snapshot,
  type Subject,
} from './model';
export interface DraftSubject {
  subject: Subject;
  counts: Counts;
  include: boolean;
  action: 'new' | 'merge' | 'replace';
  targetId: string;
  reviewed: boolean;
  raw: string;
  hours: number | null;
}
export interface DraftLesson {
  lesson: Lesson;
  include: boolean;
  reviewed: boolean;
  raw: string;
}
export interface ImportDraft {
  subjects: DraftSubject[];
  lessons: DraftLesson[];
  warnings: string[];
}
export function makeDraft(
  result: ImportProposal,
  snapshot: Snapshot,
  id: () => string,
): ImportDraft {
  const subjects: DraftSubject[] = [];
  const warnings = [...result.warnings];
  for (const extracted of result.subjects) {
    const semester = extracted.semester ?? snapshot.profile.semester;
    if (
      subjects.some(
        (s) =>
          normalizeName(s.subject.name) === normalizeName(extracted.name) &&
          s.subject.semester === semester,
      )
    ) {
      warnings.push(
        `Повторная строка «${extracted.name}» не добавлена. Сверьте исходные значения.`,
      );
      continue;
    }
    const existing = snapshot.subjects.find(
      (s) => normalizeName(s.name) === normalizeName(extracted.name) && s.semester === semester,
    );
    subjects.push({
      subject: {
        id: id(),
        name: extracted.name,
        teacher: extracted.teacher ?? '',
        semester,
        control: extracted.control ?? 'none',
        coursework:
          extracted.coursework == null ? 'unknown' : extracted.coursework ? 'work' : 'none',
        notes: '',
      },
      counts: emptyCounts(),
      include: false,
      reviewed: false,
      action: existing ? 'merge' : 'new',
      targetId: existing?.id ?? '',
      raw: extracted.raw ?? '',
      hours: extracted.totalHours ?? null,
    });
  }
  const lessons = result.lessons.map((extracted) => {
    let subject = subjects.find(
      (s) => normalizeName(s.subject.name) === normalizeName(extracted.subjectName),
    );
    if (!subject) {
      const existing = snapshot.subjects.find(
        (s) =>
          s.semester === snapshot.profile.semester &&
          normalizeName(s.name) === normalizeName(extracted.subjectName),
      );
      subject = {
        subject: {
          id: id(),
          name: extracted.subjectName,
          teacher: '',
          semester: snapshot.profile.semester,
          control: 'none',
          coursework: 'unknown',
          notes: '',
        },
        counts: emptyCounts(),
        include: false,
        reviewed: false,
        action: existing ? 'merge' : 'new',
        targetId: existing?.id ?? '',
        raw: 'Предмет найден только в расписании — подтвердите добавление.',
        hours: null,
      };
      subjects.push(subject);
    }
    const raw = [
      extracted.raw,
      extracted.date ? `Разовое занятие: ${extracted.date}. Проверьте дату.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      lesson: {
        id: id(),
        subjectId: subject.subject.id,
        weekday: extracted.weekday ?? 0,
        date: extracted.date ?? '',
        start: extracted.start ?? '',
        end: extracted.end ?? '',
        room: '',
        notes: '',
      },
      include: false,
      reviewed: false,
      raw,
    };
  });
  return { subjects, lessons, warnings };
}
