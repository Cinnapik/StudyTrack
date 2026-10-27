/** Редактирование личных данных и текущего семестра с защитой несохранённых изменений. */
import { useFormGuard } from '../ui/use-form-guard';
import { useState } from 'react';
import { router } from 'expo-router';
import { useStudy } from '../application/context';
import { Button, Field, Page, confirm, notify } from '../ui/components';
export default function Profile() {
  const { data, service, run } = useStudy();
  const [value, setValue] = useState(data.profile);
  const allowLeave = useFormGuard(value);
  const close = () => {
    allowLeave();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Page title="Учебный профиль" subtitle="Все поля доступны для изменения позже">
      <Button
        title="Отмена"
        secondary
        onPress={async () => {
          if (await confirm('Отменить изменения?', 'Несохранённые поля будут сброшены.')) close();
        }}
      />
      {(
        [
          ['lastName', 'Фамилия'],
          ['firstName', 'Имя'],
          ['patronymic', 'Отчество'],
          ['faculty', 'Факультет'],
          ['program', 'Направление / специальность'],
        ] as const
      ).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={value[key] ?? ''}
          onChangeText={(text) => setValue((v) => ({ ...v, [key]: text }))}
        />
      ))}
      <Field
        label="Университет (необязательно)"
        value={value.university}
        onChangeText={(university) => setValue((v) => ({ ...v, university }))}
      />
      <Field
        label="Группа"
        value={value.groupName}
        onChangeText={(groupName) => setValue((v) => ({ ...v, groupName }))}
      />
      <Field
        label="Курс (1–10)"
        keyboardType="number-pad"
        value={Number.isNaN(value.course) ? '' : String(value.course)}
        onChangeText={(course) =>
          setValue((v) => ({ ...v, course: course ? Number(course) : NaN }))
        }
      />
      <Field
        label="Текущий семестр (1–20)"
        keyboardType="number-pad"
        value={Number.isNaN(value.semester) ? '' : String(value.semester)}
        onChangeText={(semester) =>
          setValue((v) => ({ ...v, semester: semester ? Number(semester) : NaN }))
        }
      />
      <Field
        label="Начало семестра (ГГГГ-ММ-ДД)"
        value={value.startDate}
        onChangeText={(startDate) => setValue((v) => ({ ...v, startDate }))}
      />
      <Field
        label="Конец семестра (ГГГГ-ММ-ДД)"
        value={value.endDate}
        onChangeText={(endDate) => setValue((v) => ({ ...v, endDate }))}
      />
      <Button
        title="Сохранить профиль"
        onPress={async () => {
          await run(() => service.saveProfile({ ...value, onboarded: true }));
          notify('Профиль сохранён');
          close();
        }}
      />
    </Page>
  );
}
