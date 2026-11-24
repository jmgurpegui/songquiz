/**
 * @fileoverview Motor de resolución multimedia sin anuncios para SongQuiz.
 * Resuelve en orden de prioridad:
 *   1. Archivos personales locales cargados por el usuario (MP3/M4A/WAV/OGG/MP4/WebM via ObjectURL)
 *   2. Audios locales auténticos empaquetados en `assets/audio/`
 *   3. Previews oficiales de 30 s sin anuncios + carátula HD (600×600) mediante iTunes Search API
 * Incluye caché en memoria por sesión y gestión segura de ObjectURLs sin fugas de memoria.
 */

const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

const AUTHENTIC_LOCAL_AUDIO_MAP = Object.freeze({
  'assets/audio/blinding_lights.wav': ['blinding lights'],
  'assets/audio/shape_of_you.wav': ['shape of you'],
  'assets/audio/bohemian_rhapsody.wav': ['bohemian rhapsody'],
  'assets/audio/billie_jean.wav': ['billie jean'],
  'assets/audio/stayin_alive.wav': ["stayin' alive", 'stayin alive'],
  'assets/audio/take_on_me.wav': ['take on me']
});

const SUPPORTED_AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'opus']);
const SUPPORTED_VIDEO_EXTS = new Set(['mp4', 'webm', 'm4v', 'mov']);

/** Caché en memoria por canción para evitar consultas duplicadas durante la sesión. */
const previewCache = new Map();
/** Promesas en vuelo para evitar peticiones paralelas repetidas para la misma pista. */
const inflightRequests = new Map();

/**
 * Comprueba si `song.audioSrc` corresponde realmente a una pista local auténtica empaquetada
 * (evitando reproducir un `.wav` de demostración perteneciente a otra canción).
 *
 * @param {Object|null|undefined} song
 * @returns {boolean}
 */
export function hasAuthenticLocalAudio(song) {
  if (!song || typeof song.audioSrc !== 'string' || !song.audioSrc.trim()) {
    return false;
  }

  const normalizedSrc = song.audioSrc.trim().replace(/^\.\//, '');
  const expectedTitles = AUTHENTIC_LOCAL_AUDIO_MAP[normalizedSrc];

  if (!expectedTitles) {
    return true;
  }

  const normalizedTitle = String(song.title || '').trim().toLowerCase();
  return expectedTitles.includes(normalizedTitle);
}

/**
 * Construye un enlace externo seguro a YouTube si el ID es válido (11 caracteres).
 * @param {Object|null|undefined} song
 * @returns {string|null}
 */
export function buildExternalYoutubeUrl(song) {
  const ytId = typeof song?.youtubeId === 'string' ? song.youtubeId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{11}$/.test(ytId)) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
}

/**
 * Construye la URL de miniatura de respaldo de YouTube si existe `youtubeId` válido.
 * @param {Object|null|undefined} song
 * @returns {string|null}
 */
export function buildYoutubeThumbnailUrl(song) {
  const ytId = typeof song?.youtubeId === 'string' ? song.youtubeId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{11}$/.test(ytId)) return null;
  return `https://i.ytimg.com/vi/${encodeURIComponent(ytId)}/hqdefault.jpg`;
}

/**
 * Normaliza cadenas musicales para puntuar coincidencias de título y artista.
 * @param {string} value
 * @returns {string}
 */
