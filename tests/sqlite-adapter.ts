/** Адаптер настоящей SQLite для тестов репозитория без запуска Android. */
import { DatabaseSync } from 'node:sqlite';
import type { Database, SqlValue } from '../apps/mobile/src/persistence/database';
export class TestDatabase implements Database {
  readonly native: DatabaseSync;
  constructor(path = ':memory:') {
    this.native = new DatabaseSync(path);
  }
  async execAsync(sql: string) {
    this.native.exec(sql);
  }
  async runAsync(sql: string, ...params: SqlValue[]) {
    return this.native.prepare(sql).run(...params);
  }
  async getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
    return this.native
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row })) as T[];
  }
  async getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null> {
    return (this.native.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async withTransactionAsync(task: () => Promise<void>) {
    this.native.exec('BEGIN');
    try {
      await task();
      this.native.exec('COMMIT');
    } catch (e) {
      this.native.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.native.close();
  }
}
