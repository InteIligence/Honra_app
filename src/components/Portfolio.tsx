/**
 * HONRA — Portefólio: a montra de trabalho no perfil (mostrar, não dizer).
 * `PortfolioGaleria` — leitura pública, num perfil qualquer. UM só trilho:
 * primeiro os COMPROVADOS (negócios honrados, emoldurados com o selo — a
 * prova antes das fotos), depois as fotos soltas. Decisão do Vítor (25/07):
 * o trabalho feito passa a portefólio — referência para o próximo cliente,
 * não um feed à parte.
 * `PortfolioEditor` — o dono acrescenta/remove as suas fotos (Editar perfil).
 * Bucket público 'portfolio' → URLs públicos, sem assinar.
 */
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CartaoComprovado,
  carregarComprovados,
  urlAssinadaEvolucao,
  type ItemComprovado,
} from '@/components/TrabalhoComprovado';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  duracaoLegivel,
  escolherVideo,
  gerarCapa,
  VideoGrandeErro,
  VideoLongoErro,
  VIDEOS_MAX,
} from '@/lib/videoPortefolio';
import { Espaco, Honra, Raio } from '@/theme/honra';

type Item = {
  id: string;
  ficheiro: string;
  /** 'foto' | 'video' — sem a 059 aplicada tudo chega como foto (tolerância). */
  tipo: 'foto' | 'video';
  duracao_segundos: number | null;
  capa_path: string | null;
};

function urlPublico(ficheiro: string): string {
  return supabase.storage.from('portfolio').getPublicUrl(ficheiro).data.publicUrl;
}

async function carregarItens(perfilId: string): Promise<Item[]> {
  // Tolerante à 059 por aplicar (a regra da casa, molde da 055/058): tenta com
  // as colunas novas; se a BD ainda não as tiver, cai para o select antigo e
  // tudo é foto — uma coluna em falta não pode partir a montra.
  const nova = await supabase
    .from('portfolio_itens')
    .select('id, ficheiro, tipo, duracao_segundos, capa_path')
    .eq('perfil_id', perfilId)
    .order('criado_em', { ascending: false });
  if (!nova.error) return (nova.data as Item[]) ?? [];
  const antiga = await supabase
    .from('portfolio_itens')
    .select('id, ficheiro')
    .eq('perfil_id', perfilId)
    .order('criado_em', { ascending: false });
  return ((antiga.data as { id: string; ficheiro: string }[]) ?? []).map((x) => ({
    ...x,
    tipo: 'foto' as const,
    duracao_segundos: null,
    capa_path: null,
  }));
}

// ---- Miniatura de vídeo (galeria e editor usam a mesma) ---------------------
/**
 * A miniatura é a CAPA (jpeg) — o .mp4 não anda um byte até alguém tocar.
 * O play é um selo discreto na tinta da casa, não um botão a gritar: a cor
 * de ação (verde) fica para ações, a montra é do trabalho.
 */
function MiniaturaVideo({ item, onAbrir }: { item: Item; onAbrir: (url: string) => void }) {
  return (
    <Pressable onPress={() => onAbrir(urlPublico(item.ficheiro))}>
      <Image
        source={{ uri: item.capa_path ? urlPublico(item.capa_path) : undefined }}
        style={styles.foto}
      />
      <View style={styles.play} pointerEvents="none">
        <Text style={styles.playTxt}>▶</Text>
      </View>
      {item.duracao_segundos ? (
        <Text style={styles.duracao}>{duracaoLegivel(item.duracao_segundos)}</Text>
      ) : null}
    </Pressable>
  );
}

/** O player só nasce com o lightbox aberto — antes disso não há rede. */
function LightboxVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return (
    <VideoView player={player} style={styles.lightboxVideo} contentFit="contain" nativeControls />
  );
}

// ---- Galeria (só ver) -------------------------------------------------------
/**
 * `proprio` — estou a olhar para o MEU perfil. Muda uma coisa só: vazio deixa
 * de ser silêncio e passa a convite. No perfil dos outros o silêncio é certo
 * (ninguém quer ler "esta pessoa não tem nada"); no meu, o silêncio esconde-me
 * a funcionalidade — foi exatamente assim que o Vítor não a encontrou (25/07).
 */
