import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Carregar, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { mensagemAuth } from '@/lib/erros';
import { supabase, temConfig } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

type Estado = 'a_preparar' | 'pronto' | 'invalido';

/**
 * Uma sessão só serve para redefinir a palavra-passe se tiver NASCIDO do link
 * de recuperação (o token traz amr=recovery). Sem esta guarda, uma sessão
 * normal esquecida no browser fazia o updateUser mudar a palavra-passe da
 * conta ERRADA em silêncio — bug real apanhado pelo Vítor a 15/07.
 */
function sessaoDeRecuperacao(accessToken: string): boolean {
  try {
    const bruto = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(globalThis.atob(bruto));
    const metodos = Array.isArray(payload?.amr)
      ? payload.amr.map((m: { method?: string }) => m?.method)
      : [];
    return metodos.includes('recovery') || metodos.includes('otp') || metodos.includes('magiclink');
  } catch {
    return false; // na dúvida, nunca deixar mudar a palavra-passe de uma sessão qualquer
  }
}

/** Extrai tokens/erros do link, venham eles no fragmento (#) ou na query (?). */
function extrairDaUrl(url: string | null | undefined) {
  const s = url ?? '';
  const hashIndex = s.indexOf('#');
  const queryIndex = s.indexOf('?');
  const frag = hashIndex >= 0 ? s.slice(hashIndex + 1) : '';
  const query =
    queryIndex >= 0 ? s.slice(queryIndex + 1, hashIndex > queryIndex ? hashIndex : undefined) : '';
  const p = new URLSearchParams(frag);
  const q = new URLSearchParams(query);
  const ler = (k: string) => p.get(k) ?? q.get(k) ?? undefined;
  return {
    accessToken: ler('access_token'),
    refreshToken: ler('refresh_token'),
    code: ler('code'),
    erroDesc: ler('error_description') ?? ler('error'),
  };
}

/**
 * Redefinir palavra-passe — o destino do link do email.
 * O Supabase traz a sessão de recuperação no próprio link; como o cliente
 * está com `detectSessionInUrl: false`, estabelecemo-la aqui à mão
 * (setSession) e só então deixamos definir a nova palavra-passe.
 * Nunca fingimos sucesso: se o link não valer, dizemo-lo.
 */
