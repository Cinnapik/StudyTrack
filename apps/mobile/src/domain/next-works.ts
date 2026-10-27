/** Выбор одной ближайшей незавершённой работы на дисциплину с общим ограничением количества. */
import { isCompleted, kinds, type Snapshot, type Work } from './model';

const kindOrder = Object.keys(kinds);
export function nextWorks(snapshot: Snapshot, limit = 5): Work[] {
  const current = snapshot.subjects.filter((s) => s.semester === snapshot.profile.semester);
  const rank = (a: Work, b: Work) =>
    (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
    kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
    a.number - b.number;
  return current
    .flatMap((s) => {
      const works = snapshot.works.filter((w) => w.subjectId === s.id && !isCompleted(w));
      const candidates = kindOrder
        .flatMap((kind) => {
          const first = works
            .filter((w) => w.kind === kind)
            .sort((a, b) => a.number - b.number || a.position - b.position)[0];
          return first ? [first] : [];
        })
        .sort(rank);
      return candidates[0] ? [candidates[0]] : [];
    })
    .sort(rank)
    .slice(0, limit);
}
