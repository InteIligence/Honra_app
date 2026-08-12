// HONRA — Geração do TEXTO do contrato-convite (nível i) + hash.
// Um modelo curto e legível em PT-PT, cumprindo as INVARIANTES LEGAIS do doc:
//   • a DATA DO EVENTO em destaque (art. 17.º/1/k DL 24/2014 — sustenta a
//     exceção ao direito de livre resolução);
//   • a caução/penalização redigida como CLÁUSULA PENAL (art. 810.º CC),
//     NUNCA como "sinal" (evita o regime do dobro do art. 442.º/2 CC contra P);
//   • o pagamento antecipado direto chama-se "adiantamento", nunca "sinal";
//   • o aviso EXPRESSO de que não há direito de livre resolução (art. 4.º/1/p);
//   • a política de cancelamento com VALORES CONCRETOS (regra Visa
//     "properly disclosed") — 1.ª peça de evidência anti-chargeback.
//
// Nível i não tem valores de cartão nem mandato — o contrato é o compromisso em
// si. O hash SHA-256 do texto final é a âncora probatória (doc §4.4): calcula-se
// aqui e grava-se; o mesmo texto → o mesmo hash → verificável.
//
// Fatia C-2: o NÍVEL ii acrescenta ao contrato a cláusula do cartão e ganha um
// texto de MANDATO próprio (gerarMandato) — que NOMEIA o profissional como
// beneficiário (EBA Q&A 2019_4794), com os valores e datas CONCRETOS do
// contrato, e a promessa central: "nada é cobrado a menos que canceles nos
// termos que assinaste". O texto do nível i mantém-se BYTE-IGUAL ao da Fatia B
// (os hashes dos contratos já assinados continuam verificáveis).
//
// Também vive aqui a verdade ÚNICA dos escalões de cancelamento
// (escalaoCancelamento) — o mesmo cálculo para o texto do contrato, o texto do
// mandato e a função convite-cancelar. Datas comparadas em UTC (YYYY-MM-DD).
//
// Reutilizado por convite-decidir (gera no aceite). NÃO tem segredos nem I/O.

export const CONTRATO_VERSAO = 'convite-v1';
// mandato-v2 (Fatia D): ganha a cláusula da RESERVA de caução (hold em cartões
// de crédito, D−2). Os mandatos v1 já aceites ficam intactos (texto guardado);
// só os aceites novos nascem v2. Regra Visa "properly disclosed" + doc §5(c).
export const MANDATO_VERSAO = 'mandato-v2';

export type DadosContrato = {
  profissional_nome: string;
  cliente_nome: string;
  cliente_telefone: string;
  servico: string | null;
  data_inicio: string; // YYYY-MM-DD (obrigatória)
  data_fim: string | null;
  valor_total: number | null; // cêntimos
  sinal_valor: number | null; // cêntimos (adiantamento, fora do Honra)
  pct_cancelamento: number; // 10–15
  pct_caucao: number; // 10–30
  janela_x_meses: number; // default 2
  // Fatia C-2: nível de proteção (1 = só contrato; 2 = contrato + cartão).
  // Omitido/1 → o texto fica BYTE-IGUAL ao da Fatia B (hashes antigos válidos).
  nivel_protecao?: number;
  anexos?: { nome_ficheiro: string; sha256: string; criado_em: string }[];
};

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Primeiros 8 hex do hash — a "ref" curta que vai no SMS e no cabeçalho.
export function hash8(hash: string): string {
  return hash.slice(0, 8);
}

