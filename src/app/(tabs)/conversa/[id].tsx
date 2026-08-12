/**
 * CONVERSA (ecrã) — o fio de uma conversa em ecrã próprio.
 *
 * No TELEMÓVEL é assim que se fala: lista → conversa, um ecrã de cada vez. Na
 * SECRETÁRIA a lista e a conversa vivem juntas no separador Conversas (handoff
 * "Conversas 4a"); este ecrã continua a existir para as portas que apontam
 * direto a uma conversa (um aviso, uma notificação) — e nesse caso mostra o
 * mesmo painel, sozinho.
 *
 * O desenho todo — cabeçalho, fio, marcos, compositor — vive em
 * `PainelConversa`, para não haver duas versões da mesma sala.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PainelConversa } from '@/components/PainelConversa';
import { Espaco, Honra } from '@/theme/honra';

export default function Conversa() {
  const { id, grupo, livre } = useLocalSearchParams<{
    id: string;
    grupo?: string;
    livre?: string;
  }>();
  // Três naturezas na mesma sala: o NEGÓCIO (por omissão), o GRUPO de equipa
  // (068) e a conversa LIVRE, fora de qualquer negócio (075).
  const tipo = grupo === '1' ? 'grupo' : livre === '1' ? 'livre' : 'negocio';

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.corpo}>
        <PainelConversa
          id={id}
          tipo={tipo}
          // Aqui a conversa está sozinha no ecrã: há sempre para onde voltar.
          aoVoltar={() => router.back()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  corpo: { flex: 1, paddingTop: Espaco.sm },
});
