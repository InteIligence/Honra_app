import * as Linking from 'expo-linking';
import { Link, router, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Erro } from '@/components/ui';
import { useT } from '@/i18n';
import { mensagemAuth } from '@/lib/erros';
import { supabase, temConfig } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

/**
 * Recuperar palavra-passe — pede o email e envia o link de reposição.
 * A mesma porta sóbria do login: selo "H", filete dourado, campos e botão
 * da biblioteca `@/components/ui`.
 *
 * Privacidade: NUNCA revelamos se o email existe. A resposta é sempre neutra;
 * só erros técnicos reais (rede, limite de envio, SMTP) é que aparecem.
 */
export default function RecuperarPalavraPasse() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [aCarregar, setACarregar] = useState(false);

  async function enviar() {
    setErro(null);
    if (!temConfig) {
      setErro(t('entrada.erro_config'));
      return;
    }
    if (email.trim().length === 0) {
      setErro(t('recuperar.erro_email'));
      return;
    }

    // Para onde o link do email traz a pessoa: o ecrã de redefinição.
    const redirectTo =
      Platform.OS === 'web'
        ? `${window.location.origin}/redefinir-palavra-passe`
        : Linking.createURL('redefinir-palavra-passe');

    setACarregar(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setACarregar(false);

    // Erros técnicos reais (limite de envio, rede, SMTP) mostram-se.
    // Caso contrário, resposta neutra — nunca dizemos se a conta existe.
    if (error) {
      setErro(mensagemAuth(error, t, 'recuperar.erro_enviar'));
      return;
    }
    setEnviado(true);
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
          <Text style={styles.titulo}>{t('recuperar.titulo')}</Text>
          <Text style={styles.sub}>{t('recuperar.sub')}</Text>
          <View style={styles.filete} />
        </View>

        {enviado ? (
          /* ===== SUCESSO NEUTRO — sem revelar se a conta existe ===== */
          <View style={styles.formulario}>
            <View style={styles.aviso}>
              <Text style={styles.avisoTitulo}>{t('recuperar.verifica_titulo')}</Text>
              <Text style={styles.avisoTexto}>{t('recuperar.verifica_corpo')}</Text>
            </View>
            <Botao
              titulo={t('recuperar.voltar_entrar')}
              variante="secundario"
              onPress={() => router.replace('/login' as Href)}
              style={styles.botao}
            />
          </View>
        ) : (
          /* ===== FORMULÁRIO ===== */
          <View style={styles.formulario}>
            <View style={styles.bloco}>
              <Text style={styles.rotulo}>{t('entrada.email')}</Text>
              <Campo
                placeholder={t('entrada.email_ph')}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {erro && <Erro texto={erro} />}

            <Botao
              titulo={t('recuperar.enviar_link')}
              onPress={enviar}
              aCarregar={aCarregar}
              style={styles.botao}
            />
          </View>
        )}

        <Link href="/login" style={styles.link}>
          {t('recuperar.lembraste')}
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
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  botao: { marginTop: Espaco.sm },

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

  link: { textAlign: 'center', color: Honra.tintaSuave, marginTop: Espaco.lg, fontSize: 14 },
  linkForte: { color: Honra.verde, fontWeight: '700' },
});
