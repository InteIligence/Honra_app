import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, CampoData, formatarData, hojeISO } from '@/components/ui';
import { useT, type ChaveI18n, type Idioma } from '@/i18n';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase, temConfig } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * PÁGINA PÚBLICA DO CONVIDADO (contrato-convite).
 *
 * A escada de confiança (doc §3): 1º o Honra Card do profissional (a PROVA,
 * zero pedidos) → 2º o formulário (datas obrigatórias, serviço, valor; zero
 * dinheiro, zero conta) → 3º o contrato lido e assinado com OTP → 4º SÓ ENTÃO,
 * nos contratos com proteção contrato+cartão (nível ii), o CARTÃO — enquadrado
 * pelo que o convidado ganha, com o mandato lido e aceite ANTES (Fatia C-2).
 * O convidado NÃO tem conta e NUNCA lê a base — fala só com Edge Functions.
 *
 * Rotas pela querystring: ?ml= (magic link) identifica; &fin= diz para que ato
 * o link serve ('assinar' por omissão, 'cartao', 'cancelar'). O hold é Fatia D.
 */

const ROTULO_ABA: Record<string, ChaveI18n> = {
  identidade: 'selo.identidade',
  profissao: 'selo.profissao',
  contacto: 'selo.contacto',
  portefolio: 'selo.portefolio',
};
const ABAS = ['identidade', 'profissao', 'contacto', 'portefolio'] as const;

type Cartao = {
  id: string;
  nome: string | null;
  papel: string | null;
  cidade: string | null;
  avatar: string | null;
  indice_confianca: number | null;
  negocios_honrados: number | null;
  verificacoes: string[];
};
type ContratoEstado = {
  estado: string;
  servico: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_total: number | null;
};

// Estados → chaves i18n (os textos vivem em pt.ts/en.ts; `bom` pinta o ícone).
const ESTADO_TXT: Record<string, { titulo: ChaveI18n; corpo: ChaveI18n; bom: boolean }> = {
  formulario_recebido: {
    titulo: 'convite.estado.formulario_recebido.titulo',
    corpo: 'convite.estado.formulario_recebido.corpo',
    bom: true,
  },
  aguarda_assinatura: {
    titulo: 'convite.estado.aguarda_assinatura.titulo',
    corpo: 'convite.estado.aguarda_assinatura.corpo',
    bom: true,
  },
  assinado: {
    titulo: 'convite.estado.assinado.titulo',
    corpo: 'convite.estado.assinado.corpo',
    bom: true,
  },
  assinatura_expirada: {
    titulo: 'convite.estado.assinatura_expirada.titulo',
    corpo: 'convite.estado.assinatura_expirada.corpo',
    bom: false,
  },
  recusado: {
    titulo: 'convite.estado.recusado.titulo',
    corpo: 'convite.estado.recusado.corpo',
    bom: false,
  },
  formulario_expirado: {
    titulo: 'convite.estado.formulario_expirado.titulo',
    corpo: 'convite.estado.formulario_expirado.corpo',
    bom: false,
  },
  // Fatia C-2 — cancelamentos (o preço é do tempo; os textos dizem a verdade).
  cancelado_escalao_1: {
    titulo: 'convite.estado.cancelado_escalao_1.titulo',
    corpo: 'convite.estado.cancelado_escalao_1.corpo',
    bom: false,
  },
  cancelado_escalao_2: {
    titulo: 'convite.estado.cancelado_escalao_2.titulo',
    corpo: 'convite.estado.cancelado_escalao_2.corpo',
    bom: false,
  },
  cancelado_escalao_3: {
    titulo: 'convite.estado.cancelado_escalao_3.titulo',
    corpo: 'convite.estado.cancelado_escalao_3.corpo',
    bom: false,
  },
  cobranca_pendente: {
    titulo: 'convite.estado.cobranca_pendente.titulo',
    corpo: 'convite.estado.cobranca_pendente.corpo',
    bom: false,
  },
  cobranca_incobravel: {
    titulo: 'convite.estado.cobranca_incobravel.titulo',
    corpo: 'convite.estado.cobranca_incobravel.corpo',
    bom: false,
  },
  cancelado_profissional: {
    titulo: 'convite.estado.cancelado_profissional.titulo',
    corpo: 'convite.estado.cancelado_profissional.corpo',
    bom: false,
  },
  // Fatia D — o hold vivo e o checkpoint (a verdade, sem susto).
  caucionado: {
    titulo: 'convite.estado.caucionado.titulo',
    corpo: 'convite.estado.caucionado.corpo',
    bom: true,
  },
  sem_caucao: {
    titulo: 'convite.estado.sem_caucao.titulo',
    corpo: 'convite.estado.sem_caucao.corpo',
    bom: true,
  },
  cartao_falhou: {
    titulo: 'convite.estado.cartao_falhou.titulo',
    corpo: 'convite.estado.cartao_falhou.corpo',
    bom: false,
  },
  honrado: {
    titulo: 'convite.estado.honrado.titulo',
    corpo: 'convite.estado.honrado.corpo',
    bom: true,
  },
  incumprido_cliente: {
    titulo: 'convite.estado.incumprido_cliente.titulo',
    corpo: 'convite.estado.incumprido_cliente.corpo',
    bom: false,
  },
  incumprido_profissional: {
    titulo: 'convite.estado.incumprido_profissional.titulo',
    corpo: 'convite.estado.incumprido_profissional.corpo',
    bom: false,
  },
  // Fatia E — janela de contestação e arbitragem.
  captura_proposta: {
    titulo: 'convite.estado.captura_proposta.titulo',
    corpo: 'convite.estado.captura_proposta.corpo',
    bom: false,
  },
  em_disputa: {
    titulo: 'convite.estado.em_disputa.titulo',
    corpo: 'convite.estado.em_disputa.corpo',
    bom: false,
  },
  disputa_arquivada: {
    titulo: 'convite.estado.disputa_arquivada.titulo',
    corpo: 'convite.estado.disputa_arquivada.corpo',
    bom: false,
  },
};

// Estados de contrato vivo de onde o convidado pode pedir cancelamento (Fatia D).
const ESTADOS_CANCELAVEIS = ['assinado', 'caucionado', 'sem_caucao', 'cartao_falhou'];

// Tipo do contrato tal como convite-pagina o devolve no modo CONTRATO (assinatura).
type ContratoAssinatura = {
  estado: string;
  servico: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_total: number | null;
  sinal_valor: number | null;
  nivel_protecao: number;
  pct_cancelamento: number;
  pct_caucao: number;
  janela_x_meses: number;
  contrato_texto: string | null;
  contrato_hash: string | null;
  contrato_versao: string | null;
  mandato_texto: string | null;
  mandato_aceite_em: string | null;
  cartao_gravado_em: string | null;
  aviso_resolucao_aceite_em: string | null;
  politica_cancel_aceite_em: string | null;
  assinado_em: string | null;
};

