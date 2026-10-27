/** Проверки индекса, сопоставления преподавателей, последовательностей и атомарной смены статусов. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { matchingSubjects, subjectTeachers } from '../apps/mobile/src/domain/subject-matching';
import { workSequences } from '../apps/mobile/src/domain/work-sequence';
import { indexStudy } from '../apps/mobile/src/domain/study-index';
import {
  defaultProfile,
  emptyCounts,
  type AcademicPlan,
  type Lesson,
  type Subject,
} from '../apps/mobile/src/domain/model';
import { TestDatabase } from './sqlite-adapter';
import { StudyRepository } from '../apps/mobile/src/persistence/repository';
import { StudyService } from '../apps/mobile/src/application/study-service';

const subject = (
  id = 'subject',
  name = 'Моделирование и анализ программного обеспечения',
): Subject => ({
  id,
  name,
  semester: 1,
  teacher: '',
  control: 'credit',
  coursework: 'none',
  notes: '',
});
const lesson = (teacher = 'Степанова Е.М.'): Lesson => ({
  id: randomUUID(),
  subjectId: null,
  subjectName: 'Моделирование и анализ ПО',
  weekday: 1,
  start: '09:00',
  end: '10:30',
  room: '',
  notes: '',
  teacher,
  groupName: 'QA-1',
});
async function setup() {
  const db = new TestDatabase();
  const repo = new StudyRepository(db);
  await repo.init();
  return { db, repo, service: new StudyService(repo, randomUUID) };
}
test('shared teacher index preserves matching, group, semester, dated and manual rules', () => {
  const subjects = [
    subject('a'),
    { ...subject('b'), semester: 2 },
    { ...subject('c', 'Физика'), teacher: 'Ручной преподаватель' },
    subject('d', 'Химия'),
  ];
  const lessons: Lesson[] = [
    lesson(),
    lesson('степанова е.м.'),
    { ...lesson('Другая группа'), groupName: 'QA-2' },
    { ...lesson('Старое занятие'), date: '2025-01-01' },
    { ...lesson('Не привязывать'), linking: 'independent' },
    { ...lesson('Связанный'), subjectId: 'b' },
    { ...lesson('Импорт'), subjectId: 'c' },
    { ...lesson('Без имени'), subjectName: '', teacher: '' },
  ];
  for (const semester of [1, 2, 3])
    for (const groupName of ['QA-1', 'QA-2', '']) {
      const snapshot = {
        subjects,
        lessons,
        works: [],
        profile: { ...defaultProfile, semester, groupName },
      };
      const index = indexStudy(snapshot);
      for (const s of subjects)
        assert.equal(index.teachersBySubject.get(s.id), subjectTeachers(s, snapshot));
    }
  const ambiguous = {
    subjects: [subject('a'), subject('duplicate')],
    lessons: [lesson()],
    works: [],
    profile: defaultProfile,
  };
  assert.equal(indexStudy(ambiguous).teachersBySubject.get('a'), '');
});
test('work index preserves original objects and order, and refreshes after mutation', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.saveSubject(subject('a'), { ...emptyCounts(), lab: 4 });
    await service.saveSubject(subject('b', 'Физика'), emptyCounts());
    const before = await repo.snapshot();
    const index = indexStudy(before);
    assert.deepEqual(index.worksBySubject.get('a'), before.works);
    assert.equal(index.worksBySubject.get('a')![0], before.works[0]);
    assert.equal(index.worksBySubject.has('b'), false);
    await service.setWorkStatuses([before.works[0]!.id], 'done');
    const after = indexStudy(await repo.snapshot());
    assert.equal(
      after.worksBySubject.get('a')!.find((w) => w.id === before.works[0]!.id)!.status,
      'done',
    );
    assert.equal(index.worksBySubject.get('a')![0]!.status, 'not_started');
  } finally {
    db.close();
  }
});
test('safe name matching expands abbreviations and rejects ambiguous/nearby disciplines', () => {
  const a = subject();
  assert.equal(matchingSubjects('  моделирование и анализ ПО ', [a]).automatic?.id, a.id);
  assert.equal(
    matchingSubjects('Моделирование и аналиэ программного обеспечения', [a]).automatic?.id,
    a.id,
  );
  assert.equal(matchingSubjects(a.name, [a, subject('other')]).automatic, undefined);
  assert.equal(
    matchingSubjects('Математический анализ', [
      subject('a', 'Математический анализ 1'),
      subject('b', 'Математический анализ 2'),
    ]).automatic,
    undefined,
  );
  assert.equal(matchingSubjects('Физика', [subject('a', 'Химия')]).automatic, undefined);
  assert.equal(
    matchingSubjects('Математический анализ 2', [subject('a', 'Математический анализ 1')])
      .automatic,
    undefined,
  );
});
for (const order of ['plan-first', 'schedule-first'])
  test('teacher linkage is independent of import order: ' + order, async () => {
    const { db, repo, service } = await setup();
    try {
      await service.saveProfile({ ...defaultProfile, groupName: 'QA-1' });
      const plan: AcademicPlan = {
        url: 'https://example.org/plan',
        title: 'Тест',
        program: '',
        faculty: '',
        importedAt: '2026-10-25T00:00:00Z',
        subjects: [subject()],
      };
      if (order === 'plan-first') await service.importPlan(plan, 1, ['subject'], true);
      await service.importWeekly([lesson()], 'merge', true);
      if (order === 'schedule-first') await service.importPlan(plan, 1, ['subject'], true);
      let snapshot = await repo.snapshot();
      const saved = snapshot.subjects[0]!;
      assert.equal(snapshot.lessons[0]!.subjectId, saved.id);
      assert.equal(subjectTeachers(saved, snapshot), 'Степанова Е.М.');
      await service.importWeekly([lesson()], 'merge', true);
      assert.equal((await repo.snapshot()).lessons.length, 1);
      await service.importWeekly([lesson('Другой преподаватель')], 'merge', true);
      snapshot = await repo.snapshot();
      assert.equal(subjectTeachers(saved, snapshot), 'Степанова Е.М.; Другой преподаватель');
      await service.saveSubject({ ...saved, teacher: 'Ручной выбор' }, emptyCounts());
      await service.importPlan(plan, 1, ['subject'], true);
      snapshot = await repo.snapshot();
      assert.equal(subjectTeachers(snapshot.subjects[0]!, snapshot), 'Ручной выбор');
      assert.equal(snapshot.subjects[0]!.teacher, 'Ручной выбор');
    } finally {
      db.close();
    }
  });
test('different group and explicit independent choice cannot be auto linked', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.saveProfile({ ...defaultProfile, groupName: 'QA-2' });
    await service.saveSubject(subject(), emptyCounts());
    await service.importWeekly([lesson()], 'merge', true);
    let snapshot = await repo.snapshot();
    assert.equal(snapshot.lessons[0]!.subjectId, null);
    assert.equal(subjectTeachers(snapshot.subjects[0]!, snapshot), '');
    await service.saveProfile({ ...defaultProfile, groupName: 'QA-1' });
    await service.importWeekly([{ ...lesson(), linking: 'independent' }], 'replace', true);
    snapshot = await repo.snapshot();
    assert.equal(snapshot.lessons[0]!.subjectId, null);
    assert.equal(subjectTeachers(snapshot.subjects[0]!, snapshot), '');
  } finally {
    db.close();
  }
});
test('bulk statuses are atomic, keep grades and histories, and sequence tolerates gaps', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.saveSubject(subject(), { ...emptyCounts(), lab: 8, practice: 2 });
    let snapshot = await repo.snapshot();
    const labs = snapshot.works.filter((w) => w.kind === 'lab');
    await service.saveWork({ ...labs[0]!, grade: '5', comment: 'Сохранить' });
    const before = await repo.snapshot();
    await assert.rejects(service.setWorkStatuses([labs[0]!.id, 'missing'], 'done'));
    assert.deepEqual(await repo.snapshot(), before);
    await service.setWorkStatuses([labs[0]!.id, labs[2]!.id], 'done');
    snapshot = await repo.snapshot();
    let sequence = workSequences(snapshot.works)[0]!;
    assert.equal(sequence.nextId, labs[1]!.id);
    assert.equal(sequence.completed, 2);
    assert.equal(snapshot.history.length, 2);
    assert.equal(snapshot.works.find((w) => w.id === labs[0]!.id)!.grade, '5');
    await service.setWorkStatuses([labs[0]!.id, labs[2]!.id], 'done');
    assert.equal((await repo.snapshot()).history.length, 2);
    await service.setWorkStatuses(
      labs.map((w) => w.id),
      'submitted',
    );
    snapshot = await repo.snapshot();
    sequence = workSequences(snapshot.works)[0]!;
    assert.equal(sequence.nextId, undefined);
    assert.equal(sequence.completed, 8);
    assert.ok(
      snapshot.works.filter((w) => w.kind === 'practice').every((w) => w.status === 'not_started'),
    );
    assert.ok(sequence.items.every((w) => !!w.submitted));
    await service.setWorkStatuses(
      labs.map((w) => w.id),
      'accepted',
    );
    assert.equal(workSequences((await repo.snapshot()).works)[0]!.completed, 8);
    await service.setWorkStatuses([labs[1]!.id], 'in_progress');
    assert.equal(workSequences((await repo.snapshot()).works)[0]!.nextId, labs[1]!.id);
  } finally {
    db.close();
  }
});