export function PortfolioGaleria({
  perfilId,
  proprio = false,
}: {
  perfilId: string;
  proprio?: boolean;
}) {
  const { t } = useT();
  const [itens, setItens] = useState<Item[]>([]);
  const [comprovados, setComprovados] = useState<ItemComprovado[]>([]);
  const [aberta, setAberta] = useState<string | null>(null); // foto em ecrã cheio
  const [videoAberto, setVideoAberto] = useState<string | null>(null); // vídeo no visor
  useEffect(() => {
    let vivo = true;
    carregarItens(perfilId).then((xs) => vivo && setItens(xs));
    // Comprovados no MESMO trilho (tolerante: sem a 055, vem vazio).
    carregarComprovados(perfilId).then((xs) => vivo && setComprovados(xs));
    return () => {
      vivo = false;
    };
  }, [perfilId]);

  // A foto de entrega é privada — amplia por URL assinada, no mesmo lightbox.
  async function ampliarComprovado(caminho: string) {
    const url = await urlAssinadaEvolucao(caminho);
    if (url) setAberta(url);
  }

  if (itens.length === 0 && comprovados.length === 0) {
    if (!proprio) return null;
    // Convite (só no meu perfil): a porta é o Editar perfil, onde vivem as duas
    // entradas — as fotos e a escolha dos trabalhos comprovados.
    return (
      <View style={styles.bloco}>
        <Text style={styles.rotulo}>{t('portf.rotulo')}</Text>
        <Pressable
          style={styles.convite}
          onPress={() => router.push('/editar-perfil?foco=portefolio')}
        >
          <Text style={styles.conviteTxt}>{t('portf.vazio_proprio')}</Text>
          <Text style={styles.conviteSeta}>›</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.bloco}>
      {/* Cabeçalho: o rótulo e, só no MEU perfil, a porta discreta para o gerir.
          Cheio, o portefólio deixava de ter entrada — a montra via-se, mas não
          se mexia (25/07). O "Gerir ›" vive na linha do rótulo, não num botão
          grande: é ferramenta do dono, não apelo ao visitante. */}
      <View style={styles.cabecalho}>
        <Text style={styles.rotulo}>{t('portf.rotulo')}</Text>
        {proprio && (
          <Pressable
            onPress={() => router.push('/editar-perfil?foco=portefolio')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('portf.gerir')}
          >
            <Text style={styles.gerir}>
              {t('portf.gerir')} <Text style={styles.gerirSeta}>›</Text>
            </Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {/* A prova primeiro: comprovados emoldurados, depois as fotos soltas. */}
        {comprovados.map((c) => (
          <CartaoComprovado key={`c-${c.id}`} item={c} onAmpliar={ampliarComprovado} />
        ))}
        {itens.map((it) =>
          it.tipo === 'video' ? (
            <MiniaturaVideo key={it.id} item={it} onAbrir={setVideoAberto} />
          ) : (
            <Pressable key={it.id} onPress={() => setAberta(urlPublico(it.ficheiro))}>
              <Image source={{ uri: urlPublico(it.ficheiro) }} style={styles.foto} />
            </Pressable>
          ),
        )}
      </ScrollView>

      {/* Visor em ecrã cheio — toca na foto para ampliar; toca fora para fechar. */}
      <Modal visible={!!aberta} transparent animationType="fade" onRequestClose={() => setAberta(null)}>
        <Pressable style={styles.lightbox} onPress={() => setAberta(null)}>
          {aberta ? (
            <Image source={{ uri: aberta }} style={styles.lightboxImg} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>

      {/* Visor de vídeo — os controlos são do player; fechar é no ×, sempre à
          vista (o toque no vídeo pertence ao play/pausa, não ao fecho). */}
      <Modal
        visible={!!videoAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setVideoAberto(null)}
      >
        <View style={styles.lightbox}>
          {videoAberto ? <LightboxVideo uri={videoAberto} /> : null}
          <Pressable style={styles.fecharVideo} onPress={() => setVideoAberto(null)} hitSlop={12}>
            <Text style={styles.fecharVideoTxt}>×</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ---- Editor (o dono gere) ---------------------------------------------------
export function PortfolioEditor() {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [itens, setItens] = useState<Item[]>([]);
  const [aProcessar, setAProcessar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [videoAberto, setVideoAberto] = useState<string | null>(null);

  const recarregar = useCallback(() => {
    if (uid) carregarItens(uid).then(setItens);
  }, [uid]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  async function adicionar() {
    if (!uid) return;
    setErro(null);
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (escolha.canceled || !escolha.assets?.[0]) return;
    setAProcessar(true);
    try {
      const asset = escolha.assets[0];
      const blob = await (await fetch(asset.uri)).blob();
      const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
      const caminho = `${uid}/${Date.now()}.${ext}`;
      const { error: erroUp } = await supabase.storage
        .from('portfolio')
        .upload(caminho, blob, { contentType: blob.type || 'image/jpeg' });
      if (erroUp) throw erroUp;
      const { error: erroIns } = await supabase
        .from('portfolio_itens')
        .insert({ perfil_id: uid, ficheiro: caminho });
      if (erroIns) throw erroIns;
      recarregar();
    } catch {
      setErro(t('portf.erro'));
    } finally {
      setAProcessar(false);
    }
  }

  /**
   * O funil do vídeo: escolher → régua (60s; 60 MB onde não há compressão) →
   * subir o clip → gerar e subir a capa → registar. Se cair a meio, o que já
   * subiu é apagado — no storage não ficam órfãos.
   */
  async function adicionarVideo() {
    if (!uid) return;
    setErro(null);
    const subidos: string[] = [];
    try {
      const v = await escolherVideo();
      if (!v) return;
      setAProcessar(true);

      const base = `${uid}/${Date.now()}`;
      const caminhoVideo = `${base}.${v.mime.includes('quicktime') ? 'mov' : 'mp4'}`;
      const caminhoCapa = `${base}-capa.jpg`;

      const blobVideo = await (await fetch(v.uri)).blob();
      const upVideo = await supabase.storage
        .from('portfolio')
        .upload(caminhoVideo, blobVideo, { contentType: v.mime });
      if (upVideo.error) throw upVideo.error;
      subidos.push(caminhoVideo);

      const capaUri = await gerarCapa(v.uri);
      const blobCapa = await (await fetch(capaUri)).blob();
      const upCapa = await supabase.storage
        .from('portfolio')
        .upload(caminhoCapa, blobCapa, { contentType: 'image/jpeg' });
      if (upCapa.error) throw upCapa.error;
      subidos.push(caminhoCapa);

      const { error: erroIns } = await supabase.from('portfolio_itens').insert({
        perfil_id: uid,
        ficheiro: caminhoVideo,
        tipo: 'video',
        duracao_segundos: v.duracaoSegundos,
        capa_path: caminhoCapa,
      });
      if (erroIns) {
        await supabase.storage.from('portfolio').remove(subidos);
        // Sem a 059 aplicada as colunas não existem — a app não parte, avisa.
        const semColuna =
          erroIns.code === 'PGRST204' || /coluna|column/i.test(erroIns.message ?? '');
        setErro(t(semColuna ? 'portf.video_por_ativar' : 'portf.erro_video'));
        return;
      }
      recarregar();
    } catch (e) {
      if (subidos.length) await supabase.storage.from('portfolio').remove(subidos);
      if (e instanceof VideoLongoErro) setErro(t('portf.video_longo'));
      else if (e instanceof VideoGrandeErro) setErro(t('portf.video_grande'));
      else setErro(t('portf.erro_video'));
    } finally {
      setAProcessar(false);
    }
  }

  async function remover(it: Item) {
    setErro(null);
    // Otimista: tira já da lista; depois apaga na BD + Storage (capa incluída).
    setItens((xs) => xs.filter((x) => x.id !== it.id));
    await supabase.from('portfolio_itens').delete().eq('id', it.id);
    await supabase.storage
      .from('portfolio')
      .remove([it.ficheiro, ...(it.capa_path ? [it.capa_path] : [])]);
  }

  return (
    <View style={styles.bloco}>
      <Text style={styles.rotulo}>{t('portf.rotulo')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {itens.map((it) => (
          <View key={it.id}>
            {it.tipo === 'video' ? (
              <MiniaturaVideo item={it} onAbrir={setVideoAberto} />
            ) : (
              <Image source={{ uri: urlPublico(it.ficheiro) }} style={styles.foto} />
            )}
            <Pressable style={styles.remover} onPress={() => remover(it)} hitSlop={8}>
              <Text style={styles.removerTxt}>×</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          style={[styles.foto, styles.adicionar, aProcessar && styles.adicionarOcupado]}
          onPress={adicionar}
          disabled={aProcessar}
        >
          <Text style={styles.adicionarTxt}>{aProcessar ? '…' : '+'}</Text>
          <Text style={styles.adicionarSub}>
            {aProcessar ? t('portf.a_enviar') : t('portf.adicionar')}
          </Text>
        </Pressable>
        {/* O vídeo tem porta própria e a porta fecha ao terceiro — a guarda a
            sério vive na 059; aqui só se arruma a montra. */}
        {itens.filter((x) => x.tipo === 'video').length < VIDEOS_MAX && (
          <Pressable
            style={[styles.foto, styles.adicionar, aProcessar && styles.adicionarOcupado]}
            onPress={adicionarVideo}
            disabled={aProcessar}
          >
            <Text style={styles.adicionarTxt}>{aProcessar ? '…' : '▶'}</Text>
            <Text style={styles.adicionarSub}>
              {aProcessar ? t('portf.a_enviar') : t('portf.adicionar_video')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      {erro && <Text style={styles.erro}>{erro}</Text>}

      <Modal
        visible={!!videoAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setVideoAberto(null)}
      >
        <View style={styles.lightbox}>
          {videoAberto ? <LightboxVideo uri={videoAberto} /> : null}
          <Pressable style={styles.fecharVideo} onPress={() => setVideoAberto(null)} hitSlop={12}>
            <Text style={styles.fecharVideoTxt}>×</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const TAM = 120;
const styles = StyleSheet.create({
  bloco: { gap: Espaco.sm },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  // "Gerir ›" — mesma altura de voz do rótulo, tinta suave: a ferramenta não
  // compete com o trabalho que está ao lado.
  gerir: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  gerirSeta: { fontSize: 14 },
  // Convite de portefólio vazio — tracejado (é um lugar por preencher, não um
  // cartão a fingir conteúdo), na mesma linguagem do "+ Adicionar" do editor.
  convite: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Honra.cremeEscuro,
    borderRadius: Raio.md,
    backgroundColor: Honra.brancoCreme,
    paddingVertical: Espaco.md,
    paddingHorizontal: Espaco.md,
  },
  conviteTxt: { color: Honra.tinta, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  conviteSeta: { color: Honra.tintaSuave, fontSize: 18 },
  // alignItems 'center': na mesma fila convivem cartões altos (comprovados, com
  // moldura dourada e texto) e fotos soltas mais baixas. Encostadas ao topo
  // pareciam cair; centradas, a fila lê-se composta — a diferença de altura
  // passa a ritmo em vez de desalinho.
  fila: { gap: Espaco.sm, paddingVertical: Espaco.xs, alignItems: 'center' },
  foto: {
    width: TAM,
    height: TAM,
    borderRadius: Raio.md,
    backgroundColor: Honra.cremeEscuro,
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(18,33,27,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  lightboxImg: { width: '100%', height: '80%' },
  lightboxVideo: { width: '100%', height: '80%' },
  // Fechar do visor de vídeo: sempre à vista, fora da área dos controlos.
  fecharVideo: {
    position: 'absolute',
    top: Espaco.lg,
    right: Espaco.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(18,33,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fecharVideoTxt: { color: Honra.creme, fontSize: 22, fontWeight: '800', lineHeight: 24 },
  // Selo de play sobre a capa — tinta da casa, não verde: a montra é do
  // trabalho, a cor de ação fica para as ações.
  play: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(18,33,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTxt: { color: Honra.creme, fontSize: 13, lineHeight: 15, paddingLeft: 2 },
  duracao: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    color: Honra.creme,
    backgroundColor: 'rgba(18,33,27,0.72)',
    borderRadius: Raio.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  remover: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(18,33,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removerTxt: { color: Honra.creme, fontSize: 16, fontWeight: '800', lineHeight: 18 },
  adicionar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Honra.cremeEscuro,
    borderStyle: 'dashed',
    backgroundColor: Honra.brancoCreme,
    gap: 2,
  },
  adicionarOcupado: { opacity: 0.6 },
  adicionarTxt: { color: Honra.verde, fontSize: 28, fontWeight: '300', lineHeight: 30 },
  adicionarSub: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700' },
  erro: { color: Honra.erro, fontSize: 13 },
});
