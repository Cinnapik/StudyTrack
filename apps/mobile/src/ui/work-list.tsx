/** Карточки работ, выбор статуса и последовательности прогресса с доступными целями нажатия. */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useStudyActions } from '../application/context';
import {
  overdue,
  statuses,
  activeStatuses,
  isCompleted,
  kinds,
  type Status,
  type Subject,
  type Work,
} from '../domain/model';
import { workSequences } from '../domain/work-sequence';
import {
  Card,
  Label,
  Sheet,
  MenuItem,
  IconButton,
  Icon,
  notify,
  usePalette,
  useReducedMotion,
} from './components';

export function StatusSheet({
  visible,
  title,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  value?: Status;
  onClose: () => void;
  onSelect: (status: Status) => Promise<void>;
}) {
  return (
    <Sheet title={title} visible={visible} onClose={onClose}>
      {Object.entries(activeStatuses).map(([key, label]) => (
        <MenuItem
          key={key}
          title={label}
          selected={value === key}
          onPress={async () => {
            await onSelect(key as Status);
            onClose();
          }}
        />
      ))}
    </Sheet>
  );
}
export const WorkCard = memo(function WorkCard({
  work,
  selecting = false,
  selected = false,
  onSelect,
  onLongPress,
}: {
  work: Work;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
}) {
  const { service, run } = useStudyActions();
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const held = useRef(false);
  const completed = isCompleted(work);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.soft : c.card,
      }}
    >
      <Pressable
        accessibilityRole={selecting ? 'checkbox' : 'button'}
        accessibilityState={selecting ? { checked: selected } : undefined}
        accessibilityLabel={`№${work.number}. ${work.title}. ${statuses[work.status]}${selecting ? ', выбрать' : ''}`}
        onPressIn={() => {
          held.current = false;
        }}
        delayLongPress={450}
        onLongPress={() => {
          held.current = true;
          onLongPress?.(work.id);
        }}
        onPress={() => {
          if (held.current) return;
          if (selecting) onSelect?.(work.id);
          else router.push({ pathname: '/work/[id]', params: { id: work.id } });
        }}
        style={{
          flex: 1,
          minHeight: 64,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {selecting && (
          <View
            style={{
              width: 24,
              height: 24,
              borderWidth: 1,
              borderRadius: 6,
              borderColor: c.accent,
            }}
          >
            {selected && <Icon name="check" color={c.accent} />}
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Label bold size={15}>
            {work.title}
          </Label>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {completed && <Icon name="check" color={c.success} />}
            <Label muted size={13}>
              {statuses[work.status]}
              {work.grade ? ' · Оценка ' + work.grade : ''}
            </Label>
          </View>
          {!!work.deadline && (
            <Label muted size={12}>
              {overdue(work) ? 'Просрочено · ' : 'До '}
              {work.deadline}
            </Label>
          )}
        </View>
      </Pressable>
      {!selecting && (
        <IconButton name="more" label={'Статус: ' + work.title} onPress={() => setOpen(true)} />
      )}
      <StatusSheet
        visible={open}
        title={work.title}
        value={work.status}
        onClose={() => setOpen(false)}
        onSelect={async (status) => {
          await run(() => service.setWorkStatuses([work.id], status));
          notify('Статус обновлён');
        }}
      />
    </View>
  );
});

export const AssignmentStepper = memo(function AssignmentStepper({
  subject,
  works,
}: {
  subject: Subject;
  works: Work[];
}) {
  const c = usePalette();
  const [fade] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  const signature = works.map((w) => w.id + w.status).join('|');
  const groups = useMemo(() => workSequences(works), [works]);
  // Первое появление карточки не анимируется; эффект нужен только при изменении статусов.
  const previousSignature = useRef(signature);
  useEffect(() => {
    const changed = previousSignature.current !== signature;
    previousSignature.current = signature;
    if (reduced || !changed) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0.65);
    const animation = Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [fade, signature, reduced]);
  return (
    <Animated.View style={{ opacity: fade }}>
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Открыть дисциплину ' + subject.name}
          onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.id } })}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View style={{ flex: 1 }}>
            <Label bold size={16}>
              {subject.name}
            </Label>
          </View>
          <Icon name="next" color={c.muted} />
        </Pressable>
        {groups.map((group) => (
          <View key={group.kind} style={{ gap: 6, marginBottom: 6 }}>
            <Label muted size={13}>
              {kinds[group.kind]} · {group.completed} из {group.items.length}
              {group.completed === group.items.length ? ' · Все завершены' : ''}
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {group.items.map((w) => {
                const done = isCompleted(w),
                  next = w.id === group.nextId;
                return (
                  <Pressable
                    key={w.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${w.title}. ${statuses[w.status]}${next ? '. Следующая работа' : ''}`}
                    onPress={() => router.push({ pathname: '/work/[id]', params: { id: w.id } })}
                    style={{
                      minWidth: 48,
                      minHeight: 48,
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: next ? 2 : 1,
                      borderStyle: next ? 'dashed' : 'solid',
                      borderColor: done ? c.success : next ? c.accent : c.border,
                      backgroundColor: next ? c.soft : c.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: done ? c.success : next ? c.accent : c.muted,
                        fontWeight: next ? '700' : '400',
                      }}
                    >
                      {group.kind === 'coursework'
                        ? `${done ? '✓ ' : ''}${statuses[w.status]}`
                        : `${done ? '✓ ' : w.status === 'in_progress' ? '◷ ' : ''}${w.number}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!!group.nextId && (
              <Label muted size={12}>
                Далее · №{group.items.find((w) => w.id === group.nextId)?.number}
              </Label>
            )}
          </View>
        ))}
      </Card>
    </Animated.View>
  );
});
