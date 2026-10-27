/** Индекс работ и преподавателей в памяти. Перестраивается после обновления снимка данных. */
import { normalizeName, type Snapshot, type Work } from './model';
import { groupMatches, matchingSubjects } from './subject-matching';

/** Build once per snapshot, rather than scanning all works/subjects for every visible card. */
export function indexStudy(snapshot: Pick<Snapshot, 'subjects' | 'works' | 'lessons' | 'profile'>) {
  const worksBySubject = new Map<string, Work[]>();
  for (const work of snapshot.works) {
    const items = worksBySubject.get(work.subjectId);
    if (items) items.push(work);
    else worksBySubject.set(work.subjectId, [work]);
  }
  const subjects = snapshot.subjects.filter((s) => s.semester === snapshot.profile.semester);
  const imported = new Map<string, Map<string, string>>();
  for (const lesson of snapshot.lessons) {
    const teacher = lesson.teacher?.trim();
    if (lesson.date || !teacher || !groupMatches(lesson, snapshot.profile.groupName)) continue;
    const id =
      lesson.subjectId ??
      (lesson.linking !== 'independent'
        ? matchingSubjects(lesson.subjectName ?? '', subjects).automatic?.id
        : undefined);
    if (!id) continue;
    let names = imported.get(id);
    if (!names) imported.set(id, (names = new Map()));
    names.set(normalizeName(teacher), teacher);
  }
  const teachersBySubject = new Map(
    snapshot.subjects.map((s) => [
      s.id,
      s.teacher.trim() ? s.teacher : [...(imported.get(s.id)?.values() ?? [])].join('; '),
    ]),
  );
  return { worksBySubject, teachersBySubject };
}
