/** Общие компоненты интерфейса, темы, диалоги и сообщения. Учебные правила остаются в доменном слое. */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
  PanResponder,
  AccessibilityInfo,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { errorText, useThemePreference } from '../application/context';
import { progress, type Work } from '../domain/model';

export const light = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  text: '#17233B',
  muted: '#53637B',
  border: '#E1E5EB',
  accent: '#2959CA',
  soft: '#E6EDFF',
  danger: '#AE2437',
  success: '#137451',
};
export const dark = {
  bg: '#101318',
  card: '#1A1F27',
  text: '#EFF4FF',
  muted: '#B2BFD3',
  border: '#343C49',
  accent: '#A1BBFF',
  soft: '#263A60',
  danger: '#FF9BAB',
  success: '#6DE2B3',
};
const PaletteContext = createContext(light);
const MotionContext = createContext(true);
export const usePalette = () => useContext(PaletteContext);
export const useReducedMotion = () => useContext(MotionContext);
// One system subscription per app, not one per label, card and closed sheet.
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemePreference();
  const system = useColorScheme();
  const palette = theme === 'dark' || (theme === 'system' && system === 'dark') ? dark : light;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return (
    <PaletteContext.Provider value={palette}>
      <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>
    </PaletteContext.Provider>
  );
}
export function Label({
  children,
  muted = false,
  size = 16,
  bold = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  bold?: boolean;
}) {
  const c = usePalette();
  return (
    <Text
      style={{
        color: muted ? c.muted : c.text,
        fontSize: size,
        lineHeight: size * 1.4,
        fontWeight: bold ? '700' : '400',
        flexShrink: 1,
      }}
    >
      {children}
    </Text>
  );
}
export function Page({
  title,
  subtitle,
  children,
  actions,
  back,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  back?: () => void;
}) {
  const c = usePalette();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            gap: 12,
            paddingBottom: 48,
            maxWidth: 760,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          <ScreenHeading title={title} subtitle={subtitle} actions={actions} back={back} />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const c = usePalette();
  if (!onPress)
    return (
      <View
        style={{
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          padding: 12,
          gap: 6,
        }}
      >
        {children}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 12,
        padding: 12,
        gap: 6,
      }}
    >
      {children}
    </Pressable>
  );
}
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
}: {
  title: string;
  onPress: () => unknown | Promise<unknown>;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const c = usePalette();
  // Ref блокирует повторное нажатие сразу, ещё до перерисовки состояния busy.
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={async () => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        try {
          await onPress();
        } catch (e) {
          notify(errorText(e), 'error', () => onPress());
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 48,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: secondary ? 'transparent' : danger ? c.danger : c.accent,
        opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          fontWeight: '600',
          fontSize: 15,
          textAlign: 'center',
          color: secondary ? (danger ? c.danger : c.accent) : c === dark ? '#101722' : '#FFFFFF',
        }}
      >
        {busy ? 'Подождите…' : title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Label size={14} bold>
        {label}
      </Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          {
            color: c.text,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 12,
            padding: 12,
            minHeight: 48,
            fontSize: 16,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  if (Object.keys(options).length > 3)
    return (
      <View style={{ gap: 6 }}>
        {!compact && (
          <Label size={14} bold>
            {label}
          </Label>
        )}
        <Button
          title={`${options[value] ?? 'Выбрать'}  ▾`}
          secondary
          onPress={() => setOpen(true)}
        />
        <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
          {(Object.keys(options) as T[]).map((key) => (
            <Button
              key={key}
              title={`${key === value ? '✓ ' : ''}${options[key]}`}
              secondary
              onPress={() => {
                onChange(key);
                setOpen(false);
              }}
            />
          ))}
        </Sheet>
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      {!compact && (
        <Label size={14} bold>
          {label}
        </Label>
      )}
      <Row>
        {(Object.keys(options) as T[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: key === value }}
            aria-checked={key === value}
            onPress={() => onChange(key)}
            style={{
              padding: 12,
              minHeight: 48,
              justifyContent: 'center',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: value === key ? c.accent : c.border,
              backgroundColor: value === key ? c.soft : c.card,
            }}
          >
            <Text
              style={{
                color: value === key ? c.accent : c.text,
                fontWeight: key === value ? '700' : '400',
              }}
            >
              {options[key]}
            </Text>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}
export function Progress({ works }: { works: Work[] }) {
  const c = usePalette();
  const p = progress(works);
  return (
    <View style={{ gap: 8 }}>
      <Row>
        <Label muted size={13}>
          {p.total > 0 ? `Выполнено ${p.completed} из ${p.total}` : 'Работы не добавлены'}
        </Label>
      </Row>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.soft, overflow: 'hidden' }}>
        <View style={{ height: 4, width: `${p.percent ?? 0}%`, backgroundColor: c.accent }} />
      </View>
    </View>
  );
}
type Dialog = { title: string; message: string; resolve: (ok: boolean) => void };
type Toast = {
  message: string;
  tone: 'success' | 'error';
  retry?: () => unknown | Promise<unknown>;
};
let showDialog: ((dialog: Dialog) => void) | undefined;
let showToast: ((toast: Toast) => void) | undefined;
export const confirm = (title: string, message: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (showDialog) showDialog({ title, message, resolve });
    else resolve(false);
  });
export function notify(message: string, tone: Toast['tone'] = 'success', retry?: Toast['retry']) {
  showToast?.({ message, tone, retry });
}
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const c = usePalette(),
    insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const drag = useMemo(
    () =>
      PanResponder.create({
        // Заголовок принимает касание с начала жеста, чтобы свайп не терялся на дочернем тексте.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dx) < 30,
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 12 && Math.abs(g.dx) < 30,
        onPanResponderRelease: (_, g) => {
          if (g.dy > 70) onClose();
        },
      }),
    [onClose],
  );
  // Закрытая панель не создаёт дерево кнопок и полей.
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '86%',
            backgroundColor: c.card,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            padding: 16,
            paddingBottom: Math.max(insets.bottom, 20),
            gap: 8,
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
          }}
        >
          <View collapsable={false} {...drag.panHandlers}>
            <View
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                backgroundColor: c.border,
                alignSelf: 'center',
              }}
            />
            <ScreenHeading
              title={title}
              compact
              actions={<IconButton name="close" label="Закрыть" onPress={onClose} />}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function FeedbackHost() {
  const reduced = useReducedMotion();
  const c = usePalette(),
    insets = useSafeAreaInsets();
  const [dialogs, setDialogs] = useState<Dialog[]>([]),
    [toast, setToast] = useState<Toast | null>(null);
  const pending = useRef<Dialog[]>([]);
  useEffect(() => {
    showDialog = (d) => {
      pending.current.push(d);
      setDialogs([...pending.current]);
    };
    showToast = setToast;
    return () => {
      showDialog = undefined;
      showToast = undefined;
      pending.current.forEach((d) => d.resolve(false));
      pending.current = [];
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 12000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const finish = (ok: boolean) => {
    pending.current.shift()?.resolve(ok);
    setDialogs([...pending.current]);
  };
  const dialog = dialogs[0];
  return (
    <>
      <Modal
        visible={!!dialog}
        transparent
        animationType={reduced ? 'none' : 'fade'}
        onRequestClose={() => finish(false)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 24 }}
        >
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: c.card,
              borderRadius: 20,
              padding: 22,
              gap: 16,
              width: '100%',
              maxWidth: 480,
              alignSelf: 'center',
            }}
          >
            <ScreenHeading
              title={dialog?.title ?? ''}
              compact
              actions={<IconButton name="close" label="Отмена" onPress={() => finish(false)} />}
            />
            <Label muted>{dialog?.message}</Label>
            <Row>
              <Button title="Отмена" secondary onPress={() => finish(false)} />
              <Button title="Подтвердить" onPress={() => finish(true)} />
            </Row>
          </View>
        </View>
      </Modal>
      {!!toast && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            bottom: Math.max(insets.bottom, 12) + 70,
            left: 16,
            right: 16,
            backgroundColor: c.card,
            borderColor: toast.tone === 'error' ? c.danger : c.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 16,
            gap: 8,
            elevation: 12,
            maxWidth: 700,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Label size={14}>{toast.message}</Label>
            </View>
            <IconButton name="close" label="Закрыть сообщение" onPress={() => setToast(null)} />
          </View>
          <Row>
            {toast.retry && (
              <Button
                title="Повторить"
                secondary
                onPress={async () => {
                  const retry = toast.retry;
                  setToast(null);
                  await retry?.();
                }}
              />
            )}
          </Row>
        </View>
      )}
    </>
  );
}
export function ListPage<T>({
  title,
  subtitle,
  header,
  data,
  renderItem,
  empty,
  footer,
  actions,
  back,
  onSubtitlePress,
  initialNumToRender = 8,
}: {
  title: string;
  subtitle?: string;
  header?: React.ReactNode;
  data: T[];
  renderItem: (item: T) => React.ReactElement;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  back?: () => void;
  onSubtitlePress?: () => void;
  initialNumToRender?: number;
}) {
  const c = usePalette();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        initialNumToRender={initialNumToRender}
        maxToRenderPerBatch={4}
        windowSize={5}
        data={data}
        keyExtractor={(item, index) => String((item as { id?: string }).id ?? index)}
        renderItem={({ item }) => renderItem(item)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 48,
          gap: 8,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingBottom: 4 }}>
            <ScreenHeading
              title={title}
              subtitle={subtitle}
              actions={actions}
              back={back}
              onSubtitlePress={onSubtitlePress}
            />
            {header}
          </View>
        }
        ListEmptyComponent={<>{empty}</>}
        ListFooterComponent={<>{footer}</>}
      />
    </SafeAreaView>
  );
}
const icons = {
  close: 'm6 6 12 12M18 6 6 18',
  back: 'm14 5-7 7 7 7',
  next: 'm9 5 7 7-7 7',
  more: 'M5 11h1v2H5ZM11 11h1v2h-1ZM17 11h1v2h-1Z',
  plus: 'M12 4v16M4 12h16',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6',
  edit: 'm4 16 12-12 4 4L8 20H4ZM14 6l4 4',
  check: 'm4 12 5 5L20 6',
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  book: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3ZM12 6v16',
  calendar: 'M4 5h16v16H4ZM8 2v6M16 2v6M4 11h16M8 15h3M14 15h3',
  tasks: 'm3 6 2 2 3-4M11 6h10M3 13h4M11 13h10M3 20h4M11 20h10',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
};
export function Icon({ name, color }: { name: keyof typeof icons; color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d={icons[name]}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
}: {
  name: keyof typeof icons;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 24,
        backgroundColor: pressed ? c.soft : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Icon name={name} color={c.accent} />
    </Pressable>
  );
}
export function ScreenHeading({
  title,
  subtitle,
  actions,
  back,
  compact = false,
  onSubtitlePress,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: () => void;
  compact?: boolean;
  onSubtitlePress?: () => void;
}) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {back && <IconButton name="back" label="Назад" onPress={back} />}
        <View style={{ flex: 1 }}>
          <Label bold size={compact || back ? 18 : 24}>
            {title}
          </Label>
        </View>
        {actions}
      </View>
      {!!subtitle &&
        (onSubtitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Выбрать дату: ' + subtitle}
            onPress={onSubtitlePress}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Label muted size={14}>
              {subtitle} ▾
            </Label>
          </Pressable>
        ) : (
          <Label muted size={14}>
            {subtitle}
          </Label>
        ))}
    </View>
  );
}
export function SearchInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const c = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        paddingLeft: 12,
      }}
    >
      <Icon name="search" color={c.muted} />
      <TextInput
        accessibilityLabel="Поиск дисциплины"
        placeholder="Поиск дисциплины"
        placeholderTextColor={c.muted}
        value={value}
        onChangeText={onChangeText}
        style={{ flex: 1, minHeight: 48, paddingHorizontal: 10, color: c.text, fontSize: 16 }}
      />
      {!!value && (
        <IconButton name="close" label="Очистить поиск" onPress={() => onChangeText('')} />
      )}
    </View>
  );
}
export function MenuItem({
  title,
  onPress,
  danger = false,
  selected = false,
}: {
  title: string;
  onPress: () => unknown | Promise<unknown>;
  danger?: boolean;
  selected?: boolean;
}) {
  const c = usePalette();
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Button title={(selected ? '✓ ' : '') + title} secondary danger={danger} onPress={onPress} />
    </View>
  );
}
export function ActionMenu({
  title,
  items,
}: {
  title: string;
  items: { title: string; action: () => unknown | Promise<unknown>; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton name="more" label={title} onPress={() => setOpen(true)} />
      <Sheet title={title} visible={open} onClose={() => setOpen(false)}>
        {items.map((item) => (
          <MenuItem
            key={item.title}
            title={item.title}
            danger={item.danger}
            onPress={() => {
              setOpen(false);
              return item.action();
            }}
          />
        ))}
      </Sheet>
    </>
  );
}
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={{ paddingVertical: 24, gap: 8 }}>
      <Label bold>{title}</Label>
      {detail && (
        <Label muted size={14}>
          {detail}
        </Label>
      )}
      {action}
    </View>
  );
}
