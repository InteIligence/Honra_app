/**
 * HONRA — um projeto (orçamento) visto de dentro. Centraliza carregar + agir
 * sobre UM negócio, para o ecrã de detalhe `projeto/[id]` (e reutilizável).
 * As ações são as mesmas do separador Orçamentos, aqui num só sítio.
 */
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { useT, type TFn } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { razaoDoServidor } from '@/lib/funcoes';
import { supabase } from '@/lib/supabase';

export type Projeto = {
  id: string;
  descricao: string | null;
  estado: string;
  valor_taxa: number;
  de_perfil: string;
  para_perfil: string;
  criado_em: string;
  aceite_em: string | null;
  selado_em: string | null;
  a_agiu_em: string | null;
  b_agiu_em: string | null;
  cancel_por: string | null;
  quem_falhou: string | null;
  evolucao_ficheiro: string | null;
  prazo: string | null;
  /** € combinado (062). Opcional: ausente enquanto a coluna não estiver na BD. */
  valor_proposta?: number | null;
  /** PAGAMENTO NA ENTREGA (065). Opcionais: ausentes (undefined) enquanto a
   *  migração não estiver na BD — a UI esconde o bloco em vez de mentir. */
  pagamento_estado?: string | null;
  pagamento_transfer?: string | null;
  pago_em?: string | null;
  confirmar_ate?: string | null;
  libertado_em?: string | null;
  pagamento_contestado_em?: string | null;
  entrega_prova?: string | null;
  entrega_limpa?: string | null;
  entrega_em?: string | null;
  de?: { nome: string | null } | null;
  para?: { nome: string | null } | null;
};

/** Estados do negócio em que a entrega/pagamento fazem sentido (pós-selo,
 *  incluindo o tail legado para não criar becos) — espelho do servidor. */
export const ESTADOS_POS_SELO = ['selado', 'honrado', 'entregue', 'concluido'];

// PASTA (decisão 26/07): cada projeto é UMA entrada nas listas — o histórico
// vive DENTRO do negócio. Enquanto a migração 060 não limpar os irmãos
// legados do mesmo (trabalho, par), as listas colapsam-nos no mais avançado
// do ciclo (em empate ganha o original, o mais antigo) — o espelho exato da
// regra do índice único `orc_um_vivo_por_trabalho_par`.
const PESO_CICLO: Record<string, number> = {
  entregue: 4,
  honrado: 3,
  selado: 2,
  em_curso: 2,
  aceite: 1,
  pedido: 0,
};
export function umaPastaPorPar<
  T extends {
    id: string;
    estado: string;
    trabalho_id: string | null;
    de_perfil: string;
    para_perfil: string;
    criado_em: string;
  },
>(linhas: T[]): T[] {
  const pastas = new Map<string, T>();
  for (const p of linhas) {
    const chave = p.trabalho_id ? `${p.trabalho_id}|${p.de_perfil}|${p.para_perfil}` : p.id;
    const atual = pastas.get(chave);
    const ganha =
      !atual ||
      (PESO_CICLO[p.estado] ?? 0) > (PESO_CICLO[atual.estado] ?? 0) ||
      ((PESO_CICLO[p.estado] ?? 0) === (PESO_CICLO[atual.estado] ?? 0) &&
        p.criado_em < atual.criado_em);
    if (ganha) pastas.set(chave, p);
  }
  return [...pastas.values()];
}

// A razão REAL de uma Edge Function falhada. Era uma cópia PRIVADA daqui —
// e uma cópia privada é a razão de 45 das 48 chamadas da app nunca terem lido
// o que o servidor respondeu: quem escrevia código noutro ficheiro não tinha
// como a importar. Passou para `lib/funcoes.ts`, à mão de todos.
async function lerErroFuncao(error: unknown, fallback: string): Promise<string> {
  return (await razaoDoServidor(error)) ?? fallback;
}