function eur(centimos: number | null): string {
  if (centimos == null) return '(a combinar)';
  return `${(centimos / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;
}

function pctDe(centimos: number | null, pct: number): string {
  if (centimos == null) return `${pct}% do valor`;
  return `${pct}% (${eur(Math.round((centimos * pct) / 100))})`;
}

// Formata uma data YYYY-MM-DD como "14 de julho de 2026".
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
function dataLonga(iso: string): string {
  const [a, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!a || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

// Subtrai meses a uma data ISO (para o marco do escalão 1).
function menosMeses(iso: string, meses: number): string {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCMonth(dt.getUTCMonth() - meses);
  return dt.toISOString().slice(0, 10);
}

// Subtrai dias a uma data ISO (para o marco do escalão 2 → 3).
function menosDias(iso: string, dias: number): string {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------
// ESCALÕES DE CANCELAMENTO — a verdade única (contrato, mandato e
// convite-cancelar usam ESTE cálculo; as percentagens vêm CONGELADAS
// do contrato, nunca daqui).
//   1: até <data_inicio − janela_x_meses>          → 0€ via Honra
//   2: depois disso e até 8 dias antes do evento   → pct_cancelamento
//   3: nos 7 dias anteriores, ou no próprio dia    → pct_caucao
// ------------------------------------------------------------------
export type Escalao = 1 | 2 | 3;

/** O último dia (YYYY-MM-DD, inclusive) do escalão 1. */
export function marcoEscalao1(data_inicio: string, janela_x_meses: number): string {
  return menosMeses(data_inicio, janela_x_meses);
}

/** O último dia (YYYY-MM-DD, inclusive) do escalão 2 (= data_inicio − 8 dias). */
export function marcoEscalao2(data_inicio: string): string {
  return menosDias(data_inicio, 8);
}

/**
 * Em que escalão cai um cancelamento feito HOJE (ou em `hojeISO`, para teste)?
 * Comparação de datas em UTC (YYYY-MM-DD, lexicográfica). Nota honesta: a
 * fronteira do dia usa UTC, não Lisboa — 0–1h de folga; a favor do cliente
 * seria escolher Lisboa, fica como afinação com o advogado (TODO).
 */
export function escalaoCancelamento(
  data_inicio: string,
  janela_x_meses: number,
  hojeISO?: string,
): Escalao {
  const hoje = hojeISO ?? new Date().toISOString().slice(0, 10);
  if (hoje <= marcoEscalao1(data_inicio, janela_x_meses)) return 1;
  if (hoje <= marcoEscalao2(data_inicio)) return 2;
  return 3;
}

/** O valor (cêntimos) da cláusula penal de um escalão — null se não computável. */
export function valorEscalao(
  escalao: Escalao,
  valor_total: number | null,
  pct_cancelamento: number,
  pct_caucao: number,
): number | null {
  if (escalao === 1) return 0;
  if (valor_total == null || valor_total <= 0) return null; // "(a combinar)" — nada a cobrar via Honra
  const pct = escalao === 2 ? pct_cancelamento : pct_caucao;
  return Math.round((valor_total * pct) / 100);
}

/**
 * Compõe o texto integral do contrato-convite (nível i). Determinístico:
 * os mesmos dados produzem exatamente o mesmo texto (logo o mesmo hash).
 */
export function gerarContratoTexto(d: DadosContrato): string {
  const dataEvento =
    d.data_fim && d.data_fim !== d.data_inicio
      ? `${dataLonga(d.data_inicio)} a ${dataLonga(d.data_fim)}`
      : dataLonga(d.data_inicio);

  const marcoEscalao1 = dataLonga(menosMeses(d.data_inicio, d.janela_x_meses));

  const linhas: string[] = [];

  linhas.push('CONTRATO DE PRESTAÇÃO DE SERVIÇO — HONRA');
  linhas.push('');
  linhas.push(`Modelo ${CONTRATO_VERSAO}. Celebrado à distância, assinado por código (OTP) via SMS.`);
  linhas.push('');

  // Partes
  linhas.push('1. PARTES');
  linhas.push(`Prestador (o Profissional): ${d.profissional_nome}, com identidade verificada no Honra.`);
  linhas.push(`Cliente: ${d.cliente_nome}, contactável em ${d.cliente_telefone}.`);
  linhas.push('');

  // Objeto
  linhas.push('2. OBJETO');
  linhas.push(`Serviço: ${d.servico ?? '(a especificar entre as partes)'}.`);
  linhas.push('');

  // Data — EM DESTAQUE (invariante legal)
  linhas.push('3. DATA DO EVENTO (elemento essencial)');
  linhas.push(`>>> ${dataEvento} <<<`);
  linhas.push('Esta data é essencial: o serviço reserva uma capacidade única do Profissional');
  linhas.push('para este dia, que dificilmente pode ser reocupada se o Cliente desistir.');
  linhas.push('');

  // Valor e adiantamento (NUNCA "sinal")
  linhas.push('4. VALOR E PAGAMENTO');
  linhas.push(`Valor total do serviço: ${eur(d.valor_total)}.`);
  linhas.push('O pagamento do serviço é feito DIRETAMENTE entre o Cliente e o Profissional,');
  linhas.push('fora do Honra. O Honra não recebe nem guarda este dinheiro.');
  if (d.sinal_valor != null && d.sinal_valor > 0) {
    linhas.push(`Adiantamento acordado (pago direto ao Profissional): ${eur(d.sinal_valor)}.`);
    linhas.push('Este adiantamento é uma antecipação do pagamento, não constitui sinal.');
  }
  linhas.push('');

  // Cláusula penal de cancelamento — escalonada, com VALORES CONCRETOS
  linhas.push('5. CANCELAMENTO PELO CLIENTE (cláusula penal — art. 810.º do Código Civil)');
  linhas.push('Se o Cliente cancelar, deve ao Profissional, a título de cláusula penal (e não');
  linhas.push('de sinal), o seguinte, consoante a antecedência em relação à data do evento:');
  linhas.push(`  a) Até ${marcoEscalao1} (mais de ${d.janela_x_meses} ${d.janela_x_meses === 1 ? 'mês' : 'meses'} antes):`);
  linhas.push('     nada é devido ao abrigo deste contrato (o Cliente perde apenas o');
  linhas.push('     adiantamento que tenha pago diretamente, se algum).');
  linhas.push(`  b) Entre ${marcoEscalao1} e 8 dias antes do evento:`);
  linhas.push(`     ${pctDe(d.valor_total, d.pct_cancelamento)} do valor total.`);
  linhas.push('  c) Nos 7 dias anteriores ao evento, ou no próprio dia (não comparência):');
  linhas.push(`     ${pctDe(d.valor_total, d.pct_caucao)} do valor total.`);
  linhas.push('Os montantes são a liquidação antecipada do prejuízo típico do Profissional');
  linhas.push('por perder a data; podem ser reduzidos se a data for reocupada.');
  linhas.push('');

  // Quebra do Profissional (simetria — DL 446/85 art. 19.º/c e boa-fé)
  linhas.push('6. INCUMPRIMENTO PELO PROFISSIONAL');
  linhas.push('Se o Profissional faltar ou não prestar o serviço acordado, nada é devido pelo');
  linhas.push('Cliente e o incumprimento fica marcado no perfil público do Profissional no');
  linhas.push('Honra, além do direito do Cliente a ser ressarcido nos termos gerais.');
  linhas.push('');

  // Aviso legal EXPRESSO (art. 4.º/1/p) — invariante
  linhas.push('7. SEM DIREITO DE LIVRE RESOLUÇÃO (14 dias)');
  linhas.push('Por ter uma data de execução específica, este contrato NÃO confere ao Cliente o');
  linhas.push('direito de livre resolução de 14 dias (art. 17.º, n.º 1, alínea k, do Decreto-Lei');
  linhas.push('24/2014). Aplica-se a política de cancelamento da cláusula 5.');
  linhas.push('');

  // Nível ii — a cláusula do cartão (Fatia C-2). O nível i NÃO passa por aqui:
  // o texto fica byte-igual ao da Fatia B (hashes antigos continuam válidos).
  const nivel = d.nivel_protecao ?? 1;
  if (nivel >= 2) {
    linhas.push('8. PROTEÇÃO POR CARTÃO E MANDATO DE COBRANÇA');
    linhas.push('Depois de assinar, o Cliente guarda um cartão de pagamento como proteção mútua');
    linhas.push('deste contrato. O cartão fica guardado em segurança na Stripe (o Honra nunca vê');
    linhas.push('os números) e NADA é cobrado a menos que o Cliente cancele nos termos da');
    linhas.push(`cláusula 5. O Cliente autoriza — em benefício de ${d.profissional_nome}, o`);
    linhas.push('beneficiário desta autorização — a cobrança sem a sua presença (off-session) da');
    linhas.push('cláusula penal da cláusula 5, nos montantes e prazos exatos aí definidos.');
    linhas.push('O texto integral do mandato é mostrado e aceite no passo do cartão.');
    linhas.push('');
  }

  // Anexos — registados por hash+carimbo, nunca interpretados
  const numAnexos = nivel >= 2 ? '9' : '8';
  if (d.anexos && d.anexos.length > 0) {
    linhas.push(`${numAnexos}. ANEXOS DO PROFISSIONAL (registados, não interpretados)`);
    linhas.push('O Honra atesta a EXISTÊNCIA e a INTEGRIDADE destes ficheiros à data indicada,');
    linhas.push('nunca o seu conteúdo nem a sua validade jurídica:');
    d.anexos.forEach((a, i) => {
      const letra = String.fromCharCode(65 + i); // A, B, C…
      linhas.push(`  Anexo ${letra}: ${a.nome_ficheiro} (SHA-256 ${a.sha256.slice(0, 16)}…, registado a ${dataLonga(a.criado_em.slice(0, 10))}).`);
    });
    linhas.push('');
  }

  // Fronteira do Honra
  linhas.push('O QUE O HONRA GARANTE E NÃO GARANTE');
  linhas.push('O Honra garante que a identidade do Profissional foi verificada e que este é o');
  linhas.push('texto exato que foi assinado (pelo seu código de integridade). O Honra NÃO');
  linhas.push('processa o pagamento do serviço nem garante a sua qualidade. Assinatura por');
  linhas.push('código (OTP) enviado para o telemóvel do Cliente.');

  return linhas.join('\n');
}

/**
 * Gera o texto e o hash de uma vez. Devolve também a versão e um resumo curto
 * para o SMS/audit trail.
 */
export async function gerarContrato(d: DadosContrato): Promise<{
  texto: string;
  hash: string;
  hash8: string;
  versao: string;
  resumo: string;
}> {
  const texto = gerarContratoTexto(d);
  const hash = await sha256(texto);
  const resumo = `${d.servico ?? 'serviço'} · ${dataLonga(d.data_inicio)}`;
  return { texto, hash, hash8: hash8(hash), versao: CONTRATO_VERSAO, resumo };
}

/**
 * O TEXTO DO MANDATO (nível ii, Fatia C-2) — a peça jurídica central do cartão.
 * Exigências incorporadas (doc §5, JURIDICO §5.1):
 *   • NOMEIA o profissional como BENEFICIÁRIO (EBA Q&A 2019_4794);
 *   • gatilhos pré-definidos com as percentagens, os VALORES e as DATAS
 *     concretas do contrato (regra Visa "properly disclosed");
 *   • a promessa central à cabeça: nada é cobrado a menos que o Cliente
 *     cancele nos termos que assinou;
 *   • curto, em português corrente — não um wall of legalês.
 * `refContrato` = hash8 do contrato (liga o mandato ao texto exato assinado).
 * Determinístico: os mesmos dados → o mesmo texto → o mesmo hash.
 * NOTA (Fatia D): a RESERVA (hold) da % de caução na semana do evento é do
 * nível iii — o mandato do nível ii NÃO a promete nem a autoriza.
 */
export function gerarMandatoTexto(d: DadosContrato, refContrato: string): string {
  const marco1 = dataLonga(marcoEscalao1(d.data_inicio, d.janela_x_meses));
  const dataEvento = dataLonga(d.data_inicio);

  const linhas: string[] = [];
  linhas.push('AUTORIZAÇÃO DE COBRANÇA NO CARTÃO (MANDATO)');
  linhas.push('');
  linhas.push(`Modelo ${MANDATO_VERSAO}. Contrato: ${d.servico ?? 'serviço'} · ${dataEvento} · ref ${refContrato}.`);
  linhas.push(`Beneficiário desta autorização: ${d.profissional_nome} (o Profissional).`);
  linhas.push('');
  linhas.push('Nada é cobrado neste cartão a menos que eu cancele nos termos que assinei.');
  linhas.push('');
  linhas.push(`Ao guardar o meu cartão, eu, ${d.cliente_nome}, autorizo que a cláusula penal de`);
  linhas.push('cancelamento do contrato (cláusula 5) seja cobrada neste cartão, sem a minha');
  linhas.push('presença, apenas nestes casos e valores:');
  linhas.push(`  a) Se eu cancelar até ${marco1}: nada é cobrado neste cartão.`);
  linhas.push(`  b) Se eu cancelar depois de ${marco1} e até 8 dias antes do evento:`);
  linhas.push(`     ${pctDe(d.valor_total, d.pct_cancelamento)} do valor total.`);
  linhas.push('  c) Se eu cancelar nos 7 dias anteriores ao evento, ou faltar sem cancelar:');
  linhas.push(`     ${pctDe(d.valor_total, d.pct_caucao)} do valor total.`);
  linhas.push('');
  // Fatia D — a RESERVA de caução (hold), dita ANTES de o cartão ser guardado.
  // Só em cartões de crédito (decisão da investigação: débito = sem retenção).
  linhas.push('Reserva de caução: se o meu cartão for de CRÉDITO, autorizo também uma reserva');
  linhas.push(`(não é uma cobrança) de ${pctDe(d.valor_total, d.pct_caucao)} do valor, feita nos`);
  linhas.push('últimos dias antes do evento e devolvida por inteiro no dia, se tudo correr');
  linhas.push('como assinado; só é capturada nos casos da alínea c). Sou avisado antes de a');
  linhas.push('reserva ser feita. Em cartões de débito ou pré-pagos não há qualquer retenção.');
  linhas.push('');
  linhas.push('Nada mais é cobrado neste cartão ao abrigo deste contrato. O pagamento do');
  linhas.push('serviço corre fora do Honra, diretamente entre mim e o Profissional.');
  linhas.push('O cartão fica guardado em segurança na Stripe e a cobrança é processada pela');
  linhas.push('Stripe na conta do Profissional — o Honra nunca vê os números do cartão nem');
  linhas.push('recebe estes fundos. Se o Profissional cancelar ou faltar, nada me é cobrado.');

  return linhas.join('\n');
}

/** Gera o texto e o hash do mandato de uma vez (como gerarContrato). */
export async function gerarMandato(
  d: DadosContrato,
  refContrato: string,
): Promise<{ texto: string; hash: string; versao: string }> {
  const texto = gerarMandatoTexto(d, refContrato);
  const hash = await sha256(texto);
  return { texto, hash, versao: MANDATO_VERSAO };
}
