/** Редактирование результата, даты и оценки аттестации дисциплины. */
import { useState } from 'react';
import { useStudy } from '../application/context';
import { outcomes, type Assessment } from '../domain/model';
import { Button, Card, Choice, Field, Label } from './components';
export function AssessmentEditor({
  subjectId,
  kind,
  title,
}: {
  subjectId: string;
  kind: Assessment['kind'];
  title: string;
}) {
  const { data, service, run } = useStudy();
  const [value, setValue] = useState<Assessment>(
    () =>
      data.assessments.find((a) => a.subjectId === subjectId && a.kind === kind) ?? {
        subjectId,
        kind,
        outcome: 'unscheduled',
        date: '',
        grade: '',
        notes: '',
      },
  );
  const [saved, setSaved] = useState(false);
  function patch<K extends keyof Assessment>(key: K, v: Assessment[K]) {
    setSaved(false);
    setValue((a) => ({ ...a, [key]: v }));
  }
  return (
    <Card>
      <Label bold size={20}>
        {title}
      </Label>
      <Choice
        label="Результат"
        value={value.outcome}
        options={outcomes}
        onChange={(v) => patch('outcome', v)}
      />
      <Field
        label="Дата (ГГГГ-ММ-ДД, необязательно)"
        value={value.date}
        onChangeText={(v) => patch('date', v)}
        placeholder="2026-12-25"
      />
      <Field label="Оценка / балл" value={value.grade} onChangeText={(v) => patch('grade', v)} />
      <Field
        label="Комментарий"
        multiline
        value={value.notes}
        onChangeText={(v) => patch('notes', v)}
      />
      <Button
        title={saved ? 'Результат сохранён' : 'Сохранить результат'}
        onPress={async () => {
          await run(() => service.saveAssessment(value));
          setSaved(true);
        }}
      />
    </Card>
  );
}
