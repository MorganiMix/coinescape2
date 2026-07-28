import { Redirect, Tabs } from 'expo-router';
import { useAppStore } from '@/store/AppStore';

export default function AppTabsLayout() {
  const { isAuthenticated } = useAppStore();
  if (!isAuthenticated) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen name="panic" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="profiles" />
      <Tabs.Screen name="guide" />               {/* General app guide */}
      <Tabs.Screen name="exchange-guides" />     {/* List of exchange guides */}
      <Tabs.Screen name="exchange-guide" />      {/* Detail view for a specific exchange */}
    </Tabs>
  );
}
