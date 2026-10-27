/** Редактор дисциплины и количества работ. Сокращение списка требует безопасного плана удаления. */
import { useFormGuard } from './use-form-guard';
import { useState } from 'react';
import { router } from 'expo-router';
import { useStudy } from '../application/context';
import { subjectTeachers } from '../domain/subject-matching';
import {
  controls,
  countWorks,
  emptyCounts,
  kinds,
  planCounts,
  type Counts,
  type Kind,
  type Subject,
} from '../domain/model';
import { Button, Card, Choice, Field, Label, Page, confirm, notify } from './components';
export function SubjectEditor({ subject, onClose }: { subject?: Subject; onClose?: () => void }) {
  const { data, service, run } = useStudy();
  const [value, setValue] = useState<Subject>(
    () =>
      subject ?? {
        id: service.newId(),
        name: '',
        teacher: '',
        semester: data.profile.semester,
        control: 'none',
        coursework: 'none',
        notes: '',
      },
  );
  const [counts, setCounts] = useState<Counts>(() =>
    subject ? countWorks(data.works.filter((w) => w.subjectId === subject.id)) : emptyCounts(),
  );
  const patch = (field: keyof Subject, v: string | number) =>
    setValue((p) => ({ ...p, [field]: v }));
  const allowLeave = useFormGuard({ value, counts });
  const close = () => {
    allowLeave();
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
    else router.replace('/subjects');
  };
  return (
    <Page
      title={subject ? 'Настройки дисциплины' : 'Новая дисциплина'}
      subtitle="Работы создаются после сохранения"
      back={() => {
        void confirm('Отменить изменения?', 'Несохранённые поля будут сброшены.').then((ok) => {
          if (ok) close();
        });
      }}
    >
      <Field label="Название *" value={value.name} onChangeText={(v) => patch('name', v)} />
      <Field
        label="Преподаватель"
        value={value.teacher}
        onChangeText={(v) => patch('teacher', v)}
        placeholder={
          subjectTeachers({ ...value, teacher: '' }, data) || 'Фамилия, инициалы — если известны'
        }
      />
      <Label muted size={12}>
        Пустое поле использует преподавателей из расписания. Введённое имя имеет приоритет.
      </Label>
      <Field
        label="Семестр (1–20)"
        keyboardType="number-pad"
        value={Number.isNaN(value.semester) ? '' : String(value.semester)}
        onChangeText={(v) => patch('semester', v ? Number(v) : NaN)}
      />
      <Choice
        label="Итоговый контроль"
        value={value.control}
        options={controls}
        onChange={(v) => patch('control', v)}
      />
      <Choice
        label="Курсовая"
        value={value.coursework}
        options={{ none: 'Нет', work: 'Работа', project: 'Проект', unknown: 'Уточнить' }}
        onChange={(v) => patch('coursework', v)}
      />
      <Card>
        <Label bold>Количество работ по типам</Label>
        <Label muted size={14}>
          Укажите итоговое количество. Уменьшить можно только число нетронутых заготовок. Чтобы
          распределить уже изменённые работы, смените тип в каждой работе.
        </Label>
        {(Object.keys(kinds) as Kind[]).map((kind) => (
          <Field
            key={kind}
            label={`${kinds[kind]} (0–200)`}
            keyboardType="number-pad"
            value={Number.isNaN(counts[kind]) ? '' : String(counts[kind])}
            onChangeText={(v) => setCounts((c) => ({ ...c, [kind]: v ? Number(v) : NaN }))}
          />
        ))}
      </Card>
      <Field
        label="Заметки"
        multiline
        value={value.notes}
        onChangeText={(v) => patch('notes', v)}
      />
      <Button
        title="Сохранить дисциплину"
        onPress={async () => {
          const plan = planCounts(
            data.works.filter((w) => w.subjectId === value.id),
            counts,
            new Set(data.history.map((h) => h.workId)),
          );
          if (
            plan.remove.length &&
            !(await confirm(
              'Удалить пустые заготовки?',
              `Будет удалено ${plan.remove.length} нетронутых работ. Работы с данными защищены.`,
            ))
          )
            return;
          await run(() => service.saveSubject(value, counts, true));
          notify('Дисциплина сохранена');
          if (subject) close();
          else {
            allowLeave();
            router.replace({ pathname: '/subject/[id]', params: { id: value.id } });
          }
        }}
      />
    </Page>
  );
}
