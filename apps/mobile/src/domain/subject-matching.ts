/** Сопоставление названий дисциплин и преподавателей с учётом неоднозначности, семестра и группы. */
import { normalizeName, type Lesson, type Snapshot, type Subject } from './model';

export function canonicalSubject(name: string): string {
  return normalizeName(name)
    .replace(/\bnet\b/gi, 'net')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/(^|\s)по$/gu, '$1программного обеспечения')
    .replace(/педогогик/gu, 'педагогик')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
// Расстояние Левенштейна вычисляется двумя строками, без полной матрицы в памяти.
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1]! + 1,
        row[j]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length]!;
}
export function matchingSubjects(name: string, subjects: Subject[]) {
  const key = canonicalSubject(name);
  if (!key) return { automatic: undefined, suggestions: [] as Subject[] };
  const ranked = subjects
    .map((subject) => {
      const other = canonicalSubject(subject.name);
      const score =
        key === other ? 1 : 1 - distance(key, other) / Math.max(key.length, other.length);
      return { subject, score, other };
    })
    .filter(
      (v) =>
        v.score >= 0.78 || (key.length >= 8 && (v.other.includes(key) || key.includes(v.other))),
    )
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  // Only a unique exact/expanded name or one-character typo is safe to link automatically.
  const safe =
    best &&
    (best.score === 1 ||
      (key.length >= 12 &&
        distance(key, best.other) <= 1 &&
        key.match(/\d+/g)?.join() === best.other.match(/\d+/g)?.join())) &&
    (!ranked[1] || best.score - ranked[1].score >= 0.08);
  return { automatic: safe ? best.subject : undefined, suggestions: ranked.map((v) => v.subject) };
}
export const groupMatches = (lesson: Lesson, group: string) =>
  !group.trim() ||
  !lesson.groupName?.trim() ||
  normalizeName(group) === normalizeName(lesson.groupName);

export function subjectTeachers(
  subject: Subject,
  snapshot: Pick<Snapshot, 'lessons' | 'profile' | 'subjects'>,
): string {
  // The persisted teacher remains the user's manual value. Imported names never overwrite it.
  if (subject.teacher.trim()) return subject.teacher;
  const subjects = snapshot.subjects.filter((s) => s.semester === subject.semester);
  const teachers = snapshot.lessons
    .filter(
      (l) =>
        !l.date &&
        groupMatches(l, snapshot.profile.groupName) &&
        (l.subjectId === subject.id ||
          (!l.subjectId &&
            subject.semester === snapshot.profile.semester &&
            l.linking !== 'independent' &&
            matchingSubjects(l.subjectName ?? '', subjects).automatic?.id === subject.id)),
    )
    .map((l) => l.teacher?.trim())
    .filter((v): v is string => !!v);
  return [...new Map(teachers.map((t) => [normalizeName(t), t])).values()].join('; ');
}
