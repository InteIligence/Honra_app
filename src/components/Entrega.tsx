/**
 * HONRA — A ENTREGA FINAL com pagamento (065). Mostrar-não-dizer:
 * o bloco conta a história do dinheiro no ciclo — entrega → pagamento retido →
 * confirmação/contestação → libertado/congelado/devolvido — e dá a cada estado
 * a SUA saída. Uma porta por facto: as ações da entrega vivem AQUI (o marco
 * "Apresentação final" dos checkpoints só reflete o estado).
 *
 * Duas camadas, imposta por acesso (não por fé):
 *   · a PROVA é o que o cliente vê antes de pagar/da libertação — com a marca
 *     de água renderizada POR CIMA na UI (dissuasão, não DRM);
 *   · o LIMPO só ganha URL para o cliente com pagamento_estado='libertado'
 *     (política de Storage, migração 065). Nunca marca de água no limpo.
 *
 * Cores pela lei da casa: verde = avança/confiança; o dourado NÃO entra aqui
 * (isto é transação, não prestígio).
 */
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Erro, formatarData } from '@/components/ui';
import { useT } from '@/i18n';
import { ESTADOS_POS_SELO, type Projeto } from '@/lib/projeto';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

type AccoesEntrega = {
  apresentarEntrega: () => Promise<boolean>;
  pagarEntrega: () => Promise<boolean>;
  decidirEntrega: (acao: 'confirmar' | 'contestar', texto?: string) => Promise<boolean>;
};

// Data legível a partir de um timestamptz ISO ("2026-08-01T…" → "01/08/2026").
function dataDe(iso: string | null | undefined): string {
  return iso ? formatarData(iso.slice(0, 10)) : '';
}

// A MARCA DE ÁGUA — padrão repetido, semitransparente, por cima da PROVA.
// pointerEvents desligado: não rouba toques; é só dissuasão visual.
function MarcaDagua() {
  const { t } = useT();
  const texto = t('entrega.marca_dagua');
  return (
    <View style={styles.marcaCapa} pointerEvents="none">
      {[0, 1, 2, 3].map((i) => (
        <Text key={i} style={styles.marcaTxt} numberOfLines={1}>
          {`${texto} · ${texto} · ${texto}`}
        </Text>
      ))}
    </View>
  );
}

