import { Link, router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';

import { Botao, Campo, Chip, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { mensagemAuth } from '@/lib/erros';
import { supabase, temConfig } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Registo — a mesma porta sóbria do login: selo "H" com anel dourado,
 * filete discreto, campos e botão da biblioteca `@/components/ui`.
 * Primeira pergunta da casa: quem és — profissional ou empresa. A escolha
 * grava `perfis.tipo` (o trigger de signup cria o perfil como 'pessoa';
 * se for empresa, corrige-se logo a seguir) e afina o onboarding.
 */
type Identidade = 'pessoa' | 'empresa';

export default function Registo() {
  const { t } = useT();
  const [identidade, setIdentidade] = useState<Identidade>('pessoa');
  const [nome, setNome] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  // Enter encadeia os campos e, no último, cria a conta.
  const handleRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);

  async function criar() {
    setErro(null);
    if (!temConfig) {
      setErro(t('entrada.erro_config'));
      return;
    }
    if (nome.trim().length < 2) {
      setErro(
        identidade === 'empresa' ? t('registo.erro_nome_empresa') : t('registo.erro_nome_pessoa'),
      );
      return;
    }
    // Nickname (@handle): busca e persona. 3-20 chars, minúsculas/números/._
    const h = handle.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(h)) {
      setErro(t('registo.erro_handle'));
      return;
    }
    setACarregar(true);
    const { data: livre } = await supabase.rpc('handle_disponivel', { p_handle: h });
    if (livre === false) {
      setACarregar(false);
      setErro(t('registo.erro_handle_usado'));
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { nome: nome.trim(), handle: h } },
    });
    if (error) {
      setACarregar(false);
      setErro(mensagemAuth(error, t, 'erro.email_usado'));
      return;
    }
    // O trigger de signup cria o perfil como 'pessoa'; se é uma empresa,
    // grava-se o tipo já com a sessão viva (campo editável pelo próprio,
    // o mesmo do editar-perfil). Se falhar, o editar-perfil corrige depois.
    if (data.session && identidade === 'empresa') {
      await supabase.from('perfis').update({ tipo: 'empresa' }).eq('id', data.session.user.id);
    }
    setACarregar(false);
    // Com confirmação de email desligada (dev), a sessão vem já preenchida.
    // Conta nova → apresentação (onboarding, na voz certa); depois cai no Início.
    if (data.session) {
      router.replace(
        (identidade === 'empresa' ? '/onboarding?tipo=empresa' : '/onboarding') as Href,
      );
    } else {
      setErro(t('registo.confirma_email'));
    }
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
          <Text style={styles.titulo}>{t('registo.titulo')}</Text>
          <Text style={styles.sub}>{t('registo.sub')}</Text>
          <View style={styles.filete} />
        </View>

        {/* ===== FORMULÁRIO ===== */}
        <View style={styles.formulario}>
          {/* Quem és — a mesma língua de chips do TIPO DE PERFIL (editar-perfil). */}
          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('registo.quem_es')}</Text>
            <View style={styles.chips}>
              <Chip
                texto={t('registo.sou_profissional')}
                ativo={identidade === 'pessoa'}
                onPress={() => setIdentidade('pessoa')}
              />
              <Chip
                texto={t('registo.sou_empresa')}
                ativo={identidade === 'empresa'}
                onPress={() => setIdentidade('empresa')}
              />
            </View>
          </View>

          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('registo.nome')}</Text>
            <Campo
              placeholder={
                identidade === 'empresa'
                  ? t('registo.nome_ph_empresa')
                  : t('registo.nome_ph_pessoa')
              }
              value={nome}
              onChangeText={setNome}
              returnKeyType="next"
              onSubmitEditing={() => handleRef.current?.focus()}
            />
          </View>

          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('registo.nickname')}</Text>
            <Campo
              ref={handleRef}
              placeholder={t('registo.nickname_ph')}
              autoCapitalize="none"
              value={handle}
              onChangeText={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          </View>

          <View style={styles.bloco}>
            <Text style={styles.rotulo}>{t('entrada.email')}</Text>
            <Campo
              ref={emailRef}
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
              placeholder={t('registo.pass_ph')}
              secureTextEntry
              value={pass}
              onChangeText={setPass}
              returnKeyType="go"
              onSubmitEditing={criar}
            />
          </View>

          {erro && <Erro texto={erro} />}

          <Botao
            titulo={t('registo.criar')}
            onPress={criar}
            aCarregar={aCarregar}
            style={styles.botao}
          />
        </View>

        <Link href="/login" style={styles.link}>
          {t('registo.ja_tens')}
          <Text style={styles.linkForte}>{t('registo.entrar')}</Text>
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
  chips: { flexDirection: 'row', gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  botao: { marginTop: Espaco.sm },

  link: { textAlign: 'center', color: Honra.tintaSuave, marginTop: Espaco.lg, fontSize: 14 },
  linkForte: { color: Honra.verde, fontWeight: '700' },
});
