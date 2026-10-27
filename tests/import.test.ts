/** Проверки черновиков импорта, подтверждения строк и сохранения данных при объединении. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TestDatabase } from './sqlite-adapter';
import { StudyRepository } from '../apps/mobile/src/persistence/repository';
import { StudyService } from '../apps/mobile/src/application/study-service';
import { makeDraft } from '../apps/mobile/src/domain/import-draft';
import { countWorks, emptyCounts, lessonOccursOn } from '../apps/mobile/src/domain/model';
import { readFileSync } from 'node:fs';
import { exportBackup, mergeBackup } from '../apps/mobile/src/application/backup';
import { parseImportProposal } from '../apps/mobile/src/integrations/import-proposal';

async function setup() {
  const db = new TestDatabase();
  const repo = new StudyRepository(db);
  await repo.init();
  const service = new StudyService(repo, randomUUID);
  return { db, repo, service };
}
const response = () =>
  parseImportProposal(
    JSON.stringify({
      documentType: 'curriculum',
      subjects: [{ name: 'Алгоритмы', totalHours: 72, needsReview: true }],
      lessons: [{ subjectName: 'Неизвестный предмет', needsReview: true }],
      warnings: ['Уточнить время'],
    }),
  );
test('fixture validates and dated lessons stay one-off through import and reload', async () => {
  const { db, repo, service } = await setup();
  try {
    const result = parseImportProposal(readFileSync('tests/fixtures/import-partial.json', 'utf8'));
    result.lessons[0]!.date = '2026-11-03';
    const draft = makeDraft(result, await repo.snapshot(), randomUUID);
    draft.subjects[0]!.include = draft.subjects[0]!.reviewed = true;
    draft.lessons[0]!.include = draft.lessons[0]!.reviewed = true;
    await service.applyImport(draft, true);
    const lesson = (await repo.snapshot()).lessons[0]!;
    assert.equal(lesson.weekday, 2);
    assert.ok(lessonOccursOn(lesson, new Date(2026, 10, 3)));
    assert.ok(!lessonOccursOn(lesson, new Date(2026, 10, 10)));
  } finally {
    db.close();
  }
});
test('backup merge is idempotent and conflicting statuses roll back new subjects too', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const original = await repo.snapshot();
    await mergeBackup(repo, exportBackup(original), true);
    assert.deepEqual(await repo.snapshot(), original);
    const incoming = structuredClone(original);
    incoming.subjects.push({ ...incoming.subjects[0]!, id: randomUUID(), name: 'Новая из копии' });
    incoming.works[0]!.status = 'accepted';
    await assert.rejects(mergeBackup(repo, exportBackup(incoming), true), /Конфликт/);
    assert.deepEqual(await repo.snapshot(), original);
    incoming.works[0]!.status = original.works[0]!.status;
    await mergeBackup(repo, exportBackup(incoming), false);
    assert.deepEqual(await repo.snapshot(), original);
    await mergeBackup(repo, exportBackup(incoming), true);
    assert.equal((await repo.snapshot()).subjects.length, 9);
  } finally {
    db.close();
  }
});
test('draft does not invent work counts or silently include unknown subjects', async () => {
  const { db, repo, service } = await setup();
  try {
    const draft = makeDraft(response(), await repo.snapshot(), randomUUID);
    assert.equal(draft.subjects.length, 2);
    assert.equal(draft.subjects[0]!.counts.lab, 0);
    assert.equal(draft.subjects[0]!.hours, 72);
    assert.ok(draft.subjects.every((s) => !s.include && !s.reviewed));
    assert.equal(draft.lessons[0]!.lesson.weekday, 0);
    await service.applyImport(draft, false);
    assert.equal((await repo.snapshot()).subjects.length, 0);
  } finally {
    db.close();
  }
});
test('unreviewed and invalid imports roll back all rows; corrected import generates works', async () => {
  const { db, repo, service } = await setup();
  try {
    const draft = makeDraft(response(), await repo.snapshot(), randomUUID);
    draft.subjects[0]!.include = true;
    await assert.rejects(service.applyImport(draft, true));
    draft.subjects[0]!.reviewed = true;
    draft.subjects[0]!.counts.lab = 2;
    draft.lessons[0]!.include = true;
    draft.lessons[0]!.reviewed = true;
    await assert.rejects(service.applyImport(draft, true));
    assert.equal((await repo.snapshot()).subjects.length, 0);
    draft.lessons[0]!.include = false;
    await service.applyImport(draft, true);
    const result = await repo.snapshot();
    assert.equal(result.subjects.length, 1);
    assert.equal(result.works.length, 2);
    assert.match(result.subjects[0]!.notes, /72/);
  } finally {
    db.close();
  }
});
test('merge avoids duplicate subjects, works and lessons on repeated imports', async () => {
  const { db, repo, service } = await setup();
  try {
    const result = parseImportProposal(
      JSON.stringify({
        documentType: 'timetable',
        subjects: [{ name: 'Алгоритмы', needsReview: false }],
        lessons: [
          {
            subjectName: 'Алгоритмы',
            weekday: 1,
            start: '09:00',
            end: '10:30',
            needsReview: false,
          },
        ],
        warnings: [],
      }),
    );
    for (let i = 0; i < 2; i++) {
      const draft = makeDraft(result, await repo.snapshot(), randomUUID);
      draft.subjects[0]!.include = true;
      draft.subjects[0]!.reviewed = true;
      draft.subjects[0]!.counts.practice = 3;
      draft.lessons[0]!.include = true;
      draft.lessons[0]!.reviewed = true;
      await service.applyImport(draft, true);
    }
    const saved = await repo.snapshot();
    assert.equal(saved.subjects.length, 1);
    assert.equal(saved.works.length, 3);
    assert.equal(saved.lessons.length, 1);
  } finally {
    db.close();
  }
});
test('a reverted work with status history cannot be removed through count changes', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    let snapshot = await repo.snapshot();
    const work = snapshot.works[0]!;
    await service.saveWork({ ...work, status: 'in_progress' });
    await service.saveWork({ ...work, status: 'not_started' });
    snapshot = await repo.snapshot();
    const subject = snapshot.subjects.find((s) => s.id === work.subjectId)!;
    await assert.rejects(service.saveSubject(subject, emptyCounts(), true));
    assert.equal((await repo.snapshot()).history.length, 2);
    assert.equal(countWorks((await repo.snapshot()).works).unknown, 23);
  } finally {
    db.close();
  }
});
