/** Пять основных разделов. Неактивные вкладки сохраняют состояние и приостанавливают перерисовку. */
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, usePalette } from '../../ui/components';
export default function TabLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(8, insets.bottom),
        },
        tabBarLabelStyle: { fontSize: 10 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          tabBarIcon: ({ color }) => (
            <Icon name="home" color={typeof color === 'string' ? color : c.muted} />
          ),
        }}
      />
      <Tabs.Screen
        name="subjects"
        options={{
          title: 'Учебный план',
          tabBarIcon: ({ color }) => (
            <Icon name="book" color={typeof color === 'string' ? color : c.muted} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Расписание',
          tabBarIcon: ({ color }) => (
            <Icon name="calendar" color={typeof color === 'string' ? color : c.muted} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Задания',
          tabBarIcon: ({ color }) => (
            <Icon name="tasks" color={typeof color === 'string' ? color : c.muted} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Настройки',
          tabBarIcon: ({ color }) => (
            <Icon name="settings" color={typeof color === 'string' ? color : c.muted} />
          ),
        }}
      />
    </Tabs>
  );
}
