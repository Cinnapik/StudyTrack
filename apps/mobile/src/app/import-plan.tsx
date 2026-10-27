/** Загрузка и просмотр учебного плана. Пользователь выбирает семестр и подтверждает импорт. */
import { useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';
import { errorText, useStudy } from '../application/context';
import { controls } from '../domain/model';
import { fetchAcademicPlan, type PlanPreview } from '../integrations/academic-plan';
import { Button, Card, Choice, Field, Label, ListPage, confirm, notify } from '../ui/components';
export default function ImportPlan() {
  const { data, service, run } = useStudy();
  const [url, setUrl] = useState(''),
    [preview, setPreview] = useState<PlanPreview | null>(null),
    [semester, setSemester] = useState('1'),
    [selected, setSelected] = useState<string[]>([]),
    [error,setError] = useState('');
  const chooseSemester = (s: string, p = preview) => {
    setSemester(s);
    setSelected(
      p?.plan.subjects.filter((row) => row.semester === Number(s)).map((row) => row.id) ?? [],
    );
  };
  const load = (p: PlanPreview) => {
    setPreview(p);
    chooseSemester(String(Math.min(...p.plan.subjects.map((s) => s.semester))), p);
  };
  const rows = preview?.plan.subjects.filter((s) => s.semester === Number(semester)) ?? [];
  return (
    <ListPage
      title="Импорт учебного плана"
      subtitle="Сначала проверьте дисциплины и семестр"
      header={
        <>
          <Button title="Назад" secondary onPress={() => router.back()} />
          <Field
            label="Ссылка на открытый учебный план"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://eios.daluniver.ru/Plans/Plan.aspx?id=…"
          />
          <Button title="Загрузить план" onPress={async () => {
            Keyboard.dismiss();setError('');
            try {load(await fetchAcademicPlan(url));} catch(e) {setError(errorText(e));}
          }} />
          {!!error&&<Card><Label>{error}</Label><Label muted size={13}>Проверьте ссылку и повторите загрузку.</Label></Card>}
          {!preview &&
            (data.plans ?? []).map((plan) => (
              <Card key={plan.url}>
                <Label bold>{plan.title}</Label>
                <Label muted size={13}>
                  Сохранён {new Date(plan.importedAt).toLocaleDateString('ru-RU')}
                </Label>
                <Button
                  title="Открыть сохранённый план"
                  secondary
                  onPress={() => {
                    setUrl(plan.url);
                    load({ plan, warnings: [] });
                  }}
                />
              </Card>
            ))}
          {preview && (
            <>
              <Card>
                <Label bold>{preview.plan.title}</Label>
                {!!preview.plan.program && <Label muted>{preview.plan.program}</Label>}
                {!!preview.plan.faculty && <Label muted>{preview.plan.faculty}</Label>}
                <Label muted size={13}>
                  Часы не превращаются в количество работ. Личный профиль заполняется отдельно.
                </Label>
              </Card>
              {!!preview.warnings.length && (
                <Card>
                  {preview.warnings.map((w, i) => (
                    <Label key={i} muted size={13}>
                      {w}
                    </Label>
                  ))}
                </Card>
              )}
              <Choice
                label="Семестр для импорта"
                value={semester}
                options={Object.fromEntries(
                  [...new Set(preview.plan.subjects.map((s) => s.semester))]
                    .sort((a, b) => a - b)
                    .map((s) => [String(s), 'Семестр ' + s]),
                )}
                onChange={chooseSemester}
              />
              <Button
                title={'Импортировать дисциплины · ' + selected.length}
                disabled={!selected.length}
                onPress={async () => {
                  if (
                    !(await confirm(
                      'Сохранить учебный план?',
                      `Семестр ${semester}. Дисциплин: ${selected.length}. Существующие работы, оценки и заметки сохранятся.`,
                    ))
                  )
                    return;
                  await run(() =>
                    service.importPlan(preview.plan, Number(semester), selected, true),
                  );
                  notify('Учебный план сохранён');
                  router.replace('/subjects');
                }}
              />
            </>
          )}
        </>
      }
      data={rows}
      renderItem={(s) => (
        <Card>
          <Label bold>{s.name}</Label>
          <Label muted size={13}>
            {controls[s.control]} · Курс {s.curriculum?.course}
          </Label>
          <Label muted size={13}>
            Всего {s.curriculum?.totalHours ?? '—'} ч. · Лек {s.curriculum?.lectureHours ?? '—'} ·
            Пр {s.curriculum?.practiceHours ?? '—'} · Лаб {s.curriculum?.labHours ?? '—'}
          </Label>
          <Button
            secondary
            title={selected.includes(s.id) ? '✓ Включено — исключить' : 'Включить'}
            onPress={() =>
              setSelected((old) =>
                old.includes(s.id) ? old.filter((id) => id !== s.id) : [...old, s.id],
              )
            }
          />
        </Card>
      )}
    />
  );
}
