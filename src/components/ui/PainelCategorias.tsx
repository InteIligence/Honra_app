import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

import { ICONE_AREA, norm, type CategoriaNo } from './SeletorCategorias';

/** O que sai do painel: uma área inteira (mãe+filhas) ou uma subcategoria. */
export type EscolhaCategoria = { modo: 'area' | 'sub'; id: string; nome: string };

/** Realce da parte do nome que bate com a busca (igual ao SeletorCategorias). */
function Realce({ texto, q, base, forte }: { texto: string; q: string; base: object; forte: object }) {
  const i = q ? norm(texto).indexOf(q) : -1;
  if (i < 0) return <Text style={base}>{texto}</Text>;
  return (
    <Text style={base}>
      {texto.slice(0, i)}
      <Text style={forte}>{texto.slice(i, i + q.length)}</Text>
      {texto.slice(i + q.length)}
    </Text>
  );
}

/**
 * Painel de categorias — folha que sobe do fundo, para ESCOLHER UMA categoria
 * (pesquisa, publicar trabalho). As 12 áreas com ícone à entrada; toca-se numa
 * área e vêem-se as subcategorias; a busca corta caminho com realce. Escolher
 * fecha o painel — um gesto, sem cerimónia.
 * `permitirArea`: deixa filtrar pela área inteira ("Toda a área").
 */
