import { StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { ConnectionStatus } from '@/domain/types';

const COLOR: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTED]: Brand.success,
  [ConnectionStatus.DISCONNECTED]: Brand.textMuted,
  [ConnectionStatus.ERROR]: Brand.danger,
  [ConnectionStatus.CONNECTING]: Brand.warning,
};

export function StatusDot({ status, size = 9 }: { status: ConnectionStatus; size?: number }) {
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: COLOR[status] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {},
});
