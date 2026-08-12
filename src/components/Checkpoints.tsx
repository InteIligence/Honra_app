/**
 * HONRA — Checkpoints do projeto (fatia D). Mostrar-não-dizer:
 * cada checkpoint conta a sua história (pendente → entregue → confirmado /
 * contestado / incumprido). O PRESTADOR (para_perfil) apresenta evidência COM
 * substância; o RECETOR (de_perfil) confirma ou contesta. Silêncio ao prazo →
 * marca informada (nunca emboscada), tratada pelo resolver.
 */
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Botao, Campo, formatarData } from '@/components/ui';
import { useT, type ChaveI18n } from '@/i18n';
import { type Checkpoint } from '@/lib/projeto';
import { supabase } from '@/lib/supabase';
import { Espaco, Honra, Raio } from '@/theme/honra';

const ESTADO_TXT: Record<string, ChaveI18n> = {
  pendente: 'cp.estado_pendente',
  entregue: 'cp.estado_entregue',
  confirmado: 'cp.estado_confirmado',
  contestado: 'cp.estado_contestado',
  incumprido: 'cp.estado_incumprido',
  arquivado: 'cp.estado_arquivado',
};
const VERDE = ['entregue', 'confirmado'];

// Foto de evidência (bucket privado → URL assinado, só as partes).
function FotoEvidencia({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
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
  return (
    <>
      {/* A PROVA TEM DE SE VER INTEIRA. Estava em `cover`: um screenshot largo
          ficava recortado ao meio e o que se via eram quatro letras gigantes.
          Numa casa onde a entrega se paga contra esta imagem, uma prova que
          não se lê não é prova nenhuma — é uma miniatura decorativa por cima
          de dinheiro real.

          `contain` mostra a imagem toda; o toque abre-a em grande, porque a
          160px de altura nem tudo se decide. É o mesmo padrão que a Entrega
          (065) já usava — este ficou para trás. */}
      <Pressable onPress={() => setAberta(true)} accessibilityRole="imagebutton">
        <Image source={{ uri: url }} style={styles.foto} resizeMode="contain" />
      </Pressable>
      <Modal visible={aberta} transparent animationType="fade" onRequestClose={() => setAberta(false)}>
        <Pressable style={styles.veuProva} onPress={() => setAberta(false)}>
          <Image source={{ uri: url }} style={styles.provaGrande} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

type Accoes = {
  apresentarCheckpoint: (id: string, texto: string, comFoto: boolean) => Promise<boolean>;
  confirmarCheckpoint: (id: string) => Promise<boolean>;
  contestarCheckpoint: (id: string, texto: string) => Promise<boolean>;
};

function LinhaCheckpoint({
  cp,
  souA,
  selado,
  aProcessar,
  accoes,
}: {
  cp: Checkpoint;
  souA: boolean;
  selado: boolean;
  aProcessar: boolean;
  accoes: Accoes;
}) {
  const { t } = useT();
  const [texto, setTexto] = useState('');
  const [comFoto, setComFoto] = useState(false);
  const [aContestar, setAContestar] = useState(false);
  const [contestaTxt, setContestaTxt] = useState('');

  return (
    <View style={styles.cp}>
      <View style={styles.cpTopo}>
        <Text style={styles.cpTitulo}>
          {t('cp.ordem', { n: cp.ordem })} · {cp.descricao}
        </Text>
        <View style={[styles.badge, VERDE.includes(cp.estado) && styles.badgeVerde]}>
          <Text style={[styles.badgeTxt, VERDE.includes(cp.estado) && styles.badgeTxtVerde]}>
            {ESTADO_TXT[cp.estado] ? t(ESTADO_TXT[cp.estado]) : cp.estado}
          </Text>
        </View>
      </View>
      {cp.prazo ? (
        <Text style={styles.cpPrazo}>{t('cp.prazo', { data: formatarData(cp.prazo) })}</Text>
      ) : null}

      {/* Evidência apresentada (texto + foto). */}
      {cp.evidencia_texto ? <Text style={styles.evidTexto}>{cp.evidencia_texto}</Text> : null}
      {cp.evidencia_ficheiro ? <FotoEvidencia caminho={cp.evidencia_ficheiro} /> : null}
      {cp.estado === 'contestado' && cp.contestacao_texto ? (
        <Text style={styles.contesta}>{t('cp.contestacao', { texto: cp.contestacao_texto })}</Text>
      ) : null}

      {/* AÇÕES (só com o aperto de mão selado). */}
      {selado && cp.estado === 'pendente' && !souA ? (
        <View style={styles.acaoBloco}>
          <Text style={styles.acaoRotulo}>{t('cp.apresentar_rotulo')}</Text>
          <Campo
            placeholder={t('cp.apresentar_ph')}
            value={texto}
            onChangeText={setTexto}
            multiline
          />
          <View style={styles.fotoLinha}>
            <Text style={styles.fotoTxt}>{t('cp.anexar_foto')}</Text>
            <Switch value={comFoto} onValueChange={setComFoto} />
          </View>
          <Botao
            titulo={t('cp.apresentar')}
            onPress={async () => {
              const ok = await accoes.apresentarCheckpoint(cp.id, texto, comFoto);
              if (ok) {
                setTexto('');
                setComFoto(false);
              }
            }}
            aCarregar={aProcessar}
          />
        </View>
      ) : null}

      {selado && cp.estado === 'pendente' && souA ? (
        <Text style={styles.nota}>{t('cp.espera_prestador')}</Text>
      ) : null}

      {selado && cp.estado === 'entregue' && souA ? (
        aContestar ? (
          <View style={styles.acaoBloco}>
            <Text style={styles.acaoRotulo}>{t('cp.contestar_rotulo')}</Text>
            <Campo
              placeholder={t('cp.contestar_ph')}
              value={contestaTxt}
              onChangeText={setContestaTxt}
              multiline
            />
            <View style={styles.dupla}>
              <Botao
                titulo={t('comum.cancelar')}
                variante="secundario"
                onPress={() => setAContestar(false)}
                style={styles.duplaBtn}
              />
              <Botao
                titulo={t('cp.contestar')}
                onPress={() => accoes.contestarCheckpoint(cp.id, contestaTxt)}
                aCarregar={aProcessar}
                style={styles.duplaBtn}
              />
            </View>
          </View>
        ) : (
          <View style={styles.dupla}>
            <Botao
              titulo={t('cp.contestar')}
              variante="secundario"
              onPress={() => setAContestar(true)}
              style={styles.duplaBtn}
            />
            <Botao
              titulo={t('cp.confirmar')}
              onPress={() => accoes.confirmarCheckpoint(cp.id)}
              aCarregar={aProcessar}
              style={styles.duplaBtn}
            />
          </View>
        )
      ) : null}

      {selado && cp.estado === 'entregue' && !souA ? (
        <Text style={styles.nota}>{t('cp.espera_recetor')}</Text>
      ) : null}

      {cp.estado === 'contestado' ? <Text style={styles.nota}>{t('cp.em_revisao')}</Text> : null}
      {cp.estado === 'incumprido' ? (
        <Text style={styles.mau}>
          {cp.quem_falhou === 'prestador' ? t('cp.falhou_prestador') : t('cp.falhou_recetor')}
        </Text>
      ) : null}
    </View>
  );
}

// A ENTREGA FINAL — o destino do negócio, sempre o último marco da lista
// (decisão 26/07: o projeto nunca "é só checkpoints"). Informativa: as ações
// de entregar/pagar/confirmar vivem no bloco da ENTREGA (065) — uma porta por
// facto. Quando existe entrega, o selo daqui REFLETE o pagamento_estado:
// Por apresentar → Entregue → Confirmada / Em revisão / Devolvida.
function LinhaEntregaFinal({
  estadoProjeto,
  prazo,
  pagamentoEstado,
  temEntrega,
}: {
  estadoProjeto: string;
  prazo: string | null;
  pagamentoEstado?: string | null;
  temEntrega?: boolean;
}) {
  const { t } = useT();
  // O selo da entrega com pagamento (065) tem prioridade sobre o legado.
  let texto: string;
  let verde = false;
  if (temEntrega && pagamentoEstado === 'libertado') {
    texto = t('cp.final_confirmada');
    verde = true;
  } else if (temEntrega && pagamentoEstado === 'congelado') {
    texto = t('cp.final_em_revisao');
  } else if (temEntrega && pagamentoEstado === 'devolvido') {
    texto = t('cp.final_devolvida');
  } else if (temEntrega) {
    texto = t('cp.final_entregue');
    verde = true;
  } else if (estadoProjeto === 'honrado') {
    // A COROA do ciclo, e faltava aqui: um negócio honrado caía no `else` e
    // dizia "Por apresentar" — pedia à pessoa uma coisa que ela já tinha
    // feito, e ainda por cima na melhor altura possível. Vem primeiro que
    // 'concluido'/'entregue' porque é o estado final verdadeiro da máquina;
    // os outros dois são passagem (ou legado de linhas antigas).
    texto = t('estado.honrado_v');
    verde = true;
  } else if (estadoProjeto === 'concluido') {
    texto = t('estado.concluido');
    verde = true;
  } else if (estadoProjeto === 'entregue') {
    texto = t('estado.entregue');
    verde = true;
  } else if (estadoProjeto === 'incumprido') {
    // Falhou à palavra: não é verde, mas também não é "por apresentar" — já
    // não há nada a apresentar. Dizer a verdade custa menos que fingir espera.
    texto = t('estado.nao_cumprido');
  } else if (estadoProjeto === 'cancelado') {
    texto = t('estado.cancelado');
  } else if (estadoProjeto === 'expirado') {
    texto = t('estado.expirado');
  } else {
    texto = t('cp.final_por_apresentar');
  }
  return (
    <View style={[styles.cp, styles.cpFinal]}>
      <View style={styles.cpTopo}>
        <View style={styles.finalTitulo}>
          <View style={styles.pontoFinal} />
          <Text style={styles.finalTituloTxt}>{t('cp.final_titulo')}</Text>
        </View>
        <View style={[styles.badge, verde && styles.badgeVerde]}>
          <Text style={[styles.badgeTxt, verde && styles.badgeTxtVerde]}>{texto}</Text>
        </View>
      </View>
      {prazo ? (
        <Text style={styles.cpPrazo}>{t('cp.prazo', { data: formatarData(prazo) })}</Text>
      ) : null}
    </View>
  );
}

export function Checkpoints({
  checkpoints,
  souA,
  selado,
  aProcessar,
  accoes,
  estadoProjeto,
  prazo,
  pagamentoEstado,
  temEntrega,
}: {
  checkpoints: Checkpoint[];
  souA: boolean;
  selado: boolean;
  aProcessar: boolean;
  accoes: Accoes;
  estadoProjeto: string;
  prazo: string | null;
  /** pagamento_estado do negócio (065); undefined = migração por aplicar. */
  pagamentoEstado?: string | null;
  /** já existe entrega final apresentada (entrega_em)? */
  temEntrega?: boolean;
}) {
  const { t } = useT();
  if (checkpoints.length === 0) return null;
  return (
    <View style={styles.bloco}>
      <Text style={styles.rotulo}>{t('cp.titulo')}</Text>
      {checkpoints.map((cp) => (
        <LinhaCheckpoint
          key={cp.id}
          cp={cp}
          souA={souA}
          selado={selado}
          aProcessar={aProcessar}
          accoes={accoes}
        />
      ))}
      <LinhaEntregaFinal
        estadoProjeto={estadoProjeto}
        prazo={prazo}
        pagamentoEstado={pagamentoEstado}
        temEntrega={temEntrega}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Espaco.sm },
  rotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  cp: {
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    padding: Espaco.md,
    gap: Espaco.xs,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
  },
  cpTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Espaco.sm },
  cpTitulo: { fontSize: 15, fontWeight: '800', color: Honra.tinta, flexShrink: 1 },
  cpPrazo: { fontSize: 12, color: Honra.tintaSuave, fontWeight: '600' },
  badge: { borderRadius: Raio.pill, paddingHorizontal: Espaco.sm, paddingVertical: 2, backgroundColor: Honra.creme },
  badgeVerde: { backgroundColor: Honra.verdeSuave },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: Honra.tintaSuave },
  badgeTxtVerde: { color: Honra.verde },
  evidTexto: { fontSize: 14, color: Honra.tinta, lineHeight: 20 },
  contesta: { fontSize: 13, color: Honra.tinta, lineHeight: 19, fontStyle: 'italic' },
  foto: { width: '100%', height: 160, borderRadius: Raio.md, backgroundColor: Honra.cremeEscuro, marginTop: Espaco.xs },
  veuProva: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Espaco.md,
  },
  provaGrande: { width: '100%', height: '100%' },
  acaoBloco: { gap: Espaco.sm, marginTop: Espaco.xs },
  acaoRotulo: { color: Honra.tintaSuave, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  fotoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fotoTxt: { fontSize: 14, color: Honra.tinta, fontWeight: '600' },
  dupla: { flexDirection: 'row', gap: Espaco.sm, marginTop: Espaco.xs },
  duplaBtn: { flex: 1 },
  nota: { fontSize: 13, color: Honra.tintaSuave, lineHeight: 19 },
  mau: { fontSize: 13, color: Honra.erro, fontWeight: '700' },
  // O destino, com ênfase — fio dourado e título maior que os checkpoints:
  // a honra ganha-se ao chegar aqui.
  cpFinal: { borderColor: Honra.dourado },
  finalTitulo: { flexDirection: 'row', alignItems: 'center', gap: Espaco.sm, flexShrink: 1 },
  finalTituloTxt: { fontSize: 16, fontWeight: '800', color: Honra.tinta, flexShrink: 1 },
  pontoFinal: { width: 9, height: 9, borderRadius: Raio.pill, backgroundColor: Honra.dourado },
});
