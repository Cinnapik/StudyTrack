/** Карточка дисциплины: категории работ, массовые статусы, аттестация и заметки. */
import { useState, useCallback, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useStudy, useStudyIndex } from '../../application/context';
import { controls, kinds, isCompleted } from '../../domain/model';
import { workSequences } from '../../domain/work-sequence';
import {
  Button,
  Card,
  Choice,
  Label,
  ListPage,
  Progress,
  Row,
  confirm,
  ActionMenu,
  IconButton,
  EmptyState,
  notify,
} from '../../ui/components';
import { SubjectEditor } from '../../ui/subject-editor';
import { AssessmentEditor } from '../../ui/assessment-editor';
import { WorkCard, StatusSheet } from '../../ui/work-list';
export default function SubjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, service, run } = useStudy();
  const { worksBySubject, teachersBySubject } = useStudyIndex();
  const works = useMemo(() => worksBySubject.get(id) ?? [], [worksBySubject, id]);
  const groups = useMemo(() => workSequences(works), [works]);
  const [editing, setEditing] = useState(false),
    [tab, setTab] = useState('works'),
    [category, setCategory] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [bulk, setBulk] = useState(false);
  const toggle = useCallback(
    (id: string) =>
      setSelected((old) => (old.includes(id) ? old.filter((v) => v !== id) : [...old, id])),
    [],
  );
  const exitSelection = () => {
    setSelected([]);
    setBulk(false);
  };
  useFocusEffect(
    useCallback(() => {
      if (!editing && !selected.length) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (selected.length) {
          setSelected([]);
          setBulk(false);
        } else
          void confirm('Отменить изменения?', 'Несохранённые поля будут сброшены.').then((ok) => {
            if (ok) setEditing(false);
          });
        return true;
      });
      return () => sub.remove();
    }, [editing, selected.length]),
  );
  const subject = data.subjects.find((s) => s.id === id);
  if (!subject)
    return (
      <ListPage
        title="Дисциплина не найдена"
        data={[]}
        renderItem={() => <></>}
        header={<Button title="К учебному плану" onPress={() => router.replace('/subjects')} />}
      />
    );
  if (editing) return <SubjectEditor subject={subject} onClose={() => setEditing(false)} />;
  const current = groups.find((g) => g.kind === category) ?? groups[0];
  const currentWorks = current?.items ?? [];
  const chosen = selected.filter((id) => currentWorks.some((w) => w.id === id));
  const back = () => {
    if (selected.length) exitSelection();
    else if (router.canGoBack()) router.back();
    else router.replace('/tasks');
  };
  const edit = () => {
    exitSelection();
    setEditing(true);
  };
  return (
    <>
      <ListPage
        title={subject.name}
        subtitle={teachersBySubject.get(subject.id) || 'Преподаватель не указан'}
        back={back}
        actions={
          <ActionMenu
            title="Действия с дисциплиной"
            items={[
              {
                title: 'Добавить работу',
                action: () =>
                  router.push({ pathname: '/work/[id]', params: { id: 'new', subjectId: id } }),
              },
              { title: 'Задать количество работ', action: edit },
              {
                title: 'Настроить аттестацию',
                action: () => {
                  exitSelection();
                  setTab('assessment');
                },
              },
              { title: 'Редактировать дисциплину', action: edit },
              {
                title: 'Добавить занятие',
                action: () =>
                  router.push({ pathname: '/lesson/[id]', params: { id: 'new', subjectId: id } }),
              },
              {
                title: 'Удалить дисциплину',
                danger: true,
                action: async () => {
                  if (
                    await confirm(
                      'Удалить дисциплину?',
                      subject.name +
                        ': ' +
                        works.length +
                        ' работ, оценки и аттестация будут удалены. Занятия сохранятся.',
                    )
                  ) {
                    await run(() => service.deleteSubject(id));
                    router.replace('/subjects');
                  }
                },
              },
            ]}
          />
        }
        data={tab === 'works' ? currentWorks : []}
        renderItem={(w) => (
          <WorkCard
            work={w}
            selecting={chosen.length > 0}
            selected={chosen.includes(w.id)}
            onSelect={toggle}
            onLongPress={toggle}
          />
        )}
        header={
          <>
            <Progress works={works} />
            <Label muted size={12}>
              {controls[subject.control]} · Осталось {works.filter((w) => !isCompleted(w)).length}
            </Label>
            <Choice
              compact
              label="Раздел"
              value={tab}
              onChange={(value) => {
                exitSelection();
                setTab(value);
              }}
              options={{ works: 'Работы', assessment: 'Аттестация', notes: 'О дисциплине' }}
            />
            {tab === 'works' && (
              <>
                {groups.length > 1 ? (
                  <Choice<string>
                    compact
                    label="Категория"
                    value={current?.kind ?? ''}
                    options={Object.fromEntries(
                      groups.map((g) => [g.kind, kinds[g.kind] + ' · ' + g.items.length]),
                    )}
                    onChange={(value) => {
                      exitSelection();
                      setCategory(value);
                    }}
                  />
                ) : (
                  current && (
                    <Label muted size={13}>
                      {kinds[current.kind]} · {current.items.length}
                    </Label>
                  )
                )}
                {chosen.length > 0 ? (
                  <Card>
                    <Row>
                      <Label bold>Выбрано: {chosen.length}</Label>
                      <IconButton name="close" label="Снять выделение" onPress={exitSelection} />
                    </Row>
                    <Row>
                      <Button
                        title="Выбрать все"
                        secondary
                        onPress={() => setSelected(currentWorks.map((w) => w.id))}
                      />
                      <Button title="Изменить статус" onPress={() => setBulk(true)} />
                    </Row>
                  </Card>
                ) : (
                  <Label muted size={12}>
                    Удерживайте работу для массового выбора
                  </Label>
                )}
              </>
            )}
            {tab === 'assessment' && (
              <>
                {subject.control !== 'none' ? (
                  <AssessmentEditor subjectId={id} kind="final" title={controls[subject.control]} />
                ) : (
                  <Label muted>Итоговый контроль не предусмотрен</Label>
                )}
                {(subject.coursework === 'work' || subject.coursework === 'project') && (
                  <AssessmentEditor
                    subjectId={id}
                    kind="coursework"
                    title={subject.coursework === 'work' ? 'Курсовая работа' : 'Курсовой проект'}
                  />
                )}
                {subject.coursework === 'unknown' && (
                  <Label muted>Уточните наличие курсовой в настройках дисциплины.</Label>
                )}
              </>
            )}
            {tab === 'notes' && (
              <>
                <Card>
                  <Label bold>Личные заметки</Label>
                  <Label muted>{subject.notes || 'Заметок пока нет'}</Label>
                </Card>
                {!!subject.curriculum && (
                  <Card>
                    <Label bold>Из учебного плана</Label>
                    <Label muted>
                      Всего {subject.curriculum.totalHours ?? '—'} ч. · Лекции{' '}
                      {subject.curriculum.lectureHours ?? '—'} · Практики{' '}
                      {subject.curriculum.practiceHours ?? '—'} · Лабораторные{' '}
                      {subject.curriculum.labHours ?? '—'}
                    </Label>
                    <Label muted>{subject.curriculum.controlText}</Label>
                  </Card>
                )}
                {data.lessons
                  .filter((l) => l.subjectId === id)
                  .map((l) => (
                    <Card
                      key={l.id}
                      onPress={() =>
                        router.push({ pathname: '/lesson/[id]', params: { id: l.id } })
                      }
                    >
                      <Label>
                        {l.date || ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][l.weekday]} ·{' '}
                        {l.start}–{l.end}
                      </Label>
                    </Card>
                  ))}
              </>
            )}
          </>
        }
        empty={
          tab === 'works' ? (
            <EmptyState
              title="Работы не добавлены"
              detail="Добавьте работу или задайте количество через меню дисциплины."
            />
          ) : undefined
        }
      />
      <StatusSheet
        visible={bulk}
        title={'Статус для ' + chosen.length + ' работ'}
        onClose={() => setBulk(false)}
        onSelect={async (status) => {
          await run(() => service.setWorkStatuses(chosen, status));
          notify('Обновлён статус работ: ' + chosen.length);
          exitSelection();
        }}
      />
    </>
  );
}
