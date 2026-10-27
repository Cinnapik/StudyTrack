/** Предпросмотр XLSX: исправление строк, выбор связей и подтверждение режима сохранения. */
import { useState } from 'react';
import { router } from 'expo-router';
import { useStudy } from '../application/context';
import {
  scheduleErrors,
  subjectSuggestions,
  weekdays,
  type ScheduleRow,
} from '../domain/weekly-schedule';
import type { Lesson } from '../domain/model';
import { matchingSubjects, groupMatches } from '../domain/subject-matching';
import { pickSchedule } from '../integrations/schedule-file';
import { useFormGuard } from '../ui/use-form-guard';
import {
  Button,
  Card,
  Choice,
  Field,
  Label,
  ListPage,
  Row,
  Sheet,
  confirm,
  notify,
} from '../ui/components';
export default function ImportSchedule() {
  const { data, service, run } = useStudy();
  const [file, setFile] = useState(''),
    [rows, setRows] = useState<ScheduleRow[]>([]),
    [mode, setMode] = useState('merge'),
    [editing, setEditing] = useState<ScheduleRow | null>(null);
  const allowLeave = useFormGuard({ rows, editing });
  const selected = rows.filter((r) => r.include),
    errors = selected.filter((r) => scheduleErrors(r.lesson).length);
  const update = (row: ScheduleRow) =>
    setRows((old) =>
      old.map((r) => (r.row === row.row ? { ...row, errors: scheduleErrors(row.lesson) } : r)),
    );
  const patch = (key: keyof Lesson, value: string | number | null) =>
    setEditing((old) => (old ? { ...old, lesson: { ...old.lesson, [key]: value } } : null));
  const subjects = data.subjects.filter((s) => s.semester === data.profile.semester);
  const closeEditor = async () => {
    if (!editing) return;
    const original = rows.find((r) => r.row === editing.row);
    if (
      JSON.stringify(original?.lesson) !== JSON.stringify(editing.lesson) &&
      !(await confirm('Отменить изменения?', 'Исправления этой строки не будут применены.'))
    )
      return;
    setEditing(null);
  };
  const sorted = [...rows].sort(
    (a, b) =>
      a.lesson.weekday - b.lesson.weekday ||
      a.lesson.start.localeCompare(b.lesson.start) ||
      a.row - b.row,
  );
  return (
    <>
      <ListPage
        title="Импорт расписания"
        subtitle="Недельный шаблон из файла XLSX"
        back={() => router.back()}
        header={
          <>
            <Button
              title="Выбрать XLSX"
              onPress={async () => {
                if (
                  rows.length &&
                  !(await confirm(
                    'Выбрать другой файл?',
                    'Текущие исправления предпросмотра будут сброшены.',
                  ))
                )
                  return;
                const result = await pickSchedule();
                if (result) {
                  setFile(result.name);
                  setRows(
                    result.rows.map((row) => {
                      const match = groupMatches(row.lesson, data.profile.groupName)
                        ? matchingSubjects(row.lesson.subjectName ?? '', subjects).automatic
                        : undefined;
                      return match
                        ? {
                            ...row,
                            lesson: { ...row.lesson, subjectId: match.id, linking: 'automatic' },
                          }
                        : row;
                    }),
                  );
                }
              }}
            />
            <Label muted size={13}>
              Лист «Расписание». Даты из файла полностью игнорируются. Занятия повторяются каждую
              неделю.
            </Label>
            {!!file && (
              <>
                <Card>
                  <Label bold>{file}</Label>
                  <Label muted>
                    Строк: {rows.length} · Выбрано: {selected.length} · Ошибок: {errors.length} ·
                    Повторов: {rows.filter((r) => r.duplicate).length}
                  </Label>
                </Card>
                <Choice
                  label="Как сохранить"
                  value={mode}
                  options={{ merge: 'Объединить', replace: 'Заменить неделю' }}
                  onChange={setMode}
                />
                <Button
                  title="Сохранить расписание"
                  disabled={!selected.length || !!errors.length}
                  onPress={async () => {
                    if (
                      !(await confirm(
                        mode === 'replace' ? 'Заменить недельное расписание?' : 'Добавить занятия?',
                        `${selected.length} занятий. ${mode === 'replace' ? 'Прежние еженедельные занятия будут заменены. ' : ''}Учебный план, работы и разовые занятия сохранятся.`,
                      ))
                    )
                      return;
                    await run(() =>
                      service.importWeekly(
                        selected.map((r) => r.lesson),
                        mode as 'merge' | 'replace',
                        true,
                      ),
                    );
                    notify('Расписание сохранено');
                    allowLeave();
                    router.replace('/schedule');
                  }}
                />
              </>
            )}
          </>
        }
        data={sorted}
        renderItem={(row) => (
          <Card>
            <Label muted size={12}>
              {weekdays[row.lesson.weekday - 1] ?? 'День не указан'} · Строка {row.row}
            </Label>
            <Label bold>
              {row.lesson.start || '—'}–{row.lesson.end || '—'} ·{' '}
              {row.lesson.subjectName || 'Без названия'}
            </Label>
            <Label muted size={13}>
              {[row.lesson.teacher, row.lesson.room, row.lesson.groupName]
                .filter(Boolean)
                .join(' · ')}
            </Label>
            {row.lesson.subjectId && (
              <Label muted size={12}>
                Связано: {subjects.find((s) => s.id === row.lesson.subjectId)?.name}
              </Label>
            )}
            {row.duplicate && (
              <Label muted size={13}>
                Повтор — одинаковые занятия сохраняются один раз
              </Label>
            )}
            {!!row.errors.length && <Label size={13}>{row.errors.join('. ')}</Label>}
            <Row>
              <Button
                title="Проверить / исправить"
                secondary
                onPress={() => setEditing({ ...row, lesson: { ...row.lesson } })}
              />
              <Button
                title={row.include ? '✓ Включено' : 'Исключено'}
                secondary
                onPress={() => update({ ...row, include: !row.include })}
              />
            </Row>
          </Card>
        )}
      />
      <Sheet
        title="Занятие из файла"
        visible={!!editing}
        onClose={() => {
          void closeEditor();
        }}
      >
        {editing && (
          <>
            <Choice
              label="День недели"
              value={String(editing.lesson.weekday)}
              options={Object.fromEntries(weekdays.map((d, i) => [String(i + 1), d]))}
              onChange={(v) => patch('weekday', Number(v))}
            />
            <Field
              label="Дисциплина"
              value={editing.lesson.subjectName ?? ''}
              onChangeText={(v) => {
                patch('subjectName', v);
                patch('subjectId', null);
              }}
            />
            <Choice
              label="Связать с учебным планом"
              value={editing.lesson.subjectId ?? ''}
              options={{
                '': 'Самостоятельное занятие',
                ...Object.fromEntries(subjects.map((s) => [s.id, s.name])),
              }}
              onChange={(v) => {
                patch('subjectId', v || null);
                patch('linking', v ? 'manual' : 'independent');
              }}
            />
            {!editing.lesson.subjectId &&
              subjectSuggestions(editing.lesson.subjectName ?? '', subjects).map((s) => (
                <Button
                  key={s.id}
                  secondary
                  title={'Связать: ' + s.name}
                  onPress={() => {
                    patch('subjectId', s.id);
                    patch('linking', 'manual');
                  }}
                />
              ))}
            <Field
              label="Время с (ЧЧ:ММ)"
              value={editing.lesson.start}
              onChangeText={(v) => patch('start', v)}
            />
            <Field
              label="Время по (ЧЧ:ММ)"
              value={editing.lesson.end}
              onChangeText={(v) => patch('end', v)}
            />
            <Field
              label="Преподаватель"
              value={editing.lesson.teacher ?? ''}
              onChangeText={(v) => patch('teacher', v)}
            />
            <Field
              label="Аудитория"
              value={editing.lesson.room}
              onChangeText={(v) => patch('room', v)}
            />
            <Field
              label="Группа"
              value={editing.lesson.groupName ?? ''}
              onChangeText={(v) => patch('groupName', v)}
            />
            <Field
              label="Тип занятия"
              value={editing.lesson.lessonType ?? ''}
              onChangeText={(v) => patch('lessonType', v)}
            />
            <Button
              title="Применить исправления"
              onPress={() => {
                update(editing);
                setEditing(null);
              }}
            />
          </>
        )}
      </Sheet>
    </>
  );
}
