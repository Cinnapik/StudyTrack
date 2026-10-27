/** Недельное расписание, выбор даты и явное преобразование прежних разовых занятий. */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useStudy } from '../../application/context';
import { localDate } from '../../domain/model';
import { lessonsForDate } from '../../domain/weekly-schedule';
import {
  Button,
  Card,
  Label,
  ListPage,
  confirm,
  usePalette,
  Sheet,
  IconButton,
  ActionMenu,
  EmptyState,
} from '../../ui/components';
import { Calendar } from '../../ui/calendar';
import { LessonCard, useNow } from '../../ui/study-cards';
export default function Schedule() {
  const { data, service, run } = useStudy(),
    now = useNow(),
    c = usePalette();
  const [date, setDate] = useState(() => new Date()),
    [calendar, setCalendar] = useState(false),
    [legacy, setLegacy] = useState(false);
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const [stripWidth, setStripWidth] = useState(240);
  const visibleDays = Math.min(7, Math.max(1, Math.floor(stripWidth / 48)));
  const dayWidth = stripWidth / visibleDays;
  const weekday = (date.getDay() + 6) % 7;
  const scrollX = Math.min(Math.max(0, weekday - 2), 7 - visibleDays) * dayWidth;
  useEffect(() => {
    strip.current?.scrollTo({ x: scrollX, animated: false });
  }, [scrollX]);
  const shift = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
  };
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const dated = data.lessons.filter((l) => l.date);
  return (
    <>
      <ListPage
        title="Расписание"
        subtitle={date.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          weekday: 'long',
        })}
        onSubtitlePress={() => setCalendar(true)}
        actions={
          <ActionMenu
            title="Действия с расписанием"
            items={[
              {
                title: 'Добавить занятие',
                action: () => router.push({ pathname: '/lesson/[id]', params: { id: 'new' } }),
              },
              { title: 'Импортировать XLSX', action: () => router.push('/import-schedule') },
              { title: 'Перейти к сегодняшнему дню', action: () => setDate(new Date()) },
              ...(dated.length
                ? [{ title: 'Прежние разовые занятия', action: () => setLegacy(true) }]
                : []),
            ]}
          />
        }
        header={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton name="back" label="Предыдущая неделя" onPress={() => shift(-7)} />
            <ScrollView
              ref={strip}
              horizontal
              onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
              snapToInterval={dayWidth}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => strip.current?.scrollTo({ x: scrollX, animated: false })}
              style={{ flex: 1 }}
            >
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, i) => {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                const selected = localDate(d) === localDate(date);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={d.toLocaleDateString('ru-RU')}
                    accessibilityState={{ selected }}
                    onPress={() => setDate(d)}
                    style={{
                      minWidth: 48,
                      width: dayWidth,
                      minHeight: 64,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      borderRadius: 10,
                      backgroundColor: selected ? c.soft : 'transparent',
                      borderWidth: selected ? 1 : 0,
                      borderColor: c.accent,
                    }}
                  >
                    <Label muted size={12}>
                      {day}
                    </Label>
                    <Label bold={selected}>{d.getDate()}</Label>
                  </Pressable>
                );
              })}
            </ScrollView>
            <IconButton name="next" label="Следующая неделя" onPress={() => shift(7)} />
          </View>
        }
        data={lessonsForDate(data.lessons, date)}
        renderItem={(l) => <LessonCard lesson={l} date={date} now={now} />}
        empty={
          <EmptyState
            title="В этот день занятий нет"
            detail="Добавить занятие или импортировать XLSX можно через меню ⋯."
          />
        }
      />
      {calendar && (
        <Calendar value={date} visible onClose={() => setCalendar(false)} onChange={setDate} />
      )}
      <Sheet visible={legacy} title="Прежние разовые занятия" onClose={() => setLegacy(false)}>
        <Label muted>Записи сохранены с прежними датами и не входят в недельный шаблон.</Label>
        <Button
          title="Сделать еженедельными"
          onPress={async () => {
            if (
              await confirm(
                'Преобразовать разовые занятия?',
                'Даты будут убраны из активных записей, точные повторы объединятся. Исходные записи сохранятся в локальном архиве миграции.',
              )
            ) {
              await run(() => service.convertDatedLessons(true));
              setLegacy(false);
            }
          }}
        />
        {dated.map((l) => (
          <Card
            key={l.id}
            onPress={() => {
              setLegacy(false);
              router.push({ pathname: '/lesson/[id]', params: { id: l.id } });
            }}
          >
            <Label>
              {l.date} · {l.start} ·{' '}
              {l.subjectName || data.subjects.find((s) => s.id === l.subjectId)?.name}
            </Label>
          </Card>
        ))}
      </Sheet>
    </>
  );
}
