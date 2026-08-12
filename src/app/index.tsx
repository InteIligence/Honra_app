import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { Honra } from '@/theme/honra';

/**
 * O "portão": decide para onde vais assim que a app abre.
 * Tem sessão → entra na app. Não tem → vai para o login.
 */
export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Honra.creme }}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }

  return session ? <Redirect href="/(tabs)/inicio" /> : <Redirect href="/login" />;
}