export default function RedefinirPalavraPasse() {
  const { t } = useT();
  const [estado, setEstado] = useState<Estado>('a_preparar');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  // Nome da conta cuja palavra-passe vai mudar — à vista, para nunca haver
  // surpresas sobre QUEM se está a alterar (mostrar, não dizer).
  const [nomeConta, setNomeConta] = useState<string | null>(null);

  useEffect(() => {
    if (estado !== 'pronto') return;
    let vivo = true;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase
        .from('perfis')
        .select('nome')
        .eq('id', uid)
        .single()
        .then(({ data: p }) => {
          if (vivo && p?.nome) setNomeConta(p.nome);
        });
    });
    return () => {
      vivo = false;
    };
  }, [estado]);

  useEffect(() => {
    let vivo = true;

    function limparUrl() {
      // Não deixamos os tokens à vista na barra de endereço (só web).
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    async function preparar() {
      if (!temConfig) {
        if (vivo) setEstado('invalido');
        return;
      }

      const url =
        Platform.OS === 'web'
          ? typeof window !== 'undefined'
            ? window.location.href
            : null
          : await Linking.getInitialURL();

      const { accessToken, refreshToken, code, erroDesc } = extrairDaUrl(url);

      if (erroDesc) {
        if (vivo) setEstado('invalido');
        return;
      }

      // Fluxo implícito (padrão): os tokens vêm no fragmento do link.
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        limparUrl();
        if (vivo) setEstado(error ? 'invalido' : 'pronto');
        return;
      }

      // Fluxo PKCE (se algum dia for ligado): troca-se o código pela sessão.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        limparUrl();
        if (vivo) setEstado(error ? 'invalido' : 'pronto');
        return;
      }

      // Sem tokens no link — SÓ aceitamos uma sessão já ativa se ela for mesmo
      // de recuperação. Uma sessão normal aqui seria a conta errada (ver
      // sessaoDeRecuperacao acima).
      const { data } = await supabase.auth.getSession();
      const podeRedefinir = !!data.session && sessaoDeRecuperacao(data.session.access_token);
      if (vivo) setEstado(podeRedefinir ? 'pronto' : 'invalido');
    }

    preparar();
    return () => {
      vivo = false;
    };
  }, []);

  async function guardar() {
    setErro(null);
    if (pass1.length < 8) {
      setErro(t('defs.erro_pass_min'));
      return;
    }
    if (pass1 !== pass2) {
      setErro(t('defs.erro_pass_dif'));
      return;
    }
    setAGuardar(true);
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    if (error) {
      setAGuardar(false);
      setErro(mensagemAuth(error, t, 'redefinir.erro_atualizar'));
      return;
    }
    // Sucesso REAL — nunca fingido. Fechamos a sessão de recuperação para que
    // a pessoa entre de propósito com a nova palavra-passe.
    await supabase.auth.signOut().catch(() => {});
    router.replace('/login?redefinida=1' as Href);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.fundo}
    >
      <View style={styles.conteudo}>
        {/* ===== MARCA — o selo, calmo e nobre ===== */}
        <View style={styles.cabeca}>
          <View style={styles.selo}>
            <Text style={styles.seloTxt}>H</Text>
          </View>
          <Text style={styles.titulo}>{t('redefinir.titulo')}</Text>
          <Text style={styles.sub}>
            {estado === 'pronto' && nomeConta
              ? t('redefinir.sub_conta', { nome: nomeConta })
              : t('redefinir.sub')}
          </Text>
          <View style={styles.filete} />
        </View>

        {estado === 'a_preparar' && (
          <View style={styles.formulario}>
            <Carregar />
            <Text style={styles.nota}>{t('redefinir.a_validar')}</Text>
          </View>
        )}

        {estado === 'invalido' && (
          <View style={styles.formulario}>
            <View style={styles.aviso}>
              <Text style={styles.avisoTitulo}>{t('redefinir.invalido_titulo')}</Text>
              <Text style={styles.avisoTexto}>{t('redefinir.invalido_corpo')}</Text>
            </View>
            <Botao
              titulo={t('redefinir.pedir_novo')}
              onPress={() => router.replace('/recuperar-palavra-passe' as Href)}
              style={styles.botao}
            />
          </View>
        )}

        {estado === 'pronto' && (
          <View style={styles.formulario}>
            <View style={styles.bloco}>
              <Text style={styles.rotulo}>{t('defs.nova_pass')}</Text>
              <Campo
                placeholder={t('defs.pass_min_ph')}
                secureTextEntry
                value={pass1}
                onChangeText={setPass1}
              />
            </View>

            <View style={styles.bloco}>
              <Text style={styles.rotulo}>{t('defs.confirmar')}</Text>
              <Campo
                placeholder={t('defs.repete_ph')}
                secureTextEntry
                value={pass2}
                onChangeText={setPass2}
              />
            </View>

            {erro && <Erro texto={erro} />}

            <Botao
              titulo={t('redefinir.atualizar')}
              onPress={guardar}
              aCarregar={aGuardar}
              style={styles.botao}
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  conteudo: { flex: 1, justifyContent: 'center', paddingHorizontal: Espaco.xl },

  cabeca: { alignItems: 'center', marginBottom: Espaco.xl },
  selo: {
    width: 72,
    height: 72,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeEscuro,
    borderWidth: 2,
    borderColor: Honra.dourado,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Espaco.md,
  },
  seloTxt: { fontSize: 32, fontWeight: '800', color: Honra.creme },
  titulo: { fontSize: 26, fontWeight: '800', color: Honra.tinta, textAlign: 'center' },
  sub: { fontSize: 14, color: Honra.tintaSuave, textAlign: 'center', marginTop: Espaco.xs },
  filete: {
    width: 36,
    height: 2,
    borderRadius: Raio.pill,
    backgroundColor: Honra.dourado,
    marginTop: Espaco.md,
  },

  formulario: { gap: Espaco.md },
  bloco: { gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  botao: { marginTop: Espaco.sm },
  nota: { textAlign: 'center', color: Honra.tintaSuave, fontSize: 13, marginTop: Espaco.sm },

  aviso: {
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    borderRadius: Raio.md,
    padding: Espaco.md,
    gap: Espaco.xs,
  },
  avisoTitulo: { fontSize: 15, fontWeight: '700', color: Honra.tinta },
  avisoTexto: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20 },
});
