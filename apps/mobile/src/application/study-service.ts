/** Прикладные операции журнала. Связанные изменения данных выполняются одной транзакцией. */
import {
  countWorks,
  emptyCounts,
  generatedTitle,
  localDate,
  lessonSchema,
  lessonSlot,
  normalizeName,
  planCounts,
  type Assessment,
  type Counts,
  type Kind,
  type Lesson,
  type Profile,
  type Subject,
  type Work,
  type AcademicPlan,
  type Status,
  activeStatuses,
} from '../domain/model';
import { matchingSubjects, groupMatches } from '../domain/subject-matching';
import { personalSubjects } from '../domain/seed';
import type { ImportDraft } from '../domain/import-draft';
import { StudyRepository, type RepositoryWriter } from '../persistence/repository';

export class StudyService {
  constructor(
    readonly repo: StudyRepository,
    private id: () => string,
  ) {}
  newId() {
    return this.id();
  }
  saveProfile(profile: Profile) {
    return this.repo.transaction((tx) => tx.profile(profile));
  }
  // План изменения количества проверяется до записи: изменённые работы нельзя удалить автоматически.
  async saveSubject(subject: Subject, counts: Counts, confirmRemoval = false) {
    return this.repo.transaction(async (tx) => {
      const snapshot = await tx.snapshot();
      const works = snapshot.works.filter((w) => w.subjectId === subject.id);
      const plan = planCounts(works, counts, new Set(snapshot.history.map((h) => h.workId)));
      if (plan.remove.length && !confirmRemoval)
        throw new Error('Подтвердите удаление пустых заготовок');
      await tx.subject(subject);
      for (const w of plan.remove) await tx.removeWork(w.id);
      await this.generate(tx, subject.id, works, plan.add);
      await this.linkSchedule(tx);
    });
  }
  private async generate(tx: RepositoryWriter, subjectId: string, works: Work[], add: Counts) {
    let position = Math.max(-1, ...works.map((w) => w.position)) + 1;
    for (const kind of Object.keys(add) as Kind[]) {
      let number = Math.max(0, ...works.filter((w) => w.kind === kind).map((w) => w.number));
      for (let i = 0; i < (add[kind] ?? 0); i++) {
        number++;
        await tx.work({
          id: this.id(),
          subjectId,
          kind,
          number,
          title: generatedTitle(kind, number),
          issued: '',
          deadline: '',
          grade: '',
          comment: '',
          submitted: '',
          status: 'not_started',
          position: position++,
        });
      }
    }
  }
  saveWork(work: Work) {
    return this.repo.transaction(async (tx) => {
      const snapshot = await tx.snapshot();
      const old = snapshot.works.find((w) => w.id === work.id);
      if (
        snapshot.works.some(
          (w) =>
            w.id !== work.id &&
            w.subjectId === work.subjectId &&
            w.kind === work.kind &&
            w.number === work.number,
        )
      )
        throw new Error('Работа такого типа с этим номером уже существует');
      const updated = { ...work };
      if (updated.status === 'submitted' && old?.status !== 'submitted' && !updated.submitted)
        updated.submitted = localDate();
      await tx.work(updated);
      if (old && old.status !== updated.status)
        await tx.history({
          id: this.id(),
          workId: work.id,
          fromStatus: old.status,
          toStatus: updated.status,
          at: new Date().toISOString(),
        });
    });
  }
  // Все ID проверяются до первой записи; статусы и история сохраняются атомарно.
  setWorkStatuses(ids: string[], status: Status) {
    return this.repo.transaction(async (tx) => {
      if (!(status in activeStatuses)) throw new Error('Выберите один из пяти статусов');
      const snapshot = await tx.snapshot();
      const selected = [...new Set(ids)];
      if (!selected.length) throw new Error('Выберите работы');
      const works = selected.map((id) => snapshot.works.find((w) => w.id === id));
      if (works.some((w) => !w))
        throw new Error('Одна из работ удалена. Обновите выбор; изменения не сохранены.');
      const at = new Date().toISOString();
      for (const work of works) {
        if (!work || work.status === status) continue;
        await tx.work({
          ...work,
          status,
          submitted: status === 'submitted' && !work.submitted ? localDate() : work.submitted,
        });
        await tx.history({
          id: this.id(),
          workId: work.id,
          fromStatus: work.status,
          toStatus: status,
          at,
        });
      }
    });
  }
  // Явные связи, независимые и датированные занятия не участвуют в автоматической привязке.
  private async linkSchedule(tx: RepositoryWriter) {
    const snapshot = await tx.snapshot();
    const subjects = snapshot.subjects.filter((s) => s.semester === snapshot.profile.semester);
    for (const lesson of snapshot.lessons) {
      if (
        lesson.date ||
        lesson.subjectId ||
        lesson.linking === 'independent' ||
        !groupMatches(lesson, snapshot.profile.groupName)
      )
        continue;
      const match = matchingSubjects(lesson.subjectName ?? '', subjects).automatic;
      if (match) await tx.lesson({ ...lesson, subjectId: match.id, linking: 'automatic' });
    }
  }
  reorder(work: Work, direction: -1 | 1) {
    return this.repo.transaction(async (tx) => {
      const works = (await tx.snapshot()).works
        .filter((w) => w.subjectId === work.subjectId)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const index = works.findIndex((w) => w.id === work.id);
      const other = index + direction;
      if (index < 0 || other < 0 || other >= works.length) return;
      [works[index], works[other]] = [works[other]!, works[index]!];
      for (let i = 0; i < works.length; i++) await tx.work({ ...works[i]!, position: i });
    });
  }
  saveAssessment(value: Assessment) {
    return this.repo.transaction((tx) => tx.assessment(value));
  }
  saveLesson(value: Lesson) {
    return this.repo.transaction((tx) => tx.lesson(value));
  }
  deleteSubject(id: string) {
    return this.repo.transaction((tx) => tx.removeSubject(id));
  }
  deleteWork(id: string) {
    return this.repo.transaction((tx) => tx.removeWork(id));
  }
  deleteLesson(id: string) {
    return this.repo.transaction((tx) => tx.removeLesson(id));
  }
  loadPersonalSubjects() {
    return this.repo.transaction(async (tx) => {
      const snapshot = await tx.snapshot();
      if (snapshot.seeded) throw new Error('Личные дисциплины уже загружены');
      for (const seed of personalSubjects) {
        if (
          snapshot.subjects.some(
            (s) => s.semester === 1 && normalizeName(s.name) === normalizeName(seed.name),
          )
        )
          throw new Error(
            'Есть совпадающая дисциплина. Удалите дубликат или продолжайте ручной ввод; ваши данные не изменены.',
          );
      }
      for (const seed of personalSubjects) {
        const id = this.id();
        await tx.subject({
          id,
          name: seed.name,
          teacher: seed.teacher,
          semester: 1,
          control: seed.control,
          coursework: seed.coursework ?? 'none',
          notes: seed.coursework === 'unknown' ? 'Уточните наличие курсовой работы.' : '',
        });
        await this.generate(tx, id, [], { ...emptyCounts(), unknown: seed.count });
      }
      await tx.profile({
        ...snapshot.profile,
        semester: 1,
        onboarded: true,
      });
      await tx.setting('seeded', 'true');
    });
  }
  counts = countWorks;
  applyImport(draft: ImportDraft, confirmed: boolean) {
    if (!confirmed) return Promise.resolve();
    return this.repo.transaction(async (tx) => {
      const snapshot = await tx.snapshot();
      const mapped = new Map<string, string>();
      const targets = new Set<string>();
      const selected = draft.subjects.filter((s) => s.include);
      if (!selected.length) throw new Error('Выберите хотя бы одну дисциплину');
      for (const row of selected) {
        planCounts([], row.counts);
        if (
          row.hours !== null &&
          (!Number.isInteger(row.hours) || row.hours < 0 || row.hours > 10000)
        )
          throw new Error('Учебные часы должны быть целым числом от 0 до 10000');
        if (!row.reviewed) throw new Error('Подтвердите проверку каждой выбранной дисциплины');
        const existing =
          row.action === 'new' ? undefined : snapshot.subjects.find((s) => s.id === row.targetId);
        if (row.action !== 'new' && !existing)
          throw new Error('Выберите существующую дисциплину для объединения или замены');
        const subject =
          existing && row.action === 'merge'
            ? { ...existing, teacher: existing.teacher || row.subject.teacher }
            : {
                ...row.subject,
                id: existing?.id ?? row.subject.id,
                notes: [row.subject.notes, row.hours === null ? '' : `Учебные часы: ${row.hours}`]
                  .filter(Boolean)
                  .join('\n'),
              };
        if (targets.has(subject.id))
          throw new Error(
            'Две строки направлены в одну дисциплину. Объедините их в редакторе или исключите повтор.',
          );
        targets.add(subject.id);
        const works = snapshot.works.filter((w) => w.subjectId === subject.id);
        const counts = { ...row.counts };
        if (row.action === 'merge') {
          const old = countWorks(works);
          for (const kind of Object.keys(counts) as Kind[])
            counts[kind] = Math.max(counts[kind] ?? 0, old[kind] ?? 0);
        }
        const plan = planCounts(works, counts, new Set(snapshot.history.map((h) => h.workId)));
        await tx.subject(subject);
        for (const w of plan.remove) await tx.removeWork(w.id);
        await this.generate(tx, subject.id, works, plan.add);
        mapped.set(row.subject.id, subject.id);
      }
      const lessonKeys = new Set(snapshot.lessons.map(lessonSlot));
      for (const row of draft.lessons.filter((l) => l.include)) {
        if (!row.reviewed) throw new Error('Подтвердите проверку каждого выбранного занятия');
        const subjectId = mapped.get(row.lesson.subjectId ?? '');
        if (!subjectId) throw new Error('Для занятия нужно выбрать и подтвердить его дисциплину');
        const lesson = lessonSchema.parse({ ...row.lesson, subjectId });
        const key = lessonSlot(lesson);
        if (!lessonKeys.has(key)) {
          await tx.lesson(lesson);
          lessonKeys.add(key);
        }
      }
      await tx.profile({ ...snapshot.profile, onboarded: true });
    });
  }
  // Замена затрагивает только недельный шаблон; прежние датированные занятия остаются в базе.
  importWeekly(lessons: Lesson[], mode: 'merge' | 'replace', confirmed: boolean) {
    if (!confirmed) return Promise.resolve();
    return this.repo.transaction(async (tx) => {
      if (!lessons.length) throw new Error('Выберите хотя бы одно занятие');
      const snapshot = await tx.snapshot();
      const parsed = lessons.map((l) => {
        if (l.date) throw new Error('Недельный шаблон не содержит дат');
        const match =
          !l.subjectId && l.linking !== 'independent' && groupMatches(l, snapshot.profile.groupName)
            ? matchingSubjects(
                l.subjectName ?? '',
                snapshot.subjects.filter((s) => s.semester === snapshot.profile.semester),
              ).automatic
            : undefined;
        return lessonSchema.parse({
          ...l,
          subjectId: l.subjectId ?? match?.id ?? null,
          ...(match ? { linking: 'automatic' } : {}),
          date: undefined,
        });
      });
      if (mode === 'replace')
        for (const old of snapshot.lessons.filter((l) => !l.date)) await tx.removeLesson(old.id);
      const keys = new Set(
        mode === 'merge' ? snapshot.lessons.filter((l) => !l.date).map(lessonSlot) : [],
      );
      for (const lesson of parsed) {
        if (lesson.subjectId && !snapshot.subjects.some((s) => s.id === lesson.subjectId))
          throw new Error('Связанная дисциплина удалена. Проверьте соответствие.');
        const key = lessonSlot(lesson);
        if (!keys.has(key)) {
          await tx.lesson({ ...lesson, id: this.id() });
          keys.add(key);
        }
      }
      await this.linkSchedule(tx);
    });
  }
  // Перед явным преобразованием сохраняется исходный набор датированных занятий.
  convertDatedLessons(confirmed: boolean) {
    if (!confirmed) return Promise.resolve();
    return this.repo.transaction(async (tx) => {
      const snapshot = await tx.snapshot();
      const keys = new Set(snapshot.lessons.filter((l) => !l.date).map(lessonSlot));
      await tx.setting(
        'datedLessonsBeforeConversion',
        JSON.stringify(snapshot.lessons.filter((l) => l.date)),
      );
      for (const old of snapshot.lessons.filter((l) => l.date)) {
        const lesson = { ...old, date: undefined };
        const key = lessonSlot(lesson);
        if (keys.has(key)) await tx.removeLesson(old.id);
        else {
          await tx.lesson(lesson);
          keys.add(key);
        }
      }
    });
  }
  importPlan(plan: AcademicPlan, semester: number, selectedIds: string[], confirmed: boolean) {
    if (!confirmed) return Promise.resolve();
    return this.repo.transaction(async (tx) => {
      const snapshot = await tx.snapshot();
      const selected = plan.subjects.filter(
        (s) => s.semester === semester && selectedIds.includes(s.id),
      );
      if (!selected.length) throw new Error('Выберите дисциплины выбранного семестра');
      for (const row of selected) {
        const existing = snapshot.subjects.find(
          (s) => s.semester === semester && normalizeName(s.name) === normalizeName(row.name),
        );
        // Reimport refreshes source facts only. User metadata, assignments and grades survive.
        const subject = existing
          ? { ...existing, curriculum: row.curriculum }
          : { ...row, id: this.id() };
        await tx.subject(subject);
        if (!existing) snapshot.subjects.push(subject);
      }
      await tx.setting(
        'plans',
        JSON.stringify([...(snapshot.plans ?? []).filter((p) => p.url !== plan.url), plan]),
      );
      await tx.profile({ ...snapshot.profile, semester, onboarded: true });
      await this.linkSchedule(tx);
    });
  }
}
