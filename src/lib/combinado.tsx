/**
 * HONRA — O COMBINADO, do lado de quem o vive.
 *
 * Um combinado é um encontro marcado entre duas pessoas, com consequência
 * real: cumprido dá +2 de Confiança aos dois, falhado tira −2 a quem faltou
 * (078). Não compete com os checkpoints — o checkpoint é o TRABALHO, o
 * combinado é a PRESENÇA.
 *
 * ── PORQUE ESTE FICHEIRO EXISTE ──────────────────────────────────────────
 * A 078 construiu o servidor todo e a app ficou a saber só CRIAR. A tabela era
 * lida em zero sítios, o `fechar_combinado` chamado em zero sítios, e os
 * estados 'aceite'/'recusado' não tinham quem os escrevesse. Marcava-se um
 * combinado e nunca mais ninguém lhe tocava: nenhum chegava a cumprido,
 * nenhum a falhado, os ±2 nunca eram escritos. Aqui mora a metade que faltava.
 *
 * ── O CLIENTE NÃO DECIDE NADA ────────────────────────────────────────────
 * Todos os gestos passam por funções do servidor (081). Este ficheiro não
 * escreve na tabela, não calcula estados e não sabe prazos: pede o gesto e
 * volta a ler. Reputação é a última coisa que se pode dar ao luxo de ter duas
 * versões da verdade, e a do servidor é a que conta.
 */
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

/** Os sete estados da 078. Vivos: proposto e aceite. Os outros são desfecho. */
export type EstadoCombinado =
  | 'proposto'
  | 'aceite'
  | 'cumprido'
  | 'falhado'
  | 'expirado'
  | 'recusado'
  | 'disputado';

export type Combinado = {
  id: string;
  a: string;
  b: string;
  proposto_por: string;
  orcamento_id: string | null;
  quando: string;
  onde: string | null;
  estado: EstadoCombinado;
  a_confirmou_em: string | null;
  b_confirmou_em: string | null;
  falha_de: string | null;
  falha_em: string | null;
  contestado_em: string | null;
  criado_em: string;
};

const CAMPOS =
  'id, a, b, proposto_por, orcamento_id, quando, onde, estado, a_confirmou_em, b_confirmou_em, falha_de, falha_em, contestado_em, criado_em';

/** Os que ainda podem mudar de rumo. Os outros já contaram a sua história. */
const VIVOS: EstadoCombinado[] = ['proposto', 'aceite'];

/**
 * O que ESTA pessoa pode fazer agora — a leitura das regras da 081 do lado de
 * cá, para o ecrã não oferecer botões que o servidor vai recusar. A decisão
 * final continua a ser lá; isto é só cortesia de interface.
 */
export type Podes = {
  responder: boolean;
  confirmar: boolean;
  declararFalha: boolean;
  contestar: boolean;
};

export function podesFazer(c: Combinado, uid: string, agora = Date.now()): Podes {
  const souA = uid === c.a;
  const vivo = VIVOS.includes(c.estado);
  const jaPassou = agora >= new Date(c.quando).getTime();
  const euConfirmei = souA ? c.a_confirmou_em : c.b_confirmou_em;
  const acusado = c.falha_de ? (c.falha_de === c.a ? c.b : c.a) : null;
  const prazoDeContestar =
    c.falha_em !== null && agora <= new Date(c.falha_em).getTime() + 3 * 24 * 3600 * 1000;

  return {
    // Quem propôs não responde ao seu próprio convite.
    responder: vivo && c.estado === 'proposto' && uid !== c.proposto_por,
    // Antes da hora não há presença para confirmar — só promessa.
    confirmar: vivo && jaPassou && !euConfirmei,
    // Só acusa quem compareceu, e só se ninguém acusou ainda.
    declararFalha: vivo && jaPassou && !!euConfirmei && c.falha_em === null,
    // Só o acusado, e só dentro do prazo.
    contestar: vivo && uid === acusado && c.contestado_em === null && prazoDeContestar,
  };
}

/** Rótulo de estado para leitura humana — a chave i18n, não a frase. */
export function chaveEstado(c: Combinado, uid: string): string {
  if (c.estado === 'falhado') return c.falha_de === uid ? 'comb.est_falhou_o_outro' : 'comb.est_falhei';
  if (c.estado !== 'proposto' && c.estado !== 'aceite') return `comb.est_${c.estado}`;
  if (c.falha_em) return 'comb.est_acusado';
  const souA = uid === c.a;
  const eu = souA ? c.a_confirmou_em : c.b_confirmou_em;
  const outro = souA ? c.b_confirmou_em : c.a_confirmou_em;
  if (eu && !outro) return 'comb.est_a_espera_do_outro';
  if (!eu && outro) return 'comb.est_o_outro_confirmou';
  return c.estado === 'aceite' ? 'comb.est_aceite' : 'comb.est_proposto';
}

/**
 * O combinado ATIVO desta conversa (o mais recente que ainda pode mudar), e os
 * gestos que se podem fazer sobre ele.
 *
 * `acertar` corre a cada leitura: é ela que faz o relógio andar — uma acusação
 * não contestada vira falha ao fim dos 3 dias, e um combinado esquecido vira
 * 'expirado'. Sem cron nenhum: o tempo passa quando alguém abre a conversa.
 */
export function useCombinado(uid: string | null, outroId: string | null) {
  const [combinado, setCombinado] = useState<Combinado | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aAgir, setAAgir] = useState(false);

  const carregar = useCallback(async () => {
    if (!uid || !outroId) {
      setCombinado(null);
      return;
    }
    setACarregar(true);
    const [x, y] = uid < outroId ? [uid, outroId] : [outroId, uid];
    const { data, error } = await supabase
      .from('combinados')
      .select(CAMPOS)
      .eq('a', x)
      .eq('b', y)
      .order('quando', { ascending: false })
      .limit(1);
    if (error || !data?.length) {
      setCombinado(null);
      setACarregar(false);
      return;
    }
    let c = data[0] as Combinado;

    // Deixa o relógio andar antes de mostrar seja o que for: senão a app
    // mostrava "à espera de resposta" num combinado que expirou há uma semana.
    if (VIVOS.includes(c.estado)) {
      const { data: novo } = await supabase.rpc('acertar_combinado', { p_id: c.id });
      if (typeof novo === 'string' && novo !== c.estado) {
        const { data: fresco } = await supabase
          .from('combinados')
          .select(CAMPOS)
          .eq('id', c.id)
          .single();
        if (fresco) c = fresco as Combinado;
      }
    }
    setCombinado(c);
    setACarregar(false);
  }, [uid, outroId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Pede um gesto ao servidor e volta a ler. Nunca decide o desfecho aqui. */
  const gesto = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      if (!combinado || aAgir) return;
      setAAgir(true);
      setErro(null);
      const { error } = await supabase.rpc(fn, { p_id: combinado.id, ...args });
      setAAgir(false);
      if (error) {
        setErro(error.message);
        return;
      }
      await carregar();
    },
    [combinado, aAgir, carregar]
  );

  return {
    combinado,
    aCarregar,
    aAgir,
    erro,
    limparErro: () => setErro(null),
    recarregar: carregar,
    responder: (aceita: boolean) => gesto('responder_combinado', { p_aceita: aceita }),
    confirmar: () => gesto('confirmar_presenca'),
    declararFalha: () => gesto('declarar_falha_combinado'),
    contestar: () => gesto('contestar_combinado'),
  };
}
