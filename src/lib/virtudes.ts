import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { ChaveI18n } from '@/i18n';

/**
 * VIRTUDES — as "skills de apresentação" do Honra Card.
 *
 * Cada virtude é um traço de carácter que o profissional ESCOLHE apresentar:
 * uma sigla de 3 letras (COM, EFI, DYN…) + um nome traduzível. No Card são o
 * herói — a PROMESSA de carácter — enquanto os stats (avaliação/projetos) são
 * a PROVA, discreta, logo acima.
 *
 * Três decisões do Vítor que moldam isto:
 *  1. OPCIONAIS — não são iguais para todos; quem não escolher, não mostra.
 *  2. LIVRES — a sigla NÃO contém métrica; não deriva de avaliações. É a
 *     dimensão de diversidade e personalidade que os números não capturam.
 *  3. ESCOLHIDAS num campo com a lista das siglas (Definições do Card).
 *
 * Persistência: local (AsyncStorage), como o idioma. Quando o Card partilhado
 * (/c/[token]) precisar de as mostrar ao visitante, promove-se a coluna em
 * `perfis` — a forma do dado (lista de códigos) já fica pronta para isso.
 */
export type Virtude = {
  /** Sigla de 3 letras — a assinatura curta que brilha no Card. */
  codigo: string;
  /** Nome por extenso, traduzível (PT/EN). */
  chaveNome: ChaveI18n;
};

/**
 * O catálogo de virtudes disponíveis para escolha — a "lista das siglas".
 * Rascunho a afinar com o Vítor: as 3 primeiras são as que ele definiu
 * (COM/EFI/DYN); as restantes dão diversidade ao campo de escolha.
 * Acrescentar aqui (código + chave i18n) basta para surgir em toda a app.
 */
export const CATALOGO_VIRTUDES: Virtude[] = [
  { codigo: 'COM', chaveNome: 'virtude.com' },
  { codigo: 'EFI', chaveNome: 'virtude.efi' },
  { codigo: 'DYN', chaveNome: 'virtude.dyn' },
  { codigo: 'RIG', chaveNome: 'virtude.rig' },
  { codigo: 'PON', chaveNome: 'virtude.pon' },
  { codigo: 'CRI', chaveNome: 'virtude.cri' },
  { codigo: 'RES', chaveNome: 'virtude.res' },
  { codigo: 'DET', chaveNome: 'virtude.det' },
  { codigo: 'FLE', chaveNome: 'virtude.fle' },
];

/** O Card apresenta no máximo 3 virtudes — o tríptico de carácter. */
export const MAX_VIRTUDES = 3;

const CHAVE = 'honra.card.virtudes';

export function virtudePorCodigo(codigo: string): Virtude | undefined {
  return CATALOGO_VIRTUDES.find((v) => v.codigo === codigo);
}

/** Resolve uma lista de códigos em virtudes válidas (ignora as desconhecidas). */
export function virtudesDeCodigos(codigos: string[]): Virtude[] {
  return codigos.map(virtudePorCodigo).filter(Boolean) as Virtude[];
}

/**
 * As virtudes escolhidas pelo utilizador. Começa VAZIO — é opcional; ninguém
 * herda virtudes por omissão. Devolve `alternar`/`guardar` para o campo de
 * escolha nas Definições.
 */
export function useVirtudes() {
  const [codigos, setCodigos] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(CHAVE)
      .then((bruto) => {
        if (!vivo) return;
        if (bruto) {
          try {
            const arr = JSON.parse(bruto);
            if (Array.isArray(arr)) {
              setCodigos(arr.filter((c) => typeof c === 'string').slice(0, MAX_VIRTUDES));
            }
          } catch {
            // guardado corrompido — fica vazio
          }
        }
        setPronto(true);
      })
      .catch(() => {
        if (vivo) setPronto(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = useCallback((novos: string[]) => {
    const limitado = novos.slice(0, MAX_VIRTUDES);
    setCodigos(limitado); // otimista — a escolha nunca "hesita"
    AsyncStorage.setItem(CHAVE, JSON.stringify(limitado)).catch(() => {
      // sem persistência — a escolha vive nesta sessão
    });
  }, []);

  /**
   * Liga/desliga uma virtude respeitando o teto de 3. Ao tentar a 4.ª, ignora
   * (o campo de escolha avisa) — nunca rebenta nem "come" a escolha anterior.
   */
  const alternar = useCallback(
    (codigo: string) => {
      setCodigos((atual) => {
        let proximo: string[];
        if (atual.includes(codigo)) {
          proximo = atual.filter((c) => c !== codigo);
        } else if (atual.length >= MAX_VIRTUDES) {
          return atual; // cheio — sem efeito
        } else {
          proximo = [...atual, codigo];
        }
        AsyncStorage.setItem(CHAVE, JSON.stringify(proximo)).catch(() => {});
        return proximo;
      });
    },
    [],
  );

  return { codigos, virtudes: virtudesDeCodigos(codigos), alternar, guardar, pronto };
}
