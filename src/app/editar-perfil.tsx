import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PortfolioEditor } from '@/components/Portfolio';
import { Avatar, Botao, Campo, Carregar, Chip, Erro, SeletorCategorias } from '@/components/ui';
import { useT, type ChaveI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Editar perfil — pele Honra via `@/components/ui`:
 * `Campo` nos inputs, `Chip` no tipo e nas categorias, `Botao` a guardar.
 */
type Tipo = 'pessoa' | 'empresa' | 'equipa';
type Categoria = { id: string; nome: string; slug: string; parent_id: string | null };

const TIPOS: { valor: Tipo; chave: ChaveI18n }[] = [
  { valor: 'pessoa', chave: 'eperfil.tipo_pessoa' },
  { valor: 'empresa', chave: 'eperfil.tipo_empresa' },
  { valor: 'equipa', chave: 'eperfil.tipo_equipa' },
];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64 → bytes, sem dependências (o `atob` não existe em toda a parte). */
function base64ParaBytes(b64: string): Uint8Array {
  const limpo = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((limpo.length * 3) / 4 | 0);
  let p = 0;
  for (let i = 0; i < limpo.length; i += 4) {
    const n =
      (B64.indexOf(limpo[i]) << 18) |
      (B64.indexOf(limpo[i + 1]) << 12) |
      ((limpo[i + 2] ? B64.indexOf(limpo[i + 2]) : 0) << 6) |
      (limpo[i + 3] ? B64.indexOf(limpo[i + 3]) : 0);
    out[p++] = (n >> 16) & 255;
    if (limpo[i + 2]) out[p++] = (n >> 8) & 255;
    if (limpo[i + 3]) out[p++] = n & 255;
  }
  return out.subarray(0, p);
}

export default function EditarPerfil() {
  const { session } = useAuth();
  const { t } = useT();
  // ?foco=portefolio — quem vem do selo/da montra cai DIRETO no portefólio,
  // sem ter de descobrir que ele mora no fundo do formulário.
  const { foco } = useLocalSearchParams<{ foco?: string }>();
  const scroll = useRef<ScrollView>(null);
  const blocoPortefolio = useRef<View>(null);
  const jaRolou = useRef(false); // a pessoa mexeu — a partir daí, não mando eu

  /**
   * O foco é uma promessa: "abre-te no portefólio". Cumpri-la exige dois
   * caminhos, porque o `onLayout` do bloco NÃO dispara em web (react-native-
   * web) — só no nativo:
   *   · web    → o ref de uma View É o nó do DOM: `scrollIntoView`, exato.
   *   · nativo → a medida do `onLayout` + `scrollTo`.
   * E repete-se: o bloco CRESCE depois de aterrar (as fotos e os comprovados
   * chegam da rede), e uma tentativa única deixava o portefólio a meio caminho
   * — a promessa cumprida pela metade. A pessoa rolar à mão cala tudo: nada
   * pior que o ecrã a fugir por baixo dos dedos.
   */
  function focarPortefolio(y?: number, suave = true) {
    if (foco !== 'portefolio' || jaRolou.current) return;
    const alvo: any = blocoPortefolio.current;
    requestAnimationFrame(() => {
      if (jaRolou.current) return;
      if (typeof alvo?.scrollIntoView === 'function') {
        alvo.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
      } else if (y != null) {
        scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: suave });
      }
    });
  }

  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState('');
  const [cidade, setCidade] = useState('');
  const [nif, setNif] = useState('');
  const [tipo, setTipo] = useState<Tipo>('pessoa');

  // Foto de perfil: iniciais (fallback) + caminho da foto no bucket 'avatares'.
  const [iniciais, setIniciais] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [aFoto, setAFoto] = useState(false);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [selInicial, setSelInicial] = useState<Set<string>>(new Set());

  const [aCarregar, setACarregar] = useState(true);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Em web é este o gatilho (o `onLayout` do bloco não dispara lá): assim que
  // o formulário deixa de carregar, o portefólio já está no DOM.
  useEffect(() => {
    if (aCarregar) return;
    const marcas = [60, 300, 700, 1200, 1900, 2600].map((ms, i) =>
      setTimeout(() => focarPortefolio(undefined, i === 0), ms),
    );
    return () => marcas.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aCarregar, foco]);

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;

    async function carregar() {
      // Perfil do próprio — a montra vem da tabela; o NIF (confidencial, 065)
      // vem por RPC (a tabela perfis já não expõe nif a ninguém).
      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome, papel, cidade, tipo, avatar, avatar_url')
        .eq('id', uid)
        .single();
      if (perfil) {
        setNome(perfil.nome ?? '');
        setPapel(perfil.papel ?? '');
        setCidade(perfil.cidade ?? '');
        setTipo((perfil.tipo as Tipo) ?? 'pessoa');
        setIniciais((perfil as any).avatar ?? null);
        setAvatarUrl((perfil as any).avatar_url ?? null);
      }
      const { data: reservado } = await supabase
        .rpc('meu_perfil_reservado')
        .maybeSingle();
      setNif((reservado as { nif?: string | null } | null)?.nif ?? '');

      // Taxonomia (tolerante: se a tabela ainda não existir na BD, fica vazio)
      const { data: cats } = await supabase
        .from('categorias')
        .select('id, nome, slug, parent_id')
        .order('ordem')
        .order('nome');
      setCategorias(cats ?? []);

      // Categorias já escolhidas pelo utilizador
      const { data: minhas } = await supabase
        .from('perfil_categorias')
        .select('categoria_id')
        .eq('perfil_id', uid);
      const ids = new Set((minhas ?? []).map((m) => m.categoria_id as string));
      setSelecionadas(ids);
      setSelInicial(ids);

      setACarregar(false);
    }

    carregar();
  }, [session]);

  function alternar(id: string) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  // Escolhe e carrega a foto de perfil. O mesmo caminho serve web e nativo:
  // `fetch(uri).blob()` resolve tanto o file:// do telemóvel como o blob:/data:
  // que o picker devolve na web. Guarda-se o CAMINHO em `perfis.avatar_url`.
  async function escolherFoto() {
    if (!session) return;
    const uid = session.user.id;
    setErro(null);
    // O picker vive DENTRO do try: se a permissão for negada ou o picker
    // rebentar, o utilizador vê uma razão — nunca um silêncio.
    try {
      const escolha = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        // Um avatar é redondo: corta-se quadrado à cabeça, não se deforma depois.
        allowsEditing: true,
        aspect: [1, 1],
        // Os BYTES vêm daqui: no telemóvel, enviar um Blob ao Storage grava
        // ficheiros de 0 bytes (limitação conhecida do RN). Base64 → bytes
        // funciona igual na web e no nativo.
        base64: true,
      });
      if (escolha.canceled || !escolha.assets?.[0]) return;
      setAFoto(true);
      const asset = escolha.assets[0];
      const bytes = asset.base64
        ? base64ParaBytes(asset.base64)
        : new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
      if (!bytes.length) throw new Error('foto vazia');
      const tipo = asset.mimeType || 'image/jpeg';
      const ext = (tipo.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const caminho = `${uid}/${Date.now()}.${ext}`;
      const { error: erroUp } = await supabase.storage
        .from('avatares')
        .upload(caminho, bytes, { contentType: tipo, upsert: true });
      if (erroUp) throw erroUp;
      const { error: erroPerfil } = await supabase
        .from('perfis')
        .update({ avatar_url: caminho })
        .eq('id', uid);
      if (erroPerfil) throw erroPerfil;
      // A foto antiga deixa de servir — não fica lixo no balde.
      const anterior = avatarUrl;
      setAvatarUrl(caminho);
      if (anterior && anterior !== caminho) {
        supabase.storage
          .from('avatares')
          .remove([anterior])
          .catch(() => {});
      }
    } catch {
      setErro(t('eperfil.erro_foto'));
    } finally {
      setAFoto(false);
    }
  }

  async function guardar() {
    if (!session) return;
    const uid = session.user.id;
    setErro(null);
    setAGuardar(true);

    // 1) Atualiza os campos do perfil
    const { error: erroPerfil } = await supabase
      .from('perfis')
      .update({
        nome: nome.trim() || null,
        papel: papel.trim() || null,
        cidade: cidade.trim() || null,
        tipo,
        // NIF só faz sentido para empresa; nos outros casos limpa
        nif: tipo === 'empresa' ? nif.trim() || null : null,
      })
      .eq('id', uid);

    if (erroPerfil) {
      // Erro cru do PostgREST nunca chega ao ecrã (063 · #15) — frase digna.
      setErro(t('erro.guardar_perfil'));
      setAGuardar(false);
      return;
    }

    // 2) Sincroniza as categorias (apaga as removidas, insere as novas)
    const aRemover = [...selInicial].filter((id) => !selecionadas.has(id));
    const aInserir = [...selecionadas].filter((id) => !selInicial.has(id));

    if (aRemover.length > 0) {
      const { error: erroRem } = await supabase
        .from('perfil_categorias')
        .delete()
        .eq('perfil_id', uid)
        .in('categoria_id', aRemover);
      if (erroRem) {
        setErro(t('eperfil.erro_categorias'));
        setAGuardar(false);
        return;
      }
    }
    if (aInserir.length > 0) {
      const { error: erroIns } = await supabase
        .from('perfil_categorias')
        .insert(aInserir.map((categoria_id) => ({ perfil_id: uid, categoria_id })));
      if (erroIns) {
        setErro(t('eperfil.erro_categorias'));
        setAGuardar(false);
        return;
      }
    }

    setAGuardar(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>

      {aCarregar ? (
        <Carregar />
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.corpo}
          onScrollBeginDrag={() => {
            jaRolou.current = true;
          }}
        >
          <Text style={styles.titulo}>{t('eperfil.titulo')}</Text>

          {/* FOTO DE PERFIL — mostra a atual (ou as iniciais) e deixa trocá-la. */}
          <View style={styles.foto}>
            <Avatar
              iniciais={iniciais}
              imagem={
                avatarUrl
                  ? supabase.storage.from('avatares').getPublicUrl(avatarUrl).data.publicUrl
                  : null
              }
              tamanho={88}
            />
            <Botao
              titulo={avatarUrl ? t('eperfil.trocar_foto') : t('eperfil.adicionar_foto')}
              variante="secundario"
              onPress={escolherFoto}
              aCarregar={aFoto}
              style={styles.fotoBotao}
            />
          </View>

          <Text style={styles.rotulo}>{t('eperfil.nome')}</Text>
          <Campo placeholder={t('eperfil.nome_ph')} value={nome} onChangeText={setNome} />

          <Text style={styles.rotulo}>{t('eperfil.funcao')}</Text>
          <Campo placeholder={t('eperfil.funcao_ph')} value={papel} onChangeText={setPapel} />

          <Text style={styles.rotulo}>{t('eperfil.cidade')}</Text>
          <Campo placeholder={t('eperfil.cidade_ph')} value={cidade} onChangeText={setCidade} />

          <Text style={styles.rotulo}>{t('eperfil.tipo')}</Text>
          <View style={styles.chips}>
            {TIPOS.map((opcao) => (
              <Chip
                key={opcao.valor}
                texto={t(opcao.chave)}
                ativo={tipo === opcao.valor}
                onPress={() => setTipo(opcao.valor)}
              />
            ))}
          </View>

          {tipo === 'empresa' && (
            <>
              <Text style={styles.rotulo}>{t('eperfil.nif')}</Text>
              <Campo
                placeholder={t('eperfil.nif_ph')}
                value={nif}
                onChangeText={setNif}
                keyboardType="number-pad"
              />
            </>
          )}

          <Text style={styles.rotulo}>{t('eperfil.categorias')}</Text>
          {categorias.length === 0 ? (
            <Text style={styles.nota}>{t('eperfil.sem_categorias')}</Text>
          ) : (
            <SeletorCategorias
              categorias={categorias}
              selecionadas={selecionadas}
              onToggle={alternar}
            />
          )}

          {/* PORTEFÓLIO — a montra de trabalho (guarda-se logo ao adicionar/remover). */}
          <View
            ref={blocoPortefolio}
            style={styles.portefolio}
            onLayout={(e) => focarPortefolio(e.nativeEvent.layout.y)}
          >
            <PortfolioEditor />
            {/* Trabalho comprovado: escolher os negócios honrados que entram no
                portefólio (é aqui que o portefólio se gere — não no Início). */}
            <Pressable
              style={styles.comprovadoLinha}
              onPress={() => router.push('/apresentar-trabalho')}
            >
              <Text style={styles.comprovadoTxt}>{t('eperfil.comprovado')}</Text>
              <Text style={styles.comprovadoSeta}>›</Text>
            </Pressable>
          </View>

          {erro && <Erro texto={erro} />}

          <Botao titulo={t('eperfil.guardar')} onPress={guardar} aCarregar={aGuardar} style={styles.guardar} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta, marginBottom: Espaco.md },
  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.md,
  },
  foto: { alignItems: 'center', gap: Espaco.md, marginBottom: Espaco.md },
  fotoBotao: { alignSelf: 'center', paddingHorizontal: Espaco.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm, marginTop: Espaco.xs },
  nota: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19, marginTop: Espaco.xs },
  portefolio: { marginTop: Espaco.lg },
  // A linha do trabalho comprovado — porta discreta, não botão a gritar:
  // gerir o portefólio inclui escolher a prova que entra nele.
  comprovadoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Espaco.sm,
    paddingVertical: Espaco.sm,
    paddingHorizontal: Espaco.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    borderRadius: Raio.md,
    backgroundColor: Honra.brancoCreme,
  },
  comprovadoTxt: { color: Honra.tinta, fontSize: 14, fontWeight: '600' },
  comprovadoSeta: { color: Honra.tintaSuave, fontSize: 18 },
  guardar: { marginTop: Espaco.xl },
});
