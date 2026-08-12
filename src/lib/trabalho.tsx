/**
 * HONRA — Mural de Trabalhos + Candidaturas (a mecânica "Trabalho" do Pesquisar).
 * Contrato partilhado: o mural (lista) e o detalhe bebem daqui, para contarem a
 * mesma história. Publica-se um trabalho → profissionais candidatam-se → o autor
 * escolhe e abre um orçamento (entra no ciclo da caução já existente).
 */
import { useCallback, useEffect, useState } from 'react';

import { useT, type ChaveI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Trabalho = {
  id: string;
  autor_perfil: string;
  titulo: string;
  descricao: string | null;
  categoria_id: string | null;
  categoria2_id: string | null;
  orcamento_valor: number | null;
  data_inicio: string | null;
  prazo: string | null;
  estado: string;
  /** Aperto que ocupou o anúncio (058) — o fio para o projeto a decorrer.
   *  Vem numa consulta à parte e TOLERANTE: sem a 058 aplicada, fica undefined
   *  e a app continua inteira (uma coluna em falta não pode partir o mural). */
  orcamento_selado?: string | null;
  criado_em: string;
  autor?: { nome: string | null } | null;
  categoria?: { nome: string | null } | null;
  categoria2?: { nome: string | null } | null;
};

export type Candidatura = {
  id: string;
  trabalho_id: string;
  candidato_perfil: string;
  mensagem: string | null;
  criado_em: string;
  candidato?: { nome: string | null } | null;
};

// Duas FKs para `categorias` ⇒ as joins têm de ser desambiguadas pelo nome da constraint.
const CAMPOS_TRABALHO =
  'id, autor_perfil, titulo, descricao, categoria_id, categoria2_id, orcamento_valor, data_inicio, prazo, estado, criado_em, autor:perfis!autor_perfil(nome), categoria:categorias!trabalhos_categoria_id_fkey(nome), categoria2:categorias!trabalhos_categoria2_id_fkey(nome)';

// ---- MURAL: lista de trabalhos abertos --------------------------------------
export function useTrabalhos() {
  const { t } = useT();
  const [trabalhos, setTrabalhos] = useState<Trabalho[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setErro(null);
    supabase
      .from('trabalhos')
      .select(CAMPOS_TRABALHO)
      .eq('estado', 'aberto')
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(t('trabalho.erro_mural'));
        else setTrabalhos((data as any) ?? []);
        setACarregar(false);
      });
  }, [t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { trabalhos, aCarregar, erro, carregar };
}

// ---- Publicar um trabalho novo ----------------------------------------------
export async function publicarTrabalho(campos: {
  titulo: string;
  descricao?: string;
  categoria_id?: string | null;
  categoria2_id?: string | null;
  orcamento_valor?: number | null;
  data_inicio?: string | null;
  prazo?: string | null;
}): Promise<{ id?: string; erro?: ChaveI18n }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  // Chaves i18n — o ecrã traduz com o `t` da casa.
  if (!uid) return { erro: 'trabalho.erro_publicar' };
  const { data, error } = await supabase
    .from('trabalhos')
    .insert({
      autor_perfil: uid,
      titulo: campos.titulo.trim(),
      descricao: campos.descricao?.trim() || null,
      categoria_id: campos.categoria_id || null,
      // A 2ª só vale com 1ª (a constraint da 053 guarda o mesmo no servidor).
      categoria2_id: (campos.categoria_id && campos.categoria2_id) || null,
      orcamento_valor: campos.orcamento_valor ?? null,
      data_inicio: campos.data_inicio || null,
      prazo: campos.prazo || null,
      estado: 'aberto',
    })
    .select('id')
    .single();
  if (error || !data) return { erro: 'trabalho.erro_publicar' };
  return { id: data.id as string };
}

// ---- Editar um trabalho já publicado (só o autor; RLS trabalhos_autor_edita) -
// Mesmo shape de campos do publicar. A categoria2 só vale com a 1.ª (a mesma
// regra do insert). Devolve erro i18n ou nada.
export async function atualizarTrabalho(
  id: string,
  campos: {
    titulo: string;
    descricao?: string;
    categoria_id?: string | null;
    categoria2_id?: string | null;
    orcamento_valor?: number | null;
    data_inicio?: string | null;
    prazo?: string | null;
  }
): Promise<{ erro?: ChaveI18n }> {
  const { error } = await supabase
    .from('trabalhos')
    .update({
      titulo: campos.titulo.trim(),
      descricao: campos.descricao?.trim() || null,
      categoria_id: campos.categoria_id || null,
      categoria2_id: (campos.categoria_id && campos.categoria2_id) || null,
      orcamento_valor: campos.orcamento_valor ?? null,
      data_inicio: campos.data_inicio || null,
      prazo: campos.prazo || null,
    })
    .eq('id', id);
  if (error) return { erro: 'trabalho.erro_editar' };
  return {};
}

