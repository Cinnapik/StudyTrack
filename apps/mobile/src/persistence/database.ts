/** Минимальный интерфейс SQLite и последовательные миграции с сохранением прежних записей. */
export type SqlValue = string | number | null;
export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
export async function migrate(db: Database) {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  // Более новую схему нельзя открывать старым кодом: неизвестные поля и связи могут быть потеряны.
  if ((version?.user_version ?? 0) > 2)
    throw new Error('База создана более новой версией StudyTrack. Обновите приложение.');
  if (!version?.user_version)
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE subjects (id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL, semester INTEGER NOT NULL CHECK(semester BETWEEN 1 AND 20), data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(normalized_name, semester));
      CREATE TABLE works (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE INDEX works_subject ON works(subject_id);
      CREATE TABLE assessments (subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('final','coursework')), data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(subject_id, kind));
      CREATE TABLE lessons (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE history (id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE INDEX history_work ON history(work_id);
      PRAGMA user_version = 1;
    `);
    });
  if ((version?.user_version ?? 0) < 2)
    await db.withTransactionAsync(async () => {
      // Retain every original row as a local migration backup. Never infer weekly dates.
      await db.execAsync(`
      ALTER TABLE lessons RENAME TO lessons_v1_backup;
      CREATE TABLE lessons (id TEXT PRIMARY KEY, subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL, data TEXT NOT NULL CHECK(json_valid(data)));
      INSERT INTO lessons SELECT l.id,s.id,json_set(l.data,'$.subjectId',s.id,'$.subjectName',coalesce(json_extract(s.data,'$.name'),json_extract(l.data,'$.subjectName'),'Дисциплина из прежнего расписания')) FROM lessons_v1_backup l LEFT JOIN subjects s ON s.id=l.subject_id;
      PRAGMA user_version = 2;
    `);
    });
}
