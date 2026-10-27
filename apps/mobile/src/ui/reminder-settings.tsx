/** Настройка локальных напоминаний: изменения формы применяются после сохранения. */
import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useStudy, useReminderStatus } from '../application/context';
import { requestReminderPermission } from '../integrations/notifications';
import { Button, Card, Choice, Field, Label } from './components';

export function ReminderSettingsCard() {
  const { data, service, run } = useStudy();
  const reminderStatus = useReminderStatus();
  const [settings, setSettings] = useState(data.profile.reminders);
  return (
    <Card>
      <Label bold size={20}>
        Напоминания о сроках
      </Label>
      <Label muted>
        Одна сводка в день по работам, курсовым и аттестации. Без интернета. Сохраните настройки
        кнопкой ниже.
      </Label>
      <Choice
        label="Напоминания"
        value={settings.enabled ? 'yes' : 'no'}
        options={{ no: 'Выключены', yes: 'Включены' }}
        onChange={(v) => setSettings((s) => ({ ...s, enabled: v === 'yes' }))}
      />
      <Choice
        label="Когда напомнить"
        value={String(settings.daysBefore)}
        options={{ '0': 'В день срока', '1': 'За день', '3': 'За 3 дня', '7': 'За неделю' }}
        onChange={(v) => setSettings((s) => ({ ...s, daysBefore: Number(v) as 0 | 1 | 3 | 7 }))}
      />
      <Field
        label="Время напоминания (ЧЧ:ММ)"
        value={settings.time}
        onChangeText={(time) => setSettings((s) => ({ ...s, time }))}
      />
      <Button
        title="Сохранить напоминания"
        onPress={async () => {
          if (settings.enabled) await requestReminderPermission();
          await run(() => service.saveProfile({ ...data.profile, reminders: settings }));
        }}
      />
      <Label muted>{reminderStatus}</Label>
      <Label muted>
        Планируются ближайшие 32 даты. Прошедшие напоминания не догоняются. Откройте приложение
        после смены часового пояса, чтобы обновить время.
      </Label>
      {Platform.OS === 'android' && (
        <Button title="Разрешения Android" secondary onPress={() => Linking.openSettings()} />
      )}
    </Card>
  );
}
