import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {/* Your existing tabs... add these two */}
      <Tabs.Screen 
        name="news" 
        options={{ 
          title: 'News',
          tabBarIcon: ({ color }) => <Text style={{ color }}>📰</Text>, // Or use Ionicons
        }} 
      />
      <Tabs.Screen 
        name="risk" 
        options={{ 
          title: 'Risk Monitor',
          tabBarIcon: ({ color }) => <Text style={{ color }}>📊</Text>,
        }} 
      />
    </Tabs>
  );
}