function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((feat|ft|with|official|remaster|radio edit|version|remix)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(feat\.?|ft\.?|featuring|with|&|and|x)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae el artista principal (antes de colaboraciones) para mejorar las búsquedas en iTunes.
 * @param {string} artist
 * @returns {string}
 */
function extractPrimaryArtist(artist) {
  return String(artist || '')
    .split(/\b(?:feat\.?|ft\.?|featuring|with|&|x)\b|,|\//i)[0]
    .trim();
}

/**
 * Mejora la resolución de carátulas de iTunes de 100×100 a 600×600 HD.
 * @param {string|undefined} url
 * @returns {string|null}
 */
function upgradeArtworkUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return url.replace(/\/\d+x\d+bb\./i, '/600x600bb.');
}

/**
 * Puntúa una pista candidata devuelta por iTunes Search API frente a la canción objetivo.
 * @param {Object} item
 * @param {string} normTitle
 * @param {string} normArtist
 * @returns {number}
 */
function scoreITunesCandidate(item, normTitle, normArtist) {
  if (!item || !item.previewUrl) return -1;

  const candTitle = normalizeMatchText(item.trackName || item.trackCensoredName || '');
  const candArtist = normalizeMatchText(item.artistName || '');
  let score = 0;

  if (candTitle === normTitle) score += 60;
  else if (candTitle.includes(normTitle) || normTitle.includes(candTitle)) score += 38;
  else {
    const titleWords = normTitle.split(' ').filter((w) => w.length >= 3);
    const hits = titleWords.filter((w) => candTitle.includes(w)).length;
    score += titleWords.length > 0 ? Math.round((hits / titleWords.length) * 30) : 0;
  }

  if (candArtist === normArtist) score += 40;
  else if (candArtist.includes(normArtist) || normArtist.includes(candArtist)) score += 28;
  else {
    const artistWords = normArtist.split(' ').filter((w) => w.length >= 2);
    const hits = artistWords.filter((w) => candArtist.includes(w)).length;
    score += artistWords.length > 0 ? Math.round((hits / artistWords.length) * 24) : 0;
  }

  // Penalizar karaoke, tributos o versiones instrumentales cuando el original no lo es
  const rawTrack = `${item.trackName || ''} ${item.artistName || ''} ${item.collectionName || ''}`.toLowerCase();
  if (/(karaoke|tribute|cover band|lullaby|ringtone|instrumental version)/i.test(rawTrack)) {
    score -= 45;
  }

  return score;
}

/**
 * Ejecuta una consulta individual a iTunes Search API con tiempo límite.
 * @param {string} term
 * @param {AbortSignal} [externalSignal]
 * @returns {Promise<Array<Object>>}
 */
async function queryITunes(term, externalSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const url = `${ITUNES_SEARCH_ENDPOINT}?term=${encodeURIComponent(term)}&media=music&entity=song&limit=8`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Busca el mejor preview oficial de 30 s y carátula HD en iTunes Search API para una canción.
 * @param {Object} song
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ previewUrl: string, artworkUrl: string|null, collectionName: string }|null>}
 */
async function fetchBestITunesPreview(song, signal) {
  const cleanTitle = String(song.title || '').replace(/\([^)]*\)/g, '').trim();
  const primaryArtist = extractPrimaryArtist(song.artist || '');
  const normTitle = normalizeMatchText(song.title || '');
  const normArtist = normalizeMatchText(primaryArtist || song.artist || '');

  const searchTerms = [
    `${primaryArtist} ${cleanTitle}`.trim(),
    `${cleanTitle} ${primaryArtist}`.trim()
  ].filter(Boolean);

  let bestItem = null;
  let bestScore = -1;

  for (let i = 0; i < searchTerms.length; i += 1) {
    const results = await queryITunes(searchTerms[i], signal);
    for (const item of results) {
      const score = scoreITunesCandidate(item, normTitle, normArtist);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }
    // Si ya encontramos una coincidencia sólida, no hace falta la segunda consulta
    if (bestItem && bestScore >= 45) break;
  }

  if (!bestItem || bestScore < 20) {
    return null;
  }

  return {
    previewUrl: bestItem.previewUrl,
    artworkUrl: upgradeArtworkUrl(bestItem.artworkUrl100 || bestItem.artworkUrl60),
    collectionName: bestItem.collectionName || ''
  };
}

/**
 * Resuelve la fuente multimedia sin anuncios para la pista dada.
 *
 * @param {Object} song
 * @param {{ signal?: AbortSignal }} [options={}]
 * @returns {Promise<{
 *   sourceType: 'local-video'|'local-audio'|'bundled-audio'|'itunes-preview'|'unavailable',
 *   mediaUrl: string|null,
 *   artworkUrl: string|null,
 *   collectionName: string,
 *   externalYoutubeUrl: string|null,
 *   isCrossOrigin: boolean,
 *   reason?: string
 * }>}
 */
