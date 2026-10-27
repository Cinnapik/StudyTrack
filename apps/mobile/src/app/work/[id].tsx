/** Создание и редактирование работы: статус, сроки, оценка, комментарий и история. */
import { useFormGuard } from '../../ui/use-form-guard';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useStudy } from '../../application/context';
import { kinds, statuses, activeStatuses, generatedTitle, type Work } from '../../domain/model';
import { Button, Card, Choice, Field, Label, Page, confirm, notify } from '../../ui/components';
export default function WorkEditor() {
  const { id, subjectId } = useLocalSearchParams<{ id: string; subjectId?: string }>();
  const { data, service, run } = useStudy();
  const existing = data.works.find((w) => w.id === id);
  const [value, setValue] = useState<Work>(
    () =>
      existing ?? {
        id: service.newId(),
        subjectId: subjectId ?? '',
        kind: 'lab',
        number:
          Math.max(
            0,
            ...data.works
              .filter((w) => w.subjectId === subjectId && w.kind === 'lab')
              .map((w) => w.number),
          ) + 1,
        title: '',
        issued: '',
        deadline: '',
        grade: '',
        comment: '',
        submitted: '',
        status: 'not_started',
        position:
          Math.max(
            -1,
            ...data.works.filter((w) => w.subjectId === subjectId).map((w) => w.position),
          ) + 1,
      },
  );
  const [extra, setExtra] = useState(false);
  function patch<K extends keyof Work>(key: K, v: Work[K]) {
    setValue((w) => ({ ...w, [key]: v }));
  }
  const allowLeave = useFormGuard(value);
  const close = () => {
    allowLeave();
    if (router.canGoBack()) router.back();
    else router.replace('/tasks');
  };
  const cancel = async () => {
    if (await confirm('Отменить изменения?', 'Несохранённые поля будут сброшены.')) close();
  };
  if (!data.subjects.some((s) => s.id === value.subjectId) || (id !== 'new' && !existing))
    return (
      <Page title="Работа не найдена">
        <Button title="Назад" onPress={close} />
      </Page>
    );
  const history = data.history
    .filter((h) => h.workId === id)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Page
      title={existing ? 'Редактировать работу' : 'Новая работа'}
      subtitle={data.subjects.find((s) => s.id === value.subjectId)?.name}
      back={() => {
        void cancel();
      }}
    >
      <Field
        label="Название / тема"
        placeholder={generatedTitle(value.kind, value.number)}
        value={value.title}
        onChangeText={(v) => patch('title', v)}
      />
      <Choice
        label="Тип"
        value={value.kind}
        options={kinds}
        onChange={(v) => {
          setValue((w) => ({
            ...w,
            kind: v,
            ...(!existing
              ? {
                  number:
                    Math.max(
                      0,
                      ...data.works
                        .filter((item) => item.subjectId === w.subjectId && item.kind === v)
                        .map((item) => item.number),
                    ) + 1,
                }
              : {}),
          }));
        }}
      />
      <Field
        label="Номер"
        keyboardType="number-pad"
        value={Number.isNaN(value.number) ? '' : String(value.number)}
        onChangeText={(v) => patch('number', v ? Number(v) : NaN)}
      />
      <Choice
        label="Статус"
        value={value.status === 'revision' ? 'in_progress' : value.status}
        options={activeStatuses}
        onChange={(v) => patch('status', v)}
      />
      <Field
        label="Дедлайн (ГГГГ-ММ-ДД)"
        value={value.deadline}
        onChangeText={(v) => patch('deadline', v)}
        placeholder="Необязательно"
      />
      <Field label="Оценка / балл" value={value.grade} onChangeText={(v) => patch('grade', v)} />
      <Field
        label="Комментарий"
        multiline
        value={value.comment}
        onChangeText={(v) => patch('comment', v)}
      />
      <Button
        title={extra ? 'Скрыть дополнительные даты' : 'Дополнительные даты'}
        secondary
        onPress={() => setExtra((v) => !v)}
      />
      {extra && (
        <>
          <Field
            label="Дата выдачи (ГГГГ-ММ-ДД)"
            value={value.issued}
            onChangeText={(v) => patch('issued', v)}
          />
          <Field
            label="Дата сдачи (ГГГГ-ММ-ДД)"
            value={value.submitted}
            onChangeText={(v) => patch('submitted', v)}
          />
        </>
      )}
      <Button
        title="Сохранить работу"
        onPress={async () => {
          await run(() =>
            service.saveWork({
              ...value,
              title: value.title.trim() || generatedTitle(value.kind, value.number),
            }),
          );
          notify('Работа сохранена');
          close();
        }}
      />
      {existing && (
        <Button
          title="Удалить работу"
          secondary
          danger
          onPress={async () => {
            if (
              await confirm(
                'Удалить работу?',
                'Работа, её оценка и история будут удалены без возможности отмены.',
              )
            ) {
              await run(() => service.deleteWork(id));
              close();
            }
          }}
        />
      )}
      {!!history.length && (
        <Card>
          <Label bold>История статусов</Label>
          {history.map((h) => (
            <Label key={h.id} muted size={13}>
              {new Date(h.at).toLocaleString('ru-RU')} · {statuses[h.fromStatus]} →{' '}
              {statuses[h.toStatus]}
            </Label>
          ))}
        </Card>
      )}
    </Page>
  );
}
