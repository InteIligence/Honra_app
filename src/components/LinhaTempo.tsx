/**
 * HONRA — Linha do tempo do negócio (histórico de atividade dos passos).
 * Qualquer das partes vê o percurso: pedido → aceite (palavra dada) → selo → evolução
 * (com o FICHEIRO exposto e ampliável) → confirmação → desfecho. Transparência.
 */
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT, type ChaveI18n, type TFn } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { type Projeto } from '@/lib/projeto';
import { Espaco, Honra, Raio } from '@/theme/honra';

// "há 2 h", "há 3 dias", "agora" — carimbo humano e discreto.
// Recebe o `t` do componente (useT) — os textos vivem nos dicionários i18n.
function quando(iso: string | null, t: TFn): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return t('tempo.agora');
  if (min < 60) return t('tempo.ha_min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('tempo.ha_h', { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t('tempo.ha_dia', { n: d }) : t('tempo.ha_dias', { n: d });
}

const TERMINAL: Record<string, ChaveI18n> = {
  honrado: 'tempo.t_honrado',
  entregue: 'tempo.t_entregue',
  concluido: 'tempo.t_concluido',
  incumprido: 'tempo.t_incumprido',
  cancelado: 'tempo.t_cancelado',
  expirado: 'tempo.t_expirado',
  recusado: 'tempo.t_recusado',
};

type Evento = { t: string | null; titulo: string; ficheiro?: string | null; verde?: boolean };

// Imagem da evolução (bucket privado → URL assinado; ampliável).
function Evidencia({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    let vivo = true;
    supabase.storage
      .from('evolucoes')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => vivo && setUrl(data?.signedUrl ?? null));
    return () => {
      vivo = false;
    };
  }, [caminho]);
  if (!url) return null;
  return (
    <>
      <Pressable onPress={() => setAberta(true)}>
        <Image source={{ uri: url }} style={styles.foto} resizeMode="cover" />
      </Pressable>
      <Modal visible={aberta} transparent animationType="fade" onRequestClose={() => setAberta(false)}>
        <Pressable style={styles.lightbox} onPress={() => setAberta(false)}>
          <Image source={{ uri: url }} style={styles.lightboxImg} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

export function LinhaTempo({ projeto }: { projeto: Projeto }) {
  const { t } = useT();
  const p = projeto;
  const eventos: Evento[] = [{ t: p.criado_em, titulo: t('tempo.pedido_enviado') }];
  if (p.aceite_em) eventos.push({ t: p.aceite_em, titulo: t('tempo.aceitou'), verde: true });
  if (p.selado_em) {
    eventos.push({ t: p.selado_em, titulo: t('tempo.selado'), verde: true });
  }
  if (p.b_agiu_em)
    eventos.push({
      t: p.b_agiu_em,
      titulo: t('tempo.evolucao_apresentada'),
      ficheiro: p.evolucao_ficheiro,
    });
  if (p.a_agiu_em) eventos.push({ t: p.a_agiu_em, titulo: t('tempo.evolucao_confirmada') });

  // PAGAMENTO NA ENTREGA (065) — os passos do dinheiro, com carimbo.
  if (p.entrega_em) eventos.push({ t: p.entrega_em, titulo: t('tempo.entrega_apresentada'), verde: true });
  if (p.pago_em) eventos.push({ t: p.pago_em, titulo: t('tempo.pagamento_retido'), verde: true });
  if (p.pagamento_estado === 'congelado' && p.pagamento_contestado_em)
    eventos.push({ t: p.pagamento_contestado_em, titulo: t('tempo.pagamento_congelado') });
  if (p.pagamento_estado === 'libertado' && p.libertado_em)
    eventos.push({ t: p.libertado_em, titulo: t('tempo.pagamento_libertado'), verde: true });

  // Ordena por tempo (os que têm carimbo); o desfecho terminal vai ao fim.
  eventos.sort((a, b) => new Date(a.t ?? 0).getTime() - new Date(b.t ?? 0).getTime());
  // Estados do dinheiro sem carimbo (ou de fecho) entram DEPOIS da ordenação,
  // para nunca aterrarem no início da linha por falta de data.
  if (p.pagamento_estado === 'congelado' && !p.pagamento_contestado_em)
    eventos.push({ t: null, titulo: t('tempo.pagamento_congelado') });
  if (p.pagamento_estado === 'libertado' && !p.libertado_em)
    eventos.push({ t: null, titulo: t('tempo.pagamento_libertado'), verde: true });
  if (p.pagamento_estado === 'devolvido')
    eventos.push({ t: null, titulo: t('tempo.pagamento_devolvido') });
  if (TERMINAL[p.estado]) {
    const mau = ['incumprido', 'expirado', 'recusado', 'cancelado'].includes(p.estado);
    eventos.push({ t: null, titulo: t(TERMINAL[p.estado]), verde: !mau });
  }

  return (
    <View style={styles.bloco}>
      <Text style={styles.rotulo}>{t('tempo.historico')}</Text>
      {eventos.map((e, i) => (
        <View key={i} style={styles.linha}>
          <View style={styles.coluna}>
            <View style={[styles.ponto, e.verde && styles.pontoVerde]} />
            {i < eventos.length - 1 && <View style={styles.tubo} />}
          </View>
          <View style={styles.corpo}>
            <View style={styles.cabeca}>
              <Text style={[styles.titulo, e.verde && styles.tituloVerde]}>{e.titulo}</Text>
              {e.t ? <Text style={styles.tempo}>{quando(e.t, t)}</Text> : null}
            </View>
            {e.ficheiro ? <Evidencia caminho={e.ficheiro} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: 0 },
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Espaco.sm,
  },
  linha: { flexDirection: 'row', gap: Espaco.md },
  coluna: { alignItems: 'center', width: 12 },
  ponto: { width: 10, height: 10, borderRadius: 5, backgroundColor: Honra.pendente, marginTop: 3 },
  pontoVerde: { backgroundColor: Honra.verde },
  tubo: { flex: 1, width: 2, backgroundColor: Honra.cremeEscuro, marginVertical: 2 },
  corpo: { flex: 1, paddingBottom: Espaco.md, gap: Espaco.xs },
  cabeca: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Espaco.sm },
  titulo: { fontSize: 14, fontWeight: '700', color: Honra.tinta, flexShrink: 1 },
  tituloVerde: { color: Honra.verde },
  tempo: { fontSize: 12, color: Honra.tintaSuave, fontWeight: '600' },
  foto: { width: '100%', height: 160, borderRadius: Raio.md, backgroundColor: Honra.cremeEscuro },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(18,33,27,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  lightboxImg: { width: '100%', height: '80%' },
});
