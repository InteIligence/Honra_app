import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { Espaco, Honra, Raio } from '@/theme/honra';

export type CategoriaNo = { id: string; nome: string; slug: string; parent_id: string | null };

// Um ícone por área — a busca vira visual, não só uma lista de texto.
// Exportado: o PainelCategorias (pesquisa / publicar) fala a mesma língua visual.
export const ICONE_AREA: Record<string, keyof typeof Feather.glyphMap> = {
  eventos: 'calendar',
  'cinema-audiovisual': 'film',
  estetica: 'scissors',
  design: 'pen-tool',
  tecnologia: 'code',
  marketing: 'trending-up',
  'construcao-oficios': 'tool',
  'casa-cuidados': 'home',
  consultoria: 'briefcase',
  educacao: 'book-open',
  vendas: 'shopping-bag',
  reguladas: 'award',
};

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Realça a parte do nome que bate com a busca. */
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
 * Seletor de categorias HONRA — hierarquia mãe→filha, desenhado (não um menu).
 * Topo: "as tuas áreas" em chips. Busca com realce. Sem busca: navega POR
 * DENTRO — toca uma área (com ícone) e entra nela; volta atrás. Escreve "cinema"
 * e as subcategorias aparecem agrupadas.
 */
export function SeletorCategorias({
  categorias,
  selecionadas,
  onToggle,
}: {
  categorias: CategoriaNo[];
  selecionadas: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useT();
  const [busca, setBusca] = useState('');
  const [maeSel, setMaeSel] = useState<CategoriaNo | null>(null);
  // A busca é a heroína; explorar por área é opcional (não um muro à entrada).
  const [explorar, setExplorar] = useState(false);

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
  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias) m.set(c.id, c.nome);
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

  const chip = (f: CategoriaNo) => (
    <Pressable
      key={f.id}
      onPress={() => onToggle(f.id)}
      style={[styles.chip, selecionadas.has(f.id) && styles.chipAtivo]}
    >
      {selecionadas.has(f.id) && <Feather name="check" size={13} color={Honra.verde} />}
      <Realce
        texto={f.nome}
        q={q}
        base={selecionadas.has(f.id) ? styles.chipTxtAtivo : styles.chipTxt}
        forte={styles.realce}
      />
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {/* AS TUAS ÁREAS — parte da identidade, em destaque. */}
      {selecionadas.size > 0 && (
        <View style={styles.blocoSel}>
          <Text style={styles.blocoSelTit}>{t('cats.as_tuas')}</Text>
          <View style={styles.chipsSel}>
            {[...selecionadas].map((id) => (
              <Pressable key={id} style={styles.chipSel} onPress={() => onToggle(id)} hitSlop={6}>
                <Text style={styles.chipSelTxt}>{nomePorId.get(id) ?? '—'}</Text>
                <Feather name="x" size={13} color={Honra.creme} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Busca */}
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

      {q ? (
        // ===== Resultados da busca (agrupados, com realce) =====
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
        // ===== Dentro de uma área (drill-down) =====
        <View>
          <Pressable style={styles.voltarAreas} onPress={() => setMaeSel(null)} hitSlop={8}>
            <Feather name="chevron-left" size={18} color={Honra.verde} />
            <Feather name={ICONE_AREA[maeSel.slug] ?? 'tag'} size={16} color={Honra.verde} />
            <Text style={styles.voltarAreasTxt}>{maeSel.nome}</Text>
          </Pressable>
          <View style={styles.chips}>{(filhasDe.get(maeSel.id) ?? []).map(chip)}</View>
        </View>
      ) : !explorar ? (
        // ===== Por defeito: só a busca. Explorar é opcional (sem muro). =====
        <Pressable style={styles.explorarBtn} onPress={() => setExplorar(true)}>
          <Feather name="grid" size={16} color={Honra.verde} />
          <Text style={styles.explorarTxt}>{t('cats.explorar')}</Text>
        </Pressable>
      ) : (
        // ===== Explorar por área (cartões) =====
        <View style={styles.areas}>
          <Pressable style={styles.explorarLinha} onPress={() => setExplorar(false)} hitSlop={6}>
            <Feather name="chevron-up" size={18} color={Honra.verde} />
            <Text style={styles.explorarTxt}>{t('cats.fechar_areas')}</Text>
          </Pressable>
          {maes.map((mae) => {
            const filhas = filhasDe.get(mae.id) ?? [];
            const nSel = filhas.filter((f) => selecionadas.has(f.id)).length;
            return (
              <Pressable key={mae.id} style={styles.area} onPress={() => setMaeSel(mae)}>
                <View style={styles.areaIcone}>
                  <Feather name={ICONE_AREA[mae.slug] ?? 'tag'} size={18} color={Honra.verde} />
                </View>
                <View style={styles.areaMeio}>
                  <Text style={styles.areaNome}>{mae.nome}</Text>
                  <Text style={styles.areaSub}>{filhas.length === 1 ? t('cats.uma_area') : t('cats.n_areas', { n: filhas.length })}</Text>
                </View>
                {nSel > 0 && (
                  <View style={styles.conta}>
                    <Text style={styles.contaTxt}>{nSel}</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={18} color={Honra.tintaSuave} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Espaco.md },

  blocoSel: { gap: Espaco.xs },
  blocoSelTit: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Honra.tintaSuave },
  chipsSel: { flexDirection: 'row', flexWrap: 'wrap', gap: Espaco.xs },
  chipSel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Honra.verde,
    borderRadius: Raio.pill,
    paddingVertical: 6,
    paddingHorizontal: Espaco.sm,
  },
  chipSelTxt: { color: Honra.creme, fontSize: 13, fontWeight: '700' },

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
  },
  input: { flex: 1, fontSize: 15, color: Honra.tinta, padding: 0 },
  vazio: { fontSize: 13, color: Honra.tintaSuave },

  // Explorar por área (opcional)
  explorarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Raio.md,
    borderWidth: 1,
    borderColor: Honra.cremeEscuro,
    borderStyle: 'dashed',
  },
  explorarLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Espaco.xs,
  },
  explorarTxt: { fontSize: 14, fontWeight: '700', color: Honra.verde },

  // Navegar por área (cartões)
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
  conta: {
    minWidth: 22,
    height: 22,
    borderRadius: Raio.pill,
    backgroundColor: Honra.verde,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  contaTxt: { color: Honra.creme, fontSize: 12, fontWeight: '800' },

  // Dentro de uma área
  voltarAreas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Espaco.xs,
    marginBottom: Espaco.xs,
  },
  voltarAreasTxt: { fontSize: 15, fontWeight: '800', color: Honra.verde },

  // Resultados da busca
  grupoBusca: { gap: Espaco.xs },
  grupoTitLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grupoTit: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: Honra.tintaSuave },

  // Chips das subcategorias
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
  chipAtivo: { backgroundColor: Honra.verdeSuave, borderColor: Honra.verde },
  chipTxt: { fontSize: 13, fontWeight: '600', color: Honra.tinta },
  chipTxtAtivo: { fontSize: 13, fontWeight: '700', color: Honra.verde },
  realce: { color: Honra.verde, fontWeight: '800' },
});
