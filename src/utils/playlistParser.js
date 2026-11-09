/**
 * @fileoverview Parser y extractor client-side de alta disponibilidad para listas de YouTube y YouTube Music.
 * Soporta extracción RSS/Atom (con soporte de namespace yt:videoId), scraping de ytInitialData,
 * nodos Piped/Invidious y enriquecimiento automático con nuestro banco de letras bilingües.
 */

import { THEMATIC_PLAYLISTS, TOP_100_YOUTUBE_ORDERED } from '../data/thematicPlaylists.js';

// Mapa rápido de canciones enriquecidas para evitar duplicados y reutilizar metadatos
const ENRICHED_SONGS_MAP = new Map();
if (Array.isArray(TOP_100_YOUTUBE_ORDERED)) {
  TOP_100_YOUTUBE_ORDERED.forEach(s => {
    if (s.youtubeId) ENRICHED_SONGS_MAP.set(s.youtubeId, s);
    if (s.title) ENRICHED_SONGS_MAP.set(s.title.toLowerCase().trim(), s);
  });
}
if (Array.isArray(THEMATIC_PLAYLISTS)) {
  THEMATIC_PLAYLISTS.forEach(p => {
    if (Array.isArray(p.songs)) {
      p.songs.forEach(s => {
        if (s.youtubeId) ENRICHED_SONGS_MAP.set(s.youtubeId, s);
        if (s.title) ENRICHED_SONGS_MAP.set(s.title.toLowerCase().trim(), s);
      });
    }
  });
}

/**
 * Limpia el título eliminando coletillas comerciales comunes de YouTube
 * y separa de forma inteligente el artista y el título de la canción.
 * 
 * @param {string} rawTitle - Título original del vídeo en YouTube.
 * @param {string} [rawAuthor=""] - Nombre del canal o autor proporcionado por el feed.
 * @returns {{ title: string, artist: string }}
 */
