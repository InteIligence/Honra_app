/**
 * HONRA — Trabalho Comprovado: as peças dos negócios HONRADOS no portefólio.
 * Decisão do Vítor (25/07): NÃO é uma montra à parte nem um feed — o trabalho
 * feito PASSA A PORTEFÓLIO, referência para o próximo cliente. Este ficheiro
 * exporta o cartão emoldurado e o carregador; quem compõe o trilho único é a
 * PortfolioGaleria (comprovados primeiro, fotos soltas depois).
 *
 * Cada cartão nasce de um orçamento que chegou a 'honrado' na máquina real —
 * impossível de forjar (blindagem 010). O nome de quem contratou só aparece
 * quando a própria pessoa CONSENTIU (a view trabalhos_comprovados_publico
 * devolve null caso contrário — a decisão vive na BD, a UI só a respeita).
 *
 * Bucket 'evolucoes' é privado; a política da 055 abre SÓ a foto da entrega
 * dos negócios destacados → daí o URL assinado, não o público.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatarData } from '@/components/ui';
import { useT } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

export type ItemComprovado = {
  id: string;
  titulo: string | null;
  ficheiro: string | null;
  data_negocio: string | null;
  categoria: string | null;
  contratante_nome: string | null;
};

/** Comprovados públicos de um perfil — tolerante: sem a 055 aplicada, []. */
export async function carregarComprovados(perfilId: string): Promise<ItemComprovado[]> {
  const { data, error } = await supabase
    .from('trabalhos_comprovados_publico')
    .select('id, titulo, ficheiro, data_negocio, categoria, contratante_nome')
    .eq('perfil_id', perfilId)
    .order('criado_em', { ascending: false });
  return error ? [] : ((data as ItemComprovado[]) ?? []);
}

/** URL assinada da foto de entrega (bucket privado) — null se não der. */
export async function urlAssinadaEvolucao(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from('evolucoes').createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

// Foto da entrega (privada → assinada). Sem foto, o cartão mostra o selo
// grande no lugar dela — o que se comprova é o negócio, não a fotografia.
function FotoEntrega({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    supabase.storage
      .from('evolucoes')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => vivo && setUrl(data?.signedUrl ?? null));
    return () => {
      vivo = false;
    };
  }, [caminho]);
  if (!url) return <View style={styles.foto} />;
  return <Image source={{ uri: url }} style={styles.foto} resizeMode="cover" />;
}

/**
 * O cartão emoldurado de um comprovado — vive no trilho do portefólio, ao
 * lado das fotos soltas. A moldura + selo fazem a diferença sentir-se sem
 * gritar: um comprovativo apresenta-se emoldurado.
 */
export function CartaoComprovado({
  item,
  onAmpliar,
}: {
  item: ItemComprovado;
  onAmpliar: (caminho: string) => void;
}) {
  const { t } = useT();
  return (
    <Pressable
      style={styles.cartao}
      onPress={() => item.ficheiro && onAmpliar(item.ficheiro)}
    >
      {item.ficheiro ? (
        <FotoEntrega caminho={item.ficheiro} />
      ) : (
        /* Sem foto: o selo ocupa o lugar dela — a prova é o negócio. */
        <View style={[styles.foto, styles.fotoVazia]}>
          <Text style={styles.fotoVaziaTxt}>✓</Text>
        </View>
      )}
      {/* Selo verde = significado (provado pela máquina, não dito). */}
      <Text style={styles.selo}>{t('tcomp.selo')}</Text>
      {item.titulo ? (
        <Text style={styles.titulo} numberOfLines={1}>
          {item.titulo}
        </Text>
      ) : null}
      {/* Categoria e data em DUAS linhas: no cartão estreito juntá-las cortava
          a data a meio ("Fotografia & Vídeo · 2…") — e uma data pela metade não
          prova nada. Cada uma na sua linha respira e lê-se inteira. */}
      {item.categoria ? (
        <Text style={styles.meta} numberOfLines={1}>
          {item.categoria}
        </Text>
      ) : null}
      {item.data_negocio ? (
        <Text style={styles.data}>{formatarData(item.data_negocio.slice(0, 10))}</Text>
      ) : null}
      {/* O nome só chega aqui se a pessoa consentiu (view da 055). */}
      {item.contratante_nome ? (
        <Text style={styles.para} numberOfLines={1}>
          {t('tcomp.para', { nome: item.contratante_nome })}
        </Text>
      ) : null}
    </Pressable>
  );
}

const TAM = 150;
const styles = StyleSheet.create({
  // MOLDURA DOURADA — a marca de água do que aconteceu DENTRO do Honra
  // (decisão do Vítor, 25/07). No mesmo trilho convivem dois tipos de trabalho:
  // o de fora (foto solta, sem moldura — "eu digo que fiz") e o de cá dentro
  // (emoldurado a dourado — "o Honra viu acontecer"). O dourado é a língua do
  // prestígio da casa, a mesma do anel do avatar e do Honra Card; o verde fica
  // para o selo "Comprovado ✓", que é verificação. Uma cor, uma função.
  cartao: {
    width: TAM,
    backgroundColor: Honra.brancoCreme,
    borderWidth: 1.5,
    borderColor: Honra.dourado,
    borderRadius: Raio.md,
    padding: Espaco.sm,
    gap: 2,
  },
  foto: {
    width: '100%',
    height: 110,
    borderRadius: Raio.sm,
    backgroundColor: Honra.cremeEscuro,
    marginBottom: Espaco.xs,
  },
  fotoVazia: { alignItems: 'center', justifyContent: 'center', backgroundColor: Honra.verdeSuave },
  fotoVaziaTxt: { color: Honra.verde, fontSize: 34, fontWeight: '800' },
  selo: { color: Honra.verde, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  titulo: { color: Honra.tinta, fontSize: 13, fontWeight: '700' },
  meta: { color: Honra.tintaSuave, fontSize: 11, fontWeight: '600' },
  // A data em voz mais baixa que a categoria — acompanha, não compete.
  data: { color: Honra.tintaSuave, fontSize: 10, fontWeight: '600', opacity: 0.85 },
  para: { color: Honra.tintaSuave, fontSize: 11 },
});