// A PROVA da entrega (065): uma antevisão mais leve do ficheiro limpo. Na web
// reduz-se por canvas (lado maior ≤1280px, JPEG ~0.55) — a prova espelha a
// obra sem entregar o original ao píxel. No nativo (sem canvas nem módulo de
// manipulação instalado) a prova leva o mesmo conteúdo — a marca de água da UI
// é dissuasão, e a IMPOSIÇÃO real é o acesso ao limpo (Storage), documentado
// em docs/PAGAMENTO-NA-ENTREGA.md.
async function gerarProvaBlob(uri: string): Promise<Blob> {
  const original = await (await fetch(uri)).blob();
  if (Platform.OS !== 'web') return original;
  try {
    const bmp = await createImageBitmap(original);
    const MAX = 1280;
    const escala = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * escala));
    canvas.height = Math.max(1, Math.round(bmp.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.55));
    return blob ?? original;
  } catch {
    return original;
  }
}

// Um checkpoint do projeto (fatia D). A máquina: pendente → entregue (o
// prestador apresenta evidência) → confirmado / contestado / incumprido.
export type Checkpoint = {
  id: string;
  ordem: number;
  descricao: string;
  prazo: string | null;
  estado: string;
  evidencia_ficheiro: string | null;
  evidencia_texto: string | null;
  apresentado_em: string | null;
  confirmado_em: string | null;
  contestado_em: string | null;
  contestacao_texto: string | null;
  quem_falhou: string | null;
};

const CAMPOS_CHECKPOINT =
  'id, ordem, descricao, prazo, estado, evidencia_ficheiro, evidencia_texto, apresentado_em, confirmado_em, contestado_em, contestacao_texto, quem_falhou';

// Os campos do pagamento na entrega (065) vão em bloco próprio: a tolerância
// de migração corta-os de uma vez se a BD ainda não os tiver.
const CAMPOS_ENTREGA =
  ', pagamento_estado, pagamento_transfer, pago_em, confirmar_ate, libertado_em, pagamento_contestado_em, entrega_prova, entrega_limpa, entrega_em';

const CAMPOS =
  'id, descricao, estado, valor_taxa, de_perfil, para_perfil, criado_em, aceite_em, selado_em, a_agiu_em, b_agiu_em, cancel_por, quem_falhou, evolucao_ficheiro, prazo, valor_proposta' +
  CAMPOS_ENTREGA +
  ', de:perfis!de_perfil(nome), para:perfis!para_perfil(nome)';

