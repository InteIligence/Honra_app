import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avaliacao,
  Botao,
  Campo,
  CampoData,
  Carregar,
  Cartao,
  Chip,
  Confianca,
  Credencial,
  Erro,
  Estrelas,
  formatarData,
  hojeISO,
  OnHonra,
  Selo,
} from '@/components/ui';
import { PortfolioGaleria } from '@/components/Portfolio';
import { useT, type ChaveI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { statsContratante, type StatsContratante } from '@/lib/contratante';
import { useIdentidadeVerificada } from '@/lib/identidade';
import { useSuspensao } from '@/lib/suspensao';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';
import { estiloPrestigio, nivelDeCredencial } from '@/theme/prestigio';

/**
 * Perfil público — o ECRÃ DE REFERÊNCIA (padrão-ouro, DESIGN-SYSTEM.md §2).
 * Tudo aqui vem de `@/components/ui`; o prestígio (§3) é derivado dos
 * sinais do perfil e aplicado pela Credencial. É a língua a copiar.
 *
 * EMPRESA: além da pill "Empresa" na credencial, o perfil conta a história
 * do CONTRATANTE — "COMO CONTRATANTE" (honrados + rácio + trabalhos
 * publicados, derivados pela RPC 041) e os TRABALHOS ABERTOS listados ali
 * mesmo: o profissional chega e vê logo onde é preciso. A camada de
 * prestadora (confiança/avaliações) só se mostra se existir — a avaliação é
 * unidirecional cliente→profissional (037); uma empresa que só contrata não
 * recebe estrelas, e nunca se mostra um "0.0" a fingir.
 */
export default function PerfilPublico() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t } = useT();
  const [perfil, setPerfil] = useState<any>(null);
  const [verifs, setVerifs] = useState<{ aba: string; estado: string; origem?: string | null }[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<
    {
      id: string;
      nota: number;
      comentario: string | null;
      criado_em: string;
      revelado_em: string | null;
      de?: { nome: string | null } | null;
    }[]
  >([]);
  const [desc, setDesc] = useState('');
  // Prazo do projeto (fatia D) — a âncora dos checkpoints. Os checkpoints em
  // si definem-se DENTRO do orçamento (projeto/[id]), antes do selo.
  const [prazoProjeto, setPrazoProjeto] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  // Já existe um pedido meu 'pedido'/'aceite' para esta pessoa? Trava duplicados.
  const [pedidoEmCurso, setPedidoEmCurso] = useState(false);
  // Trust & Safety: bloqueio + denúncia.
  const [bloqueado, setBloqueado] = useState(false);
  const [denunciaAberta, setDenunciaAberta] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  // Abrir/criar a conversa com esta pessoa.
  const [aAbrirConversa, setAAbrirConversa] = useState(false);
  // A MINHA identidade está verificada? Pedir orçamento / iniciar conversa
  // exigem-na (fuga C, migração 043) — a UI diz a verdade antes da BD negar.
  const { verificada: minhaIdVerificada } = useIdentidadeVerificada();
  // Escada de suspensão (048): suspenso não pode pedir/conversar — o gesto dá
  // lugar ao motivo honesto (a conversa também cria um pedido).
  const { suspenso: contaSuspensa } = useSuspensao();
  // EMPRESA: a história do contratante (RPC 041) + os trabalhos abertos dela.
  const [statsCli, setStatsCli] = useState<StatsContratante | null>(null);
  const [trabAbertos, setTrabAbertos] = useState<
    {
      id: string;
      titulo: string;
      orcamento_valor: number | null;
      prazo: string | null;
      categoria?: { nome: string | null } | null;
    }[]
  >([]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setACarregar(true);
    setErroCarregar(null);
    setStatsCli(null);
    setTrabAbertos([]);
    // Perfil (é o dado principal — o seu erro é o erro do ecrã).
    //
    // AS COLUNAS DIZEM-SE UMA A UMA, e não `select('*')`. A 066 pôs GRANTS POR
    // COLUNA em `perfis` (é assim que o `nif` fica invisível a quem não é o
    // dono), e pedir `*` faz o PostgREST pedir TODAS — inclusive as que
    // ninguém tem direito a ler. Resultado: 42501 sempre, para qualquer
    // perfil, ATÉ O PRÓPRIO. Este ecrã estava partido desde essa migração e
    // ninguém deu por isso, porque o erro era mostrado como "Não foi possível
    // carregar este perfil" — que soa a rede em baixo, não a permissões.
    //
    // Regra a levar daqui: numa tabela com grants por coluna, `select('*')` é
    // uma bomba com rastilho — só rebenta quando alguém tirar um grant.
    supabase
      .from('perfis')
      .select(
        'id, nome, handle, papel, cidade, avatar, avatar_url, tipo, disponibilidade, indice_confianca, negocios_honrados, negocios_falhados, apertos_selados, cancelados_mutuo, criado_em'
      )
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) setErroCarregar(t('pperfil.erro_carregar'));
        else setPerfil(data);
        setACarregar(false);
        // Só as empresas contam a história de contratante no perfil público.
        if (data?.tipo === 'empresa') {
          statsContratante(id).then((s) => {
            if (vivo) setStatsCli(s);
          });
          supabase
            .from('trabalhos')
            .select('id, titulo, orcamento_valor, prazo, categoria:categorias(nome)')
            .eq('autor_perfil', id)
            .eq('estado', 'aberto')
            .order('criado_em', { ascending: false })
            .then(({ data: trabs }) => {
              if (vivo) setTrabAbertos((trabs as any[]) ?? []);
            });
        }
      });
    supabase
      .from('verificacoes')
      .select('aba, estado, origem')
      .eq('perfil_id', id)
      .then(({ data }) => {
        if (vivo) setVerifs(data ?? []);
      });
    // Categorias deste perfil (tolerante: se a tabela ainda não existir, fica vazio)
    supabase
      .from('perfil_categorias')
      .select('categorias(nome)')
      .eq('perfil_id', id)
      .then(({ data }) => {
        if (!vivo) return;
        setCategorias(
          ((data as any[]) ?? [])
            .map((r) => r.categorias?.nome)
            .filter((n): n is string => !!n)
        );
      });
    // Avaliações recebidas por este perfil (tolerante: se a tabela ainda não existir, fica vazio).
    // `revelado_em` distingue as públicas (reveladas) da minha própria selada (double-blind).
    supabase
      .from('avaliacoes')
      .select('id, nota, comentario, criado_em, revelado_em, de:perfis!de_perfil(nome)')
      .eq('para_perfil', id)
      .order('criado_em', { ascending: false })
      .then(({ data }) => {
        if (vivo) setAvaliacoes((data as any) ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [id, session, t]);

  // Guarda anti-duplicado, reavaliada no FOCO (não só na montagem: estes ecrãs
  // ficam montados por trás das abas). Só bloqueia enquanto há um pedido meu
  // 'pedido'/'aceite'; recusado/terminado liberta e limpa o estado local preso —
  // senão o "em curso"/"enviado" ficava agarrado depois de o profissional recusar.
  const reavaliarPedido = useCallback(() => {
    if (!session || !id) return;
    let vivo = true;
    supabase
      .from('orcamentos')
      .select('id')
      .eq('de_perfil', session.user.id)
      .eq('para_perfil', id)
      .in('estado', ['pedido', 'aceite'])
      .then(({ data }) => {
        if (!vivo) return;
        const emCurso = ((data as any[]) ?? []).length > 0;
        setPedidoEmCurso(emCurso);
        if (!emCurso) setEnviado(false);
      });
    return () => {
      vivo = false;
    };
  }, [id, session]);
  useFocusEffect(reavaliarPedido);

  async function pedirOrcamento() {
    if (!session || !id) return;
    setErro(null);
    setAEnviar(true);
    const { data: novo, error } = await supabase
      .from('orcamentos')
      .insert({
        de_perfil: session.user.id,
        para_perfil: id,
        descricao: desc.trim() || 'Pedido de orçamento',
        estado: 'pedido',
        prazo: prazoProjeto || null,
      })
      .select('id')
      .single();
    if (error || !novo) {
      setAEnviar(false);
      setErro(t('pperfil.erro_pedido'));
      return;
    }
    // Os checkpoints definem-se DENTRO do orçamento (projeto/[id]), depois de
    // pedido — aqui só nasce o pedido com o prazo. Sem nenhum definido, o
    // servidor cria um por omissão ao selar (o negócio corre sempre a máquina D).
    setAEnviar(false);
    setPedidoEmCurso(true);
    setEnviado(true);
  }

  // Já bloqueei esta pessoa?
  useEffect(() => {
    if (!session || !id) return;
    supabase
      .from('bloqueios')
      .select('bloqueado')
      .eq('bloqueador', session.user.id)
      .eq('bloqueado', id)
      .then(({ data }) => setBloqueado(((data as any[]) ?? []).length > 0));
  }, [session, id]);

  async function bloquear() {
    if (!session || !id) return;
    const { error } = await supabase
      .from('bloqueios')
      .insert({ bloqueador: session.user.id, bloqueado: id });
    if (!error) {
      setBloqueado(true);
      setAcaoMsg(t('pperfil.bloqueaste_msg'));
    }
  }
  async function desbloquear() {
    if (!session || !id) return;
    const { error } = await supabase
      .from('bloqueios')
      .delete()
      .eq('bloqueador', session.user.id)
      .eq('bloqueado', id);
    if (!error) {
      setBloqueado(false);
      setAcaoMsg(null);
    }
  }
  async function denunciar(motivo: string) {
    if (!session || !id) return;
    setDenunciaAberta(false);
    const { error } = await supabase
      .from('denuncias')
      .insert({ denunciante: session.user.id, denunciado: id, motivo });
    setAcaoMsg(error ? t('pperfil.erro_denuncia') : t('pperfil.denuncia_ok'));
  }

  // Abre a conversa com esta pessoa. As conversas vivem DENTRO de um negócio
  // (uma conversa = um orçamento). Se já houver um negócio partilhado, abre-o;
  // se não, cria um leve para hospedar a conversa. Um bloqueio (em qualquer
  // direção) é travado pela BD e cai no aviso.
  async function abrirConversa() {
    if (!session || !id) return;
    setAcaoMsg(null);
    // Suspenso: iniciar conversa e' um gesto NOVO — travado enquanto durar a
    // suspensao (escada de suspensao, 048). Motivo honesto, nao um erro cru.
    if (contaSuspensa) {
      setAcaoMsg(t('susp.gesto_conversa'));
      return;
    }
    setAAbrirConversa(true);

    // ── CONVERSA LIVRE (075), como na Pesquisa ─────────────────────────────
    // Este ecra ficou para tras quando a 075 chegou: continuava a criar um
    // ORCAMENTO com a descricao "Conversa" e estado "pedido" — exatamente o
    // que a 075 veio abolir, porque dizer "ola" a alguem nao pode custar um
    // pedido de orcamento que a outra pessoa tem de aceitar ou recusar (e que,
    // recusado, matava a conversa).
    //
    // Alem de errado, dava erro: o insert fazia `.select().single()`, e ler o
    // orcamento acabado de criar passa por guardas que so se cumprem depois —
    // a mesma armadilha do `return=representation` que nos custou meia hora no
    // bug dos grupos (079). Nao se remenda o insert: tira-se o insert.
    //
    // A funcao do servidor ordena o par, reaproveita a conversa que ja exista
    // e trava bloqueios nos dois sentidos, por isso nunca nascem duplicados.
    const { data, error } = await supabase.rpc('abrir_conversa_livre', { p_com: id });
    setAAbrirConversa(false);
    if (error || !data) {
      setAcaoMsg(
        String(error?.message ?? '').includes('bloqueado')
          ? t('pesq.falar_bloqueado')
          : t('idverif.conversa')
      );
      return;
    }
    router.push(`/conversa/${data as string}?livre=1`);
  }

  const ehProprio = session?.user.id === id;
  // Foto de perfil (bucket público 'avatares'); sem foto → cai nas iniciais.
  const fotoUri = perfil?.avatar_url
    ? supabase.storage.from('avatares').getPublicUrl(perfil.avatar_url).data.publicUrl
    : null;
  const identidadeVerde = verifs.some((v) => v.aba === 'identidade' && v.estado === 'verificado');
  // Double-blind: só as REVELADAS são públicas e contam para a confiança. Uma selada
  // que eu consigo ver é sempre minha (a RLS só mostra seladas ao próprio autor).
  const reveladas = avaliacoes.filter((a) => a.revelado_em);
  const minhasSeladas = avaliacoes.filter((a) => !a.revelado_em);
  const numAval = reveladas.length;
  const numAvalRecentes = reveladas.filter(
    (a) => new Date(a.criado_em).getTime() > Date.now() - 182 * 86400000,
  ).length;
  const disponivel = perfil?.disponibilidade === 'disponivel';

  // PRESTÍGIO (§3): o gold cresce com o escalão — derivado dos sinais vivos.
  // Decai sem honra recente (janela de ~6 meses).
  const verdes = verifs.filter((v) => v.estado === 'verificado').length;
  const prestigio = estiloPrestigio(
    nivelDeCredencial({
      // Honrados + Confiança (01/08): o escalão mede o que depende de quem o
      // conquista, não avaliações que dependem de terceiros.
      indice_confianca: perfil?.indice_confianca,
      verificacoesVerdes: verdes,
      numAvaliacoes: numAval,
      negociosHonrados: perfil?.negocios_honrados ?? 0,
      negociosFalhados: perfil?.negocios_falhados ?? 0,
    })
  );

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      {aCarregar ? (
        <>
          <Pressable style={styles.voltarSolto} onPress={() => router.back()}>
            <Text style={styles.voltarSoltoTxt}>{t('comum.voltar_seta')}</Text>
          </Pressable>
          <Carregar />
        </>
      ) : erroCarregar ? (
        <>
          <Pressable style={styles.voltarSolto} onPress={() => router.back()}>
            <Text style={styles.voltarSoltoTxt}>{t('comum.voltar_seta')}</Text>
          </Pressable>
          <View style={styles.centroErro}>
            <Erro texto={erroCarregar} />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* ===== CREDENCIAL — a faixa verde que dá alma ao perfil ===== */}
          <Credencial
            topo={
              <Pressable style={styles.voltar} onPress={() => router.back()}>
                <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
              </Pressable>
            }
            nome={perfil?.nome}
            handle={perfil?.handle}
            papel={perfil?.papel}
            cidade={perfil?.cidade}
            iniciais={perfil?.avatar}
            imagem={fotoUri}
            verificado={identidadeVerde}
            empresa={perfil?.tipo === 'empresa'}
            disponivel={disponivel}
            prestigio={prestigio}
          />

          {/* ===== CORPO ===== */}
          <View style={styles.corpo}>
            {/* CONFIANÇA — é aqui que se decide contratar. Numa empresa sem
                historial de prestadora esconde-se (não recebe estrelas como
                contratante — nunca mostrar um "0.0"). */}
            {(perfil?.tipo !== 'empresa' || numAval > 0) && (
              <>
                <Confianca honrados={perfil?.negocios_honrados} falhados={perfil?.negocios_falhados} />
                <OnHonra
                  apertos={perfil?.apertos_selados}
                  honrados={perfil?.negocios_honrados}
                  cancelados={perfil?.cancelados_mutuo}
                />
              </>
            )}

            {/* ===== COMO CONTRATANTE (empresa) — a palavra de quem contrata,
                derivada dos negócios reais (RPC 041). Só aparece com prova. ===== */}
            {perfil?.tipo === 'empresa' &&
              statsCli &&
              (statsCli.apertos > 0 || statsCli.honrados > 0 || statsCli.trabalhos > 0) && (
                <View style={styles.contratante}>
                  <Text style={styles.rotulo}>{t('perfil.como_contratante')}</Text>
                  <OnHonra apertos={statsCli.apertos} honrados={statsCli.honrados} />
                  {statsCli.trabalhos > 0 && (
                    <Text style={styles.contratanteSub}>
                      {statsCli.trabalhos === 1
                        ? t('perfil.trabalho_publicado')
                        : t('perfil.trabalhos_publicados', { n: statsCli.trabalhos })}
                    </Text>
                  )}
                </View>
              )}

            {/* ===== TRABALHOS ABERTOS (empresa) — onde é preciso, aqui mesmo.
                É isto que faz o profissional apaixonar-se à primeira vista. ===== */}
            {perfil?.tipo === 'empresa' && trabAbertos.length > 0 && (
              <View style={styles.trabalhos}>
                <Text style={styles.rotulo}>{t('pperfil.trabalhos_abertos')}</Text>
                {trabAbertos.map((trab) => (
                  <Cartao
                    key={trab.id}
                    style={styles.trabalhoLinha}
                    onPress={() => router.push(`/trabalho/${trab.id}`)}
                  >
                    <View style={styles.trabalhoMeio}>
                      <Text style={styles.trabalhoTitulo} numberOfLines={2}>
                        {trab.titulo}
                      </Text>
                      <Text style={styles.trabalhoSub} numberOfLines={1}>
                        {trab.categoria?.nome ?? t('pesq.sem_categoria')}
                        {trab.orcamento_valor != null ? ` · ${trab.orcamento_valor}€` : ''}
                        {trab.prazo
                          ? ` · ${t('pesq.ate_prazo', { data: formatarData(trab.prazo) })}`
                          : ''}
                      </Text>
                    </View>
                    <Text style={styles.trabalhoSeta}>›</Text>
                  </Cartao>
                ))}
              </View>
            )}

            {/* Falar com esta pessoa — abre/cria a conversa do negócio. */}
            {!ehProprio && !bloqueado && (
              <Botao
                titulo={t('pperfil.mensagem')}
                variante="secundario"
                onPress={abrirConversa}
                aCarregar={aAbrirConversa}
              />
            )}

            {categorias.length > 0 && (
              <View style={styles.chipsCat}>
                {categorias.map((nome) => (
                  <Chip key={nome} texto={nome} />
                ))}
              </View>
            )}

            {/* PORTEFÓLIO — um só trilho: primeiro a prova (comprovados da 055,
                emoldurados; o nome de quem contratou só com consentimento — a
                view garante-o), depois as fotos soltas. Mostrar, não dizer. */}
            {id && <PortfolioGaleria perfilId={id} />}

            <Text style={styles.rotulo}>{t('perfil.o_selo')}</Text>
            <Selo verificacoes={verifs} />

            {reveladas.length > 0 && (
              <View style={styles.avaliacoes}>
                <Text style={styles.rotulo}>{t('perfil.avaliacoes')}</Text>
                {reveladas.map((a) => (
                  <Avaliacao
                    key={a.id}
                    nota={a.nota}
                    comentario={a.comentario}
                    autor={a.de?.nome}
                  />
                ))}
              </View>
            )}

            {/* A minha avaliação ainda SELADA a esta pessoa (double-blind): só eu a
                vejo, e fica à parte das públicas para não parecer que já conta. */}
            {minhasSeladas.map((a) => (
              <View key={a.id} style={styles.selada}>
                <Text style={styles.rotulo}>{t('projeto.tua_avaliacao')}</Text>
                <Cartao style={styles.seladaCartao}>
                  <Estrelas nota={a.nota} />
                  {a.comentario ? <Text style={styles.seladaComentario}>{a.comentario}</Text> : null}
                  <View style={styles.seladaFaixa}>
                    <Text style={styles.seladaSelo}>{t('pperfil.selada')}</Text>
                    <Text style={styles.seladaNota}>{t('pperfil.selada_nota')}</Text>
                  </View>
                </Cartao>
              </View>
            ))}

            {!ehProprio && !enviado && !bloqueado && pedidoEmCurso && (
              <Cartao style={styles.emCurso}>
                <Text style={styles.emCursoTxt}>{t('pperfil.pedido_em_curso')}</Text>
                <Text style={styles.emCursoSub}>{t('pperfil.ve_estado')}</Text>
              </Cartao>
            )}

            {!ehProprio && !enviado && !bloqueado && !pedidoEmCurso && (
              <View style={styles.pedir}>
                <Text style={styles.rotulo}>{t('pperfil.pedir_orcamento')}</Text>
                {contaSuspensa ? (
                  /* Conta suspensa (escada de suspensão, 048): o gesto dá lugar
                     ao motivo honesto — a BD trava o pedido na mesma. */
                  <Cartao style={styles.emCurso}>
                    <Text style={styles.emCursoTxt}>{t('susp.gesto_pedir')}</Text>
                  </Cartao>
                ) : minhaIdVerificada ? (
                  <>
                    <Campo
                      placeholder={t('pperfil.descreve_ph')}
                      value={desc}
                      onChangeText={setDesc}
                      multiline
                    />
                    {/* Prazo do projeto — a âncora dos checkpoints (fatia D).
                        Os checkpoints em si definem-se DENTRO do orçamento. */}
                    <Text style={styles.cpRotulo}>{t('pperfil.prazo_projeto')}</Text>
                    <CampoData
                      value={prazoProjeto}
                      onChange={setPrazoProjeto}
                      placeholder={t('pperfil.prazo_projeto_ph')}
                      minimo={hojeISO()}
                    />
                    {erro && <Erro texto={erro} />}
                    <Botao titulo={t('pperfil.pedir_botao')} onPress={pedirOrcamento} aCarregar={aEnviar} />
                  </>
                ) : (
                  /* Sem identidade verificada não se pede (fuga C, 043) — a
                     mensagem é honesta e aponta o caminho, não finge um erro. */
                  <Cartao style={styles.emCurso}>
                    <Text style={styles.emCursoTxt}>{t('idverif.pedir')}</Text>
                    <Text style={styles.emCursoSub}>{t('idverif.sub')}</Text>
                    <Botao
                      titulo={t('idverif.botao')}
                      variante="secundario"
                      onPress={() => router.push('/perfil')}
                    />
                  </Cartao>
                )}
              </View>
            )}

            {enviado && (
              <View style={styles.sucesso}>
                <Text style={styles.sucessoTxt}>{t('pperfil.pedido_enviado')}</Text>
                <Text style={styles.sucessoSub}>{t('pperfil.ve_estado')}</Text>
              </View>
            )}

            {/* Bloqueado — sem interação possível. */}
            {!ehProprio && bloqueado && (
              <Cartao style={styles.emCurso}>
                <Text style={styles.emCursoTxt}>{t('pperfil.bloqueaste')}</Text>
                <Text style={styles.emCursoSub}>{t('pperfil.bloqueado_sub')}</Text>
                <Text style={styles.acaoLink} onPress={desbloquear}>
                  {t('pperfil.desbloquear')}
                </Text>
              </Cartao>
            )}

            {acaoMsg && <Text style={styles.acaoInfo}>{acaoMsg}</Text>}

            {/* Ações de segurança — discretas, no fim. DISCRETAS, NÃO
                INALCANÇÁVEIS: mediam 70×17px, e quem precisa de bloquear
                alguém costuma estar a tentar fazê-lo depressa e mal. Continuam
                sem cor de alarme e no fim da página (não são o que se vem cá
                fazer), mas o alvo passou a ter altura de dedo. */}
            {!ehProprio && (
              <View style={styles.seguranca}>
                <Pressable
                  onPress={() => setDenunciaAberta(true)}
                  style={styles.segAlvo}
                  accessibilityRole="button"
                >
                  <Text style={styles.acaoLink}>{t('pperfil.denunciar')}</Text>
                </Pressable>
                {!bloqueado && (
                  <Pressable onPress={bloquear} style={styles.segAlvo} accessibilityRole="button">
                    <Text style={styles.acaoLink}>{t('pperfil.bloquear')}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Modal de denúncia — motivos predefinidos. */}
        <Modal
          visible={denunciaAberta}
          transparent
          animationType="fade"
          onRequestClose={() => setDenunciaAberta(false)}
        >
          <View style={styles.veu}>
            <View style={styles.carta}>
              <Text style={styles.cartaTitulo}>{t('pperfil.modal_titulo')}</Text>
              <Text style={styles.cartaTexto}>{t('pperfil.modal_texto')}</Text>
              {/* O motivo gravado na BD fica em PT (canónico p/ revisão); só o
                  rótulo mostrado fala o idioma de quem denuncia. */}
              {(
                [
                  ['Perfil falso', 'pperfil.motivo.falso'],
                  ['Comportamento abusivo', 'pperfil.motivo.abusivo'],
                  ['Spam ou fraude', 'pperfil.motivo.spam'],
                  ['Conteúdo impróprio', 'pperfil.motivo.improprio'],
                  ['Outro', 'pperfil.motivo.outro'],
                ] as [string, ChaveI18n][]
              ).map(([valor, chave]) => (
                <Pressable key={valor} style={styles.motivo} onPress={() => denunciar(valor)}>
                  <Text style={styles.motivoTxt}>{t(chave)}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.cancelar} onPress={() => setDenunciaAberta(false)}>
                <Text style={styles.cancelarTxt}>{t('comum.cancelar')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  scroll: { paddingBottom: Espaco.xxl },
  voltarSolto: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarSoltoTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  centroErro: { padding: Espaco.xl, alignItems: 'center' },

  voltar: { alignSelf: 'flex-start', paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.creme, fontSize: 16, fontWeight: '700' },

  corpo: { padding: Espaco.xl, gap: Espaco.md },
  chipsCat: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  avaliacoes: { gap: Espaco.sm },

  // COMO CONTRATANTE (empresa) — a mesma língua do OnHonra, no lado de quem contrata.
  contratante: { gap: Espaco.sm },
  contratanteSub: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '600' },

  // TRABALHOS ABERTOS (empresa) — cartões compactos que levam ao detalhe.
  trabalhos: { gap: Espaco.sm },
  trabalhoLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  trabalhoMeio: { flex: 1 },
  trabalhoTitulo: { fontSize: 15, fontWeight: '700', color: Honra.tinta },
  trabalhoSub: { fontSize: 12, color: Honra.tintaSuave, fontWeight: '600', marginTop: 2 },
  trabalhoSeta: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '700' },

  // Avaliação selada (double-blind) — tratamento sóbrio, "à espera", não o verde do público.
  selada: { gap: Espaco.sm },
  seladaCartao: { gap: Espaco.xs, opacity: 0.85 },
  seladaComentario: { fontSize: 15, color: Honra.tinta, lineHeight: 20 },
  seladaFaixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    marginTop: Espaco.xs,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
    paddingTop: Espaco.sm,
  },
  seladaSelo: { fontSize: 13, fontWeight: '700', color: Honra.tintaSuave },
  seladaNota: { flex: 1, fontSize: 12, color: Honra.tintaSuave, lineHeight: 16 },

  emCurso: { padding: Espaco.lg, gap: Espaco.xs },
  emCursoTxt: { color: Honra.tinta, fontSize: 15, fontWeight: '700' },
  emCursoSub: { color: Honra.tintaSuave, fontSize: 13 },

  pedir: { gap: Espaco.sm },
  cpRotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.sm,
  },
  sucesso: {
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.md,
    padding: Espaco.lg,
    alignItems: 'center',
    gap: Espaco.xs,
  },
  sucessoTxt: { color: Honra.verde, fontSize: 18, fontWeight: '800' },
  sucessoSub: { color: Honra.tintaSuave, fontSize: 13 },

  // Trust & Safety — ações discretas + feedback + modal.
  acaoLink: { color: Honra.verde, fontSize: 14, fontWeight: '700', marginTop: Espaco.xs },
  segAlvo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Espaco.xs },
  acaoInfo: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19 },
  seguranca: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Espaco.xl,
    marginTop: Espaco.md,
    paddingTop: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
  },
  veu: {
    flex: 1,
    backgroundColor: 'rgba(18, 33, 27, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  carta: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.lg,
    padding: Espaco.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    gap: Espaco.xs,
  },
  cartaTitulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  cartaTexto: { fontSize: 14, lineHeight: 20, color: Honra.tintaSuave, marginBottom: Espaco.sm },
  motivo: {
    paddingVertical: Espaco.md,
    borderTopWidth: 1,
    borderTopColor: Honra.creme,
  },
  motivoTxt: { fontSize: 15, color: Honra.tinta, fontWeight: '600' },
  cancelar: { alignItems: 'center', paddingVertical: Espaco.md, marginTop: Espaco.xs },
  cancelarTxt: { color: Honra.tintaSuave, fontSize: 15, fontWeight: '700' },
});
