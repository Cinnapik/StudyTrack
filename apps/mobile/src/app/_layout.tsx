/** Корневые провайдеры и навигация. Нажатия на уведомления сверяются с актуальными записями. */
import { Stack, ThemeProvider, DefaultTheme, DarkTheme, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StudyProvider, useStudy } from '../application/context';
import { subscribeReminderTaps } from '../integrations/notifications';
import { dark, usePalette, FeedbackHost, AppearanceProvider } from '../ui/components';
export { ErrorBoundary } from 'expo-router';
function Navigation() {
  const c = usePalette();
  const { data } = useStudy();
  const snapshot = useRef(data);
  useEffect(() => {
    snapshot.current = data;
  }, [data]);
  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | undefined;
    void subscribeReminderTaps((payload) => {
      if (disposed) return;
      if (
        typeof payload.workId === 'string' &&
        snapshot.current.works.some((w) => w.id === payload.workId)
      )
        router.push({ pathname: '/work/[id]', params: { id: payload.workId } });
      else if (
        typeof payload.subjectId === 'string' &&
        snapshot.current.subjects.some((s) => s.id === payload.subjectId)
      )
        router.push({ pathname: '/subject/[id]', params: { id: payload.subjectId } });
      else router.navigate('/tasks');
    })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else remove = unsubscribe;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);
  return (
    <ThemeProvider value={c === dark ? DarkTheme : DefaultTheme}>
      <StatusBar style={c === dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
    </ThemeProvider>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StudyProvider>
        <AppearanceProvider>
          <Navigation />
          <FeedbackHost />
        </AppearanceProvider>
      </StudyProvider>
    </SafeAreaProvider>
  );
}
