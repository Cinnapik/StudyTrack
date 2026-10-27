/** Главная: занятия на сегодня и последовательности работ текущего семестра. */
import { router } from 'expo-router';
import { useMemo, useCallback } from 'react';
import { useStudy, useStudyIndex } from '../../application/context';
import type { Subject } from '../../domain/model';
import { lessonsForDate } from '../../domain/weekly-schedule';
import { Button, Card, Label, ListPage, EmptyState } from '../../ui/components';
import { LessonCard, useNow } from '../../ui/study-cards';
import { AssignmentStepper } from '../../ui/work-list';
export default function Home() {
  const { data } = useStudy(),
    now = useNow();
  const { worksBySubject } = useStudyIndex();
  const lessons = lessonsForDate(data.lessons, now);
  const subjects = useMemo(
    () =>
      data.subjects
        .filter((s) => s.semester === data.profile.semester && worksBySubject.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data.subjects, data.profile.semester, worksBySubject],
  );
  const renderSubject = useCallback(
    (s: Subject) => <AssignmentStepper subject={s} works={worksBySubject.get(s.id)!} />,
    [worksBySubject],
  );
  return (
    <ListPage
      title={data.profile.firstName ? 'Привет, ' + data.profile.firstName : 'Главная'}
      subtitle={now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
      header={
        <>
          <Label bold size={18}>
            Сегодня
          </Label>
          {lessons.map((l) => (
            <LessonCard key={l.id} lesson={l} date={now} now={now} />
          ))}
          {!lessons.length && (
            <Card>
              <Label muted>На сегодня занятий нет</Label>
            </Card>
          )}
          <Button title="Всё расписание" secondary onPress={() => router.navigate('/schedule')} />
          <Label bold size={18}>
            Учебные работы
          </Label>
          {!!subjects.length && (
            <Label muted size={12}>
              ✓ Завершено · пунктир — следующая работа · номер — открыть
            </Label>
          )}
        </>
      }
      data={subjects}
      initialNumToRender={2}
      renderItem={renderSubject}
      empty={
        <EmptyState
          title="Пока нет назначенных работ"
          detail="Добавьте работы в нужной дисциплине."
          action={<Button title="К заданиям" secondary onPress={() => router.navigate('/tasks')} />}
        />
      }
    />
  );
}
