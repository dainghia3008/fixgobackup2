import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/mobile/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName, active: IconName) =>
  ({ color, focused, size }: { color: unknown; focused: boolean; size: number }) => <Ionicons name={focused ? active : name} size={size} color={typeof color === 'string' ? color : colors.primary} />;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: '#98A2B3',
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' }, tabBarStyle: { height: 62, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.line },
    }}>
      <Tabs.Screen name="home" options={{ title: 'Trang chủ', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="history" options={{ title: 'Lịch sử', tabBarIcon: icon('time-outline', 'time') }} />
      <Tabs.Screen name="profile" options={{ title: 'Hồ sơ', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
