import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { voltar } from '@/lib/navegar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ABAS_SELO, Avatar, Virtudes } from '@/components/ui';
import { nomeEscalao, useT, type ChaveI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useVirtudes } from '@/lib/virtudes';
import { Espaco, Honra, Raio } from '@/theme/honra';
import {
  escalaoDeCredencial,
  estiloPrestigio,
  honrasEfetivas,
  nivelDeCredencial,
} from '@/theme/prestigio';

/**
 * HONRA CARD — a credencial partilhável do utilizador.
 *
 * É a peça que sai para fora do Honra (partilha-se num chat, num email, num
 * perfil) e traz gente nova. Por isso tem visual próprio: fundo verde-escuro
 * nobre, marca-de-água, e o dourado do prestígio a brilhar — mas contido,
 * nunca "bling" (DESIGN-SYSTEM.md §0.7 e §3).
 *
 * Só mostra dados REAIS. O que ainda não existe (tempo de resposta, handle
 * com username) fica honesto: "—" ou o domínio sem username. Nada inventado.
 */
type Perfil = {
  nome: string | null;
  papel: string | null;
  cidade: string | null;
  avatar: string | null;
  avatar_url: string | null;
  indice_confianca: number | null;
  negocios_honrados: number | null;
  negocios_falhados: number | null;
  apertos_selados: number | null;
};
type Verif = { aba: string; estado: string };

// Rótulos das 4 abas do selo (as MESMAS chaves do componente Selo).
const CHAVE_ABA: Record<string, ChaveI18n> = {
  identidade: 'selo.identidade',
  profissao: 'selo.profissao',
  contacto: 'selo.contacto',
  portefolio: 'selo.portefolio',
};

