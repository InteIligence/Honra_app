import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Botao,
  Campo,
  CampoData,
  Carregar,
  Cartao,
  Erro,
  Estrelas,
  formatarData,
  hojeISO,
} from '@/components/ui';
import { Checkpoints } from '@/components/Checkpoints';
import { Entrega } from '@/components/Entrega';
import { LinhaTempo } from '@/components/LinhaTempo';
import { useT, type ChaveI18n } from '@/i18n';
import { useIdentidadeVerificada } from '@/lib/identidade';
import { proximoPassoProjeto, useProjeto, type Checkpoint } from '@/lib/projeto';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

const ESTADO_TXT: Record<string, ChaveI18n> = {
  pedido: 'estado.pedido',
  aceite: 'estado.aceite',
  selado: 'estado.selado_longo',
  honrado: 'estado.honrado_v',
  entregue: 'estado.entregue',
  concluido: 'estado.concluido',
  incumprido: 'estado.nao_cumprido',
  cancelado: 'estado.cancelado',
  expirado: 'estado.expirado',
  recusado: 'estado.recusado',
};
const VERDES = ['aceite', 'selado', 'honrado', 'entregue', 'concluido'];

/**
 * CHECKPOINTS DA PROPOSTA — a definição vive DENTRO do orçamento (decisão
 * 20/07): o contratante marca o que espera e quando, o contratado vê antes de
 * aceitar, e o selo tranca tudo (guarda 047). Sem orçamento não há checkpoint.
 */