export function cleanTrackTitle(rawTitle, rawAuthor = '') {
  let title = (rawTitle || '').trim();

  // 1. Eliminar etiquetas entre corchetes o paréntesis con palabras clave comerciales de YouTube
  const noiseRegex = /[\(\[][^\)\]]*(?:official|video|audio|lyric|letra|remaster|4k|hd|hq|fps|visualizer|clip|live|tema|cancion|album|version|edit|explicit)[^\)\]]*[\)\]]/gi;
  while (noiseRegex.test(title)) {
    title = title.replace(noiseRegex, '').trim();
  }

  // 2. Eliminar sufijos con pipes (|) o barras
  title = title.replace(/\s*\|.*$/, '').trim();
  title = title.replace(/\s*\/\/.*$/, '').trim();
  title = title.replace(/\s*-\s*$/, '').trim();

  let artist = (rawAuthor || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official$/i, '')
    .trim();

  let trackTitle = title;

  // 3. Separar por guiones estándar o largos (" - ", " – ", " — ")
  const separatorMatch = title.split(/\s*[\-–—:]\s*/);
  if (separatorMatch.length >= 2) {
    const part1 = separatorMatch[0].trim();
    const part2 = separatorMatch.slice(1).join(' - ').trim();

    if (part1.length > 0 && part2.length > 0) {
      artist = part1;
      trackTitle = part2;
    }
  }

  // 4. Limpieza final de comillas y caracteres sobrantes
  trackTitle = trackTitle.replace(/^["'«]+|["'»]+$/g, '').trim();
  artist = artist.replace(/^["'«]+|["'»]+$/g, '').trim() || 'Artista Internacional';

  return {
    title: trackTitle || 'Pista Musical',
    artist: artist
  };
}

/**
 * Extrae el ID de una lista de reproducción a partir de una URL de YouTube, YouTube Music o ID directo.
 * 
 * @param {string} inputUrlOrId
 * @returns {string|null} ID de la playlist o null si es inválido.
 */
export function extractPlaylistId(inputUrlOrId) {
  if (!inputUrlOrId) return null;
  const str = inputUrlOrId.trim();

  const listParamMatch = str.match(/[?&]list=([a-zA-Z0-9_\-]+)/);
  if (listParamMatch) {
    return listParamMatch[1];
  }

  if (/^[a-zA-Z0-9_\-]{10,}$/.test(str)) {
    return str;
  }

  return null;
}

/**
 * Convierte un título, artista y videoId en un objeto con el esquema estándar de songs.json.
 * Si la canción está en nuestro banco pedagógico, la enriquece con sus letras bilingües y trivia.
 * 
 * @param {string} title
 * @param {string} artist
 * @param {string} [videoId=""]
 * @returns {Object}
 */
export function createSongEntry(title, artist, videoId = '') {
  // Comprobar si la canción existe en el banco enriquecido por videoId o por título
  const cleanVideoId = (videoId || '').trim();
  const knownById = cleanVideoId ? ENRICHED_SONGS_MAP.get(cleanVideoId) : null;
  const knownByTitle = title ? ENRICHED_SONGS_MAP.get(title.trim().toLowerCase()) : null;
  const enriched = knownById || knownByTitle;

  if (enriched) {
    return {
      ...enriched,
      youtubeId: cleanVideoId || enriched.youtubeId
    };
  }

  const slug = (title || 'pista')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || (cleanVideoId || 'song_' + Math.random().toString(36).slice(2, 8));

  return {
    id: `${slug}_${cleanVideoId.slice(0, 5) || Math.floor(Math.random() * 1000)}`,
    title,
    artist,
    genre: 'YouTube Music',
    year: new Date().getFullYear(),
    audioSrc: 'assets/audio/blinding_lights.wav',
    youtubeId: cleanVideoId,
    culturalTrivia: `Tema interpretado por ${artist}, importado desde lista pública de YouTube Music.`
  };
}

/**
 * Descarga y extrae canciones de una lista pública de YouTube / YouTube Music desde el navegador.
 * Combina preset instantáneo, feed Atom/RSS con soporte namespace yt:videoId, parser HTML ytInitialData y APIs Piped/Invidious.
 * 
 * @param {string} playlistUrlOrId - URL o ID de la playlist.
 * @param {function(string): void} [onProgress] - Callback de estado para la UI.
 * @returns {Promise<Array<Object>>} Lista de canciones lista para jugar.
 */
export async function fetchPlaylistFromYouTube(playlistUrlOrId, onProgress = () => {}) {
  const playlistId = extractPlaylistId(playlistUrlOrId);
  if (!playlistId) {
    throw new Error('No se detectó un ID de lista válido. Introduce un enlace con "?list=..." o selecciona una lista temática sugerida.');
  }

  // 1. Verificar si corresponde a una de las listas temáticas verificadas para carga instantánea
  const presetMatch = THEMATIC_PLAYLISTS.find(p => p.playlistId === playlistId || p.id === playlistId);
  if (presetMatch) {
    onProgress(`¡Lista temática "${presetMatch.name}" cargada con letras y trivia!`);
    return presetMatch.songs.map(s => ({ ...s }));
  }

  onProgress('Conectando con YouTube Music / YouTube Feed...');
  const ytFeedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;

  const gateways = [
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  // 2. Intentar extracción mediante Feed Oficial XML Atom
  for (let i = 0; i < gateways.length; i++) {
    try {
      onProgress(`Consultando servidor de listas (${i + 1}/${gateways.length})...`);
      const targetUrl = gateways[i](ytFeedUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('<entry>')) {
          const parsedSongs = parseYouTubeAtomXml(text);
          if (parsedSongs.length > 0) {
            onProgress(`¡Completado! ${parsedSongs.length} canciones extraídas.`);
            return parsedSongs;
          }
        }
      }
    } catch {
      // Continuar con la siguiente pasarela
    }
  }

  // 3. Fallback: Extraer desde la página HTML de la playlist (compatible con listas RDCLAK5uy de YouTube Music)
  const ytPageUrl = `https://www.youtube.com/playlist?list=${playlistId}&hl=en`;
  for (let i = 0; i < gateways.length; i++) {
    try {
      onProgress(`Analizando estructura de YouTube Music (${i + 1}/${gateways.length})...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);
      const res = await fetch(gateways[i](ytPageUrl), { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const extracted = parseYouTubeHtmlInitialData(html);
        if (extracted.length > 0) {
          onProgress(`¡Completado! ${extracted.length} canciones extraídas de la página.`);
          return extracted;
        }
      }
    } catch {
      // Continuar
    }
  }

  // 4. Fallback: Nodos abiertos Piped e Invidious
  onProgress('Consultando nodos de respaldo Piped / Invidious...');
  const apiNodes = [
    { url: `https://pipedapi.kavin.rocks/playlists/${playlistId}`, type: 'piped' },
    { url: `https://inv.nadeko.net/api/v1/playlists/${playlistId}`, type: 'invidious' },
    { url: `https://invidious.nerdvpn.de/api/v1/playlists/${playlistId}`, type: 'invidious' }
  ];

  for (const node of apiNodes) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(node.url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const rawList = node.type === 'piped' ? data.relatedStreams : data.videos;
        if (Array.isArray(rawList) && rawList.length > 0) {
          return rawList.slice(0, 40).map(v => {
            const vid = v.videoId || (v.url ? v.url.split('v=')[1] : '');
            const { title, artist } = cleanTrackTitle(v.title, v.uploaderName || v.author);
            return createSongEntry(title, artist, vid);
          });
        }
      }
    } catch {
      // Siguiente nodo
    }
  }

  throw new Error('No se pudo acceder a esa lista (verifica que sea Pública en YouTube o prueba una de las Listas Temáticas Sugeridas abajo).');
}

/**
 * Parsea el XML Atom de YouTube asegurando soporte para el namespace <yt:videoId>.
 * @param {string} xmlText
 * @returns {Array<Object>}
 */
function parseYouTubeAtomXml(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const entries = Array.from(xmlDoc.getElementsByTagName('entry'));
  const result = [];

  entries.forEach(entry => {
    const rawTitle = entry.getElementsByTagName('title')[0]?.textContent || '';
    const authorNode = entry.getElementsByTagName('name')[0];
    const rawAuthor = authorNode ? authorNode.textContent : '';

    // Soporte multi-navegador para namespace yt:videoId
    let videoId =
      entry.getElementsByTagName('yt:videoId')[0]?.textContent ||
      entry.getElementsByTagName('videoId')[0]?.textContent ||
      '';

    if (!videoId) {
      const linkHref = entry.getElementsByTagName('link')[0]?.getAttribute('href') || '';
      const match = linkHref.match(/[?&]v=([a-zA-Z0-9_\-]{11})/);
      if (match) videoId = match[1];
    }

    if (rawTitle && !/^(private video|deleted video)$/i.test(rawTitle.trim())) {
      const { title, artist } = cleanTrackTitle(rawTitle, rawAuthor);
      result.push(createSongEntry(title, artist, videoId));
    }
  });

  return result;
}

/**
 * Extrae vídeos directamente del objeto ytInitialData embebido en el HTML de YouTube.
 * Ideal para listas autogeneradas de YouTube Music (RDCLAK5uy_...).
 * @param {string} html
 * @returns {Array<Object>}
 */
function parseYouTubeHtmlInitialData(html) {
  const songs = [];
  const seenIds = new Set();

  const regex = /"playlistVideoRenderer":\{"videoId":"([a-zA-Z0-9_\-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const videoId = match[1];
    const rawTitle = match[2].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
    if (!seenIds.has(videoId) && !/^(private video|deleted video)$/i.test(rawTitle)) {
      seenIds.add(videoId);
      const { title, artist } = cleanTrackTitle(rawTitle);
      songs.push(createSongEntry(title, artist, videoId));
    }
  }

  return songs;
}

/**
 * Parsea un bloque de texto donde cada línea contiene "Artista - Título" o "Título".
 * 
 * @param {string} textContent
 * @returns {Array<Object>}
 */
export function parseTextPlaylist(textContent) {
  if (!textContent) return [];
  const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const songs = [];

  lines.forEach((line, idx) => {
    const cleanedLine = line.replace(/^\d+[\.\)\-]\s*/, '');
    const { title, artist } = cleanTrackTitle(cleanedLine);
    if (title) {
      songs.push(createSongEntry(title, artist, ''));
    }
  });

  return songs;
}
