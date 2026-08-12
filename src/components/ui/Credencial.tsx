import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { nomeEscalao, useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';
import { estiloPrestigio, type EstiloPrestigio } from '@/theme/prestigio';

import { Avatar } from './Avatar';
import { Pill } from './Pill';

/**
 * Credencial HONRA — a faixa verde que dá alma ao perfil.
 * Avatar (com prestígio) + nome + ✓ + papel + pills. LÊ o prestígio
 * (DESIGN-SYSTEM.md §3) e enobrece-se, subtilmente, com o escalão.
 * Lei de design: o brilho só começa em Reconhecido (Verificado e Provado
 * partilham o mesmo visual base) — hairline (Reconhecido+), ✓ dourado e
 * cantos (Referência), moldura + monograma (Mestre).
 */
type Props = {
  nome?: string | null;
  /** Nickname (@handle) — persona/busca, por baixo do nome. */
  handle?: string | null;
  papel?: string | null;
  cidade?: string | null;
  /** Iniciais do avatar (coluna `perfis.avatar`). */
  iniciais?: string | null;
  /** URI da imagem de perfil (quando existir). */
  imagem?: string | null;
  /** Identidade verificada → ✓ junto ao nome. */
  verificado?: boolean;
  empresa?: boolean;
  disponivel?: boolean;
  /** Config de prestígio (de `estiloPrestigio`). Omisso → nível 0. */
  prestigio?: EstiloPrestigio;
  /** Conteúdo no topo da faixa (ex.: botão "‹ Voltar"). */
  topo?: ReactNode;
  /** Conteúdo isolado no canto inferior direito da faixa (ex.: Honra Card). */
  rodapeDireito?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Raio generoso da base da faixa — assinatura do ecrã de referência aprovado.
const RAIO_FAIXA = 28;

export function Credencial({
  nome,
  handle,
  papel,
  cidade,
  iniciais,
  imagem,
  verificado,
  empresa,
  disponivel,
  prestigio,
  topo,
  rodapeDireito,
  style,
}: Props) {
  const { t } = useT();
  const p = prestigio ?? estiloPrestigio(0);

  return (
    <View>
      <View style={[styles.faixa, !topo && { paddingTop: Espaco.md }, style]}>
        {topo}

        {/* Mestre — moldura dourada ténue: o "escritório mais nobre". */}
        {p.moldura && <View pointerEvents="none" style={styles.moldura} />}

        {/* Referência — detalhe de canto dourado discreto na base da faixa. */}
        {p.cantos && (
          <>
            <View pointerEvents="none" style={[styles.canto, styles.cantoEsq]} />
            <View pointerEvents="none" style={[styles.canto, styles.cantoDir]} />
          </>
        )}

        {/* Mestre — pequeno monograma "H" dourado (o emblema do Mestre). */}
        {p.emblema && (
          <View pointerEvents="none" style={styles.emblema}>
            <Text style={styles.emblemaTxt}>H</Text>
          </View>
        )}

        <Avatar iniciais={iniciais} imagem={imagem} prestigio={p} style={styles.avatar} />

        <View style={styles.nomeLinha}>
          <Text style={styles.nome}>{nome ?? t('cred.sem_nome')}</Text>
          {/* Referência+ — o ✓ ganha fundo dourado pleno (acento de prestígio). */}
          {verificado && (
            <Text style={[styles.check, p.acentoNome && styles.checkAcento]}>✓</Text>
          )}
        </View>
        {handle ? <Text style={styles.handle}>@{handle}</Text> : null}
        <Text style={styles.papel}>{papel ?? t('cred.sem_funcao')}</Text>

        <View style={styles.pills}>
          {cidade ? <Text style={styles.cidade}>{cidade}</Text> : null}
          {empresa && <Pill texto={t('cred.empresa')} variante="empresa" />}
          {/* Disponibilidade = só a esfera verde (a palavra saía por cima do Card). */}
          {disponivel && <View style={styles.dispDot} />}
          {p.mostraEscalao && <Pill texto={nomeEscalao(t, p.escalao)} variante="escalao" />}
        </View>

        {/* Canto inferior direito, isolado (ex.: acesso ao Honra Card). */}
        {rodapeDireito ? <View style={styles.rodapeDireito}>{rodapeDireito}</View> : null}
      </View>

      {/* Reconhecido+ — hairline dourado ténue a separar a credencial do corpo. */}
      {p.hairline && <View style={styles.hairline} />}
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    backgroundColor: Honra.verdeEscuro,
    alignItems: 'center',
    paddingBottom: Espaco.xl,
    borderBottomLeftRadius: RAIO_FAIXA,
    borderBottomRightRadius: RAIO_FAIXA,
  },
  avatar: { marginTop: Espaco.sm, marginBottom: Espaco.md },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: Espaco.xs },
  nome: { fontSize: 24, fontWeight: '800', color: Honra.creme },
  check: {
    color: Honra.verdeEscuro,
    backgroundColor: Honra.douradoClaro,
    width: 22,
    height: 22,
    borderRadius: Raio.pill,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  checkAcento: { backgroundColor: Honra.dourado, color: Honra.verdeMaisEscuro },
  handle: { fontSize: 13, color: Honra.cremeEscuro, marginTop: 2 },
  papel: { fontSize: 14, color: Honra.douradoClaro, marginTop: 2 },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Espaco.sm,
    marginTop: Espaco.sm,
  },
  cidade: { fontSize: 13, color: Honra.cremeEscuro },
  dispDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: Honra.verdeVivo },
  rodapeDireito: { position: 'absolute', right: Espaco.md, bottom: Espaco.md },

  // ===== Tratamentos de prestígio (sempre ténues) =====
  hairline: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: Honra.dourado,
    opacity: 0.55,
    marginTop: Espaco.xs,
    marginHorizontal: Espaco.xl,
    borderRadius: Raio.pill,
  },
  moldura: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderWidth: 1,
    borderColor: Honra.dourado,
    opacity: 0.45,
    borderBottomLeftRadius: RAIO_FAIXA - 6,
    borderBottomRightRadius: RAIO_FAIXA - 6,
  },
  canto: {
    position: 'absolute',
    bottom: 12,
    width: 14,
    height: 14,
    borderColor: Honra.dourado,
    opacity: 0.75,
  },
  cantoEsq: {
    left: 12,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderBottomLeftRadius: 10,
  },
  cantoDir: {
    right: 12,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomRightRadius: 10,
  },
  emblema: {
    position: 'absolute',
    top: Espaco.sm,
    right: Espaco.md,
    width: 26,
    height: 26,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.dourado,
    opacity: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemaTxt: { color: Honra.dourado, fontSize: 12, fontWeight: '800' },
});