export function PainelCategorias({
  visivel,
  onFechar,
  categorias,
  onEscolher,
  permitirArea = false,
  selecionadasIds,
}: {
  visivel: boolean;
  onFechar: () => void;
  categorias: CategoriaNo[];
  onEscolher: (e: EscolhaCategoria) => void;
  permitirArea?: boolean;
  selecionadasIds?: string[];
}) {
  const { t } = useT();
  const [busca, setBusca] = useState('');
  const [maeSel, setMaeSel] = useState<CategoriaNo | null>(null);
  const sel = useMemo(() => new Set(selecionadasIds ?? []), [selecionadasIds]);

  const maes = useMemo(() => categorias.filter((c) => !c.parent_id), [categorias]);
  const filhasDe = useMemo(() => {
    const m = new Map<string, CategoriaNo[]>();
    for (const c of categorias) {
      if (!c.parent_id) continue;
      const arr = m.get(c.parent_id) ?? [];
      arr.push(c);
      m.set(c.parent_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome));
    return m;
  }, [categorias]);

  const q = norm(busca.trim());
  const resultados = useMemo(() => {
    if (!q) return [];
    const grupos: { mae: CategoriaNo; filhas: CategoriaNo[] }[] = [];
    for (const mae of maes) {
      const filhas = filhasDe.get(mae.id) ?? [];
      const maeBate = norm(mae.nome).includes(q);
      const mostrar = maeBate ? filhas : filhas.filter((f) => norm(f.nome).includes(q));
      if (mostrar.length > 0) grupos.push({ mae, filhas: mostrar });
    }
    return grupos;
  }, [q, maes, filhasDe]);

  function escolher(e: EscolhaCategoria) {
    setBusca('');
    setMaeSel(null);
    onEscolher(e);
    onFechar();
  }
  function fechar() {
    setBusca('');
    setMaeSel(null);
    onFechar();
  }

  const chip = (f: CategoriaNo) => (
    <Pressable
      key={f.id}
      onPress={() => escolher({ modo: 'sub', id: f.id, nome: f.nome })}
      style={[styles.chip, sel.has(f.id) && styles.chipAtivo]}
    >
      {sel.has(f.id) && <Feather name="check" size={13} color={Honra.verde} />}
      <Realce
        texto={f.nome}
        q={q}
        base={sel.has(f.id) ? styles.chipTxtAtivo : styles.chipTxt}
        forte={styles.realce}
      />
    </Pressable>
  );

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={fechar}>
      <Pressable style={styles.veu} onPress={fechar}>
        {/* O Pressable interior "come" o toque para o véu não fechar a folha. */}
        <Pressable style={styles.folha} onPress={() => {}}>
          <View style={styles.puxador} />
          <View style={styles.topo}>
            <Text style={styles.titulo}>{t('cats.titulo')}</Text>
            {/* padding real (não hitSlop): no web o hitSlop não estica o alvo. */}
            <Pressable onPress={fechar} style={styles.fecharAlvo}>
              <Feather name="x" size={22} color={Honra.tintaSuave} />
            </Pressable>
          </View>

          <View style={styles.campo}>
            <Feather name="search" size={16} color={Honra.tintaSuave} />
            <TextInput
              style={styles.input}
              placeholder={t('cats.procura')}
              placeholderTextColor={Honra.tintaSuave}
              value={busca}
              onChangeText={(v) => {
                setBusca(v);
                if (v) setMaeSel(null);
              }}
              autoCapitalize="none"
            />
            {busca.length > 0 && (
              <Pressable onPress={() => setBusca('')} hitSlop={8}>
                <Feather name="x" size={16} color={Honra.tintaSuave} />
              </Pressable>
            )}
          </View>

          <ScrollView
            style={styles.corpo}
            contentContainerStyle={styles.corpoConteudo}
            keyboardShouldPersistTaps="handled"
          >
            {q ? (
              resultados.length === 0 ? (
                <Text style={styles.vazio}>{t('cats.sem_resultado')}</Text>
              ) : (
                resultados.map(({ mae, filhas }) => (
                  <View key={mae.id} style={styles.grupoBusca}>
                    <View style={styles.grupoTitLinha}>
                      <Feather name={ICONE_AREA[mae.slug] ?? 'tag'} size={13} color={Honra.dourado} />
                      <Text style={styles.grupoTit}>{mae.nome}</Text>
                    </View>
                    <View style={styles.chips}>{filhas.map(chip)}</View>
                  </View>
                ))
              )
            ) : maeSel ? (
              <View>
                <Pressable style={styles.voltarAreas} onPress={() => setMaeSel(null)} hitSlop={8}>
                  <Feather name="chevron-left" size={18} color={Honra.verde} />
                  <Feather name={ICONE_AREA[maeSel.slug] ?? 'tag'} size={16} color={Honra.verde} />
                  <Text style={styles.voltarAreasTxt}>{maeSel.nome}</Text>
                </Pressable>
                <View style={styles.chips}>
                  {permitirArea && (
                    <Pressable
                      onPress={() => escolher({ modo: 'area', id: maeSel.id, nome: maeSel.nome })}
                      style={[
                        styles.chip,
                        styles.chipArea,
                        sel.has(maeSel.id) && styles.chipAtivo,
                      ]}
                    >
                      <Feather
                        name={sel.has(maeSel.id) ? 'check' : 'layers'}
                        size={13}
                        color={Honra.verde}
                      />
                      <Text style={styles.chipTxtAtivo}>{t('cats.toda_area')}</Text>
                    </Pressable>
                  )}
                  {(filhasDe.get(maeSel.id) ?? []).map(chip)}
                </View>
              </View>
            ) : (
              <View style={styles.areas}>
                {maes.map((mae) => {
                  const filhas = filhasDe.get(mae.id) ?? [];
                  return (
                    <Pressable key={mae.id} style={styles.area} onPress={() => setMaeSel(mae)}>
                      <View style={styles.areaIcone}>
                        <Feather name={ICONE_AREA[mae.slug] ?? 'tag'} size={18} color={Honra.verde} />
                      </View>
                      <View style={styles.areaMeio}>
                        <Text style={styles.areaNome}>{mae.nome}</Text>
                        <Text style={styles.areaSub}>{t('cats.n_areas', { n: filhas.length })}</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={Honra.tintaSuave} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veu: { flex: 1, backgroundColor: 'rgba(18, 33, 27, 0.45)', justifyContent: 'flex-end' },
  folha: {
    backgroundColor: Honra.creme,
    borderTopLeftRadius: Raio.lg,
    borderTopRightRadius: Raio.lg,
    maxHeight: '85%',
    paddingHorizontal: Espaco.lg,
    paddingBottom: Espaco.lg,
  },
  puxador: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Raio.pill,
    backgroundColor: Honra.cremeEscuro,
    marginTop: Espaco.sm,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Espaco.md,
    paddingBottom: Espaco.sm,
  },
  titulo: { fontSize: 20, fontWeight: '800', color: Honra.tinta },
  fecharAlvo: { padding: 10, margin: -10 },

  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.sm,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingHorizontal: Espaco.md,
    paddingVertical: 11,
    marginBottom: Espaco.md,
  },
  input: { flex: 1, fontSize: 15, color: Honra.tinta, padding: 0 },

  corpo: { flexGrow: 0 },
  corpoConteudo: { paddingBottom: Espaco.xl, gap: Espaco.md },
  vazio: { fontSize: 13, color: Honra.tintaSuave },

  areas: { gap: Espaco.sm },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espaco.md,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingVertical: 12,
    paddingHorizontal: Espaco.md,
  },
  areaIcone: {
    width: 38,
    height: 38,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verdeSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaMeio: { flex: 1 },
  areaNome: { fontSize: 15, fontWeight: '700', color: Honra.tinta },
  areaSub: { fontSize: 12, color: Honra.tintaSuave, marginTop: 1 },

  voltarAreas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Espaco.xs,
    marginBottom: Espaco.sm,
  },
  voltarAreasTxt: { fontSize: 15, fontWeight: '800', color: Honra.verde },

  grupoBusca: { gap: Espaco.xs },
  grupoTitLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grupoTit: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: Honra.tintaSuave },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Honra.brancoCreme,
    borderRadius: Raio.pill,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    paddingVertical: 7,
    paddingHorizontal: Espaco.sm,
  },
  chipArea: { borderColor: Honra.verde, borderStyle: 'dashed' },
  chipAtivo: { backgroundColor: Honra.verdeSuave, borderColor: Honra.verde },
  chipTxt: { fontSize: 13, fontWeight: '600', color: Honra.tinta },
  chipTxtAtivo: { fontSize: 13, fontWeight: '700', color: Honra.verde },
  realce: { color: Honra.verde, fontWeight: '800' },
});
