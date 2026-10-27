/** Проверки расчёта сводок и согласования уведомлений без обращения к Android. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { StudyRepository } from '../apps/mobile/src/persistence/repository';
import { StudyService } from '../apps/mobile/src/application/study-service';
import { TestDatabase } from './sqlite-adapter';
import { planReminders } from '../apps/mobile/src/domain/reminders';
import { defaultProfile, profileSchema } from '../apps/mobile/src/domain/model';
import {
  reconcileReminders,
  reminderFingerprint,
  type ReminderPort,
} from '../apps/mobile/src/application/reminders';

test('legacy profiles get disabled reminders without changing existing fields', () => {
  const { reminders, ...old } = defaultProfile;
  assert.deepEqual(profileSchema.parse(old).reminders, reminders);
  assert.equal(profileSchema.parse({ ...old, university: 'Тест' }).university, 'Тест');
  assert.throws(() =>
    profileSchema.parse({ ...old, reminders: { enabled: true, daysBefore: 2, time: '25:00' } }),
  );
});
test('reminders group deadlines, skip accepted/undated/past and use local calendar time', async () => {
  const db = new TestDatabase();
  try {
    const repo = new StudyRepository(db);
    await repo.init();
    const service = new StudyService(repo, randomUUID);
    await service.loadPersonalSubjects();
    const snapshot = await repo.snapshot();
    snapshot.profile.reminders = { enabled: true, daysBefore: 1, time: '09:30' };
    snapshot.works[0]!.deadline = '2026-11-03';
    snapshot.works[1]!.deadline = '2026-11-03';
    snapshot.works[2]!.deadline = '2026-11-03';
    snapshot.works[2]!.status = 'accepted';
    snapshot.works[3]!.deadline = '2026-10-01';
    snapshot.assessments = [
      {
        subjectId: snapshot.subjects[0]!.id,
        kind: 'final',
        outcome: 'pending',
        date: '2026-11-03',
        grade: '',
        notes: '',
      },
    ];
    const plan = planReminders(snapshot, new Date(2026, 10, 1, 10));
    assert.equal(plan.length, 1);
    assert.match(plan[0]!.body, /^3 срок/);
    assert.equal(plan[0]!.at, new Date(2026, 10, 2, 9, 30).getTime());
    assert.equal(planReminders(snapshot, new Date(2026, 10, 2, 9, 31)).length, 0);
    snapshot.profile.reminders.enabled = false;
    assert.equal(planReminders(snapshot, new Date(2026, 10, 1)).length, 0);
  } finally {
    db.close();
  }
});
test('reconciliation is idempotent, changes deadlines, cancels disabled reminders and preserves foreign notifications', async () => {
  const r = { id: 'studytrack-deadlines-2026-11-01', at: 100, title: 'Сроки', body: '1 работа' };
  const pending = new Map([['other-feature', 'keep']]);
  const calls: string[] = [];
  const port: ReminderPort = {
    list: async () => [...pending].map(([id, fingerprint]) => ({ id, fingerprint })),
    cancel: async (id) => {
      calls.push('cancel');
      pending.delete(id);
    },
    schedule: async (item, fingerprint) => {
      calls.push('schedule');
      pending.set(item.id, fingerprint);
    },
  };
  await reconcileReminders(port, [r]);
  await reconcileReminders(port, [r]);
  assert.deepEqual(calls, ['schedule']);
  await reconcileReminders(port, [{ ...r, at: 200 }]);
  assert.deepEqual(calls, ['schedule', 'cancel', 'schedule']);
  assert.equal(pending.get(r.id), reminderFingerprint({ ...r, at: 200 }));
  await reconcileReminders(port, []);
  assert.deepEqual([...pending], [['other-feature', 'keep']]);
});
