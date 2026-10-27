/** Карточки дисциплин и занятий, выбор семестра и часы активного экрана. */
import { memo, useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useStudy, useStudyIndex } from '../application/context';
import { isCompleted, localDate, type Lesson, type Subject } from '../domain/model';
import { Card, Choice, Label, Progress, usePalette, notify } from './components';
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      // После потери фокуса таймер очищается; скрытая вкладка не обновляет часы.
      const t = setInterval(() => setNow(new Date()), 30000);
      return () => clearInterval(t);
    }, []),
  );
  return now;
}
export function SemesterPicker() {
  const { data, service, run } = useStudy();
  const semesters = [
    ...new Set([
      data.profile.semester,
      ...data.subjects.map((s) => s.semester),
      ...(data.plans ?? []).flatMap((p) => p.subjects.map((s) => s.semester)),
    ]),
  ].sort((a, b) => a - b);
  return (
    <Choice
      label="Текущий семестр"
      value={String(data.profile.semester)}
      options={Object.fromEntries(semesters.map((s) => [String(s), 'Семестр ' + s]))}
      onChange={(s) => {
        void run(() => service.saveProfile({ ...data.profile, semester: Number(s) })).catch((e) =>
          notify(String(e), 'error'),
        );
      }}
    />
  );
}
export const SubjectCard = memo(function SubjectCard({ subject }: { subject: Subject }) {
  const { worksBySubject, teachersBySubject } = useStudyIndex();
  const works = worksBySubject.get(subject.id) ?? [];
  const teacher = teachersBySubject.get(subject.id);
  const deadline = works
    .filter((w) => !isCompleted(w) && w.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0]?.deadline;
  return (
    <Card onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.id } })}>
      <Label bold size={18}>
        {subject.name}
      </Label>
      {!!teacher && (
        <Label muted size={13}>
          {teacher}
        </Label>
      )}
      <Progress works={works} />
      {!!deadline && (
        <Label muted size={13}>
          Ближайший срок · {deadline}
        </Label>
      )}
    </Card>
  );
});
export function LessonCard({ lesson, date, now }: { lesson: Lesson; date: Date; now: Date }) {
  const { data } = useStudy(),
    c = usePalette();
  const subject = data.subjects.find((s) => s.id === lesson.subjectId);
  const time =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const current = localDate(date) === localDate(now) && time >= lesson.start && time < lesson.end;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lesson.start + ' ' + (lesson.subjectName || subject?.name)}
      onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: lesson.id } })}
      style={{
        backgroundColor: c.card,
        borderColor: current ? c.accent : c.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <View style={{ width: 48, gap: 4 }}>
        <Label bold size={15}>
          {lesson.start}
        </Label>
        <Label muted size={12}>
          {lesson.end}
        </Label>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Label bold>{lesson.subjectName || subject?.name || 'Дисциплина'}</Label>
        {current && <Label size={12}>Сейчас идёт</Label>}
        {!!(lesson.teacher || subject?.teacher) && (
          <Label muted size={13}>
            {lesson.teacher || subject?.teacher}
          </Label>
        )}
        {!!(lesson.lessonType || lesson.room || lesson.groupName) && (
          <Label muted size={12}>
            {[lesson.lessonType, lesson.room && 'ауд. ' + lesson.room, lesson.groupName]
              .filter(Boolean)
              .join(' · ')}
          </Label>
        )}
      </View>
    </Pressable>
  );
}
