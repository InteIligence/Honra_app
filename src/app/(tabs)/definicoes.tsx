import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Botao, Campo, Cartao, Chip, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { mensagemAuth } from '@/lib/erros';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';
import { CATALOGO_VIRTUDES, MAX_VIRTUDES, useVirtudes } from '@/lib/virtudes';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

/**
 * DEFINIÇÕES — o painel do dono da conta. Produto mundial: completo e digno,
 * não um placeholder. Toda a pele vem de `@/components/ui` + `@/theme/honra`
 * (DESIGN-SYSTEM.md §5). Verde só onde AVANÇA; nada é simulado — cada ação ou
 * está mesmo ligada, ou degrada com HONESTIDADE (nunca fingir sucesso).
 *
 * Tolerância a BD incompleta: as tabelas `preferencias_notificacao` (018) e
 * `pedidos_conta` (019) podem ainda não estar aplicadas — tudo apanha o erro
 * e degrada com elegância (guarda local / mensagem honesta).
 */

type IconeFeather = ComponentProps<typeof Feather>['name'];
type NotifPrefs = { avisos_negocios: boolean; lembretes_prazo: boolean; novidades: boolean };
const NOTIF_PADRAO: NotifPrefs = { avisos_negocios: true, lembretes_prazo: true, novidades: true };

// —— Linha de ação (dentro de um Cartão): ícone + título/subtítulo + chevron.
function LinhaAcao({
  icone,
  titulo,
  subtitulo,
  aoTocar,
  tom = 'normal',
}: {
  icone: IconeFeather;
  titulo: string;
  subtitulo?: string;
  aoTocar: () => void;
  tom?: 'normal' | 'perigo';
}) {
  const perigo = tom === 'perigo';
  return (
    <Cartao onPress={aoTocar}>
      <View style={styles.linha}>
        <Feather name={icone} size={18} color={perigo ? Honra.erro : Honra.tinta} />
        <View style={styles.linhaTextos}>
          <Text style={[styles.linhaTitulo, perigo && styles.linhaTituloPerigo]}>{titulo}</Text>
          {subtitulo ? <Text style={styles.linhaSub}>{subtitulo}</Text> : null}
        </View>
        <Feather name="chevron-right" size={18} color={Honra.tintaSuave} />
      </View>
    </Cartao>
  );
}

// —— Linha com interruptor (preferência ligada/desligada).
function LinhaToggle({
  titulo,
  subtitulo,
  valor,
  aoMudar,
}: {
  titulo: string;
  subtitulo?: string;
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <Cartao>
      <View style={styles.linha}>
        <View style={styles.linhaTextos}>
          <Text style={styles.linhaTitulo}>{titulo}</Text>
          {subtitulo ? <Text style={styles.linhaSub}>{subtitulo}</Text> : null}
        </View>
        <Switch
          value={valor}
          onValueChange={aoMudar}
          trackColor={{ false: Honra.cremeEscuro, true: Honra.verde }}
          thumbColor={Honra.brancoCreme}
          ios_backgroundColor={Honra.cremeEscuro}
        />
      </View>
    </Cartao>
  );
}