export function useProjeto(id: string | undefined) {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aProcessar, setAProcessar] = useState(false);
  // Já avaliei ESTE negócio? (esconde o formulário e mostra "Avaliado ✓").
  const [jaAvaliei, setJaAvaliei] = useState(false);
  // Os checkpoints do projeto (fatia D).
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  const carregar = useCallback(() => {
    if (!id) return;
    setACarregar(true);
    setErroCarregar(null);
    supabase
      .from('orcamentos')
      .select(CAMPOS)
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        // Tolerância de migração (padrão da 058/062), em escada: primeiro sem
        // os campos da entrega (065), depois sem valor_proposta (062). O ecrã
        // abre sempre; as capacidades ausentes na BD ficam invisíveis, nunca
        // um crash nem um fingimento.
        if (error) {
          ({ data, error } = await supabase
            .from('orcamentos')
            .select(CAMPOS.replace(CAMPOS_ENTREGA, ''))
            .eq('id', id)
            .single());
        }
        if (error) {
          ({ data, error } = await supabase
            .from('orcamentos')
            .select(CAMPOS.replace(CAMPOS_ENTREGA, '').replace(', valor_proposta', ''))
            .eq('id', id)
            .single());
        }
        if (error || !data) setErroCarregar(t('projeto.erro_abrir'));
        else setProjeto(data as any);
        setACarregar(false);
      });
    // Checkpoints do projeto (tolerante: se a tabela ainda não existir, fica vazio).
    supabase
      .from('checkpoints_orcamento')
      .select(CAMPOS_CHECKPOINT)
      .eq('orcamento_id', id)
      .order('ordem')
      .then(({ data }) => setCheckpoints(((data as any[]) ?? []) as Checkpoint[]));
    // Avaliação já feita por mim? (tolerante: se a tabela não existir, fica falso.)
    if (uid) {
      supabase
        .from('avaliacoes')
        .select('orcamento_id')
        .eq('orcamento_id', id)
        .eq('de_perfil', uid)
        .then(({ data }) => setJaAvaliei((((data as any[]) ?? []).length) > 0));
    }
  }, [id, uid, t]);

  const souA = !!projeto && uid === projeto.de_perfil; // A = cliente (de_perfil)

  // O APERTO DE MÃO (B aceita / A sela) — a palavra dada, sem dinheiro.
  // Decisão 15/07: a reputação é a caução. A transição corre no servidor
  // (`aperto-agir`), sem Stripe; os avisos disparam sozinhos na BD.
  async function aperto() {
    if (!id) return;
    setErro(null);
    setAProcessar(true);
    const { data, error } = await supabase.functions.invoke('aperto-agir', {
      body: { orcamento_id: id },
    });
    setAProcessar(false);
    if (error) {
      // Mostra a razão REAL da função (ex.: "Precisas de verificar a identidade
      // para aceitar."), não um genérico. O corpo do erro vem no context.
      const msg = await lerErroFuncao(error, t('projeto.erro_aperto'));
      setErro(msg);
      // Se perdi a corrida da vaga (061: o anúncio foi entregue a outro aperto,
      // o meu orçamento pode já estar 'expirado'), o ecrã tem de dizer a
      // verdade: recarrega-se — o botão de agir sai e fica a razão à vista.
      carregar();
      return;
    }
    if (!data?.ok) {
      setErro(t('projeto.erro_aperto'));
      return;
    }
    carregar();
  }

  async function recusar() {
    if (!id) return;
    setErro(null);
    const { error } = await supabase.from('orcamentos').update({ estado: 'recusado' }).eq('id', id);
    if (error) return setErro(t('projeto.erro_recusar'));
    carregar();
  }

  // A confirma a evolução no checkpoint.
  async function confirmarEvolucao() {
    if (!id) return;
    setErro(null);
    setAProcessar(true);
    const { data, error } = await supabase.functions.invoke('agir-checkpoint', {
      body: { orcamento_id: id },
    });
    setAProcessar(false);
    if (error || !data?.ok)
      return setErro(await lerErroFuncao(error, t('projeto.erro_registar')));
    carregar();
  }

  // B apresenta evolução COM foto (Storage → checkpoint).
  async function apresentarEvolucao() {
    if (!id) return;
    setErro(null);
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (escolha.canceled || !escolha.assets?.[0]) return;
    setAProcessar(true);
    try {
      const asset = escolha.assets[0];
      const blob = await (await fetch(asset.uri)).blob();
      const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
      const caminho = `${id}/${Date.now()}.${ext}`;
      const { error: erroUp } = await supabase.storage
        .from('evolucoes')
        .upload(caminho, blob, { contentType: blob.type || 'image/jpeg' });
      if (erroUp) throw erroUp;
      const { data, error } = await supabase.functions.invoke('agir-checkpoint', {
        body: { orcamento_id: id, ficheiro: caminho },
      });
      if (error || !data?.ok)
        throw new Error(await lerErroFuncao(error, t('projeto.erro_evolucao')));
      carregar();
    } catch (e) {
      // A razão vem no Error que atirámos acima; um genérico aqui apagava-a.
      setErro(e instanceof Error && e.message ? e.message : t('projeto.erro_evolucao'));
    } finally {
      setAProcessar(false);
    }
  }

  // --- CHECKPOINTS (fatia D) ---
  // B (prestador) apresenta evidência num checkpoint. A substância é
  // OBRIGATÓRIA (texto e/ou foto) — um toque vazio não conta (decisão 1).
  async function apresentarCheckpoint(
    checkpointId: string,
    texto: string,
    comFoto: boolean,
  ): Promise<boolean> {
    if (!id) return false;
    setErro(null);
    const t0 = texto.trim();
    let ficheiro: string | undefined;
    setAProcessar(true);
    try {
      if (comFoto) {
        const escolha = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
        });
        if (!escolha.canceled && escolha.assets?.[0]) {
          const asset = escolha.assets[0];
          const blob = await (await fetch(asset.uri)).blob();
          const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
          const caminho = `${id}/${Date.now()}.${ext}`;
          const { error: erroUp } = await supabase.storage
            .from('evolucoes')
            .upload(caminho, blob, { contentType: blob.type || 'image/jpeg' });
          if (erroUp) throw erroUp;
          ficheiro = caminho;
        }
      }
      if (!t0 && !ficheiro) {
        setErro(t('projeto.cp_erro_evidencia'));
        return false;
      }
      const { data, error } = await supabase.functions.invoke('agir-checkpoint', {
        body: { orcamento_id: id, checkpoint_id: checkpointId, texto: t0 || undefined, ficheiro },
      });
      if (error || !data?.ok)
        throw new Error(await lerErroFuncao(error, t('projeto.cp_erro_apresentar')));
      carregar();
      return true;
    } catch (e) {
      // A razão viaja dentro do Error; um genérico aqui deitava-a fora.
      setErro(e instanceof Error && e.message ? e.message : t('projeto.cp_erro_apresentar'));
      return false;
    } finally {
      setAProcessar(false);
    }
  }

  // A (recetor) confirma um checkpoint.
  async function confirmarCheckpoint(checkpointId: string): Promise<boolean> {
    if (!id) return false;
    setErro(null);
    setAProcessar(true);
    const { data, error } = await supabase.functions.invoke('agir-checkpoint', {
      body: { orcamento_id: id, checkpoint_id: checkpointId, acao: 'confirmar' },
    });
    setAProcessar(false);
    if (error || !data?.ok) {
      setErro((await razaoDoServidor(error)) ?? t('projeto.cp_erro_confirmar'));
      return false;
    }
    carregar();
    return true;
  }

  // A (recetor) contesta um checkpoint → vai a revisão, ninguém marcado (decisão 2).
  async function contestarCheckpoint(checkpointId: string, texto: string): Promise<boolean> {
    if (!id) return false;
    setErro(null);
    setAProcessar(true);
    const { data, error } = await supabase.functions.invoke('agir-checkpoint', {
      body: { orcamento_id: id, checkpoint_id: checkpointId, acao: 'contestar', texto: texto.trim() || undefined },
    });
    setAProcessar(false);
    if (error || !data?.ok) {
      setErro((await razaoDoServidor(error)) ?? t('projeto.cp_erro_contestar'));
      return false;
    }
    carregar();
    return true;
  }

  // (063 · #1) O tail `honrado→entregue→concluido` FOI-SE: era o vetor da
  // armadilha — o profissional, não marcando "entregue", ficava com a honra e
  // trancava a crítica. Agora `honrado` é o fim honroso e a avaliação abre aí.

  // --- PAGAMENTO NA ENTREGA (065) ---
  // B apresenta a ENTREGA FINAL: o ficheiro real ("limpo") + a prova de
  // antevisão. Sobe os dois para o bucket privado 'entregas' e grava as
  // referências na linha (RLS + guarda_ciclo_caucao validam: é B, pós-selo,
  // sem pagamento no ciclo, com valor combinado). O aviso a A dispara na BD.
  async function apresentarEntrega(): Promise<boolean> {
    if (!id || !projeto) return false;
    setErro(null);
    if (projeto.pagamento_estado === undefined) {
      // A BD ainda não tem a migração 065 — dizemo-lo, não fingimos.
      setErro(t('entrega.indisponivel'));
      return false;
    }
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1, // o LIMPO é a obra — sem degradação na origem
    });
    if (escolha.canceled || !escolha.assets?.[0]) return false;
    setAProcessar(true);
    try {
      const asset = escolha.assets[0];
      const limpo = await (await fetch(asset.uri)).blob();
      const prova = await gerarProvaBlob(asset.uri);
      const ts = Date.now();
      const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase();
      const caminhoLimpa = `${id}/limpa-${ts}.${ext}`;
      const caminhoProva = `${id}/prova-${ts}.jpg`;
      const { error: eLimpa } = await supabase.storage
        .from('entregas')
        .upload(caminhoLimpa, limpo, { contentType: limpo.type || 'image/jpeg' });
      if (eLimpa) throw eLimpa;
      const { error: eProva } = await supabase.storage
        .from('entregas')
        .upload(caminhoProva, prova, { contentType: 'image/jpeg' });
      if (eProva) throw eProva;
      const { error: eLinha } = await supabase
        .from('orcamentos')
        .update({
          entrega_limpa: caminhoLimpa,
          entrega_prova: caminhoProva,
          entrega_em: new Date().toISOString(),
        })
        .eq('id', id);
      if (eLinha) {
        // A guarda da BD fala PT com a razão real (ex.: "Entrega trancada: o
        // pagamento já entrou no ciclo.") — mostra-se essa, não um genérico.
        setErro(eLinha.message || t('entrega.erro_apresentar'));
        return false;
      }
      carregar();
      return true;
    } catch {
      setErro(t('entrega.erro_apresentar'));
      return false;
    } finally {
      setAProcessar(false);
    }
  }

  // A PAGA a entrega: pede a Checkout Session ao servidor e abre-a. A verdade
  // do pagamento vem do webhook — o ecrã /pago só traz a pessoa de volta.
  async function pagarEntrega(): Promise<boolean> {
    if (!id) return false;
    setErro(null);
    setAProcessar(true);
    const return_url =
      Platform.OS === 'web' ? `${window.location.origin}/pago` : Linking.createURL('pago');
    const { data, error } = await supabase.functions.invoke('entrega-pagamento', {
      body: { orcamento_id: id, return_url },
    });
    if (error || !data?.url) {
      setAProcessar(false);
      setErro(error ? await lerErroFuncao(error, t('entrega.erro_pagar')) : t('entrega.erro_pagar'));
      return false;
    }
    if (Platform.OS === 'web') {
      window.location.assign(data.url as string);
      return true; // a página vai mudar; o estado volta pelo /pago
    }
    setAProcessar(false);
    await WebBrowser.openBrowserAsync(data.url as string);
    carregar(); // volta e relê o estado (o webhook pode já ter marcado)
    return true;
  }

  // A DECIDE: confirmar (liberta a B) ou contestar (congela; evidência
  // obrigatória — congelar NÃO é devolver). Corre no servidor (entrega-decidir).
  async function decidirEntrega(acao: 'confirmar' | 'contestar', texto?: string): Promise<boolean> {
    if (!id) return false;
    setErro(null);
    if (acao === 'contestar' && !texto?.trim()) {
      setErro(t('entrega.erro_contestacao_vazia'));
      return false;
    }
    setAProcessar(true);
    const { data, error } = await supabase.functions.invoke('entrega-decidir', {
      body: { orcamento_id: id, acao, texto: texto?.trim() || undefined },
    });
    setAProcessar(false);
    if (error || !data?.ok) {
      setErro(error ? await lerErroFuncao(error, t('entrega.erro_decidir')) : t('entrega.erro_decidir'));
      return false;
    }
    carregar();
    return true;
  }

  async function cancelarMutuo() {
    if (!id) return;
    setErro(null);
    setAProcessar(true);
    const { data, error } = await supabase.functions.invoke('cancelar-mutuo', {
      body: { orcamento_id: id },
    });
    setAProcessar(false);
    if (error || !data?.ok)
      return setErro(await lerErroFuncao(error, t('projeto.erro_cancelar')));
    carregar();
  }

  // A PROPOSTA (062): valor + prazo, do CLIENTE, pré-selo — nunca do
  // profissional. A UI só mostra o editor a souA em 'pedido'/'aceite'; a BD
  // (guarda_proposta_cliente) trava na mesma. Devolve se guardou.
  async function guardarProposta(valor: number | null, prazo: string | null): Promise<boolean> {
    if (!id || !souA) return false;
    setErro(null);
    setAProcessar(true);
    let { error } = await supabase
      .from('orcamentos')
      .update({ valor_proposta: valor, prazo: prazo || null })
      .eq('id', id);
    // Tolerância 062: sem a coluna na BD, guarda-se ao menos o prazo.
    if (error) {
      ({ error } = await supabase
        .from('orcamentos')
        .update({ prazo: prazo || null })
        .eq('id', id));
    }
    setAProcessar(false);
    if (error) {
      setErro((await razaoDoServidor(error)) ?? t('proposta.erro'));
      return false;
    }
    carregar();
    return true;
  }

  // Avaliar (UM SÓ SENTIDO): só o CLIENTE (souA = de_perfil) avalia o
  // PROFISSIONAL (para_perfil). O profissional não avalia o cliente — a BD
  // (037) também o proíbe. Devolve se correu bem, para o ecrã fechar o
  // formulário só em caso de sucesso.
  async function avaliar(nota: number, comentario: string): Promise<boolean> {
    if (!id || !uid || !projeto || nota < 1 || !souA) return false;
    const paraPerfil = projeto.para_perfil;
    setErro(null);
    setAProcessar(true);
    const { error } = await supabase.from('avaliacoes').insert({
      orcamento_id: id,
      de_perfil: uid,
      para_perfil: paraPerfil,
      nota,
      comentario: comentario.trim() || null,
    });
    setAProcessar(false);
    if (error) {
      setErro((await razaoDoServidor(error)) ?? t('projeto.erro_avaliar'));
      return false;
    }
    setJaAvaliei(true);
    return true;
  }

  return {
    projeto,
    checkpoints,
    souA,
    uid,
    aCarregar,
    erroCarregar,
    erro,
    aProcessar,
    jaAvaliei,
    carregar,
    accoes: {
      aperto,
      recusar,
      guardarProposta,
      confirmarEvolucao,
      apresentarEvolucao,
      apresentarCheckpoint,
      confirmarCheckpoint,
      contestarCheckpoint,
      apresentarEntrega,
      pagarEntrega,
      decidirEntrega,
      cancelarMutuo,
      avaliar,
    },
  };
}

