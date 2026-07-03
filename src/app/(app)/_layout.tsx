import { Redirect, Tabs } from 'expo-router';

import { useAppStore } from '@/store/AppStore';

export default function AppTabsLayout() {
  const { isAuthenticated } = useAppStore();
  if (!isAuthenticated) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Navigation is handled by the top-right NavMenu instead of a tab bar.
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen name="panic" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="profiles" />
      <Tabs.Screen name="guide" />
      <Tabs.Screen name="exchange-guide" />
    </Tabs>
  );
}
