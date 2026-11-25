/**
 * @fileoverview Motor de resolución multimedia sin anuncios para SongQuiz.
 * Resuelve en orden de prioridad:
 *   1. Archivos personales locales cargados por el usuario (MP3/M4A/WAV/OGG/MP4/WebM via ObjectURL)
 *   2. Audios locales auténticos personalizados (excluyendo los 6 .wav sintetizados heredados)
 *   3. Previews oficiales de estudio (30 s, 0 anuncios) + carátula HD (600×600) mediante iTunes Search API
 *      con búsqueda progresiva multi-región (US / ES / songTerm / ASCII) y filtrado de versiones falsas.
 * Incluye utilidades seguras para embeber YouTube post-ronda dentro de la app sin salir fuera.
 */

const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

/**
 * Los 6 archivos .wav originales del repositorio son tonos sintetizados de demostración (5–13 s),
 * no grabaciones de estudio reales. Se excluyen para que temas como Bohemian Rhapsody,
 * Shape of You, Blinding Lights, Billie Jean, Take On Me y Stayin' Alive reproduzcan
 * siempre su preview oficial de estudio sin sonido metálico.
 */
const SYNTHESIZED_DEMO_AUDIO_PATHS = new Set([
  'assets/audio/blinding_lights.wav',
  'assets/audio/shape_of_you.wav',
  'assets/audio/bohemian_rhapsody.wav',
  'assets/audio/billie_jean.wav',
  'assets/audio/stayin_alive.wav',
  'assets/audio/take_on_me.wav'
]);

const SUPPORTED_AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'opus']);
const SUPPORTED_VIDEO_EXTS = new Set(['mp4', 'webm', 'm4v', 'mov']);

/** Caché en memoria por canción para evitar consultas duplicadas durante la sesión. */
const previewCache = new Map();
/** Promesas en vuelo para evitar peticiones paralelas repetidas para la misma pista. */
const inflightRequests = new Map();

/**
 * Comprueba si `song.audioSrc` corresponde a un archivo local real distinto de los 6 `.wav`
 * sintetizados heredados.
 *
 * @param {Object|null|undefined} song
 * @returns {boolean}
 */
export function hasAuthenticLocalAudio(song) {
  if (!song || typeof song.audioSrc !== 'string' || !song.audioSrc.trim()) {
    return false;
  }

  const normalizedSrc = song.audioSrc.trim().replace(/^\.\//, '');
  if (SYNTHESIZED_DEMO_AUDIO_PATHS.has(normalizedSrc)) {
    return false;
  }

  return true;
}

/**
 * Valida y devuelve un ID de vídeo de YouTube seguro (11 caracteres alfanuméricos, `-` o `_`).
 * @param {Object|null|undefined} song
 * @returns {string|null}
 */
export function extractValidYoutubeId(song) {
  const ytId = typeof song?.youtubeId === 'string' ? song.youtubeId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{11}$/.test(ytId)) return null;
  return ytId;
}

/**
 * Construye un enlace externo seguro a YouTube si el ID es válido (11 caracteres).
 * @param {Object|null|undefined} song
 * @returns {string|null}
 */
export function buildExternalYoutubeUrl(song) {
  const ytId = extractValidYoutubeId(song);
  if (!ytId) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
}

/**
 * Construye la URL segura de YouTube embebido (`youtube-nocookie.com`) para ver el vídeo
 * dentro de SongQuiz al finalizar cada ronda sin abandonar la aplicación.
 *
 * @param {Object|null|undefined} song
 * @param {{ autoplay?: boolean }} [options={}]
 * @returns {string|null}
 */
export function buildYoutubeEmbedUrl(song, { autoplay = false } = {}) {
  const ytId = extractValidYoutubeId(song);
  if (!ytId) return null;

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1'
  });
  if (autoplay) {
    params.set('autoplay', '1');
  }

  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?${params.toString()}`;
}

/**
 * Construye la URL de miniatura de respaldo de YouTube si existe `youtubeId` válido.
 * @param {Object|null|undefined} song
 * @returns {string|null}
 */
export function buildYoutubeThumbnailUrl(song) {
  const ytId = extractValidYoutubeId(song);
  if (!ytId) return null;
  return `https://i.ytimg.com/vi/${encodeURIComponent(ytId)}/hqdefault.jpg`;
}

