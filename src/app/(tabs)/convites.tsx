import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Carregar, Chip, Erro, Vazio, formatarData, hojeISO } from '@/components/ui';
import { useT, type ChaveI18n, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

/**
 * CONVITES (contrato-convite) — o lado do profissional.
 *
 * Os pedidos que entram por convite (clientes SEM conta Honra, vindos do Honra
 * Card). O essencial: quem, quando, quanto. E a decisão em dois botões honestos:
 * Aceitar / Recusar.
 *
 * Fatia C-2: ao aceitar, escolhe-se a PROTEÇÃO — "contrato" ou "contrato+cartão"
 * (nível ii). O cartão só aparece se o gate Connect estiver aberto
 * (pode_nivel_protecao_avancado — migração 035): sem pagamentos ativos, o
 * dinheiro da proteção não teria onde cair a favor de P (direct charges,
 * DESENHO §11.1). O gate explica-se pelo ganho, nunca pelo medo.
 */

type Convite = {
  id: string;
  estado: string;
  servico: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_total: number | null;
  nivel_protecao: number;
  cartao_gravado_em: string | null;
  // Fatia D — a verdade do hold e do checkpoint.
  funding_cartao: string | null;
  hold_decisao: string | null;
  checkpoint_em: string | null;
  perdoado_em: string | null;
  pct_caucao: number;
  // Fatia E — prova-de-encontro + janela de contestação.
  prova_encontro_em: string | null;
  captura_prazo_em: string | null;
  criado_em: string;
  cliente: { nome: string | null } | null;
};

const PENDENTE = 'formulario_recebido';

// Estado → chave i18n (os textos vivem nos dicionários).
const ESTADO_CHAVE: Record<string, ChaveI18n> = {
  formulario_recebido: 'convites.estado.formulario_recebido',
  aguarda_assinatura: 'convites.estado.aguarda_assinatura',
  assinado: 'convites.estado.assinado',
  assinatura_expirada: 'convites.estado.assinatura_expirada',
  recusado: 'convites.estado.recusado',
  formulario_expirado: 'convites.estado.formulario_expirado',
  cancelado_escalao_1: 'convites.estado.cancelado_escalao_1',
  cancelado_escalao_2: 'convites.estado.cancelado_escalao_2',
  cancelado_escalao_3: 'convites.estado.cancelado_escalao_3',
  cobranca_pendente: 'convites.estado.cobranca_pendente',
  cobranca_incobravel: 'convites.estado.cobranca_incobravel',
  cancelado_profissional: 'convites.estado.cancelado_profissional',
  // Fatia D — o hold vivo e o checkpoint.
  caucionado: 'convites.estado.caucionado',
  sem_caucao: 'convites.estado.sem_caucao',
  cartao_falhou: 'convites.estado.cartao_falhou',
  honrado: 'convites.estado.honrado',
  incumprido_cliente: 'convites.estado.incumprido_cliente',
  incumprido_profissional: 'convites.estado.incumprido_profissional',
  // Fatia E — blindagem da fuga E.
  captura_proposta: 'convites.estado.captura_proposta',
  em_disputa: 'convites.estado.em_disputa',
  disputa_arquivada: 'convites.estado.disputa_arquivada',
};

function textoEstado(t: TFn, estado: string): string {
  const chave = ESTADO_CHAVE[estado];
  return chave ? t(chave) : estado;
}
const ESTADOS_VERDES = ['aguarda_assinatura', 'assinado', 'caucionado', 'honrado'];
// Estados vivos que chegam ao dia do evento → checkpoint de P (dois botões).
const ESTADOS_CHECKPOINT = ['assinado', 'caucionado', 'sem_caucao', 'cartao_falhou'];

function euros(c: number | null): string {
  if (c == null) return '—';
  return `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}

// A linha de proteção diz a VERDADE do instrumento vivo (Fatia D): caução
// segura no cartão / cartão guardado sem retenção (débito) / reserva falhou.
function linhaProtecao(t: TFn, c: Convite): string | null {
  if ((c.nivel_protecao ?? 1) < 2) return null;
  if (c.estado === 'caucionado') {
    const valor =
      c.valor_total != null ? euros(Math.round((c.valor_total * c.pct_caucao) / 100)) : `${c.pct_caucao}%`;
    return t('convites.hold_seguro', { valor });
  }
  if (c.hold_decisao === 'hold_falhou') return t('convites.hold_falhou');
  if (c.hold_decisao?.startsWith('sem_hold') && c.hold_decisao !== 'sem_hold_sem_valor')
    return t('convites.hold_sem_debito');
  if (c.estado === 'cartao_falhou') return t('convites.hold_a_tentar');
  if (c.estado === 'honrado' && c.hold_decisao === 'hold_armado') return t('convites.hold_devolvido');
  return (
    t('convites.protecao_cartao') +
    (c.cartao_gravado_em ? t('convites.cartao_guardado') : t('convites.cartao_espera'))
  );
}

function EstadoPill({ estado }: { estado: string }) {
  const { t } = useT();
  const verde = ESTADOS_VERDES.includes(estado);
  const mau =
    estado === 'recusado' || estado === 'formulario_expirado' || estado === 'incumprido_profissional';
  return (
    <View style={[styles.pill, verde && styles.pillVerde, mau && styles.pillMau]}>
      <Text style={[styles.pillTxt, verde && styles.pillTxtVerde, mau && styles.pillTxtMau]}>
        {textoEstado(t, estado)}
      </Text>
    </View>
  );
}

export default function Convites() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [convites, setConvites] = useState<Convite[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'pendentes' | 'todos'>('pendentes');
  const [aAgir, setAAgir] = useState<string | null>(null);
  // SECRETÁRIA: a lista de convites numa coluna centrada mais larga (uma lista
  // com estados lê-se melhor a fio do que repartida em colunas).
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  // Gate dos níveis avançados (conta Connect ativa) + a escolha por convite.
  const [gateCartao, setGateCartao] = useState(false);
  const [nivelSel, setNivelSel] = useState<Record<string, 1 | 2>>({});

  const carregar = useCallback(() => {
    if (!uid) return;
    setACarregar(true);
    setErroCarregar(null);
    supabase
      .from('contratos_convite')
      .select(
        'id, estado, servico, data_inicio, data_fim, valor_total, nivel_protecao, cartao_gravado_em, ' +
          'funding_cartao, hold_decisao, checkpoint_em, perdoado_em, pct_caucao, ' +
          'prova_encontro_em, captura_prazo_em, criado_em, ' +
          'cliente:clientes_convidados(nome)',
      )
      .eq('profissional_id', uid)
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErroCarregar(t('convites.erro_carregar'));
        else setConvites((data as any) ?? []);
        setACarregar(false);
      });
    // O gate lê-se à parte (função da 035); se falhar, fica fechado — honesto.
    supabase
      .rpc('pode_nivel_protecao_avancado', { p_perfil: uid })
      .then(({ data }) => setGateCartao(data === true));
  }, [uid, t]);

  useFocusEffect(carregar);

  async function decidir(id: string, decisao: 'aceitar' | 'recusar') {
    setAAgir(id);
    const nivel = decisao === 'aceitar' ? (nivelSel[id] ?? 1) : undefined;
    const { data, error } = await supabase.functions.invoke('convite-decidir', {
      body: { contrato_id: id, decisao, ...(nivel ? { nivel } : {}) },
    });
    setAAgir(null);
    if (error || !data?.ok) {
      // O erro vindo da função é server-side (PT — TODO v2); o genérico traduz.
      setErroCarregar(data?.error ?? (await razaoDoServidor(error)) ?? t('convites.erro_decidir'));
      return;
    }
    carregar();
  }

  // Fatia D — o CHECKPOINT do dia: "Recebi" (honrado, hold liberta a 0€) ou
  // "Não recebi" (cláusula penal: captura do hold ou MIT; fee 3% mín. 0,60€).
  async function checkpoint(id: string, acao: 'recebi' | 'nao_recebi') {
    setAAgir(id);
    const { data, error } = await supabase.functions.invoke('convite-checkpoint', {
      body: { contrato_id: id, acao },
    });
    setAAgir(null);
    if (error || !data?.ok) {
      setErroCarregar(data?.error ?? (await razaoDoServidor(error)) ?? t('convites.erro_checkpoint'));
      return;
    }
    carregar();
  }

  // Fatia D — o PERDÃO de uma cobrança pendente: nada se cobra a ninguém (fee 0).
  async function perdoar(id: string) {
    setAAgir(id);
    const { data, error } = await supabase.functions.invoke('convite-cancelar', {
      body: { contrato_id: id, acao: 'perdoar' },
    });
    setAAgir(null);
    if (error || !data?.ok) {
      setErroCarregar(data?.error ?? (await razaoDoServidor(error)) ?? t('convites.erro_perdoar'));
      return;
    }
    carregar();
  }

  const lista =
    filtro === 'pendentes' ? convites.filter((c) => c.estado === PENDENTE) : convites;

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <View style={styles.topo}>
        <Text style={styles.voltar} onPress={() => router.back()}>
          {t('comum.voltar_seta')}
        </Text>
        <Text style={styles.titulo}>{t('convites.titulo')}</Text>
        <View style={styles.topoAcao} />
      </View>

      <View style={styles.filtros}>
        <Chip
          texto={t('convites.filtro_pendentes')}
          ativo={filtro === 'pendentes'}
          onPress={() => setFiltro('pendentes')}
        />
        <Chip texto={t('convites.filtro_todos')} ativo={filtro === 'todos'} onPress={() => setFiltro('todos')} />
      </View>

      {aCarregar ? (
        <Carregar />
      ) : erroCarregar ? (
        <View style={styles.centro}>
          <Erro texto={erroCarregar} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}>
          {lista.length === 0 ? (
            <Vazio
              texto={
                filtro === 'pendentes' ? t('convites.vazio_pendentes') : t('convites.vazio_todos')
              }
            />
          ) : (
            lista.map((c) => (
              <View key={c.id} style={styles.cartao}>
                <View style={styles.cabeca}>
                  <Text style={styles.quem} numberOfLines={1}>
                    {c.cliente?.nome ?? t('convites.cliente_convidado')}
                  </Text>
                  <EstadoPill estado={c.estado} />
                </View>
                <Text
                  style={[styles.servico, !c.servico && styles.placeholder]}
                  numberOfLines={2}
                >
                  {c.servico ?? t('convites.sem_servico')}
                </Text>
                <View style={styles.meta}>
                  <Text style={styles.metaTxt}>
                    {formatarData(c.data_inicio)}
                    {c.data_fim ? ` – ${formatarData(c.data_fim)}` : ''}
                  </Text>
                  <Text style={[styles.metaTxt, c.valor_total == null && styles.placeholder]}>
                    {c.valor_total == null ? t('convites.valor_combinar') : euros(c.valor_total)}
                  </Text>
                </View>

                {/* Proteção do contrato aceite — a verdade, sem enfeite. */}
                {c.estado !== PENDENTE && linhaProtecao(t, c) ? (
                  <Text style={styles.protecaoTxt}>{linhaProtecao(t, c)}</Text>
                ) : null}

                {/* Fatia D+E — CHECKPOINT: o dia chegou; dois botões honestos.
                    A comparência (prova-de-encontro) trava a falta indevida. */}
                {ESTADOS_CHECKPOINT.includes(c.estado) &&
                c.data_inicio <= hojeISO() &&
                !c.checkpoint_em ? (
                  <>
                    <Text style={styles.checkpointNota}>{t('convites.checkpoint_nota')}</Text>
                    {!c.prova_encontro_em ? (
                      <Botao
                        titulo={t('convites.comparencia_abrir')}
                        variante="secundario"
                        onPress={() => router.push(`/comparencia?id=${c.id}` as Href)}
                        style={{ marginTop: Espaco.xs }}
                      />
                    ) : null}
                    <View style={styles.acoes}>
                      <Botao
                        titulo={t('convites.checkpoint_nao_recebi')}
                        variante="secundario"
                        onPress={() => checkpoint(c.id, 'nao_recebi')}
                        aCarregar={aAgir === c.id}
                        style={styles.acaoBtn}
                      />
                      <Botao
                        titulo={t('convites.checkpoint_recebi')}
                        onPress={() => checkpoint(c.id, 'recebi')}
                        aCarregar={aAgir === c.id}
                        style={styles.acaoBtn}
                      />
                    </View>
                  </>
                ) : null}

                {/* Fatia E — janela de contestação aberta (a aguardar o cliente). */}
                {c.estado === 'captura_proposta' ? (
                  <Text style={styles.checkpointNota}>
                    {t('convites.captura_proposta_nota', {
                      prazo: c.captura_prazo_em ? formatarData(c.captura_prazo_em.slice(0, 10)) : '—',
                    })}
                  </Text>
                ) : null}
                {c.estado === 'em_disputa' ? (
                  <Text style={styles.checkpointNota}>{t('convites.em_disputa_nota')}</Text>
                ) : null}

                {/* Fatia D — PERDÃO de uma cobrança pendente (fee 0). */}
                {c.estado === 'cobranca_pendente' && !c.perdoado_em ? (
                  <>
                    <Text style={styles.checkpointNota}>{t('convites.perdoar_nota')}</Text>
                    <Botao
                      titulo={t('convites.perdoar')}
                      variante="secundario"
                      onPress={() => perdoar(c.id)}
                      aCarregar={aAgir === c.id}
                    />
                  </>
                ) : null}
                {c.perdoado_em ? (
                  <Text style={styles.protecaoTxt}>{t('convites.perdoado')}</Text>
                ) : null}

                {c.estado === PENDENTE && (
                  <>
                    {/* A escolha da proteção — sóbria, congelada no aceite. */}
                    <Text style={styles.protecaoRotulo}>{t('convites.protecao')}</Text>
                    {gateCartao ? (
                      <View style={styles.nivelLinha}>
                        {([1, 2] as const).map((n) => {
                          const ativo = (nivelSel[c.id] ?? 1) === n;
                          return (
                            <Pressable
                              key={n}
                              style={[styles.nivelOpcao, ativo && styles.nivelOpcaoOn]}
                              onPress={() => setNivelSel((s) => ({ ...s, [c.id]: n }))}
                            >
                              <Text style={[styles.nivelTxt, ativo && styles.nivelTxtOn]}>
                                {n === 1 ? t('convites.nivel_contrato') : t('convites.nivel_cartao')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.nivelNota}>{t('convites.nivel_nota')}</Text>
                    )}

                    <View style={styles.acoes}>
                      <Botao
                        titulo={t('convites.recusar')}
                        variante="secundario"
                        onPress={() => decidir(c.id, 'recusar')}
                        aCarregar={aAgir === c.id}
                        style={styles.acaoBtn}
                      />
                      <Botao
                        titulo={t('convites.aceitar')}
                        onPress={() => decidir(c.id, 'aceitar')}
                        aCarregar={aAgir === c.id}
                        style={styles.acaoBtn}
                      />
                    </View>
                  </>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* CRIAR CONVITE, EM QUALQUER LADO.
          Isto escondia o botão na web e remetia para o telemóvel, por se ter
          assumido que convidar é um gesto presencial de bolso. Duas coisas
          desmentiram-no:

          1. O ecrã de criar convite desenha o QR SÓ NA WEB — a biblioteca usa
             canvas do browser. Ou seja, a porta estava fechada exatamente do
             lado onde o quarto funciona, e aberta do lado onde o QR nem
             aparece. Quem seguisse a nota chegava a um ecrã pior.

          2. Nada no fluxo exige um telemóvel a quem CONVIDA. O QR mostra-se
             num ecrã qualquer — e num monitor lê-se melhor do que num
             telemóvel. O SMS do código vai para o telefone de quem RECEBE,
             que é outra pessoa e outro aparelho.

          O Honra na web é o Honra. Uma capacidade central não se tira a metade
          da casa por um pressuposto sobre onde as pessoas estão. */}
      <Pressable
        onPress={() => router.push('/convidar-cliente' as Href)}
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel={t('convites.criar')}
      >
        <Feather name="user-plus" size={24} color={Honra.creme} />
      </Pressable>
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
  filtros: { flexDirection: 'row', gap: Espaco.sm, paddingHorizontal: Espaco.md, paddingTop: Espaco.md },
  topoAcao: { width: 60 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Honra.verde,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Web: em vez do FAB de criar, uma nota discreta a remeter para o telemóvel.
  centro: { padding: Espaco.xl, alignItems: 'center' },
  corpo: { padding: Espaco.md, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  corpoLargo: { width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: Espaco.xl },

  cartao: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    gap: Espaco.sm,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  cabeca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Espaco.sm,
  },
  quem: { fontSize: 15, fontWeight: '800', color: Honra.tinta, flexShrink: 1 },
  servico: { fontSize: 14, color: Honra.tinta },
  placeholder: { color: Honra.tintaSuave, fontStyle: 'italic', opacity: 0.8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaTxt: { fontSize: 13, color: Honra.tintaSuave, fontWeight: '600' },
  acoes: { flexDirection: 'row', gap: Espaco.sm, marginTop: Espaco.xs },
  acaoBtn: { flex: 1 },

  // Proteção (Fatia C-2)
  protecaoTxt: { fontSize: 12, color: Honra.tintaSuave, fontWeight: '600' },
  // Checkpoint / perdão (Fatia D)
  checkpointNota: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17, marginTop: Espaco.xs },
  protecaoRotulo: {
    color: Honra.tintaSuave,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.xs,
  },
  nivelLinha: { flexDirection: 'row', gap: Espaco.sm },
  nivelOpcao: {
    flex: 1,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: Honra.creme,
  },
  nivelOpcaoOn: { borderColor: Honra.verde, backgroundColor: Honra.verdeSuave },
  nivelTxt: { fontSize: 13, fontWeight: '700', color: Honra.tintaSuave },
  nivelTxtOn: { color: Honra.verde },
  nivelNota: { fontSize: 12, color: Honra.tintaSuave, lineHeight: 17 },

  pill: {
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 3,
    backgroundColor: Honra.creme,
    flexShrink: 1,
  },
  pillVerde: { backgroundColor: Honra.verdeSuave },
  pillMau: { backgroundColor: Honra.erroSuave },
  pillTxt: { fontSize: 12, fontWeight: '700', color: Honra.tintaSuave },
  pillTxtVerde: { color: Honra.verde },
  pillTxtMau: { color: Honra.erro },
});