// Imagem de um caminho do bucket privado 'entregas' (URL assinado; só quem a
// política de Storage deixar — a prova às partes, o limpo só libertado).
function ImagemEntrega({
  caminho,
  comMarca,
  ampliavel,
}: {
  caminho: string;
  comMarca: boolean;
  ampliavel?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    let vivo = true;
    supabase.storage
      .from('entregas')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => vivo && setUrl(data?.signedUrl ?? null));
    return () => {
      vivo = false;
    };
  }, [caminho]);
  if (!url) return null;
  const corpo = (
    <View style={styles.imagemCaixa}>
      <Image source={{ uri: url }} style={styles.imagem} resizeMode="cover" />
      {comMarca ? <MarcaDagua /> : null}
    </View>
  );
  if (!ampliavel) return corpo;
  return (
    <>
      <Pressable onPress={() => setAberta(true)}>{corpo}</Pressable>
      <Modal visible={aberta} transparent animationType="fade" onRequestClose={() => setAberta(false)}>
        <Pressable style={styles.lightbox} onPress={() => setAberta(false)}>
          <Image source={{ uri: url }} style={styles.lightboxImg} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

// Abrir o LIMPO no tamanho/ficheiro real (URL assinado na hora do toque).
async function abrirLimpo(caminho: string) {
  const { data } = await supabase.storage.from('entregas').createSignedUrl(caminho, 3600);
  if (data?.signedUrl) await Linking.openURL(data.signedUrl);
}

export function Entrega({
  projeto,
  souA,
  aProcessar,
  accoes,
}: {
  projeto: Projeto;
  souA: boolean;
  aProcessar: boolean;
  accoes: AccoesEntrega;
}) {
  const { t } = useT();
  const [aContestar, setAContestar] = useState(false);
  const [contestaTxt, setContestaTxt] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const pag = projeto.pagamento_estado; // undefined = migração 065 por aplicar
  const temEntrega = !!projeto.entrega_em;
  const temValor = projeto.valor_proposta != null && Number(projeto.valor_proposta) > 0;
  const posSelo = ESTADOS_POS_SELO.includes(projeto.estado);

  // Sem a migração na BD, o bloco não existe — nada de portas mortas.
  if (pag === undefined) return null;
  const estadoPag = pag ?? 'sem_pagamento';

  // Quando aparece o bloco:
  //  · há dinheiro no ciclo (qualquer estado além de sem_pagamento) → sempre;
  //  · há entrega apresentada → sempre (os dois acompanham);
  //  · B pós-selo com valor combinado → o convite a apresentar.
  const mostrar =
    estadoPag !== 'sem_pagamento' || temEntrega || (!souA && posSelo && temValor);
  if (!mostrar) return null;

  const valorTxt = temValor ? String(projeto.valor_proposta) : '';

  return (
    <View style={styles.bloco}>
      <Text style={styles.rotulo}>{t('entrega.titulo')}</Text>
      <View style={styles.cartao}>
        {/* A PROVA — visível às duas partes; marca de água SÓ para o cliente. */}
        {projeto.entrega_prova ? (
          <>
            <Text style={styles.subRotulo}>{t('entrega.prova_rotulo')}</Text>
            <ImagemEntrega caminho={projeto.entrega_prova} comMarca={souA} />
          </>
        ) : null}

        {/* ===== O PROFISSIONAL (B) ===== */}
        {!souA && (
          <>
            {estadoPag === 'sem_pagamento' && posSelo && temValor ? (
              <>
                {!temEntrega ? (
                  <Text style={styles.nota}>{t('entrega.apresentar_ajuda')}</Text>
                ) : (
                  <Text style={styles.nota}>{t('entrega.aguarda_pagamento_b')}</Text>
                )}
                <Botao
                  titulo={temEntrega ? t('entrega.substituir') : t('entrega.apresentar')}
                  variante={temEntrega ? 'secundario' : 'primario'}
                  onPress={accoes.apresentarEntrega}
                  aCarregar={aProcessar}
                />
              </>
            ) : null}
            {estadoPag === 'aguarda_pagamento' ? (
              <Text style={styles.nota}>{t('entrega.aguarda_pagamento_b')}</Text>
            ) : null}
            {estadoPag === 'pago_retido' ? (
              <Text style={styles.notaVerde}>
                {t('entrega.pago_retido_b', { data: dataDe(projeto.confirmar_ate) })}
              </Text>
            ) : null}
            {estadoPag === 'libertado' ? (
              <Text style={styles.notaVerde}>
                {projeto.pagamento_transfer
                  ? t('entrega.libertado_b')
                  : t('entrega.libertado_b_pendente')}
              </Text>
            ) : null}
            {estadoPag === 'congelado' ? (
              <Text style={styles.nota}>{t('entrega.congelado')}</Text>
            ) : null}
            {estadoPag === 'devolvido' ? (
              <Text style={styles.notaMa}>{t('entrega.devolvido_b')}</Text>
            ) : null}
          </>
        )}

        {/* ===== O CLIENTE (A) ===== */}
        {souA && (
          <>
            {/* Pagar só faz sentido pós-selo — num estado terminal o botão
                seria uma porta morta (a função recusá-lo-ia sempre). */}
            {(estadoPag === 'sem_pagamento' || estadoPag === 'aguarda_pagamento') &&
            temEntrega &&
            posSelo ? (
              <>
                <Text style={styles.nota}>{t('entrega.pagar_ajuda')}</Text>
                <Botao
                  titulo={t('entrega.pagar', { valor: valorTxt })}
                  onPress={accoes.pagarEntrega}
                  aCarregar={aProcessar}
                />
              </>
            ) : null}

            {estadoPag === 'pago_retido' ? (
              aContestar ? (
                <View style={styles.contestaBloco}>
                  <Text style={styles.subRotulo}>{t('entrega.contestar_rotulo')}</Text>
                  <Text style={styles.nota}>{t('entrega.contestar_ajuda')}</Text>
                  <Campo
                    placeholder={t('entrega.contestar_ph')}
                    value={contestaTxt}
                    onChangeText={setContestaTxt}
                    multiline
                  />
                  <View style={styles.dupla}>
                    <Botao
                      titulo={t('comum.cancelar')}
                      variante="secundario"
                      onPress={() => {
                        setAContestar(false);
                        setErroLocal(null);
                      }}
                      style={styles.duplaBtn}
                    />
                    <Botao
                      titulo={t('entrega.contestar')}
                      onPress={async () => {
                        if (!contestaTxt.trim()) {
                          setErroLocal(t('entrega.erro_contestacao_vazia'));
                          return;
                        }
                        setErroLocal(null);
                        const ok = await accoes.decidirEntrega('contestar', contestaTxt);
                        if (ok) setAContestar(false);
                      }}
                      aCarregar={aProcessar}
                      style={styles.duplaBtn}
                    />
                  </View>
                  {erroLocal ? <Erro texto={erroLocal} /> : null}
                </View>
              ) : (
                <>
                  <Text style={styles.notaVerde}>
                    {t('entrega.confirmar_ate', { data: dataDe(projeto.confirmar_ate) })}
                  </Text>
                  <View style={styles.dupla}>
                    <Botao
                      titulo={t('entrega.contestar')}
                      variante="secundario"
                      onPress={() => setAContestar(true)}
                      style={styles.duplaBtn}
                    />
                    <Botao
                      titulo={t('entrega.confirmar')}
                      onPress={() => accoes.decidirEntrega('confirmar')}
                      aCarregar={aProcessar}
                      style={styles.duplaBtn}
                    />
                  </View>
                </>
              )
            ) : null}

            {estadoPag === 'libertado' ? (
              <>
                <Text style={styles.notaVerde}>{t('entrega.libertado_a')}</Text>
                {projeto.entrega_limpa ? (
                  <>
                    <Text style={styles.subRotulo}>{t('entrega.limpo_rotulo')}</Text>
                    {/* O LIMPO — sem marca de água, ampliável; só existe URL
                        porque a política de Storage já o abriu ('libertado'). */}
                    <ImagemEntrega caminho={projeto.entrega_limpa} comMarca={false} ampliavel />
                    <Botao
                      titulo={t('entrega.abrir_limpo')}
                      variante="secundario"
                      onPress={() => projeto.entrega_limpa && abrirLimpo(projeto.entrega_limpa)}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {estadoPag === 'congelado' ? (
              <Text style={styles.nota}>{t('entrega.congelado')}</Text>
            ) : null}
            {estadoPag === 'devolvido' ? (
              <Text style={styles.nota}>{t('entrega.devolvido_a')}</Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  subRotulo: { color: Honra.tintaSuave, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  cartao: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    gap: Espaco.sm,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  nota: { fontSize: 13, color: Honra.tintaSuave, lineHeight: 19 },
  notaVerde: { fontSize: 13, color: Honra.verde, lineHeight: 19, fontWeight: '700' },
  notaMa: { fontSize: 13, color: Honra.erro, lineHeight: 19, fontWeight: '700' },
  imagemCaixa: {
    borderRadius: Raio.md,
    overflow: 'hidden',
    backgroundColor: Honra.cremeEscuro,
  },
  imagem: { width: '100%', height: 200 },
  // A marca de água: linhas repetidas, inclinadas, semitransparentes — lê-se
  // sobre claro e escuro sem esconder a obra. (Sem textShadow*: os props
  // estão deprecados no RN 0.85 e sujavam a consola.)
  marcaCapa: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-around',
    overflow: 'hidden',
  },
  marcaTxt: {
    color: 'rgba(18,33,27,0.38)',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
    transform: [{ rotate: '-16deg' }],
  },
  contestaBloco: { gap: Espaco.sm },
  dupla: { flexDirection: 'row', gap: Espaco.sm },
  duplaBtn: { flex: 1 },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(18,33,27,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.lg,
  },
  lightboxImg: { width: '100%', height: '80%' },
});
