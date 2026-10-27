/** Список дисциплин текущего семестра с поиском и прогрессом выполнения работ. */
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useStudy } from '../../application/context';
import { Button, Card, SearchInput, Label, ListPage } from '../../ui/components';
import { SubjectCard, SemesterPicker } from '../../ui/study-cards';
export default function Tasks() {
  const { data } = useStudy();
  const [query, setQuery] = useState('');
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
  return (
    <ListPage
      title="Задания"
      subtitle="Работы по дисциплинам"
      header={
        <>
          <SemesterPicker />
          <SearchInput value={query} onChangeText={setQuery} />
        </>
      }
      data={subjects}
      renderItem={(s) => <SubjectCard subject={s} />}
      empty={
        <Card>
          <Label muted>
            {query
              ? 'Ничего не найдено'
              : 'Добавьте дисциплины в учебном плане, затем задайте количество работ.'}
          </Label>
          <Button title="Открыть учебный план" onPress={() => router.navigate('/subjects')} />
        </Card>
      }
    />
  );
}
