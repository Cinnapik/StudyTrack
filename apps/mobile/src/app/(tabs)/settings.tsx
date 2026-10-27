/** Настройки оформления, профиль, резервные копии и локальные напоминания. */
import { router } from 'expo-router';
import appConfig from '../../../app.json';
import { SemesterPicker } from '../../ui/study-cards';
import { useStudy } from '../../application/context';
import {
  exportBackup,
  exportCsv,
  parseBackup,
  restoreBackup,
  mergeBackup,
} from '../../application/backup';
import { pickBackup, shareBackup } from '../../integrations/backup-files';
import { Button, Card, Choice, Label, Page, confirm, notify } from '../../ui/components';
import { ReminderSettingsCard } from '../../ui/reminder-settings';
export default function Settings() {
  const { data, service, run } = useStudy();
  return (
    <Page title="Настройки" subtitle="Ваши данные остаются на устройстве">
      <Card>
        <Label bold size={20}>
          Учебный профиль
        </Label>
        <Label muted>
          {data.profile.university || 'Университет не указан'}
          {'\n'}
          {data.profile.groupName || 'Группа не указана'} · Курс {data.profile.course} · Семестр{' '}
          {data.profile.semester}
        </Label>
        <Button title="Изменить профиль" secondary onPress={() => router.push('/profile')} />
      </Card>
      <Card>
        <Label bold>Учёба</Label>
        <SemesterPicker />
        <Button
          title="Сохранённые учебные планы"
          secondary
          onPress={() => router.push('/import-plan')}
        />
      </Card>
      <Choice
        label="Тема оформления"
        value={data.profile.theme}
        options={{ system: 'Системная', light: 'Светлая', dark: 'Тёмная' }}
        onChange={(theme) => {
          void run(() => service.saveProfile({ ...data.profile, theme })).catch(() => {
            notify('Не удалось сохранить тему. Повторите выбор.', 'error');
          });
        }}
      />
      <ReminderSettingsCard key={JSON.stringify(data.profile.reminders)} />
      <Card>
        <Label bold size={20}>
          Резервные копии
        </Label>
        <Label muted>
          JSON сохраняет профиль, дисциплины, задания, историю и расписание. CSV — таблица заданий.
          Сохраните копию вне приложения перед переустановкой.
        </Label>
        <Button title="Экспорт JSON" onPress={() => shareBackup(exportBackup(data), 'json')} />
        <Button title="Экспорт CSV" secondary onPress={() => shareBackup(exportCsv(data), 'csv')} />
        <Button
          title="Объединить с JSON"
          secondary
          onPress={async () => {
            const json = await pickBackup();
            if (!json) return;
            const preview = parseBackup(json);
            if (
              await confirm(
                'Объединить резервную копию?',
                `В копии: ${preview.subjects.length} дисциплин, ${preview.works.length} работ, ${preview.lessons.length} занятий. Профиль и настройки существующих дисциплин останутся прежними. Совпадающие записи пропускаются, новые добавляются. При конфликте работы, занятия или аттестации вся операция отменяется.`,
              )
            )
              await run(() => mergeBackup(service.repo, json, true));
          }}
        />
        <Button
          title="Восстановить из JSON"
          secondary
          onPress={async () => {
            const json = await pickBackup();
            if (!json) return;
            const preview = parseBackup(json);
            if (
              await confirm(
                'Заменить данные резервной копией?',
                `В копии: ${preview.subjects.length} дисциплин, ${preview.works.length} работ, ${preview.lessons.length} занятий. Текущие данные будут полностью заменены. Сначала сохраните их экспортом.`,
              )
            )
              await run(() => restoreBackup(service.repo, json, true));
          }}
        />
      </Card>
      <Card>
        <Label bold>Очистка данных</Label>
        <Button
          title="Удалить все данные"
          danger
          secondary
          onPress={async () => {
            if (
              await confirm(
                'Удалить все данные?',
                'Профиль, учебные планы, задания, оценки и расписание будут удалены. Перед очисткой сохраните JSON-копию.',
              )
            ) {
              await run(() => service.repo.transaction((tx) => tx.clear()));
              notify('Данные удалены');
            }
          }}
        />
      </Card>
      <Label muted size={13}>
        StudyTrack {appConfig.expo.version} · Локальный учебный журнал.
      </Label>
    </Page>
  );
}