export async function resolveSongMedia(song, { signal } = {}) {
  const externalYoutubeUrl = buildExternalYoutubeUrl(song);
  const ytThumb = buildYoutubeThumbnailUrl(song);

  if (!song) {
    return {
      sourceType: 'unavailable',
      mediaUrl: null,
      artworkUrl: null,
      collectionName: '',
      externalYoutubeUrl: null,
      isCrossOrigin: false,
      reason: 'No hay pista seleccionada.'
    };
  }

  // 1. Archivo personal local cargado por el usuario en esta sesión (MP3/M4A/WAV/MP4/WebM)
  if (song.localMediaUrl && typeof song.localMediaUrl === 'string') {
    return {
      sourceType: song.isLocalVideo ? 'local-video' : 'local-audio',
      mediaUrl: song.localMediaUrl,
      artworkUrl: null,
      collectionName: 'Biblioteca personal',
      externalYoutubeUrl,
      isCrossOrigin: false
    };
  }

  const cacheKey = song.id || `${song.artist}|${song.title}`;

  // 2. Pista local auténtica empaquetada en assets/audio/ (100% offline y 0 anuncios)
  if (hasAuthenticLocalAudio(song)) {
    const cached = previewCache.get(cacheKey);
    return {
      sourceType: 'bundled-audio',
      mediaUrl: song.audioSrc,
      artworkUrl: cached?.artworkUrl || ytThumb,
      collectionName: cached?.collectionName || '',
      externalYoutubeUrl,
      isCrossOrigin: false
    };
  }

  // 3. Caché de sesión (preview oficial de 30 s ya resuelto)
  if (previewCache.has(cacheKey)) {
    const cached = previewCache.get(cacheKey);
    if (cached && cached.previewUrl) {
      return {
        sourceType: 'itunes-preview',
        mediaUrl: cached.previewUrl,
        artworkUrl: cached.artworkUrl || ytThumb,
        collectionName: cached.collectionName || '',
        externalYoutubeUrl,
        isCrossOrigin: true
      };
    }
  }

  // Sin conexión a Internet
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      sourceType: 'unavailable',
      mediaUrl: null,
      artworkUrl: ytThumb,
      collectionName: '',
      externalYoutubeUrl,
      isCrossOrigin: false,
      reason: 'Sin conexión a Internet y esta canción no tiene archivo local en caché.'
    };
  }

  // 4. Consulta bajo demanda a iTunes Search API (0 anuncios, sin API key)
  try {
    let reqPromise = inflightRequests.get(cacheKey);
    if (!reqPromise) {
      reqPromise = fetchBestITunesPreview(song, signal).finally(() => {
        inflightRequests.delete(cacheKey);
      });
      inflightRequests.set(cacheKey, reqPromise);
    }

    const match = await reqPromise;
    if (match && match.previewUrl) {
      previewCache.set(cacheKey, match);
      return {
        sourceType: 'itunes-preview',
        mediaUrl: match.previewUrl,
        artworkUrl: match.artworkUrl || ytThumb,
        collectionName: match.collectionName || '',
        externalYoutubeUrl,
        isCrossOrigin: true
      };
    }

    return {
      sourceType: 'unavailable',
      mediaUrl: null,
      artworkUrl: ytThumb,
      collectionName: '',
      externalYoutubeUrl,
      isCrossOrigin: false,
      reason: 'No se encontró preview oficial de 30 s sin anuncios para esta pista.'
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    return {
      sourceType: 'unavailable',
      mediaUrl: null,
      artworkUrl: ytThumb,
      collectionName: '',
      externalYoutubeUrl,
      isCrossOrigin: false,
      reason: 'No se pudo contactar con el servicio de previews sin anuncios.'
    };
  }
}

/**
 * Precarga silenciosamente el preview de la siguiente canción para acelerar la transición.
 * @param {Object|null|undefined} song
 */
