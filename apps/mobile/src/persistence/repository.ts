/** Сериализованный доступ к SQLite, проверка записей и чтение согласованного снимка. */
import {
  assessmentSchema,
  academicPlanSchema,
  defaultProfile,
  historySchema,
  lessonSchema,
  normalizeName,
  profileSchema,
  subjectSchema,
  workSchema,
  type Assessment,
  type History,
  type Lesson,
  type Profile,
  type Snapshot,
  type Subject,
  type Work,
} from '../domain/model';
import { migrate, type Database } from './database';

// A single queue owns all access: unrelated async operations cannot leak into a transaction.
export class StudyRepository {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private db: Database) {}
  // Даже после ошибки очередь продолжает работу; следующий запрос не наследует отклонённый Promise.
  private queue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
  init() {
    return this.queue(() => migrate(this.db));
  }
  transaction<T>(task: (tx: RepositoryWriter) => Promise<T>): Promise<T> {
    return this.queue(async () => {
      let result!: T;
      await this.db.withTransactionAsync(async () => {
        result = await task(new RepositoryWriter(this.db));
      });
      return result;
    });
  }
  snapshot(): Promise<Snapshot> {
    return this.queue(() => readSnapshot(this.db));
  }
}
async function rows<T>(db: Database, table: string, parse: (value: unknown) => T): Promise<T[]> {
  return (await db.getAllAsync<{ data: string }>(`SELECT data FROM ${table}`)).map((r) =>
    parse(JSON.parse(r.data)),
  );
}
export async function readSnapshot(db: Database): Promise<Snapshot> {
  const settings = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  const profile = settings.find((s) => s.key === 'profile');
  return {
    profile: profile ? profileSchema.parse(JSON.parse(profile.value)) : defaultProfile,
    subjects: await rows(db, 'subjects', subjectSchema.parse),
    works: await rows(db, 'works', workSchema.parse),
    assessments: await rows(db, 'assessments', assessmentSchema.parse),
    lessons: (
      await db.getAllAsync<{ data: string; subject_id: string | null }>(
        'SELECT data,subject_id FROM lessons',
      )
    ).map((r) => lessonSchema.parse({ ...JSON.parse(r.data), subjectId: r.subject_id })),
    history: await rows(db, 'history', historySchema.parse),
    seeded: settings.some((s) => s.key === 'seeded' && s.value === 'true'),
    plans: academicPlanSchema
      .array()
      .parse(JSON.parse(settings.find((s) => s.key === 'plans')?.value ?? '[]')),
  };
}
// Экземпляр используется внутри транзакции репозитория; отдельной очереди здесь нет.
export class RepositoryWriter {
  constructor(private db: Database) {}
  snapshot() {
    return readSnapshot(this.db);
  }
  async setting(key: string, value: string) {
    await this.db.runAsync(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key,
      value,
    );
  }
  profile(value: Profile) {
    return this.setting('profile', JSON.stringify(profileSchema.parse(value)));
  }
  async subject(value: Subject) {
    const s = subjectSchema.parse(value);
    const duplicate = await this.db.getFirstAsync<{ id: string }>(
      'SELECT id FROM subjects WHERE normalized_name=? AND semester=? AND id<>?',
      normalizeName(s.name),
      s.semester,
      s.id,
    );
    if (duplicate) throw new Error('Такая дисциплина уже есть в этом семестре');
    await this.db.runAsync(
      'INSERT INTO subjects(id,normalized_name,semester,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET normalized_name=excluded.normalized_name,semester=excluded.semester,data=excluded.data',
      s.id,
      normalizeName(s.name),
      s.semester,
      JSON.stringify(s),
    );
  }
  async work(value: Work) {
    const w = workSchema.parse(value);
    await this.db.runAsync(
      'INSERT INTO works(id,subject_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET subject_id=excluded.subject_id,data=excluded.data',
      w.id,
      w.subjectId,
      JSON.stringify(w),
    );
  }
  async assessment(value: Assessment) {
    const a = assessmentSchema.parse(value);
    await this.db.runAsync(
      'INSERT INTO assessments(subject_id,kind,data) VALUES(?,?,?) ON CONFLICT(subject_id,kind) DO UPDATE SET data=excluded.data',
      a.subjectId,
      a.kind,
      JSON.stringify(a),
    );
  }
  async lesson(value: Lesson) {
    const subject = value.subjectId
      ? await this.db.getFirstAsync<{ data: string }>(
          'SELECT data FROM subjects WHERE id=?',
          value.subjectId,
        )
      : null;
    const l = lessonSchema.parse({
      ...value,
      subjectName: value.subjectName || (subject ? JSON.parse(subject.data).name : undefined),
    });
    await this.db.runAsync(
      'INSERT INTO lessons(id,subject_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET subject_id=excluded.subject_id,data=excluded.data',
      l.id,
      l.subjectId,
      JSON.stringify(l),
    );
  }
  async history(value: History) {
    const h = historySchema.parse(value);
    await this.db.runAsync(
      'INSERT INTO history(id,work_id,data) VALUES(?,?,?)',
      h.id,
      h.workId,
      JSON.stringify(h),
    );
  }
  async removeSubject(id: string) {
    await this.db.runAsync('DELETE FROM subjects WHERE id=?', id);
  }
  async removeWork(id: string) {
    await this.db.runAsync('DELETE FROM works WHERE id=?', id);
  }
  async removeLesson(id: string) {
    await this.db.runAsync('DELETE FROM lessons WHERE id=?', id);
  }
  async clear() {
    await this.db.execAsync(
      'DELETE FROM lessons; DELETE FROM lessons_v1_backup; DELETE FROM subjects; DELETE FROM settings;',
    );
  }
}
