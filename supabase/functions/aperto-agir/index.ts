// HONRA — O aperto de mão em dois toques, SEM dinheiro.
// DECISÃO 15/07: a reputação é a caução. Dentro do marketplace ambos os lados
// têm perfil verificado e 1 pessoa = 1 conta — a marca de incumprimento é
// inescapável. Esta função substitui a `autorizar-caucao` no fluxo INTERNO:
// executa a transição diretamente (via service_role), sem Stripe, sem holds.
// (Os holds vivem agora só no contrato-convite, onde a outra parte vem de fora.)
//
// Quem chama, e o que acontece:
//   B (para_perfil) com estado 'pedido'  → ACEITA:  pedido → aceite  (dá a palavra)
//   A (de_perfil)   com estado 'aceite'  → SELA:    aceite → selado  (fecha o compromisso;
//                                          arranca o relógio do checkpoint ~dia 6)
//
// Guardas que continuam de pé (na BD, não aqui):
//   · guarda_aceita_verificado — aceitar exige identidade verificada de quem
//     aceita (004) e selar exige identidade verificada de quem sela (043,
//     fuga C). Aplica-se a TODOS os updates, incluindo o nosso via service_role.
//   · notificar_ciclo — os avisos disparam sozinhos na transição (migração 032).
//
// Precisa de SUPABASE_SERVICE_ROLE_KEY. JWT obrigatório (deploy sem --no-verify-jwt).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // 1) Quem és tu? (o Porteiro confirma pela tua sessão)
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'não autenticado' }, 401);

  // 2) Que orçamento?
  let orcamento_id: string | undefined;
  try {
    orcamento_id = (await req.json())?.orcamento_id;
  } catch {
    // sem corpo válido
  }
  if (!orcamento_id) return json({ error: 'falta o orcamento_id' }, 400);

  // 3) Ir buscar o orçamento (o RLS já limita às duas partes; validamos na mesma).
  const { data: orc, error: erroOrc } = await supabase
    .from('orcamentos')
    .select('id, de_perfil, para_perfil, estado, prazo')
    .eq('id', orcamento_id)
    .single();
  if (erroOrc || !orc) return json({ error: 'orçamento não encontrado' }, 404);

  // 4) Descobrir o GESTO a partir de quem chama + do estado. Um só caminho
  //    válido por combinação — impossível agir fora de vez.
  let gesto: 'aceitar' | 'selar';
  if (user.id === orc.para_perfil && orc.estado === 'pedido') {
    gesto = 'aceitar'; // B aceita → pedido → aceite
  } else if (user.id === orc.de_perfil && orc.estado === 'aceite') {
    gesto = 'selar'; // A sela → aceite → selado
  } else {
    return json({ error: 'não é a tua vez de agir neste orçamento' }, 400);
  }

  // 4b) Conta suspensa: os gestos de marketplace estão travados enquanto durar
  //     a suspensão (escada de suspensão, migração 048). Resposta honesta em vez
  //     do gesto — a guarda da BD (guarda_aceita_verificado) remata na mesma.
  {
    const { data: susp } = await supabase.rpc('esta_suspenso', { p_perfil: user.id });
    if (susp === true) {
      return json(
        {
          suspenso: true,
          error:
            gesto === 'aceitar'
              ? 'A tua conta está suspensa: não podes aceitar orçamentos enquanto durar a suspensão.'
              : 'A tua conta está suspensa: não podes selar apertos de mão enquanto durar a suspensão.',
        },
        403,
      );
    }
  }

  // 5) Quem AGE tem de estar verificado — quem aceita (desde a 004) e, desde a
  //    blindagem da fuga C (migração 043), também quem SELA: sem isto, uma
  //    conta descartável fabricava negócios honrados com um só lado
  //    verificado. A guarda da BD também o exige — falhamos aqui primeiro,
  //    com uma resposta honesta em vez de um erro de servidor.
  {
    const { data: verif } = await supabase
      .from('verificacoes')
      .select('estado')
      .eq('perfil_id', user.id)
      .eq('aba', 'identidade')
      .eq('estado', 'verificado')
      .maybeSingle();
    if (!verif) {
      return json(
        {
          error:
            gesto === 'aceitar'
              ? 'Precisas de verificar a identidade para aceitar.'
              : 'Precisas de verificar a identidade para selar o aperto de mão.',
        },
        403,
      );
    }
  }

  // 6) A transição, server-side. O update é condicionado ao estado de partida
  //    (idempotente: dois toques ao mesmo tempo não avançam duas vezes) e os
  //    avisos disparam sozinhos pelo trigger notificar_ciclo.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const agora = new Date().toISOString();

  const patch =
    gesto === 'aceitar'
      ? { estado: 'aceite', aceite_em: agora }
      : { estado: 'selado', selado_em: agora };
  const estadoPartida = gesto === 'aceitar' ? 'pedido' : 'aceite';

  const { data: atualizado, error: erroUpd } = await admin
    .from('orcamentos')
    .update(patch)
    .eq('id', orc.id)
    .eq('estado', estadoPartida)
    .select('id, estado');

  if (erroUpd) {
    // A guarda da BD pode recusar (ex.: identidade por verificar) — devolve a razão real.
    return json({ error: erroUpd.message ?? 'não consegui registar o aperto de mão' }, 400);
  }
  if (!atualizado || atualizado.length === 0) {
    return json({ error: 'o orçamento mudou entretanto — recarrega e tenta de novo' }, 409);
  }

  // 7) Ao SELAR, o negócio corre SEMPRE a máquina de checkpoints (fatia D).
  //    A garantia de ≥1 checkpoint (o "Entrega do trabalho" por omissão) e o
  //    prazo visível já NÃO se fazem aqui: são TRANSACIONAIS na BD (migração
  //    063 — trigger `garantir_checkpoint_ao_selar` + `prazo_visivel_ao_selar`),
  //    na mesma transação do selo. Assim um insert falhado nunca deixa o
  //    negócio `selado` com 0 checkpoints a cair no motor legado (#13).

  return json({ ok: true, gesto, estado: patch.estado });
});
