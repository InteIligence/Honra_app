import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { en } from './en';
import { pt } from './pt';

/**
 * HONRA — i18n leve, sem dependências novas.
 *
 * - Dicionários planos e TIPADOS (`pt.ts` é a fonte das chaves; `en.ts` é
 *   obrigado pelo tipo a ser completo).
 * - A preferência vive na MESMA chave que o toggle das Definições sempre usou
 *   ('honra.idioma'); na primeira vez decide o locale do dispositivo/browser.
 * - Fallback: chave em falta → texto PT. NUNCA se mostra a chave crua.
 * - Trocar o idioma nas Definições re-renderiza tudo (contexto React).
 */

export type Idioma = 'pt' | 'en';
export type ChaveI18n = keyof typeof pt;
export type TFn = (chave: ChaveI18n, params?: Record<string, string | number>) => string;

/** A chave de storage histórica do toggle das Definições — não mudar. */
export const CHAVE_IDIOMA = 'honra.idioma';

const DICIONARIOS: Record<Idioma, Record<ChaveI18n, string>> = { pt, en };

/** 1ª vez (sem escolha guardada): fala a língua do dispositivo/browser. */
function idiomaDoDispositivo(): Idioma {
  try {
    const tag =
      (typeof navigator !== 'undefined' && navigator.language) ||
      Intl.DateTimeFormat().resolvedOptions().locale ||
      'pt';
    return tag.toLowerCase().startsWith('pt') ? 'pt' : 'en';
  } catch {
    return 'pt';
  }
}

function traduzir(idioma: Idioma, chave: ChaveI18n, params?: Record<string, string | number>) {
  // Fallback: em falta no idioma ativo → PT (a língua-mãe), nunca a chave crua.
  let texto = DICIONARIOS[idioma][chave] ?? pt[chave] ?? '';
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      texto = texto.split(`{${k}}`).join(String(v));
    }
  }
  return texto;
}

type CtxI18n = {
  idioma: Idioma;
  mudarIdioma: (idioma: Idioma) => void;
  t: TFn;
};

// Fora do provider (não deve acontecer): PT estático, nada rebenta.
const FALLBACK: CtxI18n = {
  idioma: 'pt',
  mudarIdioma: () => {},
  t: (chave, params) => traduzir('pt', chave, params),
};

const I18nContext = createContext<CtxI18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(idiomaDoDispositivo);

  // Escolha guardada (a mesma chave do toggle das Definições) ganha ao locale.
  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(CHAVE_IDIOMA)
      .then((v) => {
        if (vivo && (v === 'pt' || v === 'en')) setIdioma(v);
      })
      .catch(() => {
        // sem storage — fica o idioma do dispositivo
      });
    return () => {
      vivo = false;
    };
  }, []);

  const mudarIdioma = useCallback((novo: Idioma) => {
    setIdioma(novo); // re-render imediato de toda a app
    AsyncStorage.setItem(CHAVE_IDIOMA, novo).catch(() => {});
  }, []);

  const t = useCallback<TFn>((chave, params) => traduzir(idioma, chave, params), [idioma]);

  const valor = useMemo(() => ({ idioma, mudarIdioma, t }), [idioma, mudarIdioma, t]);
  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>;
}

/** O hook da casa: `const { t, idioma, mudarIdioma } = useT();` */
export function useT(): CtxI18n {
  return useContext(I18nContext) ?? FALLBACK;
}

// ——— Escalões (percurso Verificado→Mestre) ———
// Os nomes vêm de dados/`prestigio.ts` em PT; aqui traduz-se a APRESENTAÇÃO.
const CHAVE_ESCALAO: Record<string, ChaveI18n> = {
  Verificado: 'escalao.verificado',
  Provado: 'escalao.provado',
  Recomendado: 'escalao.recomendado',
  Reconhecido: 'escalao.reconhecido',
  Referenciado: 'escalao.referenciado',
  Mestre: 'escalao.mestre',
  // Nomes antigos, mantidos para linhas e caches que ainda os digam.
  Referência: 'escalao.referenciado',
};

/** Nome do escalão no idioma ativo (desconhecido → devolve como veio). */
export function nomeEscalao(t: TFn, escalao: string | null | undefined): string {
  if (!escalao) return '';
  const chave = CHAVE_ESCALAO[escalao];
  return chave ? t(chave) : escalao;
}