// ---- DETALHE de um trabalho + candidaturas + ações --------------------------
export function useTrabalho(id: string | undefined) {
  const { session } = useAuth();
  const { t } = useT();
  const uid = session?.user.id;
  const [trabalho, setTrabalho] = useState<Trabalho | null>(null);
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [jaCandidatei, setJaCandidatei] = useState(false);
  const [aCarregar, setACarregar] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aProcessar, setAProcessar] = useState(false);

  const souAutor = !!trabalho && uid === trabalho.autor_perfil;

  const carregar = useCallback(() => {
    if (!id) return;
    setACarregar(true);
    setErroCarregar(null);
    supabase
      .from('trabalhos')
      .select(CAMPOS_TRABALHO)
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setErroCarregar(t('trabalho.erro_abrir'));
        else setTrabalho(data as any);
        setACarregar(false);
      });
    // O fio para o projeto a decorrer (058), à parte e sem drama: se a coluna
    // ainda não existir na BD, o anúncio mostra-se na mesma — só não leva lá.
    supabase
      .from('trabalhos')
      .select('orcamento_selado')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        const oid = (data as any)?.orcamento_selado;
        if (oid) setTrabalho((tr) => (tr ? { ...tr, orcamento_selado: oid } : tr));
      });
    // Candidaturas: o RLS só devolve as que posso ver (as minhas, ou todas se sou o autor).
    supabase
      .from('candidaturas')
      .select('id, trabalho_id, candidato_perfil, mensagem, criado_em, candidato:perfis!candidato_perfil(nome)')
      .eq('trabalho_id', id)
      .order('criado_em', { ascending: false })
      .then(({ data }) => {
        const lista = (data as any[]) ?? [];
        setCandidaturas(lista);
        setJaCandidatei(lista.some((c) => c.candidato_perfil === uid));
      });
  }, [id, uid, t]);

  // Candidatar-me a este trabalho.
  async function candidatar(mensagem: string): Promise<boolean> {
    if (!id || !uid) return false;
    setErro(null);
    setAProcessar(true);
    const { error } = await supabase.from('candidaturas').insert({
      trabalho_id: id,
      candidato_perfil: uid,
      mensagem: mensagem.trim() || null,
    });
    setAProcessar(false);
    if (error) {
      setErro(t('trabalho.erro_candidatar'));
      return false;
    }
    setJaCandidatei(true);
    carregar();
    return true;
  }

  // Retirar a minha candidatura.
  async function retirar() {
    if (!id || !uid) return;
    setErro(null);
    await supabase.from('candidaturas').delete().eq('trabalho_id', id).eq('candidato_perfil', uid);
    setJaCandidatei(false);
    carregar();
  }

  // Autor fecha o anúncio à mão. Desde a 058 isto é a EXCEÇÃO, não a rotina:
  // o anúncio passa a "a decorrer" sozinho quando um aperto é selado. Fechar
  // é para o caso de ninguém aparecer ou de se desistir da proposta.
  async function fechar() {
    if (!id) return;
    setErro(null);
    const { error } = await supabase.from('trabalhos').update({ estado: 'fechado' }).eq('id', id);
    if (error) return setErro(t('trabalho.erro_fechar'));
    carregar();
  }

  // Autor escolhe um candidato → abre um orçamento (entra no ciclo da caução).
  // Devolve o id do orçamento criado (para navegar até ele).
  // O negócio é UM por (trabalho, par): o histórico vive DENTRO dele, não na
  // lista. Se já existe um vivo, devolve-se esse — carregar outra vez no botão
  // leva ao que está pendente em vez de parir um negócio novo (guarda 060).
  const ESTADOS_VIVOS = ['pedido', 'aceite', 'selado', 'honrado', 'entregue', 'em_curso'];
  async function abrirOrcamento(candidatoPerfil: string): Promise<string | null> {
    if (!uid || !trabalho) return null;
    setErro(null);
    setAProcessar(true);
    const { data: vivo } = await supabase
      .from('orcamentos')
      .select('id')
      .eq('trabalho_id', trabalho.id)
      .eq('de_perfil', uid)
      .eq('para_perfil', candidatoPerfil)
      .in('estado', ESTADOS_VIVOS)
      .limit(1)
      .maybeSingle();
    if (vivo) {
      setAProcessar(false);
      return vivo.id as string;
    }
    // O anúncio ancora o negócio (27/07): o prazo do anúncio entra como data
    // da apresentação final e o orçamento estimado como valor da proposta —
    // ambos editáveis até ao selo. O que o anúncio já disse não se rediz.
    const base = {
      de_perfil: uid, // o autor do trabalho é o cliente
      para_perfil: candidatoPerfil, // o candidato é o profissional
      descricao: trabalho.titulo,
      estado: 'pedido',
      prazo: trabalho.prazo ?? null,
    };
    // O fio do anúncio (058): é por aqui que o mural passa sozinho a "a
    // decorrer" quando este aperto for selado. Fallbacks por tolerância de
    // migrações: sem a coluna da 062 segue sem valor; sem a da 058, sem fio —
    // abre-se o orçamento na mesma em vez de deixar o autor sem poder escolher.
    let { data, error } = await supabase
      .from('orcamentos')
      .insert({
        ...base,
        trabalho_id: trabalho.id,
        valor_proposta: trabalho.orcamento_valor ?? null,
      })
      .select('id')
      .single();
    if (error) {
      ({ data, error } = await supabase
        .from('orcamentos')
        .insert({ ...base, trabalho_id: trabalho.id })
        .select('id')
        .single());
    }
    if (error) {
      ({ data, error } = await supabase.from('orcamentos').insert(base).select('id').single());
    }
    setAProcessar(false);
    if (error || !data) {
      setErro(t('trabalho.erro_orcamento'));
      return null;
    }
    return data.id as string;
  }

  return {
    trabalho,
    souAutor,
    uid,
    candidaturas,
    jaCandidatei,
    aCarregar,
    erroCarregar,
    erro,
    aProcessar,
    carregar,
    accoes: { candidatar, retirar, fechar, abrirOrcamento },
  };
}
