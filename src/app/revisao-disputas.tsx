import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Carregar, Erro, Vazio } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * REVISÃO DE DISPUTAS (só ADMIN) — a camada 3 da blindagem da fuga E.
 * O resíduo he-said/she-said: contratos 'em_disputa' (o cliente contestou a
 * falta, ou o silêncio venceu sem recibo de entrega do aviso). O admin lê a
 * contestação e decide: dar razão ao PROFISSIONAL (cobrar) ou ao CLIENTE
 * (arquivar). Default: na dúvida, protege o cliente. Ecrã mínimo, honesto.
 */
type Disputa = {
  id: string;
  servico: string | null;
  valor_total: number | null;
  pct_caucao: number;
  contestacao_texto: string | null;
  prova_encontro_em: string | null;
  consentimento_resultado: string | null;
  cliente: { nome: string | null } | null;
  profissional: { nome: string | null } | null;
};

function euros(c: number | null): string {
  if (c == null) return '—';
  return `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}

// Checkpoint interno contestado (fatia D) — o recetor disse "não recebi".
type DisputaCP = {
  id: string;
  descricao: string;
  contestacao_texto: string | null;
  evidencia_texto: string | null;
  evidencia_ficheiro: string | null;
  orc: {
    descricao: string | null;
    de: { nome: string | null } | null;
    para: { nome: string | null } | null;
  } | null;
};

// Entrega com pagamento CONGELADO (065) — o cliente contestou; o dinheiro só
// sai daqui por veredito. 'profissional' = infundada (liberta + marca no
// carril do contratante); 'cliente' = devolução (o cliente nunca teve o limpo).
type DisputaEntrega = {
  id: string;
  descricao: string | null;
  valor_proposta: number | null;
  pagamento_contestacao: string | null;
  de: { nome: string | null } | null;
  para: { nome: string | null } | null;
};

export default function RevisaoDisputas() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [disputas, setDisputas] = useState<Disputa[]>([]);
  const [disputasCP, setDisputasCP] = useState<DisputaCP[]>([]);
  const [disputasEntrega, setDisputasEntrega] = useState<DisputaEntrega[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aAgir, setAAgir] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!uid) return;
    setACarregar(true);
    setErro(null);
    // 064: sem puxar a coluna is_admin para o cliente — a RPC responde (e é
    // fail-closed: erro/sem sessão → não-admin).
    const { data: ehAdmin } = await supabase.rpc('sou_admin');
    const souAdmin = ehAdmin === true;
    setAdmin(souAdmin);
    if (!souAdmin) {
      setACarregar(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke('convite-disputa', { body: { acao: 'listar' } });
    if (error || !data?.ok)
      setErro((await razaoDoServidor(error)) ?? t('disputas.erro_carregar'));
    else setDisputas((data.disputas as Disputa[]) ?? []);
    // Checkpoints internos contestados (fatia D) + entregas congeladas (065) —
    // vêm da mesma função de revisão.
    const { data: dcp } = await supabase.functions.invoke('checkpoint-disputa', { body: { acao: 'listar' } });
    if (dcp?.ok) {
      setDisputasCP((dcp.disputas as DisputaCP[]) ?? []);
      setDisputasEntrega((dcp.entregas as DisputaEntrega[]) ?? []);
    }
    setACarregar(false);
  }, [uid, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function resolver(id: string, decisao: 'cobrar' | 'arquivar') {
    setAAgir(id);
    const { data, error } = await supabase.functions.invoke('convite-disputa', {
      body: { acao: 'resolver', contrato_id: id, decisao },
    });
    setAAgir(null);
    if (error || !data?.ok) {
      setErro(data?.error ?? (await razaoDoServidor(error)) ?? t('disputas.erro_resolver'));
      return;
    }
    carregar();
  }

  async function resolverCP(id: string, decisao: 'prestador' | 'recetor') {
    setAAgir(id);
    const { data, error } = await supabase.functions.invoke('checkpoint-disputa', {
      body: { acao: 'resolver', checkpoint_id: id, decisao },
    });
    setAAgir(null);
    if (error || !data?.ok) {
      setErro(data?.error ?? (await razaoDoServidor(error)) ?? t('disputas.erro_resolver'));
      return;
    }
    carregar();
  }

  // (065) O veredito sobre o dinheiro congelado da entrega — a ÚNICA saída do
  // estado 'congelado'.
  async function resolverEntrega(id: string, decisao: 'profissional' | 'cliente') {
    setAAgir(id);
    const { data, error } = await supabase.functions.invoke('checkpoint-disputa', {
      body: { acao: 'resolver_entrega', orcamento_id: id, decisao },
    });
    setAAgir(null);
    if (error || !data?.ok) {
      setErro(data?.error ?? (await razaoDoServidor(error)) ?? t('disputas.erro_resolver'));
      return;
    }
    carregar();
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
        <Text style={styles.titulo}>{t('disputas.titulo')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {aCarregar ? (
        <Carregar />
      ) : admin === false ? (
        <View style={styles.centro}>
          <Text style={styles.semPermissao}>{t('disputas.sem_permissao')}</Text>
        </View>
      ) : erro ? (
        <View style={styles.centro}>
          <Erro texto={erro} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.corpo}>
          {disputas.length === 0 && disputasCP.length === 0 && disputasEntrega.length === 0 ? (
            <Vazio texto={t('disputas.vazio')} />
          ) : null}

          {/* ENTREGAS COM PAGAMENTO CONGELADO (065) — o veredito do dinheiro.
              'profissional' liberta E marca o carril do contratante;
              'cliente' devolve (nunca botão do cliente — só aqui). */}
          {disputasEntrega.length > 0 && (
            <Text style={styles.seccao}>{t('disputas.entrega_seccao')}</Text>
          )}
          {disputasEntrega.map((d) => (
            <View key={d.id} style={styles.cartao}>
              <Text style={styles.quem}>
                {(d.para?.nome ?? '—') + '  ·  ' + (d.de?.nome ?? '—')}
              </Text>
              {d.descricao ? <Text style={styles.servico}>{d.descricao}</Text> : null}
              <Text style={styles.valor}>
                {t('disputas.valor_em_jogo', {
                  valor: d.valor_proposta != null ? `${d.valor_proposta} €` : '—',
                })}
              </Text>
              <Text style={styles.contestacaoRotulo}>{t('disputas.contestacao')}</Text>
              <Text style={styles.contestacao}>
                {d.pagamento_contestacao || t('disputas.sem_texto')}
              </Text>
              <View style={styles.acoes}>
                <Botao
                  titulo={t('disputas.entrega_devolver')}
                  variante="secundario"
                  onPress={() => resolverEntrega(d.id, 'cliente')}
                  aCarregar={aAgir === d.id}
                  style={styles.acaoBtn}
                />
                <Botao
                  titulo={t('disputas.entrega_libertar')}
                  onPress={() => resolverEntrega(d.id, 'profissional')}
                  aCarregar={aAgir === d.id}
                  style={styles.acaoBtn}
                />
              </View>
            </View>
          ))}

          {/* CHECKPOINTS INTERNOS contestados (fatia D) — sem dinheiro; a moeda
              é a marca. Ónus da prova no PRESTADOR. */}
          {disputasCP.length > 0 && (
            <Text style={styles.seccao}>{t('disputas.cp_seccao')}</Text>
          )}
          {disputasCP.map((d) => (
            <View key={d.id} style={styles.cartao}>
              <Text style={styles.quem}>
                {(d.orc?.para?.nome ?? '—') + '  ·  ' + (d.orc?.de?.nome ?? '—')}
              </Text>
              <Text style={styles.servico}>{d.descricao}</Text>
              {d.evidencia_texto ? (
                <Text style={styles.contestacao}>
                  {t('disputas.cp_evidencia', { texto: d.evidencia_texto })}
                </Text>
              ) : null}
              <Text style={styles.contestacaoRotulo}>{t('disputas.contestacao')}</Text>
              <Text style={styles.contestacao}>
                {d.contestacao_texto || t('disputas.sem_texto')}
              </Text>
              <View style={styles.acoes}>
                <Botao
                  titulo={t('disputas.cp_a_favor_recetor')}
                  variante="secundario"
                  onPress={() => resolverCP(d.id, 'recetor')}
                  aCarregar={aAgir === d.id}
                  style={styles.acaoBtn}
                />
                <Botao
                  titulo={t('disputas.cp_a_favor_prestador')}
                  onPress={() => resolverCP(d.id, 'prestador')}
                  aCarregar={aAgir === d.id}
                  style={styles.acaoBtn}
                />
              </View>
            </View>
          ))}

          {disputas.length > 0 && <Text style={styles.seccao}>{t('disputas.convite_seccao')}</Text>}
          {disputas.length === 0 ? null : (
            disputas.map((d) => {
              const valor = d.valor_total != null ? Math.round((d.valor_total * d.pct_caucao) / 100) : null;
              return (
                <View key={d.id} style={styles.cartao}>
                  <Text style={styles.quem}>
                    {(d.profissional?.nome ?? '—') + '  ·  ' + (d.cliente?.nome ?? '—')}
                  </Text>
                  <Text style={styles.servico}>{d.servico ?? '—'}</Text>
                  <Text style={styles.valor}>{t('disputas.valor_em_jogo', { valor: euros(valor) })}</Text>

                  {d.prova_encontro_em ? (
                    <Text style={styles.provaEncontro}>{t('disputas.prova_encontro')}</Text>
                  ) : null}

                  <Text style={styles.contestacaoRotulo}>{t('disputas.contestacao')}</Text>
                  <Text style={styles.contestacao}>
                    {d.consentimento_resultado === 'silencio'
                      ? t('disputas.silencio')
                      : d.contestacao_texto || t('disputas.sem_texto')}
                  </Text>

                  <View style={styles.acoes}>
                    <Botao
                      titulo={t('disputas.arquivar')}
                      variante="secundario"
                      onPress={() => resolver(d.id, 'arquivar')}
                      aCarregar={aAgir === d.id}
                      style={styles.acaoBtn}
                    />
                    <Botao
                      titulo={t('disputas.cobrar')}
                      onPress={() => resolver(d.id, 'cobrar')}
                      aCarregar={aAgir === d.id}
                      style={styles.acaoBtn}
                    />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.md,
    paddingTop: Espaco.md,
  },
  voltar: { color: Honra.verde, fontSize: 16, fontWeight: '700', width: 60 },
  titulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  centro: { padding: Espaco.xl, alignItems: 'center' },
  semPermissao: { fontSize: 15, color: Honra.tintaSuave },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  seccao: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: Espaco.sm,
  },
  cartao: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    gap: Espaco.xs,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  quem: { fontSize: 15, fontWeight: '800', color: Honra.tinta },
  servico: { fontSize: 14, color: Honra.tinta },
  valor: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '700' },
  provaEncontro: { fontSize: 13, color: Honra.verde, fontWeight: '700' },
  contestacaoRotulo: {
    color: Honra.tintaSuave,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.xs,
  },
  contestacao: { fontSize: 14, color: Honra.tinta, lineHeight: 20 },
  acoes: { flexDirection: 'row', gap: Espaco.sm, marginTop: Espaco.sm },
  acaoBtn: { flex: 1 },
});