// "500" ou "500,50" (euros) → cêntimos; '' → null.
function eurosParaCentimos(v: string): number | null {
  const limpo = v.replace(/\s/g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function centimosParaEuros(c: number | null, idioma: Idioma = 'pt'): string {
  if (c == null) return '—';
  // O número fala a língua de quem lê (PT: "1 234,56 €" · EN: "€1,234.56").
  if (idioma === 'en') {
    return `€${(c / 100).toLocaleString('en-IE', { minimumFractionDigits: 2 })}`;
  }
  return `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}
// Normaliza um telemóvel PT para E.164 (9 dígitos → +351…); deixa o resto como está.
function normalizarTelefone(v: string): string {
  const t = v.replace(/[\s-]/g, '');
  if (/^9\d{8}$/.test(t)) return `+351${t}`;
  return t;
}

export default function PaginaConvidado() {
  const { token, ml, fin, cartao, session_id } = useLocalSearchParams<{
    token: string;
    ml?: string;
    fin?: string; // para que ato serve o link: 'assinar' (omissão) | 'cartao' | 'cancelar'
    cartao?: string; // retorno do Checkout de setup: 'confirmar' | 'cancelado'
    session_id?: string;
  }>();
  // Com magic link (?ml=) o `token` é o token_publico do CONTRATO e entramos
  // direto no ato que o link permite (doc §8.1). Sem ele, é o Honra Card do
  // profissional (a porta de entrada da escada de confiança). O servidor valida
  // SEMPRE a finalidade real do link — o `fin` só orienta o ecrã.
  if (ml && token) {
    if (fin === 'cartao')
      return (
        <PaginaPassoCartao tokenPublico={token} ml={ml} retorno={cartao} sessionId={session_id} />
      );
    if (fin === 'cancelar') return <PaginaCancelamento tokenPublico={token} ml={ml} />;
    // Fatia E — prova-de-encontro (co-presença) e janela de contestação.
    if (fin === 'comparencia') return <PaginaComparencia tokenPublico={token} ml={ml} />;
    if (fin === 'checkpoint') return <PaginaConsentimento tokenPublico={token} ml={ml} />;
    return <PaginaAssinatura tokenPublico={token} ml={ml} />;
  }
  return <PaginaCartao token={token} />;
}

// Para onde a Stripe deve voltar depois do Checkout de setup: a PRÓPRIA página
// do contrato (na web, a origem exata; no nativo, o link universal do site).
function returnUrlCartao(tokenPublico: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/c/${tokenPublico}`;
  }
  return `https://honraapp.com/c/${tokenPublico}`;
}

// Abre o Checkout da Stripe (mesmo padrão de ativar-pagamentos).
async function abrirStripe(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

function PaginaCartao({ token }: { token: string }) {
  const { t } = useT();
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cartao, setCartao] = useState<Cartao | null>(null);
  const [podeReceber, setPodeReceber] = useState(true);
  const [passo, setPasso] = useState<'card' | 'form' | 'estado'>('card');

  // Formulário
  const [servico, setServico] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [valor, setValor] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  // Estado após submissão
  const [contrato, setContrato] = useState<ContratoEstado | null>(null);

  const carregarCartao = useCallback(async () => {
    if (!token) return;
    if (!temConfig) {
      setErro(t('convite.erro_config'));
      setACarregar(false);
      return;
    }
    setACarregar(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke('convite-pagina', {
      body: { perfil: token },
    });
    if (error || !data?.profissional) {
      setErro((await razaoDoServidor(error)) ?? t('convite.erro_profissional'));
    } else {
      setCartao(data.profissional as Cartao);
      setPodeReceber(!!data.pode_receber);
    }
    setACarregar(false);
  }, [token, t]);

  useEffect(() => {
    carregarCartao();
  }, [carregarCartao]);

  async function enviar() {
    setErroForm(null);
    if (nome.trim().length < 2) return setErroForm(t('convite.form.erro_nome'));
    const tel = normalizarTelefone(telefone);
    if (!/^\+[1-9]\d{7,14}$/.test(tel)) return setErroForm(t('convite.form.erro_telefone'));
    if (!dataInicio) return setErroForm(t('convite.form.erro_data'));
    const valorCent = eurosParaCentimos(valor);
    if (valor && valorCent == null) return setErroForm(t('convite.form.erro_valor'));

    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('convite-formulario', {
      body: {
        perfil: token,
        nome: nome.trim(),
        telefone: tel,
        servico: servico.trim() || null,
        data_inicio: dataInicio,
        data_fim: dataFim || null,
        valor_total: valorCent,
      },
    });
    setAEnviar(false);
    if (error || !data?.ok) {
      // `context.body` é um ReadableStream, nunca uma string — a guarda do
      // `typeof` a seguir caía SEMPRE no genérico. A razão lê-se do corpo da
      // resposta, que é o que o `razaoDoServidor` faz.
      setErroForm(
        data?.error ?? (await razaoDoServidor(error)) ?? t('convite.form.erro_enviar')
      );
      return;
    }
    // Buscar o estado pelo token do contrato (a "verdade única" também para o C).
    const r = await supabase.functions.invoke('convite-pagina', { body: { token: data.token } });
    if (r.data?.contrato) setContrato(r.data.contrato as ContratoEstado);
    setPasso('estado');
  }

  if (aCarregar) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }
  if (erro || !cartao) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <Text style={styles.erroTxt}>{erro ?? t('convite.erro_profissional')}</Text>
      </View>
    );
  }

  const nomePro = cartao.nome ?? t('comum.profissional');
  const sub = [cartao.papel, cartao.cidade].filter(Boolean).join(' · ');
  const identidadeOk = cartao.verificacoes.includes('identidade');
  // Sem avaliações (0/null) mostra "—", nunca "0,0★" — 0 não é nota, é ausência
  // (o mesmo padrão do honra-card e do componente Confiança).
  const indiceAval = Number(cartao.indice_confianca ?? 0);
  const avalTxt =
    indiceAval > 0 ? `${indiceAval.toFixed(1).replace('.', ',')}★` : '—';

  return (
    <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
      {/* ===== 1º ANDAR — o Honra Card (a prova). Sempre visível. ===== */}
      <View style={styles.card}>
        <Text style={styles.marca}>Honra</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{cartao.avatar ?? nomePro.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.nomeLinha}>
          <Text style={styles.nome} numberOfLines={1}>
            {nomePro}
          </Text>
          {identidadeOk && (
            <View style={styles.visto}>
              <Feather name="check" size={11} color="#fff" />
            </View>
          )}
        </View>
        {sub ? <Text style={styles.papel}>{sub}</Text> : null}

        <View style={styles.abas}>
          {ABAS.map((aba) => {
            const verde = cartao.verificacoes.includes(aba);
            return (
              <View key={aba} style={[styles.aba, verde ? styles.abaOn : styles.abaOff]}>
                <Text style={[styles.abaTxt, verde ? styles.abaTxtOn : styles.abaTxtOff]}>
                  {verde ? '✓ ' : '🔒 '}
                  {t(ROTULO_ABA[aba])}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValor}>{avalTxt}</Text>
            <Text style={styles.statRotulo}>{t('convite.avaliacao')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValor}>{String(cartao.negocios_honrados ?? 0)}</Text>
            <Text style={styles.statRotulo}>{t('convite.negocios')}</Text>
          </View>
        </View>
      </View>

      {/* ===== 2º ANDAR — o formulário / estado ===== */}
      {passo === 'card' && (
        <View style={styles.bloco}>
          {podeReceber ? (
            <>
              <Text style={styles.chamada}>{t('convite.chamada', { nome: nomePro })}</Text>
              <Botao titulo={t('convite.pedir')} onPress={() => setPasso('form')} />
            </>
          ) : (
            <Text style={styles.avisoSuave}>{t('convite.sem_identidade')}</Text>
          )}
        </View>
      )}

      {passo === 'form' && (
        <View style={styles.bloco}>
          <Text style={styles.rotulo}>{t('convite.form.servico')}</Text>
          <Campo
            placeholder={t('convite.form.servico_ph')}
            value={servico}
            onChangeText={setServico}
          />

          <Text style={styles.rotulo}>{t('convite.form.data')}</Text>
          <CampoData value={dataInicio} onChange={setDataInicio} minimo={hojeISO()} />
          <Text style={styles.dica}>{t('convite.form.data_dica')}</Text>

          <Text style={styles.rotulo}>{t('convite.form.ate')}</Text>
          <CampoData
            value={dataFim}
            onChange={setDataFim}
            minimo={dataInicio || hojeISO()}
            placeholder={t('comum.opcional')}
          />

          <Text style={styles.rotulo}>{t('convite.form.valor')}</Text>
          <Campo
            placeholder={t('convite.form.valor_ph')}
            keyboardType="numeric"
            value={valor}
            onChangeText={setValor}
          />

          <Text style={styles.rotulo}>{t('convite.form.nome')}</Text>
          <Campo placeholder={t('convite.form.nome_ph')} value={nome} onChangeText={setNome} />

          <Text style={styles.rotulo}>{t('convite.form.telemovel')}</Text>
          <Campo
            placeholder={t('convite.form.telemovel_ph')}
            keyboardType="phone-pad"
            value={telefone}
            onChangeText={setTelefone}
          />

          <Text style={styles.rgpd}>{t('convite.form.rgpd')}</Text>

          {erroForm ? <Text style={styles.erroForm}>{erroForm}</Text> : null}

          <Botao titulo={t('convite.form.enviar')} onPress={enviar} aCarregar={aEnviar} />
          <Botao
            titulo={t('comum.voltar')}
            variante="secundario"
            onPress={() => setPasso('card')}
          />
        </View>
      )}

      {passo === 'estado' && (
        <View style={styles.bloco}>
          <EstadoView contrato={contrato} />
        </View>
      )}
    </ScrollView>
  );
}

function EstadoView({ contrato }: { contrato: ContratoEstado | null }) {
  const { t, idioma } = useT();
  const info = contrato ? ESTADO_TXT[contrato.estado] : ESTADO_TXT.formulario_recebido;
  const cor = info?.bom ? Honra.verde : Honra.tintaSuave;
  return (
    <View style={styles.estadoCard}>
      <View style={[styles.estadoIcone, { backgroundColor: info?.bom ? Honra.verdeSuave : Honra.creme }]}>
        <Feather name={info?.bom ? 'check' : 'clock'} size={20} color={cor} />
      </View>
      <Text style={styles.estadoTitulo}>
        {info ? t(info.titulo) : t('convite.estado.formulario_recebido.titulo')}
      </Text>
      <Text style={styles.estadoCorpo}>{info ? t(info.corpo) : ''}</Text>
      {contrato && (
        <View style={styles.resumo}>
          {contrato.servico ? (
            <ResumoLinha etiqueta={t('convite.resumo.servico')} valor={contrato.servico} />
          ) : null}
          <ResumoLinha
            etiqueta={t('convite.resumo.data')}
            valor={
              formatarData(contrato.data_inicio) +
              (contrato.data_fim ? ` – ${formatarData(contrato.data_fim)}` : '')
            }
          />
          {contrato.valor_total != null ? (
            <ResumoLinha
              etiqueta={t('convite.resumo.valor')}
              valor={centimosParaEuros(contrato.valor_total, idioma)}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}
function ResumoLinha({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.resumoLinha}>
      <Text style={styles.resumoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.resumoValor}>{valor}</Text>
    </View>
  );
}

// Uma caixa de aceitação explícita (click-to-accept com carimbo — regra Visa +
// art. 4.º/1/p). "Mostrar não dizer": o aviso legal claro mas sóbrio.
function Aceite({
  marcado,
  onToggle,
  children,
}: {
  marcado: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable style={styles.aceiteLinha} onPress={onToggle}>
      <View style={[styles.caixa, marcado && styles.caixaOn]}>
        {marcado && <Feather name="check" size={13} color="#fff" />}
      </View>
      <Text style={styles.aceiteTxt}>{children}</Text>
    </Pressable>
  );
}

/**
 * ECRÃ DE LEITURA + ASSINATURA (contrato-convite, Fatia B).
 *
 * O convidado, depois de o profissional aceitar, volta pelo magic link (?ml=),
 * LÊ o contrato curto do Honra, ACEITA explicitamente (i) o aviso de não-resolução
 * e (ii) a política de cancelamento, e só então recebe o OTP por SMS e assina.
 * "O link identifica; só o OTP autentica" — um link morto pede um novo.
 */
function PaginaAssinatura({ tokenPublico, ml }: { tokenPublico: string; ml: string }) {
  const { t } = useT();
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cartao, setCartao] = useState<Cartao | null>(null);
  const [contrato, setContrato] = useState<ContratoAssinatura | null>(null);

  const [avisoOk, setAvisoOk] = useState(false);
  const [politicaOk, setPoliticaOk] = useState(false);
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [aAgir, setAAgir] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [podeRenovar, setPodeRenovar] = useState(false);
  // Nível ii: a assinatura devolve um magic link 'cartao' — o degrau seguinte
  // continua nesta página, sem esperar por SMS (o cartão vem SEMPRE depois).
  const [mlCartao, setMlCartao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!temConfig) {
      setErro(t('convite.erro_config'));
      setACarregar(false);
      return;
    }
    setACarregar(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke('convite-pagina', {
      body: { token: tokenPublico },
    });
    if (error || !data?.contrato) {
      setErro((await razaoDoServidor(error)) ?? t('convite.erro_contrato'));
    } else {
      setCartao((data.profissional as Cartao) ?? null);
      setContrato(data.contrato as ContratoAssinatura);
    }
    setACarregar(false);
  }, [tokenPublico, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function pedirCodigo() {
    setErroAcao(null);
    setPodeRenovar(false);
    if (!avisoOk || !politicaOk) {
      setErroAcao(t('convite.assinatura.erro_aceites'));
      return;
    }
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-otp', {
      body: { token: ml, aviso_ok: avisoOk, politica_ok: politicaOk },
    });
    setAAgir(false);
    if (error || !data?.enviado) {
      if (data?.pode_renovar) setPodeRenovar(true);
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.assinatura.erro_codigo_envio'));
      return;
    }
    setCodigoPedido(true);
  }

  async function assinar() {
    setErroAcao(null);
    setPodeRenovar(false);
    if (!/^\d{6}$/.test(codigo.trim())) {
      setErroAcao(t('convite.assinatura.erro_codigo'));
      return;
    }
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-assinar', {
      body: { token: ml, codigo: codigo.trim() },
    });
    setAAgir(false);
    if (error || !data?.ok) {
      if (data?.pode_renovar) setPodeRenovar(true);
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.assinatura.erro_assinar'));
      return;
    }
    // Nível ii: o servidor emite já o link do passo do cartão.
    if (typeof data?.ml_cartao === 'string') setMlCartao(data.ml_cartao);
    carregar(); // recarrega → estado 'assinado'
  }

  async function renovar() {
    setErroAcao(null);
    setPodeRenovar(false);
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-otp', {
      body: { token_publico: tokenPublico, renovar: true },
    });
    setAAgir(false);
    if (error || !data?.renovado) {
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.assinatura.erro_link'));
      return;
    }
    setErroAcao(t('convite.assinatura.link_enviado'));
  }

  if (aCarregar) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }
  if (erro || !contrato) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <Text style={styles.erroTxt}>{erro ?? t('convite.erro_contrato')}</Text>
      </View>
    );
  }

  const nomePro = cartao?.nome ?? t('comum.profissional');

  // Estado terminal ou não-assinável → mostra o estado; e, no nível ii recém-
  // assinado, o degrau seguinte da escada: o CARTÃO (com o mandato à vista).
  if (contrato.estado !== 'aguarda_assinatura') {
    const faltaCartao =
      contrato.estado === 'assinado' &&
      (contrato.nivel_protecao ?? 1) >= 2 &&
      !contrato.cartao_gravado_em;
    return (
      <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
        <View style={styles.bloco}>
          <EstadoView
            contrato={{
              estado: contrato.estado,
              servico: contrato.servico,
              data_inicio: contrato.data_inicio,
              data_fim: contrato.data_fim,
              valor_total: contrato.valor_total,
            }}
          />
          {contrato.contrato_hash ? (
            <Text style={styles.hashTxt}>
              {t('convite.ref', { ref: contrato.contrato_hash.slice(0, 8) })}
            </Text>
          ) : null}
        </View>

        {faltaCartao && mlCartao ? (
          <BlocoCartao
            tokenPublico={tokenPublico}
            ml={mlCartao}
            mandatoTexto={contrato.mandato_texto}
          />
        ) : null}
        {faltaCartao && !mlCartao ? <PedirLinkCartao tokenPublico={tokenPublico} /> : null}

        <AcoesContrato tokenPublico={tokenPublico} contrato={contrato} />
      </ScrollView>
    );
  }

  const dataDestaque =
    formatarData(contrato.data_inicio) +
    (contrato.data_fim ? ` – ${formatarData(contrato.data_fim)}` : '');

  return (
    <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
      <Text style={styles.marcaTopo}>Honra</Text>
      <Text style={styles.tituloAssin}>{t('convite.assinatura.titulo', { nome: nomePro })}</Text>

      {/* Data em destaque (invariante) */}
      <View style={styles.dataDestaque}>
        <Text style={styles.dataRotulo}>{t('convite.assinatura.data_evento')}</Text>
        <Text style={styles.dataValor}>{dataDestaque}</Text>
      </View>

      {/* O contrato para LER */}
      <View style={styles.contratoCard}>
        <Text style={styles.contratoTexto}>{contrato.contrato_texto ?? ''}</Text>
      </View>
      {contrato.contrato_hash ? (
        <Text style={styles.hashTxt}>
          {t('convite.ref_integridade', {
            ref: contrato.contrato_hash.slice(0, 8),
            versao: contrato.contrato_versao ?? '—',
          })}
        </Text>
      ) : null}

      {/* Aviso legal + política, com aceitação explícita (antes de assinar).
          A referência legal (art. 17.º/1/k do DL 24/2014) mantém-se intacta
          nos dois idiomas — a lei é a lei. */}
      <View style={styles.bloco}>
        <Aceite marcado={avisoOk} onToggle={() => setAvisoOk((v) => !v)}>
          {t('convite.assinatura.aviso_resolucao')}
        </Aceite>
        <Aceite marcado={politicaOk} onToggle={() => setPoliticaOk((v) => !v)}>
          {t('convite.assinatura.politica', {
            pct1: contrato.pct_cancelamento,
            pct2: contrato.pct_caucao,
          })}
        </Aceite>

        {!codigoPedido ? (
          <Botao
            titulo={t('convite.assinatura.receber_codigo')}
            onPress={pedirCodigo}
            aCarregar={aAgir}
            style={{ marginTop: Espaco.sm }}
          />
        ) : (
          <>
            <Text style={styles.rotulo}>{t('convite.assinatura.codigo_rotulo')}</Text>
            <Campo
              placeholder={t('convite.assinatura.codigo_ph')}
              keyboardType="number-pad"
              value={codigo}
              onChangeText={setCodigo}
              maxLength={6}
            />
            <Botao titulo={t('convite.assinatura.assinar')} onPress={assinar} aCarregar={aAgir} />
          </>
        )}

        {erroAcao ? <Text style={styles.erroForm}>{erroAcao}</Text> : null}
        {podeRenovar ? (
          <Botao
            titulo={t('convite.assinatura.link_novo')}
            variante="secundario"
            onPress={renovar}
            aCarregar={aAgir}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * BLOCO DO CARTÃO (nível ii, Fatia C-2) — o último degrau da escada.
 * Título pelo GANHO do cliente; o mandato (P nomeado beneficiário, valores e
 * datas concretos) lido e aceite ANTES do cartão — invariante legal. O Checkout
 * (Apple Pay/Google Pay à cabeça) corre na conta Stripe do profissional.
 */
function BlocoCartao({
  tokenPublico,
  ml,
  mandatoTexto,
}: {
  tokenPublico: string;
  ml: string;
  mandatoTexto: string | null;
}) {
  const { t } = useT();
  const [mandatoOk, setMandatoOk] = useState(false);
  const [aAgir, setAAgir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function guardarCartao() {
    setErro(null);
    if (!mandatoOk) {
      setErro(t('convite.cartao.erro_mandato'));
      return;
    }
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-cartao', {
      body: {
        acao: 'iniciar',
        token: ml,
        mandato_ok: true,
        return_url: returnUrlCartao(tokenPublico),
      },
    });
    if (error || !data?.url) {
      setAAgir(false);
      setErro(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.cartao.erro_abrir'));
      return;
    }
    await abrirStripe(data.url as string);
    setAAgir(false);
  }

  return (
    <View style={styles.bloco}>
      <Text style={styles.chamada}>{t('convite.cartao.chamada')}</Text>
      <Text style={styles.avisoSuave}>{t('convite.cartao.explica')}</Text>

      {mandatoTexto ? (
        <View style={styles.mandatoCard}>
          <Text style={styles.contratoTexto}>{mandatoTexto}</Text>
        </View>
      ) : null}

      <Aceite marcado={mandatoOk} onToggle={() => setMandatoOk((v) => !v)}>
        {t('convite.cartao.mandato_aceite')}
      </Aceite>

      {erro ? <Text style={styles.erroForm}>{erro}</Text> : null}
      <Botao titulo={t('convite.cartao.guardar')} onPress={guardarCartao} aCarregar={aAgir} />
    </View>
  );
}

/** Sem link vivo do cartão (voltou mais tarde): pede um novo por SMS. */
function PedirLinkCartao({ tokenPublico }: { tokenPublico: string }) {
  const { t } = useT();
  const [aAgir, setAAgir] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function pedir() {
    setAAgir(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('convite-cartao', {
      body: { acao: 'link', token_publico: tokenPublico },
    });
    setAAgir(false);
    if (error || !data?.renovado) {
      setMsg(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.cartao.erro_link'));
      return;
    }
    setMsg(t('convite.cartao.link_enviado'));
  }

  return (
    <View style={styles.bloco}>
      <Text style={styles.avisoSuave}>{t('convite.cartao.falta')}</Text>
      {msg ? <Text style={styles.dica}>{msg}</Text> : null}
      <Botao titulo={t('convite.cartao.pedir_link')} onPress={pedir} aCarregar={aAgir} />
    </View>
  );
}

/**
 * AÇÕES DO CONTRATO VIVO — por agora, cancelar (C-2). Discreto: cancelar não é
 * o caminho feliz, mas nunca se esconde — só se lhe diz o preço com verdade.
 */
function AcoesContrato({
  tokenPublico,
  contrato,
}: {
  tokenPublico: string;
  contrato: ContratoAssinatura;
}) {
  const { t } = useT();
  const [aAgir, setAAgir] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!ESTADOS_CANCELAVEIS.includes(contrato.estado)) return null;

  async function pedirCancelamento() {
    setAAgir(true);
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('convite-cancelar', {
      body: { acao: 'pedir', token_publico: tokenPublico },
    });
    setAAgir(false);
    if (error || !data?.enviado) {
      setMsg(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.cartao.erro_link'));
      return;
    }
    setMsg(t('convite.cancelar.link_enviado'));
  }

  return (
    <View style={styles.acoesRodape}>
      {msg ? <Text style={styles.dica}>{msg}</Text> : null}
      <Pressable onPress={pedirCancelamento} disabled={aAgir} hitSlop={8}>
        <Text style={styles.linkDiscreto}>
          {aAgir ? t('comum.a_enviar') : t('convite.cancelar.preciso')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * PÁGINA DO PASSO DO CARTÃO (?fin=cartao) — quem chega pelo magic link do
 * cartão (do SMS, ou de volta do Checkout com ?cartao=confirmar&session_id=).
 * A confirmação é SEMPRE server-side (retrieve na conta de P) — o browser nunca
 * é a fonte da verdade.
 */
function PaginaPassoCartao({
  tokenPublico,
  ml,
  retorno,
  sessionId,
}: {
  tokenPublico: string;
  ml: string;
  retorno?: string;
  sessionId?: string;
}) {
  const { t } = useT();
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contrato, setContrato] = useState<ContratoAssinatura | null>(null);
  const [confirmado, setConfirmado] = useState<{ brand?: string; last4?: string } | null>(null);
  const [erroConfirmar, setErroConfirmar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro(null);
    // 1) De volta do Checkout? Confirmar PRIMEIRO (retrieve na conta de P).
    if (retorno === 'confirmar' && sessionId) {
      const { data, error } = await supabase.functions.invoke('convite-cartao', {
        body: { acao: 'confirmar', token: ml, session_id: sessionId },
      });
      if (error || !data?.ok) {
        setErroConfirmar(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.cartao.erro_confirmar'));
      } else if (!data.ja_estava) {
        setConfirmado({ brand: data.brand, last4: data.last4 });
      }
    }
    // 2) O estado do contrato (a verdade única).
    const r = await supabase.functions.invoke('convite-pagina', { body: { token: tokenPublico } });
    if (r.error || !r.data?.contrato)
      setErro((await razaoDoServidor(r.error)) ?? t('convite.erro_contrato'));
    else setContrato(r.data.contrato as ContratoAssinatura);
    setACarregar(false);
  }, [tokenPublico, ml, retorno, sessionId, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (aCarregar) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }
  if (erro || !contrato) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <Text style={styles.erroTxt}>{erro ?? t('convite.erro_contrato')}</Text>
      </View>
    );
  }

  const guardado = !!contrato.cartao_gravado_em;
  return (
    <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
      <Text style={styles.marcaTopo}>Honra</Text>

      {guardado ? (
        <View style={styles.bloco}>
          <View style={styles.estadoCard}>
            <View style={[styles.estadoIcone, { backgroundColor: Honra.verdeSuave }]}>
              <Feather name="check" size={20} color={Honra.verde} />
            </View>
            <Text style={styles.estadoTitulo}>{t('convite.cartao.guardado')}</Text>
            <Text style={styles.estadoCorpo}>
              {confirmado?.last4
                ? t('convite.cartao.confirmado', {
                    marca: confirmado.brand ?? '',
                    fim: confirmado.last4,
                  })
                : ''}
              {t('convite.cartao.protecao_ativa')}
            </Text>
          </View>
          {contrato.contrato_hash ? (
            <Text style={styles.hashTxt}>
              {t('convite.ref', { ref: contrato.contrato_hash.slice(0, 8) })}
            </Text>
          ) : null}
        </View>
      ) : contrato.estado === 'assinado' && (contrato.nivel_protecao ?? 1) >= 2 ? (
        <>
          {erroConfirmar ? (
            <View style={styles.bloco}>
              <Text style={styles.erroForm}>{erroConfirmar}</Text>
            </View>
          ) : null}
          <BlocoCartao tokenPublico={tokenPublico} ml={ml} mandatoTexto={contrato.mandato_texto} />
        </>
      ) : (
        <View style={styles.bloco}>
          <EstadoView
            contrato={{
              estado: contrato.estado,
              servico: contrato.servico,
              data_inicio: contrato.data_inicio,
              data_fim: contrato.data_fim,
              valor_total: contrato.valor_total,
            }}
          />
        </View>
      )}
    </ScrollView>
  );
}

/**
 * PÁGINA DE CANCELAMENTO (?fin=cancelar) — mostra o ESCALÃO e o VALOR CONCRETO
 * de hoje ANTES do botão (o preço é do tempo; nada é surpresa), e só executa
 * com aceitação explícita. Percentagens: as CONGELADAS no aceite.
 */
function PaginaCancelamento({ tokenPublico, ml }: { tokenPublico: string; ml: string }) {
  type Previsao = {
    escalao: 1 | 2 | 3;
    pct: number;
    valor_centimos: number | null;
    cobra_no_cartao: boolean;
    disponivel: boolean;
  };
  const { t, idioma } = useT();
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contrato, setContrato] = useState<ContratoAssinatura | null>(null);
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [aAgir, setAAgir] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ estado: string; cobrado: boolean } | null>(null);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro(null);
    const [pagina, prev] = await Promise.all([
      supabase.functions.invoke('convite-pagina', { body: { token: tokenPublico } }),
      supabase.functions.invoke('convite-cancelar', { body: { acao: 'prever', token: ml } }),
    ]);
    if (pagina.error || !pagina.data?.contrato) {
      // Duas chamadas em paralelo: a razão é a DESTA, não de um `error` solto.
      setErro((await razaoDoServidor(pagina.error)) ?? t('convite.erro_contrato'));
    } else {
      setContrato(pagina.data.contrato as ContratoAssinatura);
      if (!prev.error && prev.data?.escalao) setPrevisao(prev.data as Previsao);
      else if (prev.data?.error) setErro(prev.data.error);
    }
    setACarregar(false);
  }, [tokenPublico, ml, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function confirmar() {
    setErroAcao(null);
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-cancelar', {
      body: { acao: 'confirmar', token: ml, aceito: true },
    });
    setAAgir(false);
    if (error || !data?.ok) {
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.cancelar.erro'));
      return;
    }
    setResultado({ estado: data.estado as string, cobrado: data.cobrado === true });
  }

  if (aCarregar) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }
  if (erro || !contrato) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <Text style={styles.erroTxt}>{erro ?? t('convite.erro_contrato')}</Text>
      </View>
    );
  }

  // Já executado (ou o contrato já não está cancelável) → o estado é a verdade.
  const estadoFinal =
    resultado?.estado ??
    (!ESTADOS_CANCELAVEIS.includes(contrato.estado) ? contrato.estado : null);
  if (estadoFinal) {
    return (
      <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
        <Text style={styles.marcaTopo}>Honra</Text>
        <View style={styles.bloco}>
          <EstadoView
            contrato={{
              estado: estadoFinal,
              servico: contrato.servico,
              data_inicio: contrato.data_inicio,
              data_fim: contrato.data_fim,
              valor_total: contrato.valor_total,
            }}
          />
        </View>
      </ScrollView>
    );
  }

  const valorTxt =
    previsao?.valor_centimos != null && previsao.valor_centimos > 0
      ? `${previsao.pct}% (${centimosParaEuros(previsao.valor_centimos, idioma)})`
      : previsao?.escalao === 1
        ? t('convite.cancelar.nada')
        : previsao
          ? t('convite.cancelar.pct_direto', { pct: previsao.pct })
          : null;

  return (
    <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
      <Text style={styles.marcaTopo}>Honra</Text>
      <Text style={styles.tituloAssin}>{t('convite.cancelar.titulo')}</Text>

      <View style={styles.bloco}>
        {previsao ? (
          <>
            <Text style={styles.avisoSuave}>
              {previsao.escalao === 1
                ? t('convite.cancelar.gratis')
                : t('convite.cancelar.custo', { valor: valorTxt ?? '—' }) +
                  (previsao.cobra_no_cartao ? t('convite.cancelar.no_cartao') : '')}
            </Text>
            {!previsao.disponivel ? (
              <Text style={styles.erroForm}>{t('convite.cancelar.indisponivel')}</Text>
            ) : (
              <>
                {erroAcao ? <Text style={styles.erroForm}>{erroAcao}</Text> : null}
                <Botao
                  titulo={
                    previsao.escalao === 1
                      ? t('convite.cancelar.confirmar')
                      : t('convite.cancelar.confirmar_valor', { valor: valorTxt ?? '—' })
                  }
                  onPress={confirmar}
                  aCarregar={aAgir}
                />
              </>
            )}
          </>
        ) : (
          <Text style={styles.avisoSuave}>{t('convite.cancelar.sem_previsao')}</Text>
        )}
      </View>
      {contrato.contrato_hash ? (
        <Text style={styles.hashTxt}>
          {t('convite.ref', { ref: contrato.contrato_hash.slice(0, 8) })}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * PÁGINA DE COMPARÊNCIA (?fin=comparencia) — a prova-de-encontro do CLIENTE
 * (Fatia E, camada 1). O cliente, presente, pede um OTP por SMS e digita-o
 * junto com o código que o profissional lhe mostra no ecrã. Se ambos baterem,
 * fica registada a co-presença — e a falta indevida deixa de ser possível.
 * Anti-forja: ninguém cunha sozinho (o P não tem o OTP; o cliente não
 * precomputa o código rotativo).
 */
function PaginaComparencia({ tokenPublico, ml }: { tokenPublico: string; ml: string }) {
  const { t } = useT();
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [jaProvado, setJaProvado] = useState(false);
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [otp, setOtp] = useState('');
  const [codigoProf, setCodigoProf] = useState('');
  const [aAgir, setAAgir] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [provado, setProvado] = useState(false);

  useEffect(() => {
    supabase.functions
      .invoke('convite-pagina', { body: { token: tokenPublico } })
      .then(({ data, error }) => {
        if (error || !data?.contrato) setErro(t('convite.erro_contrato'));
        else if ((data.contrato as ContratoAssinatura & { prova_encontro_em?: string | null }).prova_encontro_em) {
          setJaProvado(true);
        }
        setACarregar(false);
      });
  }, [tokenPublico, t]);

  async function pedirCodigo() {
    setErroAcao(null);
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-comparencia', {
      body: { acao: 'codigo', token: ml },
    });
    setAAgir(false);
    if (error || !data?.enviado) {
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.comparencia.erro_envio'));
      return;
    }
    setCodigoPedido(true);
  }

  async function provar() {
    setErroAcao(null);
    if (!/^\d{6}$/.test(otp.trim())) return setErroAcao(t('convite.comparencia.erro_otp'));
    if (!/^\d{6}$/.test(codigoProf.trim().replace(/\s/g, '')))
      return setErroAcao(t('convite.comparencia.erro_codigo'));
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-comparencia', {
      body: { acao: 'provar', token: ml, otp: otp.trim(), codigo: codigoProf.trim() },
    });
    setAAgir(false);
    if (error || !data?.ok) {
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.comparencia.erro_provar'));
      return;
    }
    setProvado(true);
  }

  if (aCarregar) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }

  if (provado || jaProvado) {
    return (
      <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
        <Text style={styles.marcaTopo}>Honra</Text>
        <View style={styles.bloco}>
          <View style={styles.estadoCard}>
            <View style={[styles.estadoIcone, { backgroundColor: Honra.verdeSuave }]}>
              <Feather name="check" size={20} color={Honra.verde} />
            </View>
            <Text style={styles.estadoTitulo}>{t('convite.comparencia.provado_titulo')}</Text>
            <Text style={styles.estadoCorpo}>
              {jaProvado && !provado ? t('convite.comparencia.ja_provado') : t('convite.comparencia.provado_corpo')}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
      <Text style={styles.marcaTopo}>Honra</Text>
      <Text style={styles.tituloAssin}>{t('convite.comparencia.titulo')}</Text>
      <View style={styles.bloco}>
        <Text style={styles.avisoSuave}>{t('convite.comparencia.explica')}</Text>
        {erro ? <Text style={styles.erroForm}>{erro}</Text> : null}

        {!codigoPedido ? (
          <Botao
            titulo={t('convite.comparencia.receber_codigo')}
            onPress={pedirCodigo}
            aCarregar={aAgir}
            style={{ marginTop: Espaco.sm }}
          />
        ) : (
          <>
            <Text style={styles.rotulo}>{t('convite.comparencia.otp_rotulo')}</Text>
            <Campo
              placeholder={t('convite.comparencia.otp_ph')}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
            />
            <Text style={styles.rotulo}>{t('convite.comparencia.codigo_prof_rotulo')}</Text>
            <Campo
              placeholder={t('convite.comparencia.codigo_prof_ph')}
              keyboardType="number-pad"
              value={codigoProf}
              onChangeText={setCodigoProf}
              maxLength={6}
            />
            <Botao titulo={t('convite.comparencia.provar')} onPress={provar} aCarregar={aAgir} />
          </>
        )}
        {erroAcao ? <Text style={styles.erroForm}>{erroAcao}</Text> : null}
      </View>
    </ScrollView>
  );
}

