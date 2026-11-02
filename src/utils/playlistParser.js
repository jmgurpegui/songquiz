/**
 * @fileoverview Parser y extractor client-side para listas de reproducción de YouTube (Zero-API).
 * Procesa enlaces públicos de YouTube y YouTube Music, limpia expresiones superfluas
 * y genera el esquema estándar compatible con songs.json sin necesidad de claves de Google Cloud.
 */

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

  // 1. Eliminar etiquetas entre corchetes o paréntesis con palabras clave de YouTube
  const noiseRegex = /[\(\[][^\)\]]*(?:official|video|audio|lyric|letra|remaster|4k|hd|hq|fps|visualizer|clip|live|tema|cancion|album)[^\)\]]*[\)\]]/gi;
  while (noiseRegex.test(title)) {
    title = title.replace(noiseRegex, '').trim();
  }

  // 2. Eliminar sufijos con pipes (|) o barras
  title = title.replace(/\s*\|.*$/, '').trim();
  title = title.replace(/\s*-\s*$/, '').trim();

  let artist = (rawAuthor || '').replace(/ - Topic$/i, '').replace(/VEVO$/i, '').trim();
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
  artist = artist.replace(/^["'«]+|["'»]+$/g, '').trim() || 'Artista Desconocido';

  return {
    title: trackTitle || 'Pista Desconocida',
    artist: artist
  };
}

/**
 * Extrae el ID de una lista de reproducción a partir de una URL o cadena.
 * Soporta youtube.com, music.youtube.com o el ID directo.
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
 * Convierte un título y artista en un objeto con el esquema estándar de songs.json.
 * Deja letras y trivia como cadenas vacías según especificación.
 * 
 * @param {string} title
 * @param {string} artist
 * @param {string} [videoId=""]
 * @returns {Object}
 */
export function createSongEntry(title, artist, videoId = '') {
  const slug = (title || 'pista')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 30) || (videoId || 'song_' + Math.random().toString(36).slice(2, 8));

  return {
    id: slug,
    title,
    artist,
    genre: 'Pop / Variado',
    year: new Date().getFullYear(),
    audioSrc: `assets/audio/${slug}.wav`,
    youtubeId: videoId,
    lyrics: {
      en: '',
      es: ''
    },
    culturalTrivia: ''
  };
}

/**
 * Descarga y extrae canciones de una lista pública de YouTube directamente desde el navegador
 * mediante el feed público Atom/RSS oficial con pasarelas CORS de alta disponibilidad.
 * 
 * @param {string} playlistUrlOrId - URL o ID de la playlist.
 * @param {function(string): void} [onProgress] - Callback de estado para la UI.
 * @returns {Promise<Array<Object>>} Lista de canciones en el esquema estándar songs.json.
 */
export async function fetchPlaylistFromYouTube(playlistUrlOrId, onProgress = () => {}) {
  const playlistId = extractPlaylistId(playlistUrlOrId);
  if (!playlistId) {
    throw new Error('No se detectó un ID de lista válido. Asegúrate de incluir "?list=ID" o el ID directo de la lista.');
  }

  onProgress('Conectando con el feed público de YouTube...');
  const ytFeedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;

  const gateways = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  let rawXmlText = null;

  for (let i = 0; i < gateways.length; i++) {
    try {
      onProgress(`Conectando mediante pasarela ${i + 1} de ${gateways.length}...`);
      const targetUrl = gateways[i](ytFeedUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('<feed') && text.includes('<entry>')) {
          rawXmlText = text;
          break;
        }
      }
    } catch {
      // Intentar con la siguiente pasarela
    }
  }

  // Si las pasarelas del feed fallan, consultar nodos abiertos de Invidious
  if (!rawXmlText) {
    onProgress('Consultando nodo abierto Invidious...');
    const invidiousHosts = [
      `https://inv.nadeko.net/api/v1/playlists/${playlistId}`,
      `https://invidious.nerdvpn.de/api/v1/playlists/${playlistId}`
    ];

    for (const host of invidiousHosts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(host, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.videos) && data.videos.length > 0) {
            onProgress(`Se encontraron ${data.videos.length} pistas en Invidious.`);
            return data.videos.map(v => {
              const { title, artist } = cleanTrackTitle(v.title, v.author);
              return createSongEntry(title, artist, v.videoId);
            });
          }
        }
      } catch {
        // Continuar
      }
    }
  }

  if (!rawXmlText) {
    throw new Error('No se pudo descargar la lista automáticamente por restricciones de red. Puedes pegar la lista en la pestaña "Pegar Texto / JSON".');
  }

  onProgress('Procesando datos XML de YouTube...');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(rawXmlText, 'text/xml');
  const entries = Array.from(xmlDoc.querySelectorAll('entry'));

  if (entries.length === 0) {
    throw new Error('La lista de reproducción parece estar vacía o no contiene vídeos públicos.');
  }

  const resultSongs = [];
  entries.forEach(entry => {
    const rawTitle = entry.querySelector('title')?.textContent || '';
    const rawAuthor = entry.querySelector('author > name')?.textContent || '';
    const videoId = entry.querySelector('videoId')?.textContent || '';

    if (rawTitle) {
      const { title, artist } = cleanTrackTitle(rawTitle, rawAuthor);
      resultSongs.push(createSongEntry(title, artist, videoId));
    }
  });

  onProgress(`¡Completado! Se extrajeron ${resultSongs.length} pistas limpias.`);
  return resultSongs;
}

/**
 * Parsea un bloque de texto donde cada línea contiene "Artista - Título" o "Título"
 * para permitir importación instantánea cuando no hay conexión externa o para listas personalizadas.
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
      songs.push(createSongEntry(title, artist, `custom_${idx + 1}`));
    }
  });

  return songs;
}
