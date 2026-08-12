/**
 * HONRA — vídeo no portefólio: o funil que ACEITA GRANDE e GUARDA LEVE.
 *
 * A régua (Vítor, 26/07/2026):
 *   · até 60 segundos por clip — montra, não canal;
 *   · até 3 vídeos por perfil (a 059 guarda o mesmo número no servidor);
 *   · o original grande entra e é comprimido NO DISPOSITIVO; onde a
 *     compressão ainda não existe (web / Expo Go), vale o teto de 60 MB do
 *     bucket e a mensagem explica o caminho (telemóvel comprime);
 *   · capa = primeira frame (jpeg) — a galeria carrega SÓ a capa, o .mp4
 *     só anda quando alguém toca no play;
 *   · upload NATIVO apenas. Links de Instagram/YouTube não têm porta.
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export const VIDEOS_MAX = 3;
export const DURACAO_MAX_S = 60;
/** Teto do upload direto — igual ao file_size_limit do bucket (059). */
export const TAMANHO_MAX_BYTES = 60 * 1024 * 1024;

export type VideoEscolhido = {
  /** URI local (já comprimido, quando a costura estiver ligada). */
  uri: string;
  duracaoSegundos: number;
  mime: string;
};

/** O clip passa dos 60s — corta-se um excerto, não se alarga a régua. */
export class VideoLongoErro extends Error {}
/** Sem compressão disponível e acima do teto do bucket. */
export class VideoGrandeErro extends Error {}

/**
 * Abre a biblioteca, valida a régua e devolve o vídeo pronto a subir.
 * Devolve null se a pessoa desistir no picker.
 */
export async function escolherVideo(): Promise<VideoEscolhido | null> {
  const escolha = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
  });
  if (escolha.canceled || !escolha.assets?.[0]) return null;
  const a = escolha.assets[0];

  // `duration` vem em MILISSEGUNDOS (docs v57); na web pode não vir — mede-se
  // pelos metadados do próprio <video>, sem ler o ficheiro inteiro.
  let duracaoS = a.duration != null && a.duration > 0 ? a.duration / 1000 : NaN;
  if (!Number.isFinite(duracaoS)) {
    if (Platform.OS !== 'web') throw new Error('duração desconhecida');
    duracaoS = await duracaoWeb(a.uri);
  }
  if (Math.round(duracaoS) > DURACAO_MAX_S) throw new VideoLongoErro();

  const { uri, bytes } = await comprimir(a.uri, a.fileSize ?? null);
  if (bytes != null && bytes > TAMANHO_MAX_BYTES) throw new VideoGrandeErro();

  return {
    uri,
    duracaoSegundos: Math.max(1, Math.round(duracaoS)),
    mime: a.mimeType || 'video/mp4',
  };
}

/**
 * A COSTURA DA COMPRESSÃO. Hoje devolve o original tal e qual: a compressão
 * no dispositivo (react-native-compressor, alvo 1080p H.264 ~10 Mbps →
 * 40-60 MB/min) precisa de DEV BUILD, e o projeto ainda corre sem módulos
 * nativos próprios. Quando o dev build existir, liga-se AQUI — o resto do
 * funil (validação, capa, upload, insert) não mexe. Até lá, o teto de 60 MB
 * é a fronteira honesta, e é o próprio bucket quem a guarda (059).
 */
async function comprimir(
  uri: string,
  bytes: number | null,
): Promise<{ uri: string; bytes: number | null }> {
  let tamanho = bytes;
  if (tamanho == null && Platform.OS === 'web') {
    try {
      tamanho = (await (await fetch(uri)).blob()).size;
    } catch {
      tamanho = null;
    }
  }
  return { uri, bytes: tamanho };
}

/**
 * Capa = primeira frame, em jpeg local pronto a subir.
 * Nativo: expo-video-thumbnails (deprecado no SDK 57 a favor do expo-video —
 * migrar para `generateThumbnailsAsync` quando o player subir; hoje está
 * instalado e a funcionar em iOS/Android/Expo Go).
 * Web: <video> + canvas, com seek a ~0.1s — a 0s muitos browsers pintam preto.
 */
export async function gerarCapa(uriVideo: string): Promise<string> {
  if (Platform.OS === 'web') return capaWeb(uriVideo);
  const VideoThumbnails = await import('expo-video-thumbnails');
  const { uri } = await VideoThumbnails.getThumbnailAsync(uriVideo, {
    time: 100,
    quality: 0.7,
  });
  return uri;
}

/** Duração em segundos: 0:42, 1:00. Para o distintivo da miniatura. */
export function duracaoLegivel(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---- Web (só corre com Platform.OS === 'web') -------------------------------

function elementoVideo(uri: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error('sem metadados'));
    v.src = uri;
  });
}

async function duracaoWeb(uri: string): Promise<number> {
  const v = await elementoVideo(uri);
  const d = v.duration;
  v.removeAttribute('src');
  return d;
}

async function capaWeb(uriVideo: string): Promise<string> {
  const v = await elementoVideo(uriVideo);
  await new Promise<void>((res) => {
    v.onseeked = () => res();
    v.currentTime = 0.1;
  });
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('sem capa'))), 'image/jpeg', 0.8),
  );
  v.removeAttribute('src');
  return URL.createObjectURL(blob);
}
