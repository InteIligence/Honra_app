import { router } from 'expo-router';
import { voltar } from '@/lib/navegar';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Vazio } from '@/components/ui';
import { useT, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { apertaCoracao, useAvisos, type Aviso } from '@/lib/avisos';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

// Contagem decrescente humana, a empurrar para a ação (nunca "vais ser cobrado").
// Recebe o `t` do ecrã (useT) — os textos vivem nos dicionários i18n.
function faltam(prazo: string, agora: number, t: TFn): string {
  const ms = new Date(prazo).getTime() - agora;
  if (ms <= 0) return t('avisos.prazo_terminado');
  const min = Math.round(ms / 60000);
  if (min < 60) return t('avisos.faltam_min', { n: min });
  const h = Math.round(min / 60);
  if (h < 48) return t('avisos.faltam_h', { n: h });
  const d = Math.round(h / 24);
  return t('avisos.faltam_dias', { n: d });
}

// Cor do relógio: verde calmo → dourado a aquecer → aperto quando fecha.
function corDoRelogio(a: Aviso, agora: number): string {
  if (a.lida) return Honra.pendente;
  if (!a.prazo) return a.urgente ? Honra.dourado : Honra.verde;
  const ms = new Date(a.prazo).getTime() - agora;
  if (ms <= 0) return Honra.erro;
  if (ms < 6 * 3600_000) return Honra.erro;
  if (ms < 48 * 3600_000) return Honra.dourado;
  return Honra.verde;
}

// Cor da ABA lateral esquerda: por TIPO, não por urgência. Verde = os marcos
// (aperto de mão + conclusão do projeto); bege escuro = a história do
// orçamento/projeto a decorrer. (O ponto e o relógio continuam na urgência.)
const MARCOS_VERDES = new Set(['aceite', 'selado', 'honrado', 'entregue', 'concluido']);
function corDaAba(a: Aviso): string {
  return MARCOS_VERDES.has(a.tipo) ? Honra.verde : Honra.begeEscuro;
}

// Estado do consentimento visto pela CONTRAPARTE (trabalho comprovado, 055):
// 'inexistente' = o executante entretanto tirou o destaque — nada a responder.
type EstadoConsent = 'pendente' | 'aceite' | 'recusado' | 'inexistente';

export default function Avisos() {
  const { t } = useT();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { avisos, marcarLida, marcarTodas } = useAvisos();
  const [agora, setAgora] = useState(Date.now());
  // Consentimento (aviso 'consentimento_comprovado'): a resposta vive AQUI,
  // inline — obrigar a pessoa a caçar o sítio certo não seria consentir, seria
  // desistir. O mapa orcamento_id→estado diz a cada cartão o que mostrar.
  const [consentimentos, setConsentimentos] = useState<Record<string, EstadoConsent>>({});
  const [consentCarregado, setConsentCarregado] = useState(false);
  const [aResponder, setAResponder] = useState<string | null>(null); // id do aviso
  const [erroConsent, setErroConsent] = useState<{ id: string; msg: string } | null>(null);

  // Relógio a bater — os contadores mexem sem tocar em nada.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // O estado REAL do consentimento vem da BD (não do aviso): assim o cartão
  // diz a verdade mesmo dias depois, ou se a resposta foi dada noutro sítio.
  const consentChave = avisos
    .filter((a) => a.tipo === 'consentimento_comprovado' && a.orcamento_id)
    .map((a) => a.orcamento_id as string)
    .join(',');
  useEffect(() => {
    if (!uid || !consentChave) return;
    let vivo = true;
    supabase
      .from('trabalhos_comprovados')
      .select('orcamento_id, consentimento_estado')
      .in('orcamento_id', consentChave.split(','))
      .neq('perfil_id', uid) // a linha onde EU sou a contraparte (não o executante)
      .then(({ data }) => {
        if (!vivo) return;
        const mapa: Record<string, EstadoConsent> = {};
        for (const r of (data as { orcamento_id: string; consentimento_estado: EstadoConsent }[]) ??
          [])
          mapa[r.orcamento_id] = r.consentimento_estado;
        setConsentimentos(mapa);
        setConsentCarregado(true);
      });
    return () => {
      vivo = false;
    };
  }, [uid, consentChave]);

  // Aceitar/recusar mostrar o meu nome. A RLS (tcomp_contraparte_consente)
  // só deixa tocar na linha onde sou a contraparte; a guarda trava o resto.
  async function responderConsent(a: Aviso, resposta: 'aceite' | 'recusado') {
    if (!uid || !a.orcamento_id || aResponder) return;
    setErroConsent(null);
    setAResponder(a.id);
    const { data, error } = await supabase
      .from('trabalhos_comprovados')
      .update({ consentimento_estado: resposta })
      .eq('orcamento_id', a.orcamento_id)
      .neq('perfil_id', uid)
      .select('id');
    setAResponder(null);
    if (error) {
      setErroConsent({ id: a.id, msg: t('avisos.consent_erro') });
      return;
    }
    // 0 linhas = o destaque já não existe (sem erro — só a verdade calma).
    setConsentimentos((m) => ({
      ...m,
      [a.orcamento_id as string]: data && data.length > 0 ? resposta : 'inexistente',
    }));
    if (!a.lida) marcarLida(a.id);
  }

  function abrir(a: Aviso) {
    if (!a.lida) marcarLida(a.id);
    // Convites (contrato-convite) → o ecrã de Convites do profissional.
    if (a.tipo.startsWith('convite')) {
      router.push('/convites');
      return;
    }
    // Pedido de cédula pendente (só admins recebem) → a fila de revisão.
    if (a.tipo === 'cedula_pendente') {
      router.push('/revisao-profissao');
      return;
    }
    // Avisos do mural (vaga entregue / anúncio reaberto) levam ao anúncio.
    if (a.trabalho_id) {
      router.push(`/trabalho/${a.trabalho_id}`);
      return;
    }
    if (!a.orcamento_id) return;
    // Cada aviso leva ao sítio certo: mensagem → conversa; o resto → o projeto.
    if (a.tipo === 'mensagem') router.push(`/conversa/${a.orcamento_id}`);
    else router.push(`/projeto/${a.orcamento_id}`);
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={voltar} hitSlop={10} style={styles.voltar}>
          <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
        </Pressable>
        {avisos.some((a) => !a.lida) && (
          <Pressable onPress={marcarTodas} hitSlop={10}>
            <Text style={styles.todasTxt}>{t('avisos.marcar_todas')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.titulo}>{t('avisos.titulo')}</Text>

      <ScrollView contentContainerStyle={styles.corpo}>
        {avisos.length === 0 && <Vazio texto={t('avisos.vazio')} />}
        {avisos.map((a) => {
          const cor = corDoRelogio(a, agora);
          const corAba = corDaAba(a);
          const bate = apertaCoracao(a, agora);
          // Consentimento inline: só nos avisos certos, e só com a BD ouvida.
          const consent: EstadoConsent | null =
            a.tipo === 'consentimento_comprovado' && a.orcamento_id && consentCarregado
              ? (consentimentos[a.orcamento_id] ?? 'inexistente')
              : null;
          return (
            <Pressable key={a.id} onPress={() => abrir(a)}>
              <View style={[styles.cartao, !a.lida && styles.cartaoPorLer, { borderLeftColor: corAba }]}>
                <View style={styles.cabeca}>
                  <Text style={[styles.tit, a.lida && styles.titLido]} numberOfLines={2}>
                    {a.titulo}
                  </Text>
                  {!a.lida && <View style={[styles.ponto, bate && { backgroundColor: cor }]} />}
                </View>
                {a.corpo && <Text style={styles.corpoTxt}>{a.corpo}</Text>}
                {a.prazo && (
                  <Text style={[styles.relogio, { color: cor }]}>{faltam(a.prazo, agora, t)}</Text>
                )}

                {/* ===== Consentimento (trabalho comprovado) — decide-se AQUI =====
                    Aceitar avança (verde); recusar é palavra igual, em voz
                    neutra — recusar não é falhar, é decidir. */}
                {consent === 'pendente' && (
                  <View style={styles.consentAcoes}>
                    <Botao
                      titulo={t('avisos.consent_aceitar')}
                      onPress={() => responderConsent(a, 'aceite')}
                      aCarregar={aResponder === a.id}
                      style={styles.consentBotao}
                    />
                    <Pressable
                      style={styles.consentRecusar}
                      onPress={() => responderConsent(a, 'recusado')}
                      disabled={aResponder === a.id}
                    >
                      <Text style={styles.consentRecusarTxt}>{t('avisos.consent_recusar')}</Text>
                    </Pressable>
                  </View>
                )}
                {consent === 'aceite' && (
                  <Text style={styles.consentFeitoVerde}>{t('avisos.consent_aceite_feito')}</Text>
                )}
                {consent === 'recusado' && (
                  <Text style={styles.consentFeito}>{t('avisos.consent_recusa_feita')}</Text>
                )}
                {consent === 'inexistente' && (
                  <Text style={styles.consentFeito}>{t('avisos.consent_ja_nao')}</Text>
                )}
                {erroConsent?.id === a.id && (
                  <Text style={styles.consentErro}>{erroConsent.msg}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.sm,
  },
  voltar: {},
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  todasTxt: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '700' },
  titulo: {
    fontSize: 28,
    fontWeight: '800',
    color: Honra.tinta,
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.xs,
  },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  cartao: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderLeftWidth: 3,
    padding: Espaco.md,
    gap: Espaco.xs,
  },
  cartaoPorLer: { backgroundColor: '#FFFFFF' },
  cabeca: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Espaco.sm },
  tit: { flex: 1, fontSize: 15, fontWeight: '800', color: Honra.tinta },
  titLido: { fontWeight: '600', color: Honra.tintaSuave },
  ponto: { width: 9, height: 9, borderRadius: 5, backgroundColor: Honra.pendente, marginTop: 3 },
  corpoTxt: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20 },
  relogio: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },

  // Consentimento inline (trabalho comprovado): aceitar em verde (avança),
  // recusar em voz neutra — as duas respostas valem o mesmo.
  consentAcoes: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md, marginTop: Espaco.xs },
  consentBotao: { flex: 1, paddingVertical: Espaco.sm },
  consentRecusar: { paddingHorizontal: Espaco.md, paddingVertical: Espaco.sm },
  consentRecusarTxt: { color: Honra.tintaSuave, fontSize: 14, fontWeight: '700' },
  consentFeitoVerde: { color: Honra.verde, fontSize: 13, fontWeight: '700', marginTop: 2 },
  consentFeito: { color: Honra.tintaSuave, fontSize: 13, marginTop: 2 },
  consentErro: { color: Honra.erro, fontSize: 13, marginTop: 2 },
});