export function prefetchSongMedia(song) {
  if (!song || song.localMediaUrl || hasAuthenticLocalAudio(song)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const cacheKey = song.id || `${song.artist}|${song.title}`;
  if (previewCache.has(cacheKey) || inflightRequests.has(cacheKey)) return;

  resolveSongMedia(song).catch(() => {});
}

/**
 * Extrae artista y título limpios a partir del nombre de un archivo local MP3/MP4.
 * Ejemplos:
 *   "01 - Queen - Bohemian Rhapsody.mp3" -> { artist: "Queen", title: "Bohemian Rhapsody" }
 *   "Daft Punk - Get Lucky (Official Video).mp4" -> { artist: "Daft Punk", title: "Get Lucky" }
 *
 * @param {string} filename
 * @returns {{ artist: string, title: string }}
 */
export function parseLocalFilename(filename) {
  const withoutExt = String(filename || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/\s*\((official|music video|lyric video|audio|hd|4k|hq)[^)]*\)/gi, '')
    .replace(/\s*\[(official|music video|lyric video|audio|hd|4k|hq)[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const dashMatch = withoutExt.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim() || 'Biblioteca personal',
      title: dashMatch[2].trim() || withoutExt
    };
  }

  return {
    artist: 'Biblioteca personal',
    title: withoutExt || 'Pista local'
  };
}

/**
 * Gestor de biblioteca personal local en memoria de sesión (MP3/M4A/WAV/OGG/MP4/WebM).
 * Administra la creación y revocación segura de ObjectURLs para evitar fugas de memoria.
 */
export class LocalMediaLibrary {
  constructor() {
    /** @type {Set<string>} */
    this._activeObjectUrls = new Set();
  }

  /**
   * Comprueba si un `File` tiene extensión o tipo MIME de audio o vídeo admitido.
   * @param {File} file
   * @returns {{ supported: boolean, isVideo: boolean }}
   */
  classifyFile(file) {
    if (!file || typeof file.name !== 'string') {
      return { supported: false, isVideo: false };
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();

    if (SUPPORTED_VIDEO_EXTS.has(ext) || mime.startsWith('video/')) {
      return { supported: true, isVideo: true };
    }
    if (SUPPORTED_AUDIO_EXTS.has(ext) || mime.startsWith('audio/')) {
      return { supported: true, isVideo: false };
    }
    return { supported: false, isVideo: false };
  }

  /**
   * Convierte una `FileList` o array de archivos locales en una lista jugable de canciones.
   * Revoca previamente cualquier ObjectURL anterior.
   *
   * @param {FileList|Array<File>} fileList
   * @returns {{ tracks: Array<Object>, skippedCount: number, videoCount: number, audioCount: number }}
   */
  importFiles(fileList) {
    const files = Array.from(fileList || []);
    const validEntries = [];
    let skippedCount = 0;

    for (const file of files) {
      const { supported, isVideo } = this.classifyFile(file);
      if (!supported) {
        skippedCount += 1;
        continue;
      }
      validEntries.push({ file, isVideo });
    }

    if (validEntries.length === 0) {
      return { tracks: [], skippedCount, videoCount: 0, audioCount: 0 };
    }

    this.revokeAll();

    let videoCount = 0;
    let audioCount = 0;

    const tracks = validEntries.map(({ file, isVideo }, idx) => {
      const objectUrl = URL.createObjectURL(file);
      this._activeObjectUrls.add(objectUrl);

      if (isVideo) videoCount += 1;
      else audioCount += 1;

      const { artist, title } = parseLocalFilename(file.name);
      return {
        id: `local_media_${String(idx + 1).padStart(3, '0')}`,
        title,
        artist,
        genre: isVideo ? 'Vídeo personal' : 'Audio personal',
        year: new Date(file.lastModified || Date.now()).getFullYear(),
        audioSrc: '',
        youtubeId: '',
        culturalTrivia: `Archivo personal local (${file.name}) reproducido directamente desde tu dispositivo sin anuncios.`,
        localMediaUrl: objectUrl,
        isLocalVideo: isVideo,
        localFileName: file.name
      };
    });

    return { tracks, skippedCount, videoCount, audioCount };
  }

  /**
   * Revoca todos los ObjectURLs activos para liberar memoria del navegador.
   */
  revokeAll() {
    for (const url of this._activeObjectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignorar errores al revocar en entornos sin DOM completo
      }
    }
    this._activeObjectUrls.clear();
  }
}

export const localMediaLibrary = new LocalMediaLibrary();
