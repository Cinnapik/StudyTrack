/** Инициализация SQLite и состояние приложения. Данные, команды, оформление и напоминания разделены по контекстам. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { openDatabaseAsync } from 'expo-sqlite';
import { StudyRepository } from '../persistence/repository';
import { StudyService } from './study-service';
import type { Snapshot } from '../domain/model';
import { ZodError } from 'zod';
import { syncReminders } from '../integrations/notifications';
import { indexStudy } from '../domain/study-index';

// UUID uses platform cryptographic randomness, not time or Math.random.
import { randomUUID } from 'expo-crypto';
const Context = createContext<{
  data: Snapshot;
  service: StudyService;
  refresh: () => Promise<void>;
  run: (task: () => Promise<unknown>) => Promise<void>;
} | null>(null);
const ThemeContext = createContext<Snapshot['profile']['theme']>('system');
const ReminderContext = createContext('Проверяем напоминания…');
const IndexContext = createContext<ReturnType<typeof indexStudy> | null>(null);
const ActionsContext = createContext<Pick<
  NonNullable<React.ContextType<typeof Context>>,
  'service' | 'run' | 'refresh'
> | null>(null);
// Общий Promise исключает повторное открытие базы при одновременной загрузке компонентов.
let initialization: Promise<StudyService> | undefined;
function initialize() {
  initialization ??= openDatabaseAsync('studytrack.db')
    .then(async (db) => {
      const repo = new StudyRepository(db);
      await repo.init();
      return new StudyService(repo, randomUUID);
    })
    .catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
export function errorText(error: unknown) {
  if (error instanceof ZodError) return error.issues.map((i) => i.message).join('\n');
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить операцию. Попробуйте снова.';
}
export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [service, setService] = useState<StudyService>();
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [reminderStatus, setReminderStatus] = useState('Проверяем напоминания…');
  const refresh = useCallback(async () => {
    if (service) setData(await service.repo.snapshot());
  }, [service]);
  const run = useCallback(
    async (task: () => Promise<unknown>) => {
      await task();
      await refresh();
    },
    [refresh],
  );
  // Стабильные команды не заставляют карточки обновляться при изменении служебных сообщений.
  const actions = useMemo(
    () => (service ? { service, refresh, run } : null),
    [service, refresh, run],
  );
  const value = useMemo(() => (data && actions ? { data, ...actions } : null), [data, actions]);
  // Индекс обновляется вместе со снимком, поэтому после записи карточки видят новые статусы.
  const index = useMemo(() => (data ? indexStudy(data) : null), [data]);
  useEffect(() => {
    if (!data) return;
    let active = true;
    void syncReminders(data).then(
      (status) => {
        if (active) setReminderStatus(status);
      },
      () => {
        if (active)
          setReminderStatus(
            'Не удалось обновить напоминания. Откройте приложение снова. Учебные данные сохранены.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, [data]);
  async function load() {
    try {
      const s = await initialize();
      const next = await s.repo.snapshot();
      setService(s);
      setData(next);
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => listener.remove();
  }, []);
  if (!service || !data)
    return (
      <View style={{ flex: 1, padding: 32, justifyContent: 'center', backgroundColor: '#F2F5F9' }}>
        {error ? (
          <>
            <Text>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={{ padding: 24 }}
            >
              <Text>Повторить загрузку</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text style={{ textAlign: 'center', margin: 16 }}>Открываем ваш учебный журнал…</Text>
          </>
        )}
      </View>
    );
  return (
    <Context.Provider value={value}>
      <ActionsContext.Provider value={actions}>
        <ThemeContext.Provider value={data.profile.theme}>
          <IndexContext.Provider value={index}>
            <ReminderContext.Provider value={reminderStatus}>{children}</ReminderContext.Provider>
          </IndexContext.Provider>
        </ThemeContext.Provider>
      </ActionsContext.Provider>
    </Context.Provider>
  );
}
export const useThemePreference = () => useContext(ThemeContext);
export const useReminderStatus = () => useContext(ReminderContext);
export function useStudyIndex() {
  const value = useContext(IndexContext);
  if (!value) throw new Error('StudyProvider missing');
  return value;
}
export function useStudyActions() {
  const value = useContext(ActionsContext);
  if (!value) throw new Error('StudyProvider missing');
  return value;
}
export function useStudy() {
  const value = useContext(Context);
  if (!value) throw new Error('StudyProvider missing');
  return value;
}
