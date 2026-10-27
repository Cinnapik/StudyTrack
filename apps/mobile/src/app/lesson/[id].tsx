/** Редактор занятия и его связи с дисциплиной. Сохранение выполняется через сервис. */
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useStudy } from '../../application/context';
import type { Lesson } from '../../domain/model';
import { weekdays, subjectSuggestions } from '../../domain/weekly-schedule';
import { useFormGuard } from '../../ui/use-form-guard';
import { Button, Choice, Field, Label, Page, confirm, notify } from '../../ui/components';
export default function LessonEditor() {
  const { id, subjectId } = useLocalSearchParams<{ id: string; subjectId?: string }>();
  const { data, service, run } = useStudy();
  const existing = data.lessons.find((l) => l.id === id),
    subject = data.subjects.find((s) => s.id === subjectId);
  const [value, setValue] = useState<Lesson>(
    () =>
      existing ?? {
        id: service.newId(),
        subjectId: subject?.id ?? null,
        subjectName: subject?.name ?? '',
        teacher: subject?.teacher ?? '',
        groupName: '',
        lessonType: '',
        weekday: 1,
        start: '09:00',
        end: '10:30',
        room: '',
        notes: '',
      },
  );
  const allowLeave = useFormGuard(value);
  const close = () => {
    allowLeave();
    if (router.canGoBack()) router.back();
    else router.replace('/schedule');
  };
  const patch = (key: keyof Lesson, v: string | number | null) =>
    setValue((old) => ({ ...old, [key]: v }));
  if (id !== 'new' && !existing)
    return (
      <Page title="Занятие не найдено">
        <Button title="Назад" onPress={close} />
      </Page>
    );
  return (
    <Page
      title={existing ? 'Изменить занятие' : 'Новое занятие'}
      subtitle={value.date ? 'Прежнее разовое занятие' : 'Повторяется каждую неделю'}
      back={() => {
        void confirm('Отменить изменения?', 'Несохранённые изменения будут сброшены.').then(
          (ok) => {
            if (ok) close();
          },
        );
      }}
    >
      <Field
        label="Название дисциплины *"
        value={value.subjectName ?? data.subjects.find((s) => s.id === value.subjectId)?.name ?? ''}
        onChangeText={(v) => patch('subjectName', v)}
      />
      <Choice
        label="Связь с учебным планом"
        value={value.subjectId ?? ''}
        options={{
          '': 'Самостоятельное занятие',
          ...Object.fromEntries(
            data.subjects
              .filter((s) => s.semester === data.profile.semester || s.id === value.subjectId)
              .map((s) => [s.id, s.name]),
          ),
        }}
        onChange={(v) => {
          const s = data.subjects.find((s) => s.id === v);
          setValue((old) => ({
            ...old,
            subjectId: v || null,
            linking: v ? 'manual' : 'independent',
            subjectName: s?.name ?? old.subjectName,
            teacher: old.teacher || s?.teacher || '',
          }));
        }}
      />
      {!value.subjectId &&
        subjectSuggestions(
          value.subjectName ?? '',
          data.subjects.filter((s) => s.semester === data.profile.semester),
        ).map((s) => (
          <Button
            key={s.id}
            title={'Связать: ' + s.name}
            secondary
            onPress={() => setValue((old) => ({ ...old, subjectId: s.id, linking: 'manual' }))}
          />
        ))}
      {value.date ? (
        <Label muted>
          Дата прежней записи: {value.date}. Преобразование в неделю доступно в расписании.
        </Label>
      ) : (
        <Choice
          label="День недели"
          value={String(value.weekday)}
          options={Object.fromEntries(weekdays.map((d, i) => [String(i + 1), d]))}
          onChange={(v) => patch('weekday', Number(v))}
        />
      )}
      <Field label="Начало (ЧЧ:ММ)" value={value.start} onChangeText={(v) => patch('start', v)} />
      <Field label="Окончание (ЧЧ:ММ)" value={value.end} onChangeText={(v) => patch('end', v)} />
      <Field
        label="Преподаватель"
        value={value.teacher ?? ''}
        onChangeText={(v) => patch('teacher', v)}
      />
      <Field
        label="Тип занятия"
        placeholder="Лекция, практика…"
        value={value.lessonType ?? ''}
        onChangeText={(v) => patch('lessonType', v)}
      />
      <Field label="Аудитория" value={value.room} onChangeText={(v) => patch('room', v)} />
      <Field
        label="Группа"
        value={value.groupName ?? ''}
        onChangeText={(v) => patch('groupName', v)}
      />
      <Field
        label="Заметки"
        multiline
        value={value.notes}
        onChangeText={(v) => patch('notes', v)}
      />
      <Button
        title="Сохранить занятие"
        onPress={async () => {
          await run(() => service.saveLesson(value));
          notify('Занятие сохранено');
          close();
        }}
      />
      {existing && (
        <Button
          title="Удалить занятие"
          secondary
          danger
          onPress={async () => {
            if (await confirm('Удалить занятие?', 'Занятие исчезнет из расписания.')) {
              await run(() => service.deleteLesson(id));
              close();
            }
          }}
        />
      )}
    </Page>
  );
}
