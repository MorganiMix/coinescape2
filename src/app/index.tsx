import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { useAppStore } from '@/store/AppStore';

/** Entry gate: route to the app tabs if authenticated, otherwise to sign-in. */
export default function Index() {
  const { isAuthenticated, authChecked } = useAppStore();

  // Wait for the on-device account lookup to finish before deciding, so we
  // don't flash the sign-in screen on a cold start.
  if (!authChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.bg }}>
        <ActivityIndicator color={Brand.accent} />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? '/(app)/panic' : '/sign-in'} />;
}