export default function DefinicoesScreen() {
  const { session, sair } = useAuth();
  const { t, idioma, mudarIdioma } = useT();
  const { codigos: virtudes, alternar: alternarVirtude } = useVirtudes();
  const uid = session?.user.id;
  const email = session?.user.email ?? '—';
  // SECRETÁRIA: as definições numa coluna centrada confortável (o padrão dos
  // ajustes em desktop — macOS/GitHub; não o fio de telemóvel esticado).
  const { width } = useWindowDimensions();
  const largo = width >= LARGURA_SECRETARIA;

  // CONTA — mudar palavra-passe (painel expansível).
  const [mudarPassAberto, setMudarPassAberto] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [aGuardarPass, setAGuardarPass] = useState(false);
  const [erroPass, setErroPass] = useState<string | null>(null);
  const [okPass, setOkPass] = useState(false);

  // IDIOMA — vive no I18nProvider (a mesma chave 'honra.idioma' de sempre);
  // mudar aqui muda a app INTEIRA de imediato.

  // NOTIFICAÇÕES — preferências por-utilizador.
  const [notif, setNotif] = useState<NotifPrefs>(NOTIF_PADRAO);

  // PRIVACIDADE E DADOS (RGPD).
  const [msgPrivacidade, setMsgPrivacidade] = useState<string | null>(null);
  const [eliminarAberto, setEliminarAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [aEliminar, setAEliminar] = useState(false);
  const [erroEliminar, setErroEliminar] = useState<string | null>(null);
  const [msgEliminar, setMsgEliminar] = useState<string | null>(null);

  // APOIO.
  const [msgApoio, setMsgApoio] = useState<string | null>(null);

  // ADMIN — a área de revisão só aparece a quem é admin (o Vítor, ao início).
  const [souAdmin, setSouAdmin] = useState(false);

  // Carrega as preferências guardadas (notificações da BD ou, se a
  // tabela ainda não existir, do armazenamento local).
  useEffect(() => {
    let vivo = true;

    (async () => {
      if (!uid) return;

      // Admin? Via RPC (064) — sem puxar a coluna is_admin; fail-closed.
      supabase.rpc('sou_admin').then(({ data }) => {
        if (vivo) setSouAdmin(data === true);
      });

      // Notificações — tenta a tabela (fonte de verdade quando existir).
      const { data, error } = await supabase
        .from('preferencias_notificacao')
        .select('avisos_negocios, lembretes_prazo, novidades')
        .eq('perfil_id', uid)
        .maybeSingle();
      if (!vivo) return;

      const linha = data as Partial<NotifPrefs> | null;
      if (!error && linha) {
        setNotif({
          avisos_negocios: linha.avisos_negocios ?? true,
          lembretes_prazo: linha.lembretes_prazo ?? true,
          novidades: linha.novidades ?? true,
        });
        return;
      }

      // Tabela ainda não aplicada (migração 018) — lê a escolha local, se houver.
      try {
        const bruto = await AsyncStorage.getItem('honra.notif');
        if (vivo && bruto) {
          const guardadas = JSON.parse(bruto) as Partial<NotifPrefs>;
          setNotif({ ...NOTIF_PADRAO, ...guardadas });
        }
      } catch {
        // sem persistência — mantém os valores por omissão
      }
    })();

    return () => {
      vivo = false;
    };
  }, [uid]);

  async function alternarNotif(chave: keyof NotifPrefs, valor: boolean) {
    const proximo = { ...notif, [chave]: valor };
    setNotif(proximo); // otimista — o interruptor nunca "hesita"
    if (!uid) return;
    // Fonte de verdade: a tabela por-utilizador (upsert na PK perfil_id).
    const { error } = await supabase
      .from('preferencias_notificacao')
      .upsert({ perfil_id: uid, ...proximo, atualizado_em: new Date().toISOString() });
    if (error) {
      // Migração 018 ainda não aplicada — degrada com elegância: guarda local.
      try {
        await AsyncStorage.setItem('honra.notif', JSON.stringify(proximo));
      } catch {
        // sem persistência disponível — a escolha vive só nesta sessão
      }
    }
  }

  async function guardarPass() {
    setErroPass(null);
    setOkPass(false);
    if (pass1.length < 8) {
      setErroPass(t('defs.erro_pass_min'));
      return;
    }
    if (pass1 !== pass2) {
      setErroPass(t('defs.erro_pass_dif'));
      return;
    }
    setAGuardarPass(true);
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    setAGuardarPass(false);
    if (error) {
      setErroPass(mensagemAuth(error, t, 'defs.erro_pass'));
      return;
    }
    // Sucesso REAL — nunca fingido.
    setOkPass(true);
    setPass1('');
    setPass2('');
  }

  // Entrega o JSON: na web faz download; no nativo abre a folha de partilha.
  function entregarJSON(nome: string, obj: unknown) {
    const texto = JSON.stringify(obj, null, 2);
    if (Platform.OS === 'web') {
      const blob = new Blob([texto], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Share.share({ message: texto }).catch(() => {});
    }
  }

  // RGPD — portabilidade: pede os dados ao servidor e entrega-os já (download).
  async function exportarDados() {
    setMsgPrivacidade(t('defs.exportar_prep'));
    const { data, error } = await supabase.functions.invoke('exportar-dados');
    if (error || !data) {
      setMsgPrivacidade((await razaoDoServidor(error)) ?? t('defs.exportar_erro'));
      return;
    }
    entregarJSON('honra-os-meus-dados.json', data);
    setMsgPrivacidade(t('defs.exportar_ok'));
  }

  // RGPD — direito a ser esquecido: elimina a conta A SÉRIO (cascata) e sai.
  // A palavra de confirmação acompanha o idioma (PT "ELIMINAR" / EN "DELETE").
  const palavraEliminar = t('defs.palavra_eliminar');

  async function confirmarEliminar() {
    setErroEliminar(null);
    if (confirmacao.trim().toUpperCase() !== palavraEliminar) {
      setErroEliminar(t('defs.modal_erro_confirma', { palavra: palavraEliminar }));
      return;
    }
    setAEliminar(true);
    const { data, error } = await supabase.functions.invoke('eliminar-conta');
    if (error || !(data as { eliminado?: boolean })?.eliminado) {
      setAEliminar(false);
      // Apagar a conta é irreversível: se falha, a pessoa TEM de saber porquê.
      setErroEliminar((await razaoDoServidor(error)) ?? t('defs.modal_erro'));
      return;
    }
    // Conta apagada → termina a sessão e volta ao login.
    await sair().catch(() => {});
    router.replace('/login');
  }

  function abrirLegal(pagina: 'termos' | 'privacidade') {
    // Por agora abre a página no browser; troca por ecrã próprio quando existir.
    WebBrowser.openBrowserAsync(`https://honraapp.com/${pagina}`);
  }

  async function abrirApoio() {
    setMsgApoio(null);
    const url = 'mailto:apoio@honraapp.com';
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // cai para a mensagem com o contacto
    }
    setMsgApoio(t('defs.apoio_msg'));
  }

  async function terminar() {
    await sair();
    router.replace('/login');
  }

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={[styles.corpo, largo && styles.corpoLargo]}>
        <Text style={styles.titulo}>{t('defs.titulo')}</Text>

        {/* ===== CONTA ===== */}
        <Text style={styles.rotulo}>{t('defs.conta')}</Text>
        <Cartao>
          <Text style={styles.linhaSub}>{t('defs.email')}</Text>
          <Text style={styles.valor}>{email}</Text>
        </Cartao>
        <LinhaAcao
          icone="lock"
          titulo={t('defs.mudar_pass')}
          aoTocar={() => {
            setErroPass(null);
            setOkPass(false);
            setMudarPassAberto((a) => !a);
          }}
        />
        {mudarPassAberto ? (
          <Cartao style={styles.formPass}>
            <Text style={styles.rotulo}>{t('defs.nova_pass')}</Text>
            <Campo
              placeholder={t('defs.pass_min_ph')}
              secureTextEntry
              autoCapitalize="none"
              value={pass1}
              onChangeText={setPass1}
            />
            <Text style={styles.rotulo}>{t('defs.confirmar')}</Text>
            <Campo
              placeholder={t('defs.repete_ph')}
              secureTextEntry
              autoCapitalize="none"
              value={pass2}
              onChangeText={setPass2}
            />
            {erroPass ? <Erro texto={erroPass} /> : null}
            {okPass ? <Text style={styles.sucesso}>{t('defs.pass_atualizada')}</Text> : null}
            <Botao
              titulo={t('defs.guardar_pass')}
              onPress={guardarPass}
              aCarregar={aGuardarPass}
              desativado={!pass1 || !pass2}
            />
          </Cartao>
        ) : null}

        {/* ===== IDIOMA ===== */}
        <Text style={styles.rotulo}>{t('defs.idioma')}</Text>
        <View style={styles.chips}>
          <Chip texto="Português" ativo={idioma === 'pt'} onPress={() => mudarIdioma('pt')} />
          <Chip texto="English" ativo={idioma === 'en'} onPress={() => mudarIdioma('en')} />
        </View>
        <Text style={styles.nota}>{t('defs.idioma_nota')}</Text>

        {/* ===== HONRA CARD — virtudes (opcionais, livres, escolhidas pelo próprio) ===== */}
        <Text style={styles.rotulo}>{t('defs.card')}</Text>
        <Text style={styles.cardTitulo}>{t('defs.virtudes_titulo')}</Text>
        <Text style={styles.nota}>{t('defs.virtudes_ajuda')}</Text>
        <View style={styles.chips}>
          {CATALOGO_VIRTUDES.map((v) => (
            <Chip
              key={v.codigo}
              texto={`${v.codigo} · ${t(v.chaveNome)}`}
              ativo={virtudes.includes(v.codigo)}
              onPress={() => alternarVirtude(v.codigo)}
            />
          ))}
        </View>
        <Text style={styles.contador}>
          {virtudes.length >= MAX_VIRTUDES
            ? t('defs.virtudes_cheio')
            : t('defs.virtudes_contador', { n: virtudes.length })}
        </Text>

        {/* ===== NOTIFICAÇÕES ===== */}
        <Text style={styles.rotulo}>{t('defs.notificacoes')}</Text>
        <LinhaToggle
          titulo={t('defs.notif_negocios')}
          subtitulo={t('defs.notif_negocios_sub')}
          valor={notif.avisos_negocios}
          aoMudar={(v) => alternarNotif('avisos_negocios', v)}
        />
        <LinhaToggle
          titulo={t('defs.notif_prazo')}
          subtitulo={t('defs.notif_prazo_sub')}
          valor={notif.lembretes_prazo}
          aoMudar={(v) => alternarNotif('lembretes_prazo', v)}
        />
        <LinhaToggle
          titulo={t('defs.notif_novidades')}
          subtitulo={t('defs.notif_novidades_sub')}
          valor={notif.novidades}
          aoMudar={(v) => alternarNotif('novidades', v)}
        />

        {/* ===== PAGAMENTOS ===== */}
        <Text style={styles.rotulo}>{t('defs.pagamentos')}</Text>
        <LinhaAcao
          icone="credit-card"
          titulo={t('defs.ativar_pagamentos')}
          subtitulo={t('defs.ativar_pagamentos_sub')}
          aoTocar={() => router.push('/ativar-pagamentos' as Href)}
        />

        {/* ===== PRIVACIDADE E DADOS (RGPD) ===== */}
        <Text style={styles.rotulo}>{t('defs.privacidade')}</Text>
        <LinhaAcao
          icone="download"
          titulo={t('defs.exportar')}
          subtitulo={t('defs.exportar_sub')}
          aoTocar={exportarDados}
        />
        <LinhaAcao
          icone="trash-2"
          titulo={t('defs.eliminar')}
          subtitulo={t('defs.eliminar_sub')}
          tom="perigo"
          aoTocar={() => {
            setConfirmacao('');
            setErroEliminar(null);
            setMsgEliminar(null);
            setEliminarAberto(true);
          }}
        />
        {msgPrivacidade ? <Text style={styles.info}>{msgPrivacidade}</Text> : null}

        {/* ===== LEGAL ===== */}
        <Text style={styles.rotulo}>{t('defs.legal')}</Text>
        <LinhaAcao
          icone="file-text"
          titulo={t('defs.termos')}
          aoTocar={() => abrirLegal('termos')}
        />
        <LinhaAcao
          icone="shield"
          titulo={t('defs.politica')}
          aoTocar={() => abrirLegal('privacidade')}
        />

        {/* ===== APOIO ===== */}
        <Text style={styles.rotulo}>{t('defs.apoio')}</Text>
        <LinhaAcao
          icone="help-circle"
          titulo={t('defs.ajuda')}
          subtitulo="apoio@honraapp.com"
          aoTocar={abrirApoio}
        />
        {msgApoio ? <Text style={styles.info}>{msgApoio}</Text> : null}

        {/* ===== ADMIN — só visível a administradores. ===== */}
        {souAdmin ? (
          <>
            <Text style={styles.rotulo}>{t('defs.admin')}</Text>
            <LinhaAcao
              icone="award"
              titulo={t('defs.rever_profissoes')}
              subtitulo={t('defs.rever_profissoes_sub')}
              aoTocar={() => router.push('/revisao-profissao' as Href)}
            />
            <LinhaAcao
              icone="shield"
              titulo={t('defs.rever_disputas')}
              subtitulo={t('defs.rever_disputas_sub')}
              aoTocar={() => router.push('/revisao-disputas' as Href)}
            />
          </>
        ) : null}

        {/* ===== TERMINAR SESSÃO — discreto, não "avança" nada. ===== */}
        <Botao
          titulo={t('defs.terminar_sessao')}
          variante="secundario"
          onPress={terminar}
          style={styles.sair}
        />
      </ScrollView>

      {/* ===== MODAL: eliminar conta — dupla confirmação séria ===== */}
      <Modal
        visible={eliminarAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setEliminarAberto(false)}
      >
        <View style={styles.veu}>
          <View style={styles.carta}>
            <Text style={styles.cartaTitulo}>{t('defs.modal_titulo')}</Text>
            <Text style={styles.cartaTexto}>{t('defs.modal_corpo')}</Text>
            <Text style={styles.rotulo}>
              {t('defs.modal_rotulo', { palavra: palavraEliminar })}
            </Text>
            <Campo
              placeholder={palavraEliminar}
              value={confirmacao}
              onChangeText={setConfirmacao}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {erroEliminar ? <Erro texto={erroEliminar} /> : null}
            {msgEliminar ? <Text style={styles.info}>{msgEliminar}</Text> : null}
            {msgEliminar ? (
              <Botao
                titulo={t('comum.fechar')}
                variante="secundario"
                onPress={() => setEliminarAberto(false)}
              />
            ) : (
              <>
                <Botao
                  titulo={t('defs.modal_botao')}
                  onPress={confirmarEliminar}
                  aCarregar={aEliminar}
                  desativado={confirmacao.trim().toUpperCase() !== palavraEliminar}
                  style={styles.botaoPerigo}
                />
                <Pressable
                  style={styles.cancelar}
                  onPress={() => setEliminarAberto(false)}
                  hitSlop={8}
                >
                  <Text style={styles.cancelarTxt}>{t('comum.cancelar')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  corpo: { padding: Espaco.xl, gap: Espaco.sm, paddingBottom: Espaco.xxl },
  corpoLargo: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta, marginBottom: Espaco.md },

  rotulo: {
    color: Honra.tintaSuave,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: Espaco.md,
  },
  nota: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 19, marginTop: Espaco.xs },
  cardTitulo: { color: Honra.tinta, fontSize: 16, fontWeight: '700', marginTop: Espaco.xs },
  contador: { color: Honra.verde, fontSize: 12, fontWeight: '700', marginTop: Espaco.xs },
  info: { color: Honra.tinta, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: Espaco.xs },
  sucesso: { color: Honra.verde, fontSize: 14, fontWeight: '700' },
  valor: { color: Honra.tinta, fontSize: 16, fontWeight: '600', marginTop: 2 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm, marginTop: Espaco.xs },

  // Linha de definição (dentro de um Cartão).
  linha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.md },
  linhaTextos: { flex: 1, gap: 2 },
  linhaTitulo: { color: Honra.tinta, fontSize: 16, fontWeight: '600' },
  linhaTituloPerigo: { color: Honra.erro },
  linhaSub: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 18 },

  formPass: { gap: Espaco.sm, marginTop: Espaco.xs },
  sair: { marginTop: Espaco.xl, borderColor: Honra.cremeEscuro, opacity: 0.9 },

  // Modal (mesma pele do véu/carta do CampoData).
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
    gap: Espaco.sm,
  },
  cartaTitulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  cartaTexto: { fontSize: 14, lineHeight: 20, color: Honra.tintaSuave },
  botaoPerigo: { backgroundColor: Honra.erro, marginTop: Espaco.xs },
  cancelar: { alignItems: 'center', paddingVertical: Espaco.sm },
  cancelarTxt: { color: Honra.tintaSuave, fontSize: 15, fontWeight: '700' },
});
