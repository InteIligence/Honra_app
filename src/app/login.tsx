import { Link, router, useLocalSearchParams, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Botao, Campo, Erro } from '@/components/ui';
import { mensagemAuth } from '@/lib/erros';
import { useT } from '@/i18n';
import { supabase, temConfig } from '@/lib/supabase';
import { Espaco, Honra, LARGURA_SECRETARIA, Raio } from '@/theme/honra';

/**
 * Porta de entrada do Honra — sóbria, credencial.
 * Selo "H" com anel dourado (a marca), filete dourado discreto,
 * campos e botão da biblioteca `@/components/ui`.
 */
export default function Login() {
  const { t } = useT();
  // Vinda de "redefinir-palavra-passe": mostra a confirmação de sucesso.
  const { redefinida } = useLocalSearchParams<{ redefinida?: string }>();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  // Enter salta do email para a palavra-passe, e da palavra-passe entra.
  const passRef = useRef<TextInput>(null);
  // No átrio (web, secretária) o painel da marca já traz a inscrição — não repetir.
  const { width } = useWindowDimensions();
  const noAtrio = Platform.OS === 'web' && width >= LARGURA_SECRETARIA;

  async function entrar() {
    setErro(null);
    if (!temConfig) {
      setErro(t('entrada.erro_config'));
      return;
    }
    setACarregar(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setACarregar(false);
    if (error) {
      setErro(mensagemAuth(error, t, 'erro.credenciais'));
      return;
    }
    router.replace('/(tabs)/inicio');
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
          <Text style={styles.titulo}>{t('login.titulo')}</Text>
          {!noAtrio && <Text style={styles.sub}>{t('login.sub')}</Text>}
          <View style={styles.filete} />
        </View>

        {/* ===== FORMULÁRIO ===== */}
        <View style={styles.formulario}>
          {redefinida === '1' && (
            <View style={styles.sucesso}>
              <Text style={styles.sucessoTxt}>{t('login.redefinida')}</Text>
            </View>
          )}

          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('entrada.email')}</Text>
            <Campo
              placeholder={t('entrada.email_ph')}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              onSubmitEditing={() => passRef.current?.focus()}
            />
          </View>

          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('entrada.pass')}</Text>
            <Campo
              ref={passRef}
              placeholder={t('login.pass_ph')}
              secureTextEntry
              value={pass}
              onChangeText={setPass}
              returnKeyType="go"
              onSubmitEditing={entrar}
            />
          </View>

          {erro && <Erro texto={erro} />}

          <Botao
            titulo={t('login.entrar')}
            onPress={entrar}
            aCarregar={aCarregar}
            style={styles.botao}
          />

          <Text
            style={styles.esqueci}
            onPress={() => router.push('/recuperar-palavra-passe' as Href)}
          >
            {t('login.esqueci')}
          </Text>
        </View>

        <Link href="/registo" style={styles.link}>
          {t('login.sem_conta')}
          <Text style={styles.linkForte}>{t('login.criar_conta')}</Text>
        </Link>
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
  esqueci: {
    textAlign: 'center',
    color: Honra.tintaSuave,
    fontSize: 13,
    marginTop: Espaco.xs,
  },
  sucesso: {
    backgroundColor: Honra.verdeSuave,
    borderRadius: Raio.md,
    paddingVertical: Espaco.sm,
    paddingHorizontal: Espaco.md,
  },
  sucessoTxt: { color: Honra.verde, fontSize: 14, fontWeight: '600', textAlign: 'center' },

  link: { textAlign: 'center', color: Honra.tintaSuave, marginTop: Espaco.lg, fontSize: 14 },
  linkForte: { color: Honra.verde, fontWeight: '700' },
});
