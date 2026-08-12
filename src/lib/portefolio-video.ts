/**
 * HONRA — Vídeo no portefólio: a régua e a canalização (Vítor, 26/07/2026).
 *
 * A régua, por extenso:
 *   · 60 segundos por clip, 3 vídeos por portefólio — montra, não canal.
 *   · O ideal é aceitar o ORIGINAL grande (até ~500 MB) e COMPRIMIR no
 *     dispositivo antes do upload (alvo 1080p H.264 ~10 Mbps → 40-60 MB).
 *   · Onde não houver compressão, o degrade é HONESTO: upload direto até
 *     60 MB, com a explicação na mensagem — nunca um limite mudo.
 *
 * COMPRESSÃO — porquê ainda não é real:
 *   O projeto corre em EXPO GO, e comprimir vídeo exige um módulo NATIVO
 *   (react-native-compressor) que o Expo Go não transporta. Nem vale tentar
 *   um require "à experiência": o Metro resolve os require estaticamente e
 *   o bundle rebentava com a lib por instalar. Por isso esta camada é uma
 *   COSTURA: a app fala sempre com `comprimirVideo`, e no dia do dev build
 *   troca-se o miolo sem tocar em mais nada.
 */
import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

// ---- A régua em números -----------------------------------------------------
export const MAX_VIDEOS_PORTEFOLIO = 3;
export const MAX_VIDEO_SEGUNDOS = 60;
/** Teto do upload SEM compressão — espelhado no bucket pela 059 (60 MB). */
export const MAX_BYTES_UPLOAD_DIRETO = 60 * 1024 * 1024;
/** Teto do ficheiro ORIGINAL quando a compressão existir (dev build). */
export const MAX_BYTES_ORIGINAL = 500 * 1024 * 1024;

/** Fica `true` no dia em que o dev build trouxer o módulo nativo. */
export const COMPRESSAO_DISPONIVEL = false;

/**
 * A costura da compressão. Hoje devolve o original tal e qual
 * (`comprimida: false`) e quem chama aplica o teto dos 60 MB.
 *
 * TODO(dev build): instalar `react-native-compressor` e trocar o miolo por
 *   Video.compress(uri, { compressionMethod: 'manual', maxSize: 1920, bitrate: 10_000_000 })
 * — alvo 1080p H.264 ~10 Mbps. Na web não há (nem vai haver) compressão:
 * o browser não tem transcodificador; o teto dos 60 MB fica.
 */
export async function comprimirVideo(uri: string): Promise<{ uri: string; comprimida: boolean }> {
  return { uri, comprimida: false };
}

// ---- Duração ------------------------------------------------------------------
/**
 * O picker devolve `duration` em MILISSEGUNDOS (docs v57 — confirmado), mas
 * já houve eras em que uma plataforma falava em segundos. Como no portefólio
 * nenhum clip válido passa dos 60 s, a leitura é inequívoca: acima de 300 só
 * pode ser ms (um clip de 0,3 s não existe); até 300, só pode ser segundos.
 * Assim a validação nunca deixa passar um vídeo longo por troca de unidades.
 */
export function normalizarDuracaoSegundos(duracao: number | null | undefined): number | null {
  if (duracao == null || !Number.isFinite(duracao) || duracao <= 0) return null;
  const segundos = duracao > 300 ? duracao / 1000 : duracao;
  return Math.max(1, Math.round(segundos));
}

/** "62" → "1:02" — o distintivo lê-se como num relógio, sem tecniquês. */
export function formatarDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Tamanho ------------------------------------------------------------------
/**
 * Tamanho em bytes SEM carregar o ficheiro para memória — com originais de
 * centenas de MB, ler primeiro e pesar depois era rebentar o telemóvel.
 * Ordem: o que o picker já sabe → expo-file-system (só nativo) → null
 * (e aí quem chama pesa o blob depois de o obter, já dentro do teto).
 */
export async function tamanhoDoVideo(asset: ImagePickerAsset): Promise<number | null> {
  if (typeof asset.fileSize === 'number' && asset.fileSize > 0) return asset.fileSize;
  if (Platform.OS === 'web') return null;
  try {
    // API nova do expo-file-system (a legada foi reformada no SDK atual).
    const { File } = await import('expo-file-system');
    const info = new File(asset.uri);
    return typeof info.size === 'number' && info.size > 0 ? info.size : null;
  } catch {
    return null;
  }
}