function CheckpointsProposta({
  orcamentoId,
  checkpoints,
  prazoProjeto,
  onMudou,
}: {
  orcamentoId: string;
  checkpoints: Checkpoint[];
  prazoProjeto: string | null;
  onMudou: () => void;
}) {
  const { t } = useT();
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const [erroCp, setErroCp] = useState<string | null>(null);
  // A data da apresentação final vive no PRAZO do negócio — é o mesmo
  // compromisso, não uma coluna nova. Editável só nesta janela (pedido/
  // aceite, do lado A); B vê-a antes de aceitar; o selo fecha a janela.
  const [prazoFinal, setPrazoFinal] = useState(prazoProjeto ?? '');

  async function guardarPrazoFinal(data: string) {
    setPrazoFinal(data);
    setErroCp(null);
    const { error } = await supabase
      .from('orcamentos')
      .update({ prazo: data || null })
      .eq('id', orcamentoId);
    if (error) return setErroCp(t('cpdef.erro'));
    onMudou();
  }

  async function adicionar() {
    if (!descricao.trim()) return;
    setAGuardar(true);
    setErroCp(null);
    const ordem = checkpoints.reduce((m, c) => Math.max(m, c.ordem), 0) + 1;
    const { error } = await supabase.from('checkpoints_orcamento').insert({
      orcamento_id: orcamentoId,
      ordem,
      descricao: descricao.trim(),
      prazo: prazo || prazoProjeto || null,
      estado: 'pendente',
    });
    setAGuardar(false);
    if (error) return setErroCp(t('cpdef.erro'));
    setDescricao('');
    setPrazo('');
    onMudou();
  }

  async function remover(cpId: string) {
    setErroCp(null);
    const { error } = await supabase.from('checkpoints_orcamento').delete().eq('id', cpId);
    if (error) return setErroCp(t('cpdef.erro'));
    onMudou();
  }

  return (
    <Cartao style={cpDefStyles.bloco}>
      <Text style={cpDefStyles.rotulo}>{t('pperfil.checkpoints')}</Text>
      <Text style={cpDefStyles.ajuda}>{t('pperfil.checkpoints_ajuda')}</Text>
      {checkpoints.map((cp) => (
        <View key={cp.id} style={cpDefStyles.linha}>
          <View style={cpDefStyles.meio}>
            <Text style={cpDefStyles.desc}>{cp.descricao}</Text>
            {cp.prazo ? (
              <Text style={cpDefStyles.prazo}>
                {t('pesq.ate_prazo', { data: formatarData(cp.prazo) })}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => remover(cp.id)} hitSlop={8}>
            <Text style={cpDefStyles.remover}>{t('pperfil.checkpoint_remover')}</Text>
          </Pressable>
        </View>
      ))}
      <Campo
        placeholder={t('pperfil.checkpoint_ph')}
        value={descricao}
        onChangeText={setDescricao}
      />
      <CampoData
        value={prazo}
        onChange={setPrazo}
        placeholder={t('pperfil.checkpoint_prazo_ph')}
        minimo={hojeISO()}
      />
      <Botao
        titulo={t('pperfil.checkpoint_add')}
        variante="secundario"
        onPress={adicionar}
        aCarregar={aGuardar}
        desativado={!descricao.trim()}
      />
      {/* A APRESENTAÇÃO FINAL — o destino, abaixo do caminho (decisão 26/07):
          com ênfase própria. Não é um checkpoint: não se remove, não se move —
          marca-se o dia. O dourado é o da honra de chegar lá. */}
      <View style={cpDefStyles.finalBloco}>
        <View style={cpDefStyles.finalCabeca}>
          <View style={cpDefStyles.pontoFinal} />
          <Text style={cpDefStyles.finalTitulo}>{t('cp.final_titulo')}</Text>
        </View>
        <Text style={cpDefStyles.ajuda}>{t('cp.final_ajuda')}</Text>
        <CampoData
          value={prazoFinal}
          onChange={guardarPrazoFinal}
          placeholder={t('cp.final_data_ph')}
          minimo={hojeISO()}
        />
      </View>
      {erroCp && <Erro texto={erroCp} />}
    </Cartao>
  );
}

const cpDefStyles = StyleSheet.create({
  bloco: { gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  ajuda: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 18 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    paddingVertical: Espaco.xs,
    borderBottomWidth: 1,
    borderBottomColor: Honra.cremeEscuro,
  },
  meio: { flex: 1 },
  desc: { color: Honra.tinta, fontSize: 14, fontWeight: '600' },
  prazo: { color: Honra.tintaSuave, fontSize: 12, marginTop: 1 },
  remover: { color: Honra.erro, fontSize: 13, fontWeight: '700' },
  // O destino, com ênfase: bloco próprio no fim do cartão, separado por um
  // fio; título maior que os checkpoints e ponto dourado (honra do fim).
  finalBloco: {
    marginTop: Espaco.xs,
    paddingTop: Espaco.sm,
    borderTopWidth: 1,
    borderTopColor: Honra.cremeEscuro,
    gap: Espaco.xs,
  },
  finalCabeca: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  finalTitulo: { color: Honra.tinta, fontSize: 16, fontWeight: '800' },
  pontoFinal: {
    width: 9,
    height: 9,
    borderRadius: Raio.pill,
    backgroundColor: Honra.dourado,
  },
});

/**
 * A PROPOSTA DO CLIENTE (062): o VALOR — do cliente, NUNCA do profissional
 * (regra 27/07). Editável só pré-selo; o profissional vê antes de aceitar
 * (é a isto que diz sim) e o selo tranca para os dois.
 * A DATA não vive aqui (27/07): a porta dela é uma só — a "Apresentação
 * final", no cartão dos checkpoints. Duas portas para o mesmo facto era ruído.
 */
function PropostaCliente({
  projeto,
  aProcessar,
  onGuardar,
}: {
  projeto: { valor_proposta?: number | null; prazo: string | null };
  aProcessar: boolean;
  onGuardar: (valor: number | null, prazo: string | null) => Promise<boolean>;
}) {
  const { t } = useT();
  const [valor, setValor] = useState(
    projeto.valor_proposta != null ? String(projeto.valor_proposta) : ''
  );
  const [guardada, setGuardada] = useState(false);

  const num = parseFloat(valor.replace(',', '.'));
  const valorValido = !valor.trim() || (Number.isFinite(num) && num > 0);

  async function guardar() {
    setGuardada(false);
    // O prazo passa intacto — quem o edita é a Apresentação final.
    const ok = await onGuardar(valor.trim() && valorValido ? num : null, projeto.prazo ?? null);
    setGuardada(ok);
  }

  return (
    <Cartao style={propStyles.bloco}>
      <Text style={propStyles.rotulo}>{t('proposta.rotulo')}</Text>
      <Text style={propStyles.ajuda}>{t('proposta.ajuda')}</Text>
      <Campo
        placeholder={t('proposta.valor_ph')}
        value={valor}
        onChangeText={(v: string) => {
          setValor(v);
          setGuardada(false);
        }}
        keyboardType="decimal-pad"
      />
      <Botao
        titulo={t('proposta.guardar')}
        variante="secundario"
        onPress={guardar}
        aCarregar={aProcessar}
        desativado={!valorValido || !valor.trim()}
      />
      {guardada && <Text style={propStyles.guardada}>{t('proposta.guardada')}</Text>}
    </Cartao>
  );
}

const propStyles = StyleSheet.create({
  bloco: { gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  ajuda: { color: Honra.tintaSuave, fontSize: 13, lineHeight: 18 },
  guardada: { color: Honra.verde, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});

// Mostra a foto de evolução (bucket privado → URL assinado, só as partes).
function Evidencia({ caminho }: { caminho: string }) {
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
  if (!url) return null;
  return <Image source={{ uri: url }} style={styles.evidencia} resizeMode="cover" />;
}

// Negócios que se podem avaliar — só no FIM (a entrega+pagamento da 065 corre
// entre honrado e concluido; a avaliação abre em concluido, a par da BD).
const AVALIAVEL = ['concluido', 'confirmado_ambos', 'devolvido'];

export default function ProjetoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { projeto, checkpoints, souA, uid, aCarregar, erroCarregar, erro, aProcessar, jaAvaliei, carregar, accoes } =
    useProjeto(id);

  // Formulário de avaliação (estrelas + comentário) — vive aqui, no detalhe.
  const [avAberto, setAvAberto] = useState(false);
  const [avNota, setAvNota] = useState(0);
  const [avComentario, setAvComentario] = useState('');
  // Avaliar exige identidade verificada (fuga C, migração 043) — a UI diz a
  // verdade antes de a BD negar o insert.
  const { verificada: minhaIdVerificada } = useIdentidadeVerificada();

  useFocusEffect(useCallback(() => carregar(), [carregar]));

  const outroNome = souA ? projeto?.para?.nome : projeto?.de?.nome;
  const outroId = souA ? projeto?.para_perfil : projeto?.de_perfil;
  const passo = projeto
    ? proximoPassoProjeto(projeto.estado, souA, !!projeto.a_agiu_em, !!projeto.b_agiu_em, t)
    : null;

  return (
    <SafeAreaView style={styles.fundo} edges={['top']}>
      <Pressable style={styles.voltar} onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.voltarTxt}>{t('comum.voltar_seta')}</Text>
      </Pressable>

      {aCarregar ? (
        <Carregar />
      ) : erroCarregar || !projeto ? (
        <View style={styles.centro}>
          <Erro texto={erroCarregar ?? t('projeto.nao_encontrado')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.corpo}>
          {/* CABEÇALHO — a outra parte + estado */}
          <Text style={styles.titulo}>{t('projeto.titulo')}</Text>
          <Pressable
            style={styles.parte}
            onPress={() => outroId && router.push(`/perfil/${outroId}`)}
          >
            <Text style={styles.parteRotulo}>{souA ? t('projeto.com') : t('projeto.de')}</Text>
            <Text style={styles.parteNome}>{outroNome ?? t('inicio.alguem')}</Text>
            <Text style={styles.verPerfil}>{t('projeto.ver_perfil')}</Text>
          </Pressable>

          <View style={[styles.estado, VERDES.includes(projeto.estado) && styles.estadoVerde]}>
            <Text
              style={[styles.estadoTxt, VERDES.includes(projeto.estado) && styles.estadoTxtVerde]}
            >
              {ESTADO_TXT[projeto.estado] ? t(ESTADO_TXT[projeto.estado]) : projeto.estado}
            </Text>
          </View>

          {/* Conversa do negócio — as duas partes falam aqui dentro. */}
          <Botao
            titulo={t('projeto.conversa')}
            variante="secundario"
            onPress={() => router.push(`/conversa/${id}`)}
          />

          {/* PRÓXIMO PASSO */}
          {passo?.texto ? (
            <View style={styles.passo}>
              <View style={[styles.passoDot, passo.minhaVez && styles.passoDotVez]} />
              <Text style={[styles.passoTxt, passo.minhaVez && styles.passoTxtVez]}>
                {passo.texto}
              </Text>
            </View>
          ) : null}

          {/* DETALHES — com o combinado (062): valor e prazo à vista das duas
              partes. É a isto que o profissional diz sim antes de aceitar. */}
          <Cartao style={styles.bloco}>
            {projeto.descricao ? <Text style={styles.desc}>{projeto.descricao}</Text> : null}
            {projeto.valor_proposta != null && (
              <View style={styles.linha}>
                <Text style={styles.linhaRotulo}>{t('projeto.valor')}</Text>
                <Text style={styles.linhaValor}>{projeto.valor_proposta}€</Text>
              </View>
            )}
            {projeto.prazo && (
              <View style={styles.linha}>
                <Text style={styles.linhaRotulo}>{t('projeto.prazo')}</Text>
                <Text style={styles.linhaValor}>{formatarData(projeto.prazo)}</Text>
              </View>
            )}
            <View style={styles.linha}>
              <Text style={styles.linhaRotulo}>{t('projeto.compromisso')}</Text>
              <Text style={styles.linhaValor}>{t('projeto.compromisso_valor')}</Text>
            </View>
          </Cartao>

          {/* HISTÓRICO — os passos do negócio, com tempos e o ficheiro exposto. */}
          <Cartao style={styles.bloco}>
            <LinhaTempo projeto={projeto} />
          </Cartao>

          {/* A PROPOSTA (062) — valor + prazo, do CLIENTE, pré-selo. */}
          {souA && (projeto.estado === 'pedido' || projeto.estado === 'aceite') && (
            <PropostaCliente
              projeto={projeto}
              aProcessar={aProcessar}
              onGuardar={accoes.guardarProposta}
            />
          )}

          {/* CHECKPOINTS (fatia D). ANTES do selo, o contratante define-os AQUI
              — dentro do orçamento, onde pertencem (decisão 20/07); trancam no
              selo. Depois do selo, cada um corre a sua máquina (evidência →
              confirmar/contestar) e são o coração do trabalho. */}
          {souA && (projeto.estado === 'pedido' || projeto.estado === 'aceite') ? (
            <CheckpointsProposta
              orcamentoId={String(id)}
              checkpoints={checkpoints}
              prazoProjeto={projeto.prazo}
              onMudou={carregar}
            />
          ) : (
            <Checkpoints
              checkpoints={checkpoints}
              souA={souA}
              selado={projeto.estado === 'selado'}
              aProcessar={aProcessar}
              accoes={accoes}
              estadoProjeto={projeto.estado}
              prazo={projeto.prazo}
              pagamentoEstado={projeto.pagamento_estado}
              temEntrega={!!projeto.entrega_em}
            />
          )}

          {/* A ENTREGA FINAL com pagamento (065) — uma porta por facto: as
              ações da entrega (apresentar/pagar/confirmar/contestar) vivem
              TODAS aqui; o marco "Apresentação final" acima só reflete. O
              bloco esconde-se sozinho enquanto a migração não estiver na BD. */}
          <Entrega projeto={projeto} souA={souA} aProcessar={aProcessar} accoes={accoes} />

          {/* EVIDÊNCIA (LEGADO) — só para negócios sem checkpoints. */}
          {checkpoints.length === 0 && souA && projeto.estado === 'selado' && projeto.evolucao_ficheiro && (
            <View style={styles.bloco}>
              <Text style={styles.rotulo}>{t('projeto.evolucao_apresentada')}</Text>
              <Evidencia caminho={projeto.evolucao_ficheiro} />
            </View>
          )}

          {erro && <Erro texto={erro} />}

          {/* ===== AÇÕES por estado ===== */}
          <View style={styles.accoes}>{renderAccoes()}</View>
        </ScrollView>
      )}
    </SafeAreaView>
  );

  function renderAccoes() {
    if (!projeto || !passo) return null;
    const p = projeto;
    const emCurso = aProcessar;

    // Cancelamento de comum acordo (dois toques) — só no selado.
    const blocoCancelar =
      p.estado === 'selado' ? (
        p.cancel_por === uid ? (
          <Text style={styles.nota}>{t('projeto.cancel_pedido')}</Text>
        ) : (
          <Botao
            titulo={p.cancel_por ? t('projeto.cancel_confirmar') : t('projeto.cancel_mutuo')}
            variante="secundario"
            onPress={accoes.cancelarMutuo}
            aCarregar={emCurso}
          />
        )
      ) : null;

    switch (p.estado) {
      case 'pedido':
        return souA ? (
          <Text style={styles.nota}>{t('projeto.espera_resposta')}</Text>
        ) : (
          <>
            <Text style={styles.nota}>{t('projeto.aviso_palavra')}</Text>
            <Botao titulo={t('projeto.aceitar')} onPress={accoes.aperto} aCarregar={emCurso} />
            <Botao titulo={t('projeto.recusar')} variante="secundario" onPress={accoes.recusar} />
          </>
        );
      case 'aceite':
        return souA ? (
          <>
            <Text style={styles.nota}>{t('projeto.aviso_selar')}</Text>
            <Botao titulo={t('projeto.selar')} onPress={accoes.aperto} aCarregar={emCurso} />
          </>
        ) : (
          <Text style={styles.nota}>{t('projeto.aceitaste')}</Text>
        );
      case 'selado': {
        // Com checkpoints (fatia D), as ações vivem no bloco Checkpoints acima;
        // aqui fica só o cancelamento de comum acordo.
        if (checkpoints.length > 0) {
          return <>{blocoCancelar}</>;
        }
        const euAgi = souA ? !!p.a_agiu_em : !!p.b_agiu_em;
        return (
          <>
            {euAgi ? (
              <Text style={styles.nota}>{t('projeto.ja_agiste')}</Text>
            ) : souA ? (
              <Botao
                titulo={t('projeto.confirmar_evolucao')}
                onPress={accoes.confirmarEvolucao}
                aCarregar={emCurso}
              />
            ) : (
              <Botao
                titulo={t('projeto.apresentar_evolucao')}
                onPress={accoes.apresentarEvolucao}
                aCarregar={emCurso}
              />
            )}
            {blocoCancelar}
          </>
        );
      }
      // A entrega + pagamento (065) vivem no bloco <Entrega> acima — em
      // `honrado`/`entregue` as ações são de lá; aqui não se repete. A
      // avaliação abre só no fim, em `concluido` (a par da política da BD).
      case 'honrado':
      case 'entregue':
        return null;
      case 'concluido':
        return renderAvaliacao();
      default:
        return AVALIAVEL.includes(p.estado) ? (
          renderAvaliacao()
        ) : (
          <Text style={styles.nota}>
            {ESTADO_TXT[p.estado] ? t(ESTADO_TXT[p.estado]) : p.estado}
          </Text>
        );
    }
  }

  // Avaliação (UM SÓ SENTIDO) — só o CLIENTE (souA) avalia o profissional.
  // O profissional não avalia o cliente; vê apenas uma nota discreta.
  function renderAvaliacao() {
    if (!souA) {
      return <Text style={styles.nota}>{t('projeto.concluido_cliente_avalia')}</Text>;
    }
    if (jaAvaliei) {
      return <Text style={styles.avaliado}>{t('projeto.avaliado')}</Text>;
    }
    if (!minhaIdVerificada) {
      // Sem identidade verificada não se avalia (043) — mensagem honesta
      // que aponta o caminho, em vez de um formulário que falharia.
      return (
        <>
          <Text style={styles.nota}>{t('idverif.avaliar')}</Text>
          <Botao
            titulo={t('idverif.botao')}
            variante="secundario"
            onPress={() => router.push('/perfil')}
          />
        </>
      );
    }
    if (!avAberto) {
      return (
        <>
          <Text style={styles.nota}>{t('projeto.concluido_avalia')}</Text>
          <Botao
            titulo={t('projeto.avaliar')}
            variante="secundario"
            onPress={() => {
              setAvNota(0);
              setAvComentario('');
              setAvAberto(true);
            }}
          />
        </>
      );
    }
    return (
      <View style={styles.formAval}>
        <Text style={styles.rotulo}>{t('projeto.tua_avaliacao')}</Text>
        <Text style={styles.nota}>{t('projeto.avaliacao_publica')}</Text>
        {/* Estrelas da casa; zonas de toque invisíveis por cima escolhem 1–5. */}
        <View style={styles.estrelasCaixa}>
          <Estrelas nota={avNota} tamanho={30} />
          <View style={styles.estrelasToque}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                style={styles.estrelaZona}
                onPress={() => setAvNota(n)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('projeto.dar_estrelas', { n })}
                accessibilityState={{ selected: avNota === n }}
              />
            ))}
          </View>
        </View>
        <Campo
          placeholder={t('projeto.comentario_ph')}
          value={avComentario}
          onChangeText={setAvComentario}
          multiline
        />
        <View style={styles.acoesAval}>
          <Botao
            titulo={t('comum.cancelar')}
            variante="secundario"
            onPress={() => setAvAberto(false)}
            style={styles.acaoAval}
          />
          <Botao
            titulo={t('projeto.enviar_avaliacao')}
            onPress={async () => {
              const ok = await accoes.avaliar(avNota, avComentario);
              if (ok) setAvAberto(false);
            }}
            aCarregar={aProcessar}
            desativado={avNota < 1}
            style={styles.acaoAval}
          />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: Honra.creme },
  voltar: { paddingHorizontal: Espaco.md, paddingTop: Espaco.sm },
  voltarTxt: { color: Honra.verde, fontSize: 16, fontWeight: '700' },
  centro: { padding: Espaco.xl, alignItems: 'center' },
  corpo: { padding: Espaco.xl, gap: Espaco.md, paddingBottom: Espaco.xxl },
  titulo: { fontSize: 28, fontWeight: '800', color: Honra.tinta },

  parte: { gap: 2 },
  parteRotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  parteNome: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  verPerfil: { color: Honra.verde, fontSize: 13, fontWeight: '700' },

  estado: {
    alignSelf: 'flex-start',
    borderRadius: Raio.pill,
    paddingHorizontal: Espaco.md,
    paddingVertical: 4,
    backgroundColor: Honra.creme,
  },
  estadoVerde: { backgroundColor: Honra.verdeSuave },
  estadoTxt: { fontSize: 13, fontWeight: '700', color: Honra.tintaSuave },
  estadoTxtVerde: { color: Honra.verde },

  passo: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm },
  passoDot: { width: 8, height: 8, borderRadius: Raio.pill, backgroundColor: Honra.pendente },
  passoDotVez: { backgroundColor: Honra.verde },
  passoTxt: { fontSize: 15, color: Honra.tintaSuave, fontWeight: '700' },
  passoTxtVez: { color: Honra.verde },

  bloco: { gap: Espaco.sm },
  desc: { fontSize: 15, color: Honra.tinta, lineHeight: 21 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linhaRotulo: { color: Honra.tintaSuave, fontSize: 13, fontWeight: '600' },
  linhaValor: { color: Honra.tinta, fontSize: 13, fontWeight: '700' },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  evidencia: { width: '100%', height: 200, borderRadius: Raio.md, backgroundColor: Honra.cremeEscuro },

  nota: { fontSize: 14, color: Honra.tintaSuave, lineHeight: 20 },
  accoes: { gap: Espaco.sm, marginTop: Espaco.xs },

  // Avaliação (formulário de estrelas) — só quando o negócio está concluído.
  avaliado: { color: Honra.verde, fontWeight: '700', fontSize: 14 },
  formAval: { gap: Espaco.sm },
  estrelasCaixa: { alignSelf: 'flex-start' },
  estrelasToque: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row' },
  estrelaZona: { flex: 1 },
  acoesAval: { flexDirection: 'row', gap: Espaco.sm },
  acaoAval: { flex: 1 },
});
