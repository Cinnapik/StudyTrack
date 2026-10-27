/** Сравнение вычислений старого алгоритма и общего индекса на одинаковом синтетическом наборе. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  defaultProfile,
  type Subject,
  type Lesson,
  type Work,
} from '../apps/mobile/src/domain/model';
import { indexStudy } from '../apps/mobile/src/domain/study-index';
import { subjectTeachers } from '../apps/mobile/src/domain/subject-matching';

// Synthetic unlinked schedule: deliberately exercises the costly matching path.
const subjects: Subject[] = Array.from({ length: 80 }, (_, i) => ({
  id: `subject-${i}`,
  name: `Учебная дисциплина ${i}`,
  semester: 1,
  teacher: '',
  control: 'credit',
  coursework: 'none',
  notes: '',
}));
const lessons: Lesson[] = subjects.slice(0, 30).map((s, i) => ({
  id: `lesson-${i}`,
  subjectId: null,
  subjectName: s.name,
  weekday: 1,
  teacher: `Преподаватель ${i}`,
  groupName: '',
  start: '09:00',
  end: '10:30',
  room: '',
  notes: '',
}));
const works: Work[] = subjects.flatMap((s) =>
  Array.from({ length: 30 }, (_, i) => ({
    id: `${s.id}-${i}`,
    subjectId: s.id,
    kind: 'lab',
    number: i + 1,
    position: i,
    title: `Лабораторная №${i + 1}`,
    status: 'not_started',
    issued: '',
    deadline: '',
    grade: '',
    comment: '',
    submitted: '',
  })),
);
const snapshot = { subjects, works, lessons, profile: defaultProfile };
const old = () =>
  subjects.map((s) => ({
    teacher: subjectTeachers(s, snapshot),
    works: works.filter((w) => w.subjectId === s.id),
  }));
const indexed = () => {
  const result = indexStudy(snapshot);
  return subjects.map((s) => ({
    teacher: result.teachersBySubject.get(s.id),
    works: result.worksBySubject.get(s.id),
  }));
};
assert.deepEqual(indexed(), old());
function measure(fn: () => unknown) {
  fn();
  return Array.from({ length: 5 }, () => {
    const t = performance.now();
    fn();
    return +(performance.now() - t).toFixed(2);
  });
}
console.log(
  JSON.stringify(
    {
      dataset: { subjects: subjects.length, works: works.length, unlinkedLessons: lessons.length },
      environment: `Node ${process.version}, host CPU; not Android frame time`,
      oldMs: measure(old),
      indexedMs: measure(indexed),
    },
    null,
    2,
  ),
);
