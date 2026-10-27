/** Группировка работ по типам и номерам; первая незавершённая работа определяется независимо от пропусков. */
import { isCompleted, kinds, type Kind, type Work } from './model';

export function workSequences(works: Work[]) {
  return (Object.keys(kinds) as Kind[]).flatMap((kind) => {
    const items = works
      .filter((w) => w.kind === kind)
      .sort((a, b) => a.number - b.number || a.position - b.position || a.id.localeCompare(b.id));
    return items.length
      ? [
          {
            kind,
            items,
            completed: items.filter(isCompleted).length,
            nextId: items.find((w) => !isCompleted(w))?.id,
          },
        ]
      : [];
  });
}
