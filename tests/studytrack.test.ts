/** Проверки правил журнала, SQLite-транзакций, резервных копий и экспорта. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestDatabase } from './sqlite-adapter';
import { StudyRepository } from '../apps/mobile/src/persistence/repository';
import { StudyService } from '../apps/mobile/src/application/study-service';
import {
  countWorks,
  defaultProfile,
  emptyCounts,
  localDate,
  overdue,
  planCounts,
  progress,
  validDate,
  workSchema,
  type Subject,
} from '../apps/mobile/src/domain/model';
import {
  exportBackup,
  exportCsv,
  parseBackup,
  restoreBackup,
} from '../apps/mobile/src/application/backup';
import { parseImportProposal } from '../apps/mobile/src/integrations/import-proposal';

async function setup(path?: string) {
  const db = new TestDatabase(path);
  const repo = new StudyRepository(db);
  await repo.init();
  return { db, repo, service: new StudyService(repo, randomUUID) };
}
const subject = (): Subject => ({
  id: randomUUID(),
  name: 'Алгоритмы',
  teacher: '',
  semester: 1,
  control: 'exam',
  coursework: 'none',
  notes: '',
});

test('backup rejects duplicate work sequence before replace mutates existing data', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.saveSubject(subject(), { ...emptyCounts(), lab: 2 });
    const before = await repo.snapshot();
    const duplicate = {
      ...before,
      works: [...before.works, { ...before.works[0]!, id: randomUUID() }],
    };
    const json = exportBackup(duplicate);
    assert.throws(() => parseBackup(json), /дубликаты/);
    await assert.rejects(restoreBackup(repo, json, true), /дубликаты/);
    assert.deepEqual(await repo.snapshot(), before);
  } finally {
    db.close();
  }
});
test('empty database stays empty; zero works is not 100%', async () => {
  const { db, repo } = await setup();
  try {
    assert.equal((await repo.snapshot()).works.length, 0);
    assert.equal(progress([]).percent, null);
    assert.equal((await repo.snapshot()).seeded, false);
  } finally {
    db.close();
  }
});
test('explicit seed: 8 subjects, 23 unknown works, correct controls and no rooms', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const s = await repo.snapshot();
    assert.equal(s.subjects.length, 8);
    assert.equal(s.works.length, 23);
    assert.ok(s.works.every((w) => w.kind === 'unknown'));
    assert.equal(s.lessons.length, 0);
    assert.equal(s.profile.groupName, '');
    assert.equal(
      s.subjects.find((s) => s.name === 'Параллельное программирование')?.coursework,
      'unknown',
    );
    await assert.rejects(service.loadPersonalSubjects());
    assert.equal((await repo.snapshot()).works.length, 23);
  } finally {
    db.close();
  }
});
test('done, submitted and accepted count; no deadline is never overdue; due today is not overdue', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const works = (await repo.snapshot()).works;
    works[0]!.status = 'done';
    works[1]!.status = 'submitted';
    works[2]!.status = 'accepted';
    assert.equal(progress(works).accepted, 1);
    assert.equal(progress(works).percent, 13);
    assert.equal(overdue(works[0]!, '2026-10-21'), false);
    assert.equal(overdue({ ...works[0]!, deadline: '2026-10-21' }, '2026-10-21'), false);
    assert.equal(overdue({ ...works[0]!, deadline: '2026-10-20' }, '2026-10-21'), false);
    assert.equal(overdue({ ...works[2]!, deadline: '2026-10-20' }, '2026-10-21'), false);
  } finally {
    db.close();
  }
});
test('persistent database survives close and reopen, status history and grades survive', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studytrack-'));
  const path = join(dir, 'test.db');
  try {
    const first = await setup(path);
    await first.service.loadPersonalSubjects();
    const work = (await first.repo.snapshot()).works[0]!;
    await first.service.saveWork({
      ...work,
      status: 'accepted',
      grade: '5',
      deadline: '2026-12-01',
    });
    first.db.close();
    const second = await setup(path);
    const saved = await second.repo.snapshot();
    assert.equal(saved.works.find((w) => w.id === work.id)?.grade, '5');
    assert.equal(saved.history.length, 1);
    assert.equal(progress(saved.works).accepted, 1);
    assert.deepEqual(await second.db.getAllAsync('PRAGMA integrity_check'), [
      { integrity_check: 'ok' },
    ]);
    assert.deepEqual(await second.db.getAllAsync('PRAGMA foreign_key_check'), []);
    second.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('count changes protect accepted, edited and deadline-bearing works', async () => {
  const { db, repo, service } = await setup();
  try {
    const s = subject();
    await service.saveSubject(s, { ...emptyCounts(), lab: 2 });
    const w = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...w, status: 'accepted', grade: '5' });
    await assert.rejects(service.saveSubject(s, emptyCounts(), true));
    assert.equal((await repo.snapshot()).works.length, 2);
    await assert.rejects(service.saveSubject(s, { ...emptyCounts(), lab: 1 }));
    await service.saveSubject(s, { ...emptyCounts(), lab: 1 }, true);
    assert.equal((await repo.snapshot()).works[0]!.grade, '5');
    await service.saveSubject(s, { ...emptyCounts(), lab: 3 });
    assert.equal((await repo.snapshot()).works.length, 3);
    assert.equal(progress((await repo.snapshot()).works).accepted, 1);
  } finally {
    db.close();
  }
});
test('renamed untouched work cannot be silently deleted', async () => {
  const { db, repo, service } = await setup();
  try {
    const s = subject();
    await service.saveSubject(s, { ...emptyCounts(), practice: 1 });
    const w = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...w, title: 'Моя тема' });
    assert.throws(() => planCounts([{ ...w, title: 'Моя тема' }], emptyCounts()));
  } finally {
    db.close();
  }
});
test('deduplication normalizes whitespace, case and ё; semesters stay separate', async () => {
  const { db, repo, service } = await setup();
  try {
    const s = { ...subject(), name: '  Теория   Алгоритмов ' };
    await service.saveSubject(s, emptyCounts());
    await assert.rejects(
      service.saveSubject({ ...s, id: randomUUID(), name: 'теория алгоритмов' }, emptyCounts()),
    );
    await service.saveSubject({ ...s, id: randomUUID(), semester: 2 }, emptyCounts());
    assert.equal((await repo.snapshot()).subjects.length, 2);
  } finally {
    db.close();
  }
});
test('seed collision rolls back entire operation', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.saveSubject({ ...subject(), name: 'Алгоритмы и структуры данных' }, emptyCounts());
    await assert.rejects(service.loadPersonalSubjects());
    assert.equal((await repo.snapshot()).subjects.length, 1);
    assert.equal((await repo.snapshot()).seeded, false);
  } finally {
    db.close();
  }
});
test('reclassifying works preserves status, grade and history; reorder persists', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const w = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...w, status: 'submitted', grade: '4', kind: 'lab' });
    const current = (await repo.snapshot()).works.find((x) => x.id === w.id)!;
    assert.equal(current.submitted, localDate());
    await service.reorder(current, 1);
    const snapshot = await repo.snapshot();
    assert.equal(snapshot.works.find((x) => x.id === w.id)?.position, 1);
    assert.equal(snapshot.history.length, 1);
    assert.equal(snapshot.works.find((x) => x.id === w.id)?.grade, '4');
  } finally {
    db.close();
  }
});
test('assessments and coursework are independent of work progress', async () => {
  const { db, repo, service } = await setup();
  try {
    const s = { ...subject(), coursework: 'work' as const };
    await service.saveSubject(s, emptyCounts());
    for (const kind of ['final', 'coursework'] as const)
      await service.saveAssessment({
        subjectId: s.id,
        kind,
        outcome: kind === 'final' ? 'passed' : 'pending',
        date: '',
        grade: '',
        notes: '',
      });
    const snapshot = await repo.snapshot();
    assert.equal(snapshot.assessments.length, 2);
    assert.equal(progress(snapshot.works).percent, null);
  } finally {
    db.close();
  }
});
test('cascade deletes and rollback enforce referential integrity', async () => {
  const { db, repo, service } = await setup();
  try {
    const s = subject();
    await service.saveSubject(s, { ...emptyCounts(), lab: 1 });
    const w = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...w, status: 'done' });
    await service.saveLesson({
      id: randomUUID(),
      subjectId: s.id,
      weekday: 1,
      start: '09:00',
      end: '10:30',
      room: '',
      notes: '',
    });
    await assert.rejects(
      repo.transaction(async (tx) => {
        await tx.removeSubject(s.id);
        throw new Error('rollback');
      }),
    );
    assert.equal((await repo.snapshot()).works.length, 1);
    await service.deleteSubject(s.id);
    const snapshot = await repo.snapshot();
    assert.equal(snapshot.history.length, 0);
    assert.equal(snapshot.works.length, 0);
    assert.equal(snapshot.lessons.length, 1);
    assert.equal(snapshot.lessons[0]!.subjectId, null);
  } finally {
    db.close();
  }
});
test('backup preview/cancel does not mutate; confirmed restore round trips all data', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const saved = await repo.snapshot();
    const json = exportBackup(saved);
    await repo.transaction((tx) => tx.clear());
    await restoreBackup(repo, json, false);
    assert.equal((await repo.snapshot()).subjects.length, 0);
    await restoreBackup(repo, json, true);
    assert.deepEqual(await repo.snapshot(), saved);
  } finally {
    db.close();
  }
});
test('damaged JSON, wrong version, duplicate IDs and dangling references reject without data loss', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const original = await repo.snapshot();
    const good = JSON.parse(exportBackup(original));
    for (const bad of [
      '{',
      JSON.stringify({ ...good, version: 99 }),
      JSON.stringify({ ...good, subjects: [] }),
      JSON.stringify({ ...good, works: [...good.works, good.works[0]] }),
    ]) {
      await assert.rejects(restoreBackup(repo, bad, true));
      assert.deepEqual(await repo.snapshot(), original);
    }
    assert.throws(() => parseBackup('{}'));
  } finally {
    db.close();
  }
});
test('invalid dates/counts fail and transaction rolls back', async () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-2-1'), false);
  const { db, repo, service } = await setup();
  try {
    await assert.rejects(service.saveSubject(subject(), { ...emptyCounts(), lab: -1 }));
    await assert.rejects(service.saveSubject(subject(), { ...emptyCounts(), lab: 1.2 }));
    assert.equal((await repo.snapshot()).subjects.length, 0);
    await assert.rejects(
      service.saveProfile({ ...defaultProfile, startDate: '2026-12-01', endDate: '2026-01-01' }),
    );
  } finally {
    db.close();
  }
});
test('all offline operations do not call fetch', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network must not be used');
  };
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const w = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...w, status: 'in_progress' });
    assert.equal((await repo.snapshot()).works.length, 23);
  } finally {
    globalThis.fetch = previous;
    db.close();
  }
});
test('malformed import rejects, partial data retains review flags', async () => {
  assert.throws(() => parseImportProposal('{broken'));
  const result = parseImportProposal(
    JSON.stringify({
      documentType: 'timetable',
      subjects: [
        {
          name: 'Методы и технологии интеллектуального анализа',
          teacher: 'Степанова',
          needsReview: true,
        },
      ],
      lessons: [
        {
          subjectName: 'Методы и технологии интеллектуального анализа',
          needsReview: true,
          raw: 'неразборчивое время',
        },
      ],
      warnings: ['Проверьте время'],
    }),
  );
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    assert.equal(result.subjects[0]!.needsReview, true);
    assert.equal(result.lessons[0]!.start, undefined);
    assert.equal((await repo.snapshot()).subjects.length, 8);
  } finally {
    db.close();
  }
});
test('concurrent writes are serialized; migrations are idempotent', async () => {
  const { db, repo, service } = await setup();
  try {
    await repo.init();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.saveSubject({ ...subject(), name: `Предмет ${i}` }, emptyCounts()),
      ),
    );
    assert.equal((await repo.snapshot()).subjects.length, 10);
  } finally {
    db.close();
  }
});
test('CSV quotes cells and neutralizes formula injection', async () => {
  const { db, repo, service } = await setup();
  try {
    const s = subject();
    await service.saveSubject(s, { ...emptyCounts(), lab: 1 });
    const w = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...w, title: '=SUM(1;2)' });
    const csv = exportCsv(await repo.snapshot());
    assert.ok(csv.includes('"\'=SUM(1;2)"'));
    assert.ok(csv.startsWith('\uFEFF'));
    assert.equal(countWorks([w]).lab, 1);
    assert.equal(workSchema.safeParse({ ...w, deadline: 'bad' }).success, false);
  } finally {
    db.close();
  }
});