/**
 * PÁGINA DE CONSENTIMENTO (?fin=checkpoint) — a janela de contestação do CLIENTE
 * (Fatia E, camada 2). O profissional declarou uma falta; nada é cobrado até o
 * cliente responder ou o prazo passar. O cliente pede um OTP e escolhe:
 * CONFIRMAR ("faltei" → a cláusula é cobrada) ou CONTESTAR ("compareci/paguei
 * por fora" → vai a revisão, sem cobrança). O preço e o prazo ditos ANTES.
 */
function PaginaConsentimento({ tokenPublico, ml }: { tokenPublico: string; ml: string }) {
  type Previsao = {
    estado: string;
    aberto: boolean;
    valor_centimos: number | null;
    pct: number;
    captura_prazo_em: string | null;
  };
  const { t, idioma } = useT();
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contrato, setContrato] = useState<ContratoAssinatura | null>(null);
  const [prev, setPrev] = useState<Previsao | null>(null);
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [otp, setOtp] = useState('');
  const [texto, setTexto] = useState('');
  const [aAgir, setAAgir] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [resultado, setResultado] = useState<'confirmado' | 'contestado' | null>(null);

  const carregar = useCallback(async () => {
    setACarregar(true);
    const [pagina, previsao] = await Promise.all([
      supabase.functions.invoke('convite-pagina', { body: { token: tokenPublico } }),
      supabase.functions.invoke('convite-checkpoint', { body: { acao: 'prever', token: ml } }),
    ]);
    if (pagina.error || !pagina.data?.contrato)
      setErro((await razaoDoServidor(pagina.error)) ?? t('convite.erro_contrato'));
    else {
      setContrato(pagina.data.contrato as ContratoAssinatura);
      if (previsao.data?.estado) setPrev(previsao.data as Previsao);
    }
    setACarregar(false);
  }, [tokenPublico, ml, t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function pedirCodigo() {
    setErroAcao(null);
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-checkpoint', {
      body: { acao: 'codigo', token: ml },
    });
    setAAgir(false);
    if (error || !data?.enviado) {
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.checkpoint.erro_envio'));
      return;
    }
    setCodigoPedido(true);
  }

  async function responder(acao: 'confirmar' | 'contestar') {
    setErroAcao(null);
    if (!/^\d{6}$/.test(otp.trim())) return setErroAcao(t('convite.checkpoint.erro_otp'));
    setAAgir(true);
    const { data, error } = await supabase.functions.invoke('convite-checkpoint', {
      body: { acao, token: ml, otp: otp.trim(), ...(acao === 'contestar' && texto.trim() ? { texto: texto.trim() } : {}) },
    });
    setAAgir(false);
    if (error || !data?.ok) {
      setErroAcao(data?.error ?? (await razaoDoServidor(error)) ?? t('convite.checkpoint.erro'));
      return;
    }
    setResultado(acao === 'confirmar' ? 'confirmado' : 'contestado');
  }

  if (aCarregar) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <ActivityIndicator color={Honra.verde} />
      </View>
    );
  }

  // Resultado (ou janela já fechada) → mostra o estado com verdade.
  if (resultado || (prev && !prev.aberto)) {
    const bom = resultado === 'contestado';
    const titulo =
      resultado === 'confirmado'
        ? t('convite.checkpoint.confirmado_titulo')
        : resultado === 'contestado'
          ? t('convite.checkpoint.contestado_titulo')
          : contrato
            ? t(ESTADO_TXT[contrato.estado]?.titulo ?? 'convite.checkpoint.fechada')
            : t('convite.checkpoint.fechada');
    const corpo =
      resultado === 'confirmado'
        ? t('convite.checkpoint.confirmado_corpo')
        : resultado === 'contestado'
          ? t('convite.checkpoint.contestado_corpo')
          : t('convite.checkpoint.fechada');
    return (
      <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
        <Text style={styles.marcaTopo}>Honra</Text>
        <View style={styles.bloco}>
          <View style={styles.estadoCard}>
            <View style={[styles.estadoIcone, { backgroundColor: bom ? Honra.verdeSuave : Honra.creme }]}>
              <Feather name={bom ? 'check' : 'clock'} size={20} color={bom ? Honra.verde : Honra.tintaSuave} />
            </View>
            <Text style={styles.estadoTitulo}>{titulo}</Text>
            <Text style={styles.estadoCorpo}>{corpo}</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (erro || !contrato) {
    return (
      <View style={[styles.fundo, styles.centro]}>
        <Text style={styles.erroTxt}>{erro ?? t('convite.erro_contrato')}</Text>
      </View>
    );
  }

  const valorTxt =
    prev?.valor_centimos != null ? centimosParaEuros(prev.valor_centimos, idioma) : `${prev?.pct ?? contrato.pct_caucao}%`;
  const prazoTxt = prev?.captura_prazo_em ? formatarData(prev.captura_prazo_em.slice(0, 10)) : '—';

  return (
    <ScrollView style={styles.fundo} contentContainerStyle={styles.corpo}>
      <Text style={styles.marcaTopo}>Honra</Text>
      <Text style={styles.tituloAssin}>{t('convite.checkpoint.titulo')}</Text>
      <View style={styles.bloco}>
        <Text style={styles.avisoSuave}>{t('convite.checkpoint.explica')}</Text>
        <Text style={styles.dica}>{t('convite.checkpoint.em_jogo', { valor: valorTxt })}</Text>
        <Text style={styles.dica}>{t('convite.checkpoint.prazo', { data: prazoTxt })}</Text>

        {!codigoPedido ? (
          <Botao
            titulo={t('convite.checkpoint.receber_codigo')}
            onPress={pedirCodigo}
            aCarregar={aAgir}
            style={{ marginTop: Espaco.sm }}
          />
        ) : (
          <>
            <Text style={styles.rotulo}>{t('convite.checkpoint.otp_rotulo')}</Text>
            <Campo
              placeholder={t('convite.checkpoint.otp_ph')}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
            />
            <Text style={styles.rotulo}>{t('convite.checkpoint.texto_rotulo')}</Text>
            <Campo
              placeholder={t('convite.checkpoint.texto_ph')}
              value={texto}
              onChangeText={setTexto}
            />
            <Botao
              titulo={t('convite.checkpoint.contestar')}
              onPress={() => responder('contestar')}
              aCarregar={aAgir}
            />
            <Botao
              titulo={t('convite.checkpoint.confirmar')}
              variante="secundario"
              onPress={() => responder('confirmar')}
              aCarregar={aAgir}
            />
          </>
        )}
        {erroAcao ? <Text style={styles.erroForm}>{erroAcao}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  centro: { alignItems: 'center', justifyContent: 'center', padding: Espaco.xl },
  erroTxt: { color: Honra.tintaSuave, fontSize: 15, textAlign: 'center' },
  corpo: { padding: Espaco.md, gap: Espaco.md, paddingBottom: Espaco.xxl },

  // Honra Card
  card: {
    borderRadius: 24,
    backgroundColor: Honra.verdeEscuro,
    padding: Espaco.lg,
    alignItems: 'center',
  },
  marca: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Espaco.md,
    borderWidth: 2,
    borderColor: Honra.douradoClaro,
  },
  avatarTxt: { color: '#fff', fontSize: 24, fontWeight: '800' },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Espaco.md },
  nome: { fontSize: 20, fontWeight: '800', color: '#fff', flexShrink: 1 },
  visto: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Honra.verde,
    borderWidth: 2,
    borderColor: Honra.creme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  papel: { fontSize: 13, color: 'rgba(238,234,222,0.75)', marginTop: 2, textAlign: 'center' },
  abas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: Espaco.md,
  },
  aba: { borderRadius: Raio.pill, borderWidth: 1, paddingVertical: 5, paddingHorizontal: 10 },
  abaOn: { backgroundColor: 'rgba(93,202,165,0.16)', borderColor: Honra.verdeVivo },
  abaOff: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(230,210,162,0.22)' },
  abaTxt: { fontSize: 12, fontWeight: '700' },
  abaTxtOn: { color: Honra.verdeVivo },
  abaTxtOff: { color: 'rgba(230,210,162,0.6)' },
  stats: {
    flexDirection: 'row',
    width: '100%',
    marginTop: Espaco.md,
    paddingTop: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValor: { fontSize: 16, fontWeight: '800', color: '#fff' },
  statRotulo: { fontSize: 10, letterSpacing: 0.3, color: 'rgba(238,234,222,0.6)', marginTop: 2 },

  // Bloco de conteúdo (form / estado)
  bloco: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    padding: Espaco.lg,
    gap: Espaco.sm,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  chamada: { fontSize: 16, fontWeight: '700', color: Honra.tinta, marginBottom: Espaco.sm },
  avisoSuave: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20 },
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.sm,
  },
  dica: { fontSize: 12, color: Honra.tintaSuave },
  rgpd: {
    fontSize: 12,
    color: Honra.tintaSuave,
    lineHeight: 18,
    marginTop: Espaco.sm,
    marginBottom: Espaco.xs,
  },
  erroForm: { color: Honra.erro, fontSize: 14, fontWeight: '600' },

  // Estado
  estadoCard: { alignItems: 'center', gap: Espaco.sm },
  estadoIcone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estadoTitulo: { fontSize: 18, fontWeight: '800', color: Honra.tinta },
  estadoCorpo: { fontSize: 14, color: Honra.tintaSuave, textAlign: 'center', lineHeight: 20 },
  resumo: {
    width: '100%',
    marginTop: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
    paddingTop: Espaco.sm,
    gap: Espaco.xs,
  },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  resumoEtiqueta: { fontSize: 13, color: Honra.tintaSuave },
  resumoValor: { fontSize: 13, color: Honra.tinta, fontWeight: '700' },

  // Assinatura (Fatia B)
  marcaTopo: {
    fontSize: 15,
    fontWeight: '800',
    color: Honra.verde,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tituloAssin: {
    fontSize: 20,
    fontWeight: '800',
    color: Honra.tinta,
    textAlign: 'center',
    marginTop: Espaco.xs,
  },
  dataDestaque: {
    backgroundColor: Honra.verdeEscuro,
    borderRadius: Raio.md,
    padding: Espaco.md,
    alignItems: 'center',
  },
  dataRotulo: { fontSize: 11, letterSpacing: 1, fontWeight: '700', color: Honra.douradoClaro },
  dataValor: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 4, textAlign: 'center' },
  contratoCard: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    padding: Espaco.lg,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  contratoTexto: { fontSize: 13, lineHeight: 20, color: Honra.tinta },
  hashTxt: { fontSize: 12, color: Honra.tintaSuave, textAlign: 'center' },

  // Cartão / mandato (Fatia C-2)
  mandatoCard: {
    backgroundColor: Honra.creme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  acoesRodape: { alignItems: 'center', gap: Espaco.xs, paddingVertical: Espaco.sm },
  linkDiscreto: { color: Honra.tintaSuave, fontSize: 13, textDecorationLine: 'underline' },

  aceiteLinha: { flexDirection: 'row', gap: Espaco.sm, alignItems: 'flex-start', paddingVertical: Espaco.xs },
  caixa: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Honra.cremeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  caixaOn: { backgroundColor: Honra.verde, borderColor: Honra.verde },
  aceiteTxt: { flex: 1, fontSize: 13, color: Honra.tinta, lineHeight: 19 },
});