export default function HonraCard() {
  const { session } = useAuth();
  const { t } = useT();
  const { virtudes } = useVirtudes();
  const uid = session?.user.id;
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [verifs, setVerifs] = useState<Verif[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<{ criado_em: string }[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [copiado, setCopiado] = useState(false);
  // Último recurso: se nem partilha nem clipboard resultarem, revela o texto
  // para a pessoa copiar à mão — a credencial NUNCA falha em silêncio.
  const [mostrarTexto, setMostrarTexto] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    setACarregar(true);
    supabase
      .from('perfis')
      .select('nome, papel, cidade, avatar, avatar_url, indice_confianca, negocios_honrados, negocios_falhados, apertos_selados')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        if (!vivo) return;
        setPerfil(data as Perfil);
        setACarregar(false);
      });
    supabase
      .from('verificacoes')
      .select('aba, estado')
      .eq('perfil_id', uid)
      .then(({ data }) => {
        if (vivo) setVerifs(data ?? []);
      });
    // Avaliações — só para derivar o escalão (mesmo cálculo do perfil).
    supabase
      .from('avaliacoes')
      .select('criado_em')
      .eq('para_perfil', uid)
      .then(({ data }) => {
        if (vivo) setAvaliacoes((data as any) ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [uid]);

  const identidadeVerde = verifs.some((v) => v.aba === 'identidade' && v.estado === 'verificado');

  // PRESTÍGIO (§3): o escalão é derivado dos sinais vivos, exatamente como no
  // perfil — a credencial NUNCA discorda do perfil sobre o nível conquistado.
  const verdes = verifs.filter((v) => v.estado === 'verificado').length;
  const numAval = avaliacoes.length;
  const numAvalRecentes = avaliacoes.filter(
    (a) => new Date(a.criado_em).getTime() > Date.now() - 182 * 86400000,
  ).length;
  const sinais = {
    // O escalão corre a HONRADOS + CONFIANÇA desde 01/08 (as avaliações são
    // opcionais e dependem de terceiros — não podem trancar o percurso).
    // `avaliacoesRecentes` fica de FORA de propósito: ainda não existe o sinal
    // de "honrados nos últimos 6 meses", e passar avaliações no lugar dele
    // aplicaria um decay falso a quem não o merece.
    indice_confianca: perfil?.indice_confianca,
    verificacoesVerdes: verdes,
    numAvaliacoes: numAval,
    negociosHonrados: perfil?.negocios_honrados ?? 0,
    negociosFalhados: perfil?.negocios_falhados ?? 0,
  };
  const prestigio = estiloPrestigio(nivelDeCredencial(sinais));
  const escalao = escalaoDeCredencial(sinais); // Verificado / Provado / … / Mestre

  const nome = perfil?.nome ?? session?.user.email ?? t('card.sem_nome');
  const sub = [perfil?.papel, perfil?.cidade].filter(Boolean).join(' · ');

  // AVALIAÇÃO: índice em vírgula decimal PT (ex. "4,9★"); "—" sem avaliações.
  const avaliacaoTxt =
    numAval > 0 && perfil?.indice_confianca != null
      ? `${Number(perfil.indice_confianca).toFixed(1).replace('.', ',')}★`
      : '—';
  // PROJETOS: no Card mostra-se SÓ o absoluto de honrados — decisão do Vítor
  // (15/07): o Card é a primeira impressão para quem está DE FORA (contrato-
  // convite); um rácio "M/N" sem contexto pode ser crucial pela negativa. O
  // rácio dos apertos vive DENTRO da app (perfil/pesquisa), onde é compreendido.
  //
  // ── E JA VEM LIQUIDO (01/08) ────────────────────────────────────────────
  // Como aqui o numero aparece SOZINHO, tem de ser o que conta: uma falha
  // leva dois honrados com ela (`honrasEfetivas`). Mostrar o bruto num sitio
  // onde as falhas nao se veem seria inflacionar por omissao — e este e' o
  // cartao que se poe na mao de quem ainda nao conhece ninguem.
  //
  // REGRA DA CASA, daqui em diante: onde as falhas aparecem AO LADO (o painel
  // de numeros do percurso, o racio do On Honra), mostra-se o bruto — e'
  // registo. Onde o numero aparece SOZINHO, mostra-se o liquido — e' uma
  // afirmacao, e uma afirmacao nao pode esconder o que a contradiz.
  const projetosTxt = String(
    honrasEfetivas(perfil?.negocios_honrados, perfil?.negocios_falhados)
  );

  // O "link no palco": partilhar a credencial CONVIDA a pedir orçamento. Quem
  // recebe abre a página do convidado (Honra Card + formulário), sem ter conta.
  // Baseado na ORIGEM atual (funciona em teste na LAN; vira honraapp.com em prod)
  // — se não fosse, o link apontava sempre para honraapp.com e não abria em teste.
  const linkConvite = uid
    ? typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/c/${uid}`
      : `https://honraapp.com/c/${uid}`
    : 'https://honraapp.com';

  // Texto da partilha — sóbrio e honesto (sem promessas que a app não cumpre).
  const textoPartilha = t('card.partilha', {
    nome: `${nome}${perfil?.papel ? `, ${perfil.papel}` : ''}`,
    link: linkConvite,
  });

  async function partilhar() {
    if (Platform.OS === 'web') {
      // 1) Partilha nativa do browser (telemóvel), se existir (cancelar = silêncio).
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ text: textoPartilha, url: linkConvite });
        } catch {
          // Cancelado — sem ruído.
        }
        return;
      }
      // 2) Sem partilha nativa (desktop): revela SEMPRE o texto selecionável
      //    (fiável, síncrono) e tenta o clipboard como bónus ("Copiado ✓" se der).
      setMostrarTexto(true);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(textoPartilha);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2200);
        } catch {
          // Clipboard negado — fica o texto revelado para copiar à mão.
        }
      }
      return;
    }
    // Nativo: a folha de partilha do sistema.
    try {
      await Share.share({ message: textoPartilha });
    } catch {
      // Partilha cancelada — sem ruído.
    }
  }

  if (aCarregar && !perfil) {
    return (
      <Pressable style={styles.fundo} onPress={voltar}>
        <ActivityIndicator color={Honra.douradoClaro} />
      </Pressable>
    );
  }

  return (
    // Fundo escurecido: toque fora do cartão fecha (o cartão engole o toque).
    <Pressable style={styles.fundo} onPress={voltar}>
      <Pressable style={styles.cartao} onPress={() => {}}>
        {/* Decorações (atrás do conteúdo — declaradas primeiro). */}
        <View pointerEvents="none" style={styles.brilho} />
        <Text pointerEvents="none" style={styles.marcaAgua} numberOfLines={1}>
          Honra
        </Text>

        {/* Marca no topo. */}
        <Text style={styles.marca}>Honra</Text>

        {/* Avatar com o anel de prestígio. */}
        <Avatar
          iniciais={perfil?.avatar}
          imagem={
            perfil?.avatar_url
              ? supabase.storage.from('avatares').getPublicUrl(perfil.avatar_url).data.publicUrl
              : null
          }
          prestigio={prestigio}
          tamanho={78}
          style={styles.avatar}
        />

        {/* Nome + ✓ branco (só se a identidade estiver verificada). */}
        <View style={styles.nomeLinha}>
          <Text style={styles.nome} numberOfLines={1}>
            {nome}
          </Text>
          {identidadeVerde && (
            <View style={styles.visto}>
              <Feather name="check" size={11} color="#fff" />
            </View>
          )}
        </View>
        {sub ? <Text style={styles.papel}>{sub}</Text> : null}

        {/* Medalha + pílula "Nível <escalão>" — o dourado do prestígio.
            Modulada pelo BRILHO (não pelo nível): lei de design — o brilho só
            começa em Reconhecido; Verificado e Provado têm a mesma medalha base. */}
        <View style={styles.medalhaBloco}>
          <View
            style={[
              styles.medalha,
              {
                borderWidth: 1 + prestigio.brilho * 0.4,
                backgroundColor: `rgba(197,164,95,${(0.1 + prestigio.brilho * 0.04).toFixed(2)})`,
              },
            ]}
          >
            <Feather name="award" size={26} color={Honra.douradoClaro} />
          </View>
          <View style={styles.nivelPill}>
            <Text style={styles.nivelTxt}>
              {t('card.nivel')} <Text style={styles.nivelNome}>{nomeEscalao(t, escalao)}</Text>
            </Text>
          </View>
        </View>

        {/* Handle. TODO: ainda não há sistema de usernames — mostra só o domínio
            (honesto), pronto a receber honraapp.com/<username> quando existir. */}
        <Text style={styles.handle}>honraapp.com</Text>

        {/* As 4 abas do selo: ✓ acesa (verificada) vs 🔒 (por verificar). */}
        <View style={styles.abas}>
          {ABAS_SELO.map((aba) => {
            const verde = verifs.some((v) => v.aba === aba && v.estado === 'verificado');
            return (
              <View key={aba} style={[styles.aba, verde ? styles.abaOn : styles.abaOff]}>
                <Text style={[styles.abaTxt, verde ? styles.abaTxtOn : styles.abaTxtOff]}>
                  {verde ? '✓ ' : '🔒 '}
                  {CHAVE_ABA[aba] ? t(CHAVE_ABA[aba]) : aba}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Stats. RESPOSTA fica "—": ainda não medimos tempo de resposta. */}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValor}>{avaliacaoTxt}</Text>
            <Text style={styles.statRotulo}>{t('card.avaliacao')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValor}>—</Text>
            <Text style={styles.statRotulo}>{t('card.resposta')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValor}>{projetosTxt}</Text>
            <Text style={styles.statRotulo}>{t('card.projetos')}</Text>
          </View>
        </View>

        {/* 3 VIRTUDES — o herói do Card (placa premium, cunhagem animada).
            A promessa (virtudes) coroa a prova (stats, discretos acima).
            Opcional: sem escolha, a mesma placa convida (é o Card do próprio). */}
        <Virtudes virtudes={virtudes} aoConvidar={() => router.replace('/definicoes')} />

        {/* Ações. */}
        <View style={styles.acoes}>
          <Pressable style={[styles.btn, styles.btnGh]} onPress={voltar}>
            <Text style={styles.btnGhTxt}>{t('comum.fechar')}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPri]} onPress={partilhar}>
            <Text style={styles.btnPriTxt}>
              {copiado ? t('card.copiado') : t('card.partilhar')}
            </Text>
          </Pressable>
        </View>

        {/* Recurso final: o texto da credencial, selecionável para copiar à mão. */}
        {mostrarTexto ? (
          <View style={styles.copiar}>
            <Text style={styles.copiarRotulo}>{t('card.copia')}</Text>
            <Text selectable style={styles.copiarTexto}>
              {textoPartilha}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    // Escuridão intencional (não "app acinzentada"): preto-esverdeado profundo,
    // igual à moldura web (#0d0d0c), com opacidade alta para o Card flutuar sobre
    // o escuro em vez de lavar o creme em cinzento.
    backgroundColor: 'rgba(13,13,12,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  copiar: {
    marginTop: Espaco.md,
    width: '100%',
    backgroundColor: 'rgba(251,248,241,0.10)',
    borderRadius: Raio.md,
    padding: Espaco.md,
    gap: 4,
  },
  copiarRotulo: { color: Honra.douradoClaro, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  copiarTexto: { color: Honra.brancoCreme, fontSize: 13, lineHeight: 19 },
  cartao: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    backgroundColor: Honra.verdeEscuro,
    paddingVertical: Espaco.lg,
    paddingHorizontal: Espaco.lg,
    alignItems: 'center',
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(230,210,162,0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },

  // Decorações
  brilho: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(197,164,95,0.12)',
  },
  marcaAgua: {
    position: 'absolute',
    top: 118,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 92,
    fontWeight: '800',
    letterSpacing: -2,
    color: 'rgba(255,255,255,0.05)',
  },

  marca: { fontSize: 16, fontWeight: '800', letterSpacing: -0.5, color: '#fff' },
  avatar: { marginTop: Espaco.md },

  nomeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Espaco.md,
    maxWidth: '100%',
  },
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

  // Medalha + pílula
  medalhaBloco: { alignItems: 'center', marginTop: Espaco.md },
  medalha: {
    width: 52,
    height: 52,
    borderRadius: Raio.pill,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Espaco.sm,
  },
  nivelPill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(197,164,95,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(197,164,95,0.42)',
    borderRadius: Raio.pill,
    paddingVertical: 4,
    paddingHorizontal: 13,
  },
  nivelTxt: { color: Honra.douradoClaro, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  nivelNome: { fontWeight: '800' },

  handle: { fontSize: 12, color: Honra.douradoClaro, fontWeight: '700', marginTop: Espaco.sm },

  // Abas do selo
  abas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: Espaco.md,
  },
  aba: {
    borderRadius: Raio.pill,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  abaOn: { backgroundColor: 'rgba(93,202,165,0.16)', borderColor: Honra.verdeVivo },
  abaOff: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(230,210,162,0.22)' },
  abaTxt: { fontSize: 12, fontWeight: '700' },
  abaTxtOn: { color: Honra.verdeVivo },
  abaTxtOff: { color: 'rgba(230,210,162,0.6)' },

  // Stats
  stats: {
    flexDirection: 'row',
    width: '100%',
    marginTop: Espaco.md,
    paddingTop: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  stat: { flex: 1, alignItems: 'center' },
  // Reduzidos a "ficha técnica" discreta — a prova cede o palco às virtudes.
  statValor: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  statRotulo: {
    fontSize: 9,
    letterSpacing: 0.3,
    color: 'rgba(238,234,222,0.5)',
    marginTop: 1,
  },

  // Ações
  acoes: { flexDirection: 'row', gap: Espaco.sm, width: '100%', marginTop: Espaco.lg },
  btn: { flex: 1, borderRadius: Raio.md, paddingVertical: Espaco.md, alignItems: 'center' },
  btnGh: { backgroundColor: 'rgba(255,255,255,0.12)' },
  btnGhTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnPri: { backgroundColor: Honra.creme },
  btnPriTxt: { color: Honra.verdeEscuro, fontSize: 13, fontWeight: '700' },
});
