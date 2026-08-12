# HONRA — Contrato-tipo e mandato de cartão (exemplar para o advogado)

> **O que é isto.** O Honra não usa um contrato escrito à mão: **gera** o contrato a partir dos dados do formulário-convite, sempre com a mesma estrutura e o mesmo texto (determinístico → mesmo texto = mesmo *hash* de integridade). Abaixo está um **exemplar renderizado** com um caso fictício, para o advogado ler o texto exato que o consumidor assina. O gerador vive em `supabase/functions/_shared/contrato.ts`.
>
> **Caso do exemplar:** fotógrafa (Ana Silva) ↔ cliente (João Martins), reportagem de casamento a **12 de junho de 2027**, valor **2 500 €**, adiantamento **500 €**, janela do 1.º escalão **3 meses**, penalização **15 %** / caução **25 %**, com proteção por cartão (nível ii). Valores e datas são gerados automaticamente a partir do contrato.

---

## PEÇA 1 — Contrato (modelo `convite-v1`)

```
CONTRATO DE PRESTAÇÃO DE SERVIÇO — HONRA

Modelo convite-v1. Celebrado à distância, assinado por código (OTP) via SMS.

1. PARTES
Prestador (o Profissional): Ana Silva, com identidade verificada no Honra.
Cliente: João Martins, contactável em +351 912 345 678.

2. OBJETO
Serviço: Reportagem fotográfica de casamento (dia completo).

3. DATA DO EVENTO (elemento essencial)
>>> 12 de junho de 2027 <<<
Esta data é essencial: o serviço reserva uma capacidade única do Profissional
para este dia, que dificilmente pode ser reocupada se o Cliente desistir.

4. VALOR E PAGAMENTO
Valor total do serviço: 2 500,00 €.
O pagamento do serviço é feito DIRETAMENTE entre o Cliente e o Profissional,
fora do Honra. O Honra não recebe nem guarda este dinheiro.
Adiantamento acordado (pago direto ao Profissional): 500,00 €.
Este adiantamento é uma antecipação do pagamento, não constitui sinal.

5. CANCELAMENTO PELO CLIENTE (cláusula penal — art. 810.º do Código Civil)
Se o Cliente cancelar, deve ao Profissional, a título de cláusula penal (e não
de sinal), o seguinte, consoante a antecedência em relação à data do evento:
  a) Até 12 de março de 2027 (mais de 3 meses antes):
     nada é devido ao abrigo deste contrato (o Cliente perde apenas o
     adiantamento que tenha pago diretamente, se algum).
  b) Entre 12 de março de 2027 e 8 dias antes do evento:
     15% (375,00 €) do valor total.
  c) Nos 7 dias anteriores ao evento, ou no próprio dia (não comparência):
     25% (625,00 €) do valor total.
Os montantes são a liquidação antecipada do prejuízo típico do Profissional
por perder a data; podem ser reduzidos se a data for reocupada.

6. INCUMPRIMENTO PELO PROFISSIONAL
Se o Profissional faltar ou não prestar o serviço acordado, nada é devido pelo
Cliente e o incumprimento fica marcado no perfil público do Profissional no
Honra, além do direito do Cliente a ser ressarcido nos termos gerais.

7. SEM DIREITO DE LIVRE RESOLUÇÃO (14 dias)
Por ter uma data de execução específica, este contrato NÃO confere ao Cliente o
direito de livre resolução de 14 dias (art. 17.º, n.º 1, alínea k, do Decreto-Lei
24/2014). Aplica-se a política de cancelamento da cláusula 5.

8. PROTEÇÃO POR CARTÃO E MANDATO DE COBRANÇA
Depois de assinar, o Cliente guarda um cartão de pagamento como proteção mútua
deste contrato. O cartão fica guardado em segurança na Stripe (o Honra nunca vê
os números) e NADA é cobrado a menos que o Cliente cancele nos termos da
cláusula 5. O Cliente autoriza — em benefício de Ana Silva, o
beneficiário desta autorização — a cobrança sem a sua presença (off-session) da
cláusula penal da cláusula 5, nos montantes e prazos exatos aí definidos.
O texto integral do mandato é mostrado e aceite no passo do cartão.

O QUE O HONRA GARANTE E NÃO GARANTE
O Honra garante que a identidade do Profissional foi verificada e que este é o
texto exato que foi assinado (pelo seu código de integridade). O Honra NÃO
processa o pagamento do serviço nem garante a sua qualidade. Assinatura por
código (OTP) enviado para o telemóvel do Cliente.
```

