/**
 * @fileoverview Validador de integridad de esquema y calidad pedagógica para catálogos de SongQuiz.
 * Compatible con navegador (ES6) y Node.js sin dependencias externas.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** Campos permitidos por el esquema oficial de `src/data/songs.json`. */
export const SONG_SCHEMA_ALLOWED_KEYS = Object.freeze(new Set([
  'id',
  'title',
  'artist',
  'genre',
  'year',
  'audioSrc',
  'youtubeId',
  'culturalTrivia',
  'rank',
  'views'
]));

/**
 * @typedef {Object} SongRecord
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} genre
 * @property {number} year
 * @property {string} audioSrc
 * @property {string} youtubeId
 * @property {string} culturalTrivia
 * @property {number} [rank]
 * @property {string} [views]
 */

/**
 * @typedef {Object} CatalogAuditReport
 * @property {boolean} isValid - True si no existen errores críticos de esquema o duplicidad.
 * @property {number} total - Total de registros inspeccionados.
 * @property {string[]} errors - Errores bloqueantes de esquema, tipos o IDs duplicados.
 * @property {string[]} warnings - Advertencias de calidad editorial o pedagógica.
 */

/**
 * Audita un catálogo de canciones conforme al esquema estricto de `src/data/songs.json`.
 *
 * @param {unknown} catalog - Valor parseado desde JSON o importación de usuario.
 * @param {{ strictSchema?: boolean, requireYoutubeId?: boolean }} [options={}]
 * @returns {CatalogAuditReport}
 */
export function auditSongCatalog(catalog, options = {}) {
  const { strictSchema = true, requireYoutubeId = true } = options;
  const errors = [];
  const warnings = [];

  if (!Array.isArray(catalog) || catalog.length === 0) {
    return {
      isValid: false,
      total: 0,
      errors: ['El catálogo debe ser un array JSON no vacío.'],
      warnings
    };
  }

  const seenIds = new Set();
  const seenYtIds = new Set();
  const seenPairs = new Set();
  const currentYear = new Date().getFullYear();

  catalog.forEach((song, idx) => {
    const label = `[#${idx + 1} id="${song?.id ?? 'N/A'}"]`;

    if (!song || typeof song !== 'object' || Array.isArray(song)) {
      errors.push(`${label} El elemento no es un objeto JSON válido.`);
      return;
    }

    if (strictSchema) {
      for (const key of Object.keys(song)) {
        if (!SONG_SCHEMA_ALLOWED_KEYS.has(key)) {
          errors.push(`${label} Campo no autorizado por el esquema: "${key}".`);
        }
      }
    }

    const requiredStrings = requireYoutubeId
      ? ['id', 'title', 'artist', 'genre', 'audioSrc', 'youtubeId', 'culturalTrivia']
      : ['id', 'title', 'artist'];

    for (const field of requiredStrings) {
      if (typeof song[field] !== 'string' || !song[field].trim()) {
        errors.push(`${label} Campo obligatorio ausente o vacío: "${field}".`);
      }
    }

    if (song.year !== undefined) {
      if (typeof song.year !== 'number' || !Number.isInteger(song.year) || song.year < 1900 || song.year > currentYear + 1) {
        errors.push(`${label} Año inválido: ${JSON.stringify(song.year)}.`);
      }
    } else if (strictSchema) {
      errors.push(`${label} Campo obligatorio ausente: "year".`);
    }

    if (typeof song.youtubeId === 'string' && song.youtubeId.trim()) {
      const yt = song.youtubeId.trim();
      if (!YOUTUBE_ID_REGEX.test(yt)) {
        errors.push(`${label} youtubeId inválido (se esperan 11 caracteres): "${song.youtubeId}".`);
      } else if (seenYtIds.has(yt)) {
        warnings.push(`${label} youtubeId duplicado: "${yt}".`);
      } else {
        seenYtIds.add(yt);
      }
    }

    if (typeof song.id === 'string' && song.id.trim()) {
      const id = song.id.trim();
      if (seenIds.has(id)) {
        errors.push(`${label} ID duplicado: "${id}".`);
      } else {
        seenIds.add(id);
      }
    }

    if (typeof song.title === 'string' && typeof song.artist === 'string') {
      const pairKey = `${song.title.trim().toLowerCase()}|${song.artist.trim().toLowerCase()}`;
      if (seenPairs.has(pairKey)) {
        warnings.push(`${label} Posible canción repetida: "${song.title} - ${song.artist}".`);
      } else {
        seenPairs.add(pairKey);
      }
    }

    if (typeof song.culturalTrivia === 'string') {
      if (song.culturalTrivia.trim().length < 70) {
        warnings.push(`${label} Curiosidad breve (<70 caracteres).`);
      }
      if (/Archivo NotebookLM|Sound On Sound|Engineer:|Producer:/i.test(song.culturalTrivia)) {
        warnings.push(`${label} Curiosidad sin traducir o con prefijo de importación.`);
      }
      if (/\.[a-z]/.test(song.culturalTrivia)) {
        warnings.push(`${label} Falta espacio tras punto en culturalTrivia.`);
      }
    }

    if (typeof song.genre === 'string' && song.genre.startsWith('Classic Track')) {
      warnings.push(`${label} Género genérico "${song.genre}" degrada los distractores.`);
    }
  });

  return {
    isValid: errors.length === 0,
    total: catalog.length,
    errors,
    warnings
  };
}

/**
 * Normaliza y filtra una lista importada desde JSON externo o texto para garantizar
 * que todas las canciones cumplen el esquema seguro antes de persistirse o jugarse.
 *
 * @param {unknown} rawList
 * @returns {{ songs: SongRecord[], report: CatalogAuditReport }}
 */
export function sanitizeImportedCatalog(rawList) {
  if (!Array.isArray(rawList)) {
    return {
      songs: [],
      report: {
        isValid: false,
        total: 0,
        errors: ['El formato introducido debe ser un array de canciones.'],
        warnings: []
      }
    };
  }

  const seenIds = new Set();
  const sanitized = [];
  const currentYear = new Date().getFullYear();

  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const artist = typeof item.artist === 'string' ? item.artist.trim() : '';
    if (!title || !artist) return;

    let id = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim()
      : `custom_${index + 1}`;
    while (seenIds.has(id)) {
      id = `${id}_${index + 1}`;
    }
    seenIds.add(id);

    const parsedYear = Number.parseInt(String(item.year ?? ''), 10);
    const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= currentYear + 1
      ? parsedYear
      : currentYear;

    const ytRaw = typeof item.youtubeId === 'string' ? item.youtubeId.trim() : '';
    const youtubeId = YOUTUBE_ID_REGEX.test(ytRaw) ? ytRaw : '';

    const record = {
      id,
      title,
      artist,
      genre: (typeof item.genre === 'string' && item.genre.trim()) ? item.genre.trim() : 'Pop / Internacional',
      year,
      audioSrc: (typeof item.audioSrc === 'string' && item.audioSrc.trim()) ? item.audioSrc.trim() : '',
      youtubeId,
      culturalTrivia: (typeof item.culturalTrivia === 'string' && item.culturalTrivia.trim())
        ? item.culturalTrivia.trim()
        : `${title} es una canción interpretada por ${artist} incluida en tu lista personalizada.`
    };

    if (Number.isInteger(item.rank) && item.rank > 0) {
      record.rank = item.rank;
    }
    if (typeof item.views === 'string' && item.views.trim()) {
      record.views = item.views.trim();
    }

    sanitized.push(record);
  });

  const report = auditSongCatalog(sanitized, {
    strictSchema: true,
    requireYoutubeId: false
  });

  return { songs: sanitized, report };
}