/**
 * Normaliza cadenas musicales para puntuar coincidencias de título y artista.
 * @param {string} value
 * @returns {string}
 */
export function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((feat|ft|with|official|remaster|remastered|radio edit|version|remix|audio|video|single|album|bonus|deluxe)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(feat\.?|ft\.?|featuring|with|&|and|x)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elimina acentos y puntuación superflua para construir consultas ASCII limpias.
 * @param {string} value
 * @returns {string}
 */
function toAsciiQuery(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s'-]/g, ' ')
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
    .split(/\b(?:feat\.?|ft\.?|featuring|with|&|x|vs\.?)\b|,|\//i)[0]
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
 * Prioriza grabaciones originales de estudio y penaliza karaoke, tributos, 8-bit o remixes no pedidos.
 *
 * @param {Object} item
 * @param {string} normTitle
 * @param {string} normArtist
 * @param {string} [rawTargetTitle='']
 * @returns {number}
 */
export function scoreITunesCandidate(item, normTitle, normArtist, rawTargetTitle = '') {
  if (!item || !item.previewUrl) return -1;

  const rawCandTitle = String(item.trackName || item.trackCensoredName || '');
  const rawCandArtist = String(item.artistName || '');
  const rawCollection = String(item.collectionName || '');
  const candTitle = normalizeMatchText(rawCandTitle);
  const candArtist = normalizeMatchText(rawCandArtist);
  const targetLower = String(rawTargetTitle || '').toLowerCase();

  let score = 0;

  if (candTitle === normTitle) {
    score += 62;
  } else if (candTitle.includes(normTitle) || normTitle.includes(candTitle)) {
    score += 40;
  } else {
    const titleWords = normTitle.split(' ').filter((w) => w.length >= 2);
    const hits = titleWords.filter((w) => candTitle.includes(w)).length;
    score += titleWords.length > 0 ? Math.round((hits / titleWords.length) * 32) : 0;
  }

  if (candArtist === normArtist) {
    score += 44;
  } else if (candArtist.includes(normArtist) || normArtist.includes(candArtist)) {
    score += 30;
  } else {
    const artistWords = normArtist.split(' ').filter((w) => w.length >= 2);
    const hits = artistWords.filter((w) => candArtist.includes(w)).length;
    score += artistWords.length > 0 ? Math.round((hits / artistWords.length) * 24) : 0;
  }

  // Penalizar severamente versiones falsas, karaoke, tributos, 8-bit o sintetizadas
  const combinedRaw = `${rawCandTitle} ${rawCandArtist} ${rawCollection}`.toLowerCase();
  if (/(karaoke|tribute|cover band|lullaby|ringtone|instrumental|8-bit|8 bit|chiptune|music box|soundalike|in the style of|originally performed|made famous|piano cover|midi)/i.test(combinedRaw)) {
    score -= 65;
  }

  // Penalizar remixes, directos, sped up o acústicos si el título objetivo no los pide
  const variantChecks = [
    { rx: /\bremix\b/i, penalty: 20 },
    { rx: /\b(sped up|slowed|reverb|nightcore|chipmunk)\b/i, penalty: 45 },
    { rx: /\b(live|en vivo|concert|acoustic|unplugged|acapella|a cappella)\b/i, penalty: 18 }
  ];
  for (const { rx, penalty } of variantChecks) {
    if (rx.test(rawCandTitle) && !rx.test(targetLower)) {
      score -= penalty;
    }
  }

  // Ligero bono si el título en bruto no añade paréntesis extraños
  if (!/[(\[]/.test(rawCandTitle)) {
    score += 4;
  }

  return score;
}

/**
 * Espera asíncrona cancelable por AbortSignal para reintentos breves.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

/**
 * Ejecuta una consulta individual a iTunes Search API con tiempo límite y 1 reintento en errores transitorios.
 *
 * @param {string} term
 * @param {AbortSignal} [externalSignal]
 * @param {{ country?: string, attribute?: string, limit?: number }} [opts={}]
 * @returns {Promise<Array<Object>>}
 */
async function queryITunes(term, externalSignal, opts = {}) {
  const { country = '', attribute = '', limit = 12 } = opts;

  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: String(limit)
  });
  if (country) params.set('country', country);
  if (attribute) params.set('attribute', attribute);

  const url = `${ITUNES_SEARCH_ENDPOINT}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7500);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException('Aborted', 'AbortError');
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data?.results) ? data.results : [];
      }
      // Reintentar una vez ante saturación momentánea (429/5xx)
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await delay(350, externalSignal);
        continue;
      }
      return [];
    } catch (err) {
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (attempt === 0) {
        await delay(300, externalSignal);
        continue;
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  return [];
}

/**
 * Busca el mejor preview oficial de 30 s y carátula HD en iTunes Search API para una canción,
 * usando estrategias progresivas multi-región para minimizar pistas sin audio.
 *
 * @param {Object} song
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ previewUrl: string, artworkUrl: string|null, collectionName: string }|null>}
 */
async function fetchBestITunesPreview(song, signal) {
  const cleanTitle = String(song.title || '').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
  const primaryArtist = extractPrimaryArtist(song.artist || '');
  const normTitle = normalizeMatchText(song.title || '');
  const normArtist = normalizeMatchText(primaryArtist || song.artist || '');
  const asciiQuery = toAsciiQuery(`${primaryArtist} ${cleanTitle}`);

  /** @type {Array<{ term: string, country?: string, attribute?: string }>} */
  const strategies = [
    { term: `${primaryArtist} ${cleanTitle}`.trim() },
    { term: `${cleanTitle} ${primaryArtist}`.trim(), country: 'ES' },
    { term: cleanTitle, attribute: 'songTerm' }
  ];

  if (asciiQuery && asciiQuery.toLowerCase() !== `${primaryArtist} ${cleanTitle}`.trim().toLowerCase()) {
    strategies.push({ term: asciiQuery, country: 'ES' });
  }

  let bestItem = null;
  let bestScore = -1;

  for (const strategy of strategies) {
    if (!strategy.term) continue;
    const results = await queryITunes(strategy.term, signal, strategy);
    for (const item of results) {
      const score = scoreITunesCandidate(item, normTitle, normArtist, song.title || '');
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }
    // Coincidencia de estudio muy sólida: no hace falta lanzar consultas de respaldo
    if (bestItem && bestScore >= 75) break;
  }

  if (!bestItem || bestScore < 22) {
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
 *   youtubeEmbedUrl: string|null,
 *   isCrossOrigin: boolean,
 *   reason?: string
 * }>}
 */
export async function resolveSongMedia(song, { signal } = {}) {
  const externalYoutubeUrl = buildExternalYoutubeUrl(song);
  const youtubeEmbedUrl = buildYoutubeEmbedUrl(song, { autoplay: false });
  const ytThumb = buildYoutubeThumbnailUrl(song);

  if (!song) {
    return {
      sourceType: 'unavailable',
      mediaUrl: null,
      artworkUrl: null,
      collectionName: '',
      externalYoutubeUrl: null,
      youtubeEmbedUrl: null,
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
      youtubeEmbedUrl,
      isCrossOrigin: false
    };
  }

  const cacheKey = song.id || `${song.artist}|${song.title}`;

  // 2. Pista local auténtica real (excluye los 6 .wav sintetizados heredados)
  if (hasAuthenticLocalAudio(song)) {
    const cached = previewCache.get(cacheKey);
    return {
      sourceType: 'bundled-audio',
      mediaUrl: song.audioSrc,
      artworkUrl: cached?.artworkUrl || ytThumb,
      collectionName: cached?.collectionName || '',
      externalYoutubeUrl,
      youtubeEmbedUrl,
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
        youtubeEmbedUrl,
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
      youtubeEmbedUrl,
      isCrossOrigin: false,
      reason: 'Sin conexión a Internet y esta canción no tiene archivo local en caché.'
    };
  }

  // 4. Consulta bajo demanda a iTunes Search API (0 anuncios, grabación original de estudio)
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
        youtubeEmbedUrl,
        isCrossOrigin: true
      };
    }

    return {
      sourceType: 'unavailable',
      mediaUrl: null,
      artworkUrl: ytThumb,
      collectionName: '',
      externalYoutubeUrl,
      youtubeEmbedUrl,
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
      youtubeEmbedUrl,
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