// O próximo passo de um projeto, na voz do hub. `minhaVez` = verde (é comigo).
// Recebe o `t` do ecrã (useT) — os textos vivem nos dicionários i18n.
export function proximoPassoProjeto(
  estado: string,
  souA: boolean,
  aAgiu: boolean,
  bAgiu: boolean,
  t: TFn,
): { texto: string; minhaVez: boolean } {
  switch (estado) {
    case 'pedido':
      return souA
        ? { texto: t('passo.espera_resposta'), minhaVez: false }
        : { texto: t('passo.aceita'), minhaVez: true };
    case 'aceite':
      return souA
        ? { texto: t('passo.sela'), minhaVez: true }
        : { texto: t('passo.espera_sele'), minhaVez: false };
    case 'selado': {
      const euAgi = souA ? aAgiu : bAgiu;
      if (euAgi) return { texto: t('passo.espera_outra'), minhaVez: false };
      // Regra 27/07: mal se sela, a bola está com o PROFISSIONAL. O cliente só
      // volta a ter vez com evolução à frente (B agiu primeiro). Nos negócios
      // com checkpoints a vez fina lê-se deles (o Início fá-lo); aqui fica a
      // leitura conservadora — nunca se reclama a vez do cliente sem B agir.
      if (souA && !bAgiu) return { texto: t('passo.espera_outra'), minhaVez: false };
      return souA
        ? { texto: t('passo.confirma_evolucao'), minhaVez: true }
        : { texto: t('passo.mostra_evolucao'), minhaVez: true };
    }
    // A entrega COM PAGAMENTO (065) vive entre honrado e concluido: o
    // profissional apresenta a entrega, o cliente confirma/paga (bloco <Entrega>).
    // A avaliação (cliente→profissional) abre só no fim, em `concluido` — a par
    // da política da BD (065). [reconciliação 27/07: a minha #1 avaliava em
    // honrado; a funcionalidade de pagamento-na-entrega ficou como fluxo.]
    case 'honrado':
      return souA
        ? { texto: t('passo.espera_entrega'), minhaVez: false }
        : { texto: t('passo.apresenta_entrega'), minhaVez: true };
    case 'entregue':
      return souA
        ? { texto: t('passo.confirma_entrega'), minhaVez: true }
        : { texto: t('passo.espera_confirmacao'), minhaVez: false };
    case 'concluido':
      return souA
        ? { texto: t('passo.concluido_avalia'), minhaVez: true }
        : { texto: t('passo.concluido'), minhaVez: false };
    case 'incumprido':
      return { texto: t('passo.nao_cumprido'), minhaVez: false };
    case 'cancelado':
      return { texto: t('passo.cancelado_mutuo'), minhaVez: false };
    default:
      return { texto: '', minhaVez: false };
  }
}
