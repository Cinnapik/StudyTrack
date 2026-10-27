/** Учебный план: поиск дисциплин, преподаватели и управление импортом. */
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useStudy, useStudyIndex } from '../../application/context';
import { controls } from '../../domain/model';
import { Button, Card, SearchInput, Label, ListPage, Row, EmptyState } from '../../ui/components';
import { SemesterPicker } from '../../ui/study-cards';
export default function Subjects() {
  const { data } = useStudy();
  const { teachersBySubject } = useStudyIndex();
  const [query, setQuery] = useState('');
  const hasPlan = data.subjects.length > 0;
  const subjects = useMemo(
    () =>
      data.subjects
        .filter(
          (s) =>
            s.semester === data.profile.semester &&
            s.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data.subjects, data.profile.semester, query],
  );
  const management = (
    <Card>
      <Label bold size={14}>
        Управление учебным планом
      </Label>
      <SemesterPicker />
      <Row>
        <Button
          title="Импорт по ссылке"
          secondary={hasPlan}
          onPress={() => router.push('/import-plan')}
        />
        <Button title="Добавить вручную" secondary onPress={() => router.push('/subject/new')} />
      </Row>
    </Card>
  );
  return (
    <ListPage
      title="Учебный план"
      subtitle={'Семестр ' + data.profile.semester}
      header={
        <>
          {!hasPlan && management}
          {hasPlan && <SearchInput value={query} onChangeText={setQuery} />}
        </>
      }
      data={subjects}
      renderItem={(s) => (
        <Card onPress={() => router.push({ pathname: '/subject/[id]', params: { id: s.id } })}>
          <Label bold size={16}>
            {s.name}
          </Label>
          {!!teachersBySubject.get(s.id) && (
            <Label muted size={13}>
              {teachersBySubject.get(s.id)}
            </Label>
          )}
          <Label muted size={13}>
            {controls[s.control]}
            {s.coursework !== 'none' && s.coursework !== 'unknown' ? ' · Курсовая' : ''}
          </Label>
          {!!s.curriculum && (
            <Label muted size={12}>
              {s.curriculum.totalHours ?? '—'} ч. всего · Лек {s.curriculum.lectureHours ?? '—'} ·
              Пр {s.curriculum.practiceHours ?? '—'} · Лаб {s.curriculum.labHours ?? '—'}
            </Label>
          )}
        </Card>
      )}
      empty={
        <EmptyState
          title={query ? 'Ничего не найдено' : 'Дисциплины не добавлены'}
          detail={
            query
              ? 'Попробуйте другое название.'
              : 'Импортируйте учебный план или добавьте дисциплины вручную.'
          }
        />
      }
      footer={hasPlan ? management : undefined}
    />
  );
}
