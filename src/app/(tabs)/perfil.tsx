import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avaliacao,
  Botao,
  Carregar,
  Chip,
  confiancaPct,
  Confianca,
  Credencial,
  Erro,
  MoedaInsignia,
  OnHonra,
  Selo,
} from '@/components/ui';
import { PortfolioGaleria } from '@/components/Portfolio';
import { nomeEscalao, useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { statsContratante, type StatsContratante } from '@/lib/contratante';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';
import { ESCALOES, estiloPrestigio, nivelDeCredencial } from '@/theme/prestigio';

/**
 * Perfil próprio — a MESMA língua "Credencial" do perfil público
 * (padrão-ouro: src/app/perfil/[id].tsx). Tudo vem de `@/components/ui`;
 * o prestígio (§3) é derivado dos sinais vivos e aplicado pela Credencial.
 * A voz é a mesma do público (Credencial + Confiança + categorias + Selo +
 * Portefólio + Avaliações); só acrescenta o que é do dono: editar, alternar
 * disponibilidade, verificar identidade e abrir as Definições.
 */
type Disponibilidade = 'disponivel' | 'a_partir_de' | 'ocupado';
type Perfil = {
  nome: string | null;
  handle: string | null;
  papel: string | null;
  cidade: string | null;
  avatar: string | null;
  avatar_url: string | null;
  indice_confianca: number | null;
  negocios_honrados: number | null;
  negocios_falhados: number | null;
  apertos_selados: number | null;
  cancelados_mutuo: number | null;
  tipo: string | null;
  disponibilidade: Disponibilidade | null;
};
type Verif = { aba: string; estado: string; origem?: string | null };
type AvaliacaoLinha = {
  id: string;
  nota: number;
  comentario: string | null;
  criado_em: string;
  de?: { nome: string | null } | null;
};

export default function PerfilScreen() {
  const { session } = useAuth();
  // SECRETÁRIA (28/07): o perfil abre em PAINEL — segmentos lado a lado, à
  // vista, em vez do rolo para cima e para baixo.
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;
  const { t } = useT();
  const uid = session?.user.id;
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [verifs, setVerifs] = useState<Verif[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoLinha[]>([]);
  const [aVerificar, setAVerificar] = useState(false);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // EMPRESA: a história do contratante (RPC 041) — os mesmos números do público.
  const [statsCli, setStatsCli] = useState<StatsContratante | null>(null);

  const carregar = useCallback(() => {
    if (!session) return;
    const id = session.user.id;
    setACarregar(true);
    setErro(null);
    supabase
      .from('perfis')
      .select(
        'nome, handle, papel, cidade, avatar, avatar_url, indice_confianca, negocios_honrados, negocios_falhados, apertos_selados, cancelados_mutuo, tipo, disponibilidade',
      )
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setErro(t('perfil.erro_carregar'));
        else setPerfil(data as Perfil);
        setACarregar(false);
        // Só a empresa mostra o bloco de contratante no próprio perfil.
        if ((data as Perfil | null)?.tipo === 'empresa') {
          statsContratante(id).then(setStatsCli);
        }
      });
    supabase
      .from('verificacoes')
      .select('aba, estado, origem')
      .eq('perfil_id', id)
      .then(({ data }) => setVerifs(data ?? []));
    // Categorias do próprio (tolerante: se a tabela ainda não existir, fica vazio)
    supabase
      .from('perfil_categorias')
      .select('categorias(nome)')
      .eq('perfil_id', id)
      .then(({ data }) =>
        setCategorias(
          ((data as any[]) ?? [])
            .map((r) => r.categorias?.nome)
            .filter((n): n is string => !!n)
        )
      );
    // Avaliações recebidas (tolerante: se a tabela ainda não existir, fica vazio)
    supabase
      .from('avaliacoes')
      .select('id, nota, comentario, criado_em, de:perfis!de_perfil(nome)')
      .eq('para_perfil', id)
      .order('criado_em', { ascending: false })
      .then(({ data }) => setAvaliacoes((data as any) ?? []));
  }, [session, t]);

  useFocusEffect(carregar);

  async function verificar() {
    setErro(null);
    setAVerificar(true);
    // Para onde o Stripe Identity deve voltar: a app (na web, a origem exata).
    const return_url =
      Platform.OS === 'web' ? `${window.location.origin}/verificado` : Linking.createURL('verificado');
    const { data, error } = await supabase.functions.invoke('criar-verificacao', {
      body: { return_url },
    });
    setAVerificar(false);
    if (error || !data?.url) {
      setErro((await razaoDoServidor(error)) ?? t('perfil.erro_verificacao'));
      return;
    }
    if (Platform.OS === 'web') {
      window.location.assign(data.url as string);
      return;
    }
    await WebBrowser.openBrowserAsync(data.url as string);
    carregar(); // volta e atualiza o selo
  }

  // Alterna Disponível ↔ Ocupado (otimista: mexe já na pill, depois grava).
  async function alternarDisponibilidade(alvo: Disponibilidade) {
    if (!uid || !perfil || perfil.disponibilidade === alvo) return;
    const anterior = perfil.disponibilidade;
    setErro(null);
    setPerfil({ ...perfil, disponibilidade: alvo });
    const { error } = await supabase
      .from('perfis')
      .update({ disponibilidade: alvo })
      .eq('id', uid);
    if (error) {
      // Reverte se a gravação falhar — a pill nunca mente sobre o estado real.
      setPerfil((p) => (p ? { ...p, disponibilidade: anterior } : p));
      setErro(t('perfil.erro_disponibilidade'));
    }
  }

  const identidadeVerde = verifs.some((v) => v.aba === 'identidade' && v.estado === 'verificado');
  const contactoVerde = verifs.some((v) => v.aba === 'contacto' && v.estado === 'verificado');
  const profissaoVerde = verifs.some((v) => v.aba === 'profissao' && v.estado === 'verificado');

  const numAval = avaliacoes.length;
  const numAvalRecentes = avaliacoes.filter(
    (a) => new Date(a.criado_em).getTime() > Date.now() - 182 * 86400000,
  ).length;
  const disponivel = perfil?.disponibilidade === 'disponivel';

  // PRESTÍGIO (§3): o gold cresce com o escalão — derivado dos sinais vivos,
  // exatamente como no padrão-ouro (perfil/[id].tsx). Decai sem honra recente.
  const verdes = verifs.filter((v) => v.estado === 'verificado').length;
  const nivelAtual = nivelDeCredencial({
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
  });
  const prestigio = estiloPrestigio(nivelAtual);
  const escalaoTxt = nomeEscalao(t, ESCALOES[nivelAtual]);
  // Passe Honra Card (Perfil 1c): frente = credencial; verso = confiança+selo.
  const [face, setFace] = useState<'frente' | 'verso'>('frente');
  const pctConfianca = confiancaPct(perfil?.negocios_honrados, perfil?.negocios_falhados);

  // Cabeçalho da faixa verde: rótulo + utilitários (Definições + Sino).
  const topo = (
    <View style={styles.topo}>
      <Text style={styles.rotuloTopo}>{t('perfil.rotulo_topo')}</Text>
      <View style={styles.topoAcoes}>
        {/* Definições — engrenagem neutra (utilitário, como o Sino). */}
        <Pressable
          onPress={() => router.push('/definicoes')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('perfil.definicoes_a11y')}
        >
          <Feather name="settings" size={22} color={Honra.creme} />
        </Pressable>
      </View>
    </View>
  );

  // Honra Card — isolado no canto inferior direito do pano verde (é uma peça
  // à parte: a credencial partilhável, não um utilitário do cabeçalho).
  const honraCard = (
    <Pressable
      onPress={() => router.push('/honra-card')}
      style={styles.cardBtn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('perfil.credencial_a11y')}
    >
      {/* Selo "H" da casa — não um cartão de crédito. (O selo do Honra Card
          evoluirá para escudo com H; maquete à parte.) */}
      <View style={styles.cardSelo}>
        <Text style={styles.cardSeloTxt}>H</Text>
      </View>
      <Text style={styles.cardBtnTxt}>{t('perfil.credencial')}</Text>
    </Pressable>
  );

  if (aCarregar && !perfil) {
    return (
      <SafeAreaView style={[styles.fundo, largo && styles.fundoLargo]} edges={['top']}>
        <Credencial topo={topo} nome={null} />
        <Carregar />
      </SafeAreaView>
    );
  }

  // ===== SEGMENTOS do perfil — os mesmos blocos nos dois mundos; muda a
  // composição (empilhado no telemóvel, painel na secretária). =====
  const segConfianca = (
    <>
      {/* CONFIANÇA — o que os outros veem quando decidem contratar-te. */}
      <Confianca honrados={perfil?.negocios_honrados} falhados={perfil?.negocios_falhados} />
      <OnHonra
        apertos={perfil?.apertos_selados}
        honrados={perfil?.negocios_honrados}
        cancelados={perfil?.cancelados_mutuo}
      />
    </>
  );

  // COMO CONTRATANTE (empresa) — os números que o mundo vê + a porta da rede.
  const segContratante = perfil?.tipo === 'empresa' && (
    <View style={styles.contratante}>
      <Text style={styles.rotulo}>{t('perfil.como_contratante')}</Text>
      {statsCli && (statsCli.apertos > 0 || statsCli.honrados > 0) ? (
        <OnHonra apertos={statsCli.apertos} honrados={statsCli.honrados} />
      ) : (
        <Text style={styles.nota}>{t('perfil.sem_contratacoes')}</Text>
      )}
      {statsCli && statsCli.trabalhos > 0 && (
        <Text style={styles.contratanteSub}>
          {statsCli.trabalhos === 1
            ? t('perfil.trabalho_publicado')
            : t('perfil.trabalhos_publicados', { n: statsCli.trabalhos })}
        </Text>
      )}
      <Pressable
        style={styles.redeLinha}
        onPress={() => router.push('/rede' as Href)}
        accessibilityRole="button"
        accessibilityLabel={t('inicio.rede_a11y')}
      >
        <Text style={styles.redeTxt}>{t('perfil.tua_rede')}</Text>
        <Text style={styles.redeSeta}>›</Text>
      </Pressable>
    </View>
  );

  // DISPONIBILIDADE — o dono decide se está a aceitar trabalho.
  const segDisponibilidade = (
    <>
      <Text style={styles.rotulo}>{t('perfil.disponibilidade')}</Text>
      {/* O TOGGLE — botões contornados (verde = a escolha ativa). É uma AÇÃO. */}
      <View style={styles.chipsCat}>
        <Chip
          texto={t('perfil.disponivel')}
          ativo={disponivel}
          onPress={() => alternarDisponibilidade('disponivel')}
        />
        <Chip
          texto={t('perfil.ocupado')}
          ativo={perfil?.disponibilidade === 'ocupado'}
          onPress={() => alternarDisponibilidade('ocupado')}
        />
      </View>
      {/* AS ÁREAS — rótulo próprio + etiquetas PASSIVAS (preenchidas, sem
          contorno): informação, não toggle. Separadas do bloco de cima. */}
      {categorias.length > 0 && (
        <>
          <Text style={[styles.rotulo, styles.rotuloAreas]}>{t('perfil.areas')}</Text>
          <View style={styles.areas}>
            {categorias.map((nome) => (
              <View key={nome} style={styles.areaTag}>
                <Text style={styles.areaTxt}>{nome}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );

  // PORTEFÓLIO — comprovados emoldurados primeiro. Mostrar, não dizer.
  const segPortefolio = uid ? <PortfolioGaleria perfilId={uid} proprio /> : null;

  // O SELO + as portas de verificação.
  const segSelo = (
    <>
      <Text style={styles.rotulo}>{t('perfil.o_selo')}</Text>
      {/* Picotado = tocável: cada aba trancada leva à ação que a acende. */}
      <Selo
        verificacoes={verifs}
        abasAcesasTocaveis={['portefolio']}
        aoTocarAcesa={() => router.push('/editar-perfil?foco=portefolio' as Href)}
        aoTocarBloqueada={(aba) => {
          if (aba === 'identidade') verificar();
          else if (aba === 'profissao') router.push('/verificar-profissao' as Href);
          else if (aba === 'contacto') router.push('/verificar-contacto' as Href);
          else router.push('/editar-perfil?foco=portefolio' as Href);
        }}
      />
      {!identidadeVerde && (
        <Botao titulo={t('perfil.verificar_identidade')} onPress={verificar} aCarregar={aVerificar} />
      )}
      {!contactoVerde && (
        <Botao
          titulo={t('perfil.verificar_contacto')}
          variante="secundario"
          onPress={() => router.push('/verificar-contacto' as Href)}
        />
      )}
      {!profissaoVerde && (
        <Botao
          titulo={t('perfil.verificar_profissao')}
          variante="secundario"
          onPress={() => router.push('/verificar-profissao' as Href)}
        />
      )}
      <Text style={styles.nota}>
        {identidadeVerde ? t('perfil.nota_identidade_ok') : t('perfil.nota_identidade')}
      </Text>
    </>
  );

  const segAvaliacoes = avaliacoes.length > 0 && (
    <View style={styles.avaliacoes}>
      <Text style={styles.rotulo}>{t('perfil.avaliacoes')}</Text>
      {avaliacoes.map((a) => (
        <Avaliacao key={a.id} nota={a.nota} comentario={a.comentario} autor={a.de?.nome} />
      ))}
    </View>
  );

  // Editar no FIM — não se intromete no meio da informação.
  const botaoEditar = (
    <Botao
      titulo={t('perfil.editar')}
      variante="secundario"
      onPress={() => router.push('/editar-perfil')}
    />
  );

  // ===== PERFIL 1c (SECRETÁRIA) — o passe Honra Card (frente/verso) =====
  const chipVerif = (rotulo: string, verde: boolean) => (
    <View key={rotulo} style={[styles.pvChip, !verde && styles.pvChipFalta]}>
      {verde ? <Text style={styles.pvChipCheck}>✓</Text> : null}
      <Text style={[styles.pvChipTxt, !verde && styles.pvChipTxtFalta]}>{rotulo}</Text>
    </View>
  );
  const linhaVerif = (rotulo: string, verde: boolean, nota?: string) => (
    <View key={rotulo} style={styles.vvLinha}>
      <View style={[styles.vvDot, verde ? styles.vvDotVerde : styles.vvDotFalta]}>
        {verde ? <Text style={styles.vvDotCheck}>✓</Text> : null}
      </View>
      <Text style={[styles.vvTxt, !verde && styles.vvTxtFalta]}>{rotulo}</Text>
      {nota ? <Text style={styles.vvNota}>{nota}</Text> : null}
    </View>
  );

  const honraCardPasse = (
    <View style={styles.passe}>
      <View style={styles.passeTopo}>
        <Text style={styles.passeRotulo}>{t('perfil.honra_card')}</Text>
        <View style={styles.nivelChip}>
          <Text style={styles.nivelChipTxt}>{t('perfil.nivel', { escalao: escalaoTxt })}</Text>
        </View>
        <View style={styles.faceToggle}>
          {(['frente', 'verso'] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFace(f)}
              style={[styles.faceBtn, face === f && styles.faceBtnAtivo]}
            >
              <Text style={[styles.faceBtnTxt, face === f && styles.faceBtnTxtAtivo]}>
                {t(f === 'frente' ? 'perfil.frente' : 'perfil.verso')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {face === 'frente' ? (
        <View style={styles.passeFrente}>
          {/* A INSÍGNIA do teu escalão (não o H genérico) — toca para virar. */}
          <MoedaInsignia nivel={nivelAtual} tamanho={120} />
          <View style={styles.passeIdent}>
            <View style={styles.passeNomeLinha}>
              <Text style={styles.passeNome} numberOfLines={1}>
                {perfil?.nome ?? session?.user.email}
              </Text>
              {identidadeVerde && (
                <View style={styles.passeCheck}>
                  <Text style={styles.passeCheckTxt}>✓</Text>
                </View>
              )}
            </View>
            <Text style={styles.passeSub} numberOfLines={1}>
              {[perfil?.handle ? `@${perfil.handle}` : null, perfil?.papel, perfil?.cidade]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={styles.passeChips}>
              {chipVerif(t('selo.identidade'), identidadeVerde)}
              {chipVerif(t('selo.profissao'), profissaoVerde)}
              {chipVerif(t('selo.portefolio'), verifs.some((v) => v.aba === 'portefolio' && v.estado === 'verificado'))}
              {chipVerif(t('selo.contacto'), contactoVerde)}
            </View>
          </View>
          <View style={styles.passeDir}>
            <View style={styles.passeCred}>
              <Text style={styles.passeCredLbl}>{t('perfil.cred_publica')}</Text>
              <Text style={styles.passeCredUrl}>honraapp.com/{perfil?.handle ?? ''}</Text>
            </View>
            <Pressable style={styles.passePartilhar} onPress={() => router.push('/honra-card')}>
              <Text style={styles.passePartilharTxt}>{t('perfil.partilhar_credencial')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.passeVerso}>
          <View style={styles.versoConf}>
            <Text style={styles.versoLbl}>{t('inicio.confianca')}</Text>
            <Text style={styles.versoPct}>{pctConfianca}%</Text>
            <View style={styles.versoBarra}>
              <View style={[styles.versoFill, { width: `${pctConfianca}%` }]} />
            </View>
            <Text style={styles.versoStats}>
              {t('perfil.verso_stats', {
                apertos: perfil?.apertos_selados ?? 0,
                honrados: perfil?.negocios_honrados ?? 0,
                falhas: perfil?.negocios_falhados ?? 0,
              })}
            </Text>
          </View>
          <View style={styles.versoVerifs}>
            <Text style={styles.versoLbl}>{t('perfil.verificacoes')}</Text>
            {linhaVerif(t('selo.identidade'), identidadeVerde)}
            {linhaVerif(t('selo.profissao'), profissaoVerde, t('perfil.pelo_trabalho'))}
            {linhaVerif(
              t('selo.portefolio'),
              verifs.some((v) => v.aba === 'portefolio' && v.estado === 'verificado')
            )}
            {linhaVerif(t('selo.contacto'), contactoVerde, t('perfil.por_verificar'))}
          </View>
        </View>
      )}
    </View>
  );

  // Linha de ações (Perfil 1c): disponibilidade + áreas + verificar/editar.
  const linhaAcoesD = (
    <View style={styles.acoesLinha}>
      <Pressable
        style={[styles.dispChip, disponivel && styles.dispChipAtivo]}
        onPress={() => alternarDisponibilidade('disponivel')}
      >
        {disponivel ? <View style={styles.dispDot} /> : null}
        <Text style={[styles.dispTxt, disponivel && styles.dispTxtAtivo]}>{t('perfil.disponivel')}</Text>
      </Pressable>
      <Pressable
        style={[styles.dispChip, !disponivel && styles.dispChipAtivo]}
        onPress={() => alternarDisponibilidade('ocupado')}
      >
        <Text style={[styles.dispTxt, !disponivel && styles.dispTxtAtivo]}>{t('perfil.ocupado')}</Text>
      </Pressable>
      {categorias.length > 0 && <View style={styles.acoesSep} />}
      {categorias.map((nome) => (
        <View key={nome} style={styles.areaTag}>
          <Text style={styles.areaTxt}>{nome}</Text>
        </View>
      ))}
      <View style={styles.acoesDir}>
        {!contactoVerde && (
          <Pressable
            style={styles.acaoVerde}
            onPress={() => router.push('/verificar-contacto' as Href)}
          >
            <Text style={styles.acaoVerdeTxt}>{t('perfil.verificar_contacto')}</Text>
          </Pressable>
        )}
        <Pressable style={styles.acaoOutline} onPress={() => router.push('/editar-perfil')}>
          <Text style={styles.acaoOutlineTxt}>{t('perfil.editar')}</Text>
        </Pressable>
      </View>
    </View>
  );

  // Grelha de baixo (Perfil 1c): Portefólio | Avaliações.
  const grelhaBaixoD = (
    <View style={styles.baixo}>
      <View style={styles.baixoPrincipal}>
        <View style={styles.baixoCabeca}>
          <Text style={styles.rotulo}>{t('perfil.portefolio')}</Text>
          <Pressable onPress={() => router.push('/editar-perfil?foco=portefolio' as Href)}>
            <Text style={styles.gerir}>{t('perfil.gerir')}</Text>
          </Pressable>
        </View>
        {uid && <PortfolioGaleria perfilId={uid} proprio />}
      </View>
      <View style={styles.baixoLateral}>
        <Text style={styles.rotulo}>{t('perfil.avaliacoes')}</Text>
        {avaliacoes.length > 0 ? (
          avaliacoes.map((a) => (
            <Avaliacao key={a.id} nota={a.nota} comentario={a.comentario} autor={a.de?.nome} />
          ))
        ) : (
          <Text style={styles.nota}>{t('perfil.sem_avaliacoes')}</Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.fundo, largo && styles.fundoLargo]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* SECRETÁRIA (Perfil 1c): o passe Honra Card sobre o bege, não a faixa
            verde full-bleed. No telemóvel mantém-se a credencial de sempre. */}
        {!largo && (
          <Credencial
            topo={topo}
            nome={perfil?.nome ?? session?.user.email}
            handle={perfil?.handle}
            papel={perfil?.papel}
            cidade={perfil?.cidade}
            iniciais={perfil?.avatar}
            imagem={
              perfil?.avatar_url
                ? supabase.storage.from('avatares').getPublicUrl(perfil.avatar_url).data.publicUrl
                : null
            }
            verificado={identidadeVerde}
            empresa={perfil?.tipo === 'empresa'}
            disponivel={disponivel}
            prestigio={prestigio}
            rodapeDireito={honraCard}
          />
        )}

        {largo ? (
          <View style={styles.paginaD}>
            <Text style={styles.tituloD}>{t('perfil.rotulo_topo')}</Text>
            {erro && <Erro texto={erro} />}
            {honraCardPasse}
            {linhaAcoesD}
            {grelhaBaixoD}
          </View>
        ) : (
          <View style={styles.corpo}>
            {erro && <Erro texto={erro} />}
            {segConfianca}
            {segContratante}
            {segDisponibilidade}
            {segPortefolio}
            {segSelo}
            {segAvaliacoes}
            {botaoEditar}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  fundoLargo: { backgroundColor: Honra.begeSecretaria },
  scroll: { paddingBottom: Espaco.xxl },

  // Cabeçalho dentro da faixa verde: rótulo à esquerda, Sino à direita.
  topo: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espaco.lg,
    paddingTop: Espaco.xs,
  },
  rotuloTopo: {
    color: Honra.douradoClaro,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  topoAcoes: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },

  // Honra Card no canto inferior direito do pano verde — pílula discreta a dourado.
  cardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,0.5)',
    borderRadius: 999,
    paddingHorizontal: Espaco.sm,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  cardBtnTxt: { color: Honra.douradoClaro, fontSize: 12, fontWeight: '700' },
  cardSelo: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Honra.douradoClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSeloTxt: { color: Honra.douradoClaro, fontSize: 9, fontWeight: '800', lineHeight: 11 },

  corpo: { padding: Espaco.xl, gap: Espaco.md },
  // SECRETÁRIA — o painel: 3 segmentos lado a lado (o compasso 1280 da casa),
  // avaliações ao comprido por baixo.
  grelha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Espaco.xl,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.xl,
  },
  grelhaCol: { flex: 1, minWidth: 0, gap: Espaco.md },
  grelhaErro: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.md,
  },
  avaliacoesLargo: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: Espaco.xl,
    paddingTop: Espaco.lg,
    paddingBottom: Espaco.xl,
  },
  chipsCat: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  // As áreas ficam claramente separadas do toggle de disponibilidade.
  rotuloAreas: { marginTop: Espaco.lg },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm, marginTop: Espaco.xs },
  // Etiqueta PASSIVA (informação): preenchida, sem contorno — distinta do
  // toggle contornado. Não é tocável, não é verde (verde = ação/seleção).
  areaTag: {
    backgroundColor: Honra.creme,
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 7,
  },
  areaTxt: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '600' },
  nota: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19 },
  avaliacoes: { gap: Espaco.sm },

  // COMO CONTRATANTE (empresa) — bloco sóbrio + atalho para a rede.
  contratante: { gap: Espaco.sm },
  contratanteSub: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '600' },
  redeLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Espaco.xs,
  },
  redeTxt: { color: Honra.verde, fontSize: 14, fontWeight: '700' },
  redeSeta: { color: Honra.tintaSuave, fontSize: 20, fontWeight: '700' },

  // ===== PERFIL 1c (SECRETÁRIA) =====
  paginaD: { paddingHorizontal: 34, paddingTop: Espaco.lg, gap: 26 },
  tituloD: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.3, color: '#5F6B60' },
  // O passe Honra Card — cartão verde arredondado sobre o bege.
  passe: {
    borderRadius: 24,
    padding: 30,
    backgroundColor: Honra.verdeEscuro,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 26px 60px rgba(11,42,30,.32)' } as object,
      default: {
        shadowColor: '#0B2A1E',
        shadowOpacity: 0.32,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 20 },
        elevation: 10,
      },
    }),
  },
  passeTopo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  passeRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(230,210,162,.7)' },
  nivelChip: {
    paddingVertical: 3,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: 'rgba(197,164,95,.14)',
    borderWidth: 1,
    borderColor: 'rgba(197,164,95,.42)',
  },
  nivelChipTxt: { fontSize: 11.5, fontWeight: '700', color: Honra.douradoClaro },
  faceToggle: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,.09)',
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,.22)',
  },
  faceBtn: { height: 30, paddingHorizontal: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  faceBtnAtivo: { backgroundColor: Honra.creme },
  faceBtnTxt: { fontSize: 12.5, fontWeight: '700', color: 'rgba(230,210,162,.8)' },
  faceBtnTxtAtivo: { color: Honra.verdeEscuro },
  passeFrente: { flexDirection: 'row', alignItems: 'center', gap: 34 },
  passeIdent: { flex: 1, minWidth: 0, gap: 8 },
  passeNomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  passeNome: { fontSize: 34, fontWeight: '800', letterSpacing: -0.9, color: '#fff', flexShrink: 1 },
  passeCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#127A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passeCheckTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  passeSub: { fontSize: 14.5, color: 'rgba(238,234,222,.78)' },
  passeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  pvChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,.1)',
    borderWidth: 1,
    borderColor: 'rgba(230,210,162,.25)',
  },
  pvChipFalta: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: 'rgba(230,210,162,.4)' },
  pvChipCheck: { color: Honra.douradoClaro, fontSize: 10, fontWeight: '900' },
  pvChipTxt: { fontSize: 11.5, fontWeight: '700', color: Honra.douradoClaro },
  pvChipTxtFalta: { color: 'rgba(230,210,162,.65)' },
  passeDir: {
    alignItems: 'flex-end',
    gap: 18,
    paddingLeft: 34,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,.14)',
  },
  passeCred: { alignItems: 'flex-end', gap: 3 },
  passeCredLbl: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: 'rgba(238,234,222,.55)' },
  passeCredUrl: { fontSize: 14, fontWeight: '700', color: Honra.douradoClaro },
  passePartilhar: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: Honra.creme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passePartilharTxt: { color: Honra.verdeEscuro, fontSize: 14, fontWeight: '700' },
  passeVerso: { flexDirection: 'row', gap: 34 },
  versoConf: { flex: 1, minWidth: 0, gap: 12, justifyContent: 'center' },
  versoLbl: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: 'rgba(238,234,222,.55)' },
  versoPct: { fontSize: 52, fontWeight: '800', letterSpacing: -1.6, color: '#fff' },
  versoBarra: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(242,237,226,.16)',
    maxWidth: 420,
    overflow: 'hidden',
  },
  versoFill: { height: '100%', borderRadius: 2, backgroundColor: Honra.dourado },
  versoStats: { fontSize: 14, color: 'rgba(238,234,222,.78)' },
  versoVerifs: {
    width: 400,
    gap: 9,
    paddingLeft: 34,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,.14)',
  },
  vvLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vvDot: { width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  vvDotVerde: { backgroundColor: '#127A4A' },
  vvDotFalta: { borderWidth: 1.4, borderColor: 'rgba(230,210,162,.45)', borderStyle: 'dashed' },
  vvDotCheck: { color: '#fff', fontSize: 10, fontWeight: '900' },
  vvTxt: { fontSize: 14.5, fontWeight: '600', color: '#fff' },
  vvTxtFalta: { color: 'rgba(230,210,162,.7)' },
  vvNota: { fontSize: 13, fontWeight: '500', color: 'rgba(238,234,222,.6)' },
  // Linha de ações (disponível + áreas + verificar/editar).
  acoesLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dispChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,.1)',
  },
  dispChipAtivo: { backgroundColor: '#DCEBDF', borderColor: 'rgba(18,60,43,.14)' },
  dispDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#127A4A' },
  dispTxt: { fontSize: 14, fontWeight: '600', color: '#6C7770' },
  dispTxtAtivo: { color: Honra.verdeEscuro, fontWeight: '700' },
  acoesSep: { width: 1, height: 26, backgroundColor: 'rgba(18,60,43,.12)', marginHorizontal: 6 },
  acoesDir: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  acaoVerde: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoVerdeTxt: { color: '#F7F3E9', fontSize: 14, fontWeight: '700' },
  acaoOutline: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(18,60,43,.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoOutlineTxt: { color: Honra.verdeEscuro, fontSize: 14, fontWeight: '700' },
  // Grelha de baixo — portefólio | avaliações.
  baixo: {
    flexDirection: 'row',
    gap: 34,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(18,60,43,.1)',
  },
  baixoPrincipal: { flex: 1, minWidth: 0, gap: Espaco.sm },
  baixoCabeca: { flexDirection: 'row', alignItems: 'center' },
  gerir: { fontSize: 13, fontWeight: '700', color: '#9A7740' },
  baixoLateral: { width: 420, gap: Espaco.sm },
});