*(Se houver anexos do profissional — ex.: portefólio, seguro — entram numa cláusula 9 que regista apenas a **existência e integridade** do ficheiro por SHA-256, nunca o conteúdo.)*

---

## PEÇA 2 — Mandato de cobrança no cartão (modelo `mandato-v2`)

> Mostrado e aceite **no passo do cartão**, depois da assinatura do contrato. Nomeia o profissional como **beneficiário** (exigência EBA Q&A 2019_4794) e lista gatilhos, valores e datas concretos (regra Visa "properly disclosed"). O bloco da **reserva/hold** só se aplica a cartões de **crédito**.

```
AUTORIZAÇÃO DE COBRANÇA NO CARTÃO (MANDATO)

Modelo mandato-v2. Contrato: Reportagem fotográfica de casamento · 12 de junho de 2027 · ref a1b2c3d4.
Beneficiário desta autorização: Ana Silva (o Profissional).

Nada é cobrado neste cartão a menos que eu cancele nos termos que assinei.

Ao guardar o meu cartão, eu, João Martins, autorizo que a cláusula penal de
cancelamento do contrato (cláusula 5) seja cobrada neste cartão, sem a minha
presença, apenas nestes casos e valores:
  a) Se eu cancelar até 12 de março de 2027: nada é cobrado neste cartão.
  b) Se eu cancelar depois de 12 de março de 2027 e até 8 dias antes do evento:
     15% (375,00 €) do valor total.
  c) Se eu cancelar nos 7 dias anteriores ao evento, ou faltar sem cancelar:
     25% (625,00 €) do valor total.

Reserva de caução: se o meu cartão for de CRÉDITO, autorizo também uma reserva
(não é uma cobrança) de 25% (625,00 €) do valor, feita nos
últimos dias antes do evento e devolvida por inteiro no dia, se tudo correr
como assinado; só é capturada nos casos da alínea c). Sou avisado antes de a
reserva ser feita. Em cartões de débito ou pré-pagos não há qualquer retenção.

Nada mais é cobrado neste cartão ao abrigo deste contrato. O pagamento do
serviço corre fora do Honra, diretamente entre mim e o Profissional.
O cartão fica guardado em segurança na Stripe e a cobrança é processada pela
Stripe na conta do Profissional — o Honra nunca vê os números do cartão nem
recebe estes fundos. Se o Profissional cancelar ou faltar, nada me é cobrado.
```

---

## Decisões de redação já embutidas (para o advogado confirmar)

| Escolha no texto | Porquê | Onde validar |
|---|---|---|
| Diz **"cláusula penal (art. 810.º CC)"**, nunca "sinal" | Evitar o regime do dobro (art. 442.º/2 CC) contra o profissional | Briefing A-2 · Dossier §2 |
| Adiantamento é **"antecipação do pagamento, não sinal"** | Mesma razão | Dossier §2 |
| **Data em destaque** como "elemento essencial" | É o que aciona a exceção ao arrependimento (art. 17.º/1/k) | Briefing A-3 · Dossier §1 |
| **Aviso expresso** "sem direito de livre resolução" (cláusula 7) | Obrigatório — art. 4.º/1/p DL 24/2014 | Briefing A-3 · Dossier §1.3 |
| **Simetria**: cláusula 6 pune o profissional (marca + nada devido) | Equilíbrio exigido pelo DL 446/85 art. 19.º/c + boa-fé | Briefing A-1/A-2 · Dossier §3 |
| Escalões **10-15 % → 25 %**, reduzíveis se a data for reocupada | Proporcionalidade ao dano típico (art. 19.º/c); blinda contra art. 812.º | Briefing A-1 · Dossier §3 |
| Fundos **nunca tocam no Honra** (Stripe na conta do profissional) | Manter o Honra fora do regime de instituição de pagamento | Briefing B-5 · Dossier §6 |

> **Perguntas-chave sobre estas duas peças:** a redação da cláusula 5 passa o crivo do art. 19.º/c no quadro padronizado de eventos? O aviso da cláusula 7 tem a fórmula exata exigida? O mandato (peça 2) é suficiente como autorização MIT à luz do EBA Q&A 2019_4794? — ver Bloco A do briefing.
