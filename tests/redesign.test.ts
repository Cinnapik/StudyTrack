/** Проверки HTML/XLSX-импорта, недельного расписания, миграций и совместимости данных. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseScheduleXlsx } from '../apps/mobile/src/integrations/xlsx-schedule';
import { decodePlanHtml, parseAcademicPlan } from '../apps/mobile/src/integrations/academic-plan';
import { scheduleFixture } from './xlsx-fixture';
import { nextWorks } from '../apps/mobile/src/domain/next-works';
import { emptyCounts, lessonOccursOn, type Lesson } from '../apps/mobile/src/domain/model';
import { subjectSuggestions, lessonsForDate } from '../apps/mobile/src/domain/weekly-schedule';
import { TestDatabase } from './sqlite-adapter';
import { StudyRepository } from '../apps/mobile/src/persistence/repository';
import { StudyService } from '../apps/mobile/src/application/study-service';
import { exportBackup, parseBackup, restoreBackup } from '../apps/mobile/src/application/backup';
import { planReminders } from '../apps/mobile/src/domain/reminders';

const source = 'https://eios.daluniver.ru/Plans/Plan.aspx?id=4011';
test('native HTML decoding honors windows-1251 before looking for Russian headers', () => {
  assert.equal(
    decodePlanHtml(
      new Uint8Array([
        0xc4, 0xe8, 0xf1, 0xf6, 0xe8, 0xef, 0xeb, 0xe8, 0xed, 0xe0, 0x20, 0xa8, 0xb8, 0xb9,
      ]),
      'text/html; charset=windows-1251',
    ),
    'Дисциплина Ёё№',
  );
  assert.equal(
    decodePlanHtml(new TextEncoder().encode('Семестр'), 'text/html; charset=utf-8'),
    'Семестр',
  );
  assert.throws(
    () => decodePlanHtml(new Uint8Array(), 'text/html; charset=koi8-r'),
    /не поддерживается/,
  );
});
const plan = () =>
  parseAcademicPlan(readFileSync('tests/fixtures/academic-plan-4011.html', 'utf8'), source);
async function setup() {
  const db = new TestDatabase();
  const repo = new StudyRepository(db);
  await repo.init();
  return { db, repo, service: new StudyService(repo, randomUUID) };
}

test('XLSX ignores all date values, reordered headers, merged days, blank rows and duplicate weeks', () => {
  const a = parseScheduleXlsx(scheduleFixture());
  assert.deepEqual(parseScheduleXlsx(scheduleFixture({ date: 'ИЗМЕНЕНА ДАТА' })), a);
  assert.deepEqual(parseScheduleXlsx(scheduleFixture({ date: '0', reorder: true })), a);
  assert.equal(a.length, 4);
  assert.equal(a[0]!.lesson.start, '09:00');
  assert.equal(a[0]!.lesson.end, '10:30');
  assert.equal(a[1]!.lesson.weekday, 1);
  assert.equal(a[2]!.duplicate, true);
  assert.equal(a[2]!.include, false);
  assert.equal(a[3]!.lesson.weekday, 0);
  assert.match(a[3]!.errors.join(), /день/);
  assert.ok(a.every((r) => !('date' in r.lesson)));
});
test('XLSX missing weekday is never inferred from date; formulas and invalid times require correction', () => {
  assert.equal(parseScheduleXlsx(scheduleFixture({ missingDay: true }))[0]!.lesson.weekday, 0);
  assert.match(
    parseScheduleXlsx(scheduleFixture({ invalidTime: true }))[1]!.errors.join(),
    /начала/,
  );
  assert.equal(parseScheduleXlsx(scheduleFixture({ formula: true }))[0]!.lesson.start, '');
  assert.throws(() => parseScheduleXlsx(scheduleFixture({ sheet: 'Другой лист' })), /Расписание/);
  assert.throws(() => parseScheduleXlsx(new Uint8Array([1, 2, 3])), /повреждён/);
});
test('curriculum fixture expands rowspan into independent semesters, preserves hours and coursework', () => {
  const p = plan();
  assert.equal(p.plan.subjects.length, 29);
  const english = p.plan.subjects.filter(
    (s) => s.name === 'Иностранный язык в профессиональной сфере',
  );
  assert.deepEqual(
    english.map((s) => s.semester),
    [1, 2, 3],
  );
  assert.deepEqual(
    english.map((s) => s.curriculum?.practiceHours),
    [32, 28, 32],
  );
  const parallel = p.plan.subjects.find((s) => s.name === 'Параллельное программирование')!;
  assert.equal(parallel.control, 'exam_coursework');
  assert.equal(parallel.coursework, 'work');
  assert.equal(parallel.curriculum?.labHours, 32);
  assert.equal(p.plan.subjects.filter((s) => s.control === 'graded_credit').length, 2);
  assert.match(p.warnings.join(), /Магистерская диссертация/);
  assert.throws(() => parseAcademicPlan('<html>Войдите</html>', source), /не найдена/);
  assert.equal(
    parseAcademicPlan(
      readFileSync('tests/fixtures/academic-plan-4011.html', 'utf8'),
      source.replace('4011', '999'),
    ).plan.url.endsWith('999'),
    true,
  );
});
test('plan reimport preserves metadata and grades, generates no works, caches for offline, and separates semesters', async () => {
  const { db, repo, service } = await setup();
  try {
    const p = plan().plan;
    const ids = p.subjects.map((s) => s.id);
    await service.importPlan(p, 1, ids, false);
    assert.equal((await repo.snapshot()).subjects.length, 0);
    await service.importPlan(p, 1, ids, true);
    let snapshot = await repo.snapshot();
    assert.equal(snapshot.works.length, 0);
    assert.equal(snapshot.subjects.length, 8);
    const subject = {
      ...snapshot.subjects[0]!,
      teacher: 'Ручной преподаватель',
      notes: 'Личная заметка',
    };
    await service.saveSubject(subject, { ...emptyCounts(), lab: 2 });
    const work = (await repo.snapshot()).works[0]!;
    await service.saveWork({ ...work, status: 'accepted', grade: '5', comment: 'Сохранить' });
    const before = await repo.snapshot();
    await service.importPlan(p, 1, ids, true);
    snapshot = await repo.snapshot();
    assert.deepEqual(snapshot.works, before.works);
    assert.deepEqual(snapshot.history, before.history);
    assert.deepEqual(
      snapshot.subjects.find((s) => s.id === subject.id),
      subject,
    );
    assert.equal(snapshot.profile.groupName, '');
    assert.equal(snapshot.plans?.length, 1);
    await service.importPlan(p, 2, ids, true);
    snapshot = await repo.snapshot();
    assert.equal(snapshot.profile.semester, 2);
    assert.equal(
      snapshot.subjects.filter((s) => s.name === 'Иностранный язык в профессиональной сфере')
        .length,
      2,
    );
    const json = exportBackup(snapshot);
    await restoreBackup(repo, json, true);
    assert.deepEqual(await repo.snapshot(), snapshot);
  } finally {
    db.close();
  }
});
test('weekly merge/replace are atomic, preserve tasks and dated entries, and support unlinked names', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const before = await repo.snapshot();
    const weekly = parseScheduleXlsx(scheduleFixture())
      .filter((r) => r.include && !r.errors.length)
      .map((r) => ({ ...r.lesson, linking: 'independent' as const }));
    const dated: Lesson = {
      ...weekly[0]!,
      id: 'dated',
      subjectId: before.subjects[0]!.id,
      date: '2026-10-26',
    };
    await service.saveLesson(dated);
    await service.importWeekly(weekly, 'merge', true);
    await service.importWeekly(weekly, 'merge', true);
    assert.equal((await repo.snapshot()).lessons.length, 3);
    assert.equal(lessonsForDate((await repo.snapshot()).lessons, new Date(2026, 9, 26)).length, 2);
    assert.equal(lessonsForDate((await repo.snapshot()).lessons, new Date(2030, 0, 7)).length, 2);
    const snapshot = await repo.snapshot();
    await assert.rejects(service.importWeekly([{ ...weekly[0]!, weekday: 0 }], 'replace', true));
    assert.deepEqual(await repo.snapshot(), snapshot);
    await service.importWeekly([weekly[1]!], 'replace', true);
    const after = await repo.snapshot();
    assert.equal(after.lessons.length, 2);
    assert.ok(after.lessons.some((l) => l.date === '2026-10-26'));
    assert.deepEqual(after.works, before.works);
    await service.convertDatedLessons(false);
    assert.ok((await repo.snapshot()).lessons.some((l) => l.date));
    await service.convertDatedLessons(true);
    assert.ok((await repo.snapshot()).lessons.every((l) => !l.date));
    const backup = parseBackup(exportBackup(await repo.snapshot()));
    assert.ok(backup.lessons.some((l) => l.subjectId === null));
  } finally {
    db.close();
  }
});
test('next works advances done/submitted/accepted, blocks unfinished number, ranks types by deadline, one per current-semester subject', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    let s = await repo.snapshot();
    const subject = s.subjects[0]!;
    await service.saveSubject(subject, {
      ...emptyCounts(),
      unknown: s.works.filter((w) => w.subjectId === subject.id).length,
      lab: 4,
      practice: 2,
    });
    s = await repo.snapshot();
    const labs = s.works.filter((w) => w.subjectId === subject.id && w.kind === 'lab');
    for (let i = 0; i < 3; i++)
      await service.saveWork({
        ...labs[i]!,
        status: (['done', 'submitted', 'accepted'] as const)[i]!,
      });
    await service.saveWork({ ...labs[3]!, deadline: '2026-11-01' });
    const practice = s.works.filter((w) => w.subjectId === subject.id && w.kind === 'practice');
    await service.saveWork({ ...practice[1]!, deadline: '2026-10-25' }); // #2 cannot skip unfinished #1.
    s = await repo.snapshot();
    const next = nextWorks(s, 100);
    assert.equal(next.find((w) => w.subjectId === subject.id)?.id, labs[3]!.id);
    assert.equal(new Set(next.map((w) => w.subjectId)).size, next.length);
    assert.ok(nextWorks(s).length <= 5);
    assert.equal(nextWorks({ ...s, profile: { ...s.profile, semester: 20 } }).length, 0);
  } finally {
    db.close();
  }
});
test('suggestions normalize .NET and pedagogics without auto-creating subjects', () => {
  const subjects = plan().plan.subjects.filter((s) => s.semester === 1);
  assert.equal(subjectSuggestions('Технология net', subjects)[0]?.name, 'Технология .NET');
  assert.equal(
    subjectSuggestions('Педогогика высшей школы', subjects)[0]?.name,
    'Педагогика высшей школы',
  );
});
test('notification skips completed works and routes a single deadline to its work', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const s = await repo.snapshot();
    s.profile.reminders = { enabled: true, daysBefore: 1, time: '09:00' };
    s.works = s.works.slice(0, 2).map((w) => ({ ...w, deadline: '2026-11-05' }));
    s.works[1]!.status = 'done';
    const reminders = planReminders(s, new Date(2026, 9, 24));
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0]!.workId, s.works[0]!.id);
    s.works[0]!.status = 'submitted';
    assert.equal(planReminders(s, new Date(2026, 9, 24)).length, 0);
  } finally {
    db.close();
  }
});
test('v1 migration preserves every dated lesson, old profile, grade and status history and survives subject deletion', async () => {
  const { db, repo, service } = await setup();
  try {
    await service.loadPersonalSubjects();
    const s = await repo.snapshot();
    await service.saveWork({ ...s.works[0]!, status: 'accepted', grade: '5', comment: 'важно' });
    // Restore the released v1 lesson table structure, then exercise the real v2 migration.
    await db.execAsync(
      'DROP TABLE lessons; ALTER TABLE lessons_v1_backup RENAME TO lessons; PRAGMA user_version=1;',
    );
    const lesson = {
      id: 'legacy',
      subjectId: s.subjects[0]!.id,
      weekday: 1,
      date: '2026-10-26',
      start: '09:00',
      end: '10:30',
      room: '203',
      notes: 'сохранить',
    };
    await db.runAsync(
      'INSERT INTO lessons(id,subject_id,data) VALUES(?,?,?)',
      lesson.id,
      lesson.subjectId,
      JSON.stringify(lesson),
    );
    await repo.init();
    const after = await repo.snapshot();
    assert.equal(after.lessons[0]!.date, lesson.date);
    assert.equal(after.works[0]!.grade, '5');
    assert.equal(after.history.length, 1);
    assert.equal(
      await db
        .getFirstAsync<{ n: number }>('SELECT count(*) n FROM lessons_v1_backup')
        .then((r) => r?.n),
      1,
    );
    assert.equal(lessonOccursOn(after.lessons[0]!, new Date(2026, 10, 2)), false);
    await service.deleteSubject(lesson.subjectId);
    const preserved = (await repo.snapshot()).lessons[0]!;
    assert.equal(preserved.subjectId, null);
    assert.equal(preserved.notes, 'сохранить');
    assert.ok(preserved.subjectName);
  } finally {
    db.close();
  }
});
