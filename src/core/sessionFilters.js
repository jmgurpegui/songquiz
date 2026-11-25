/**
 * @fileoverview Lógica pura de filtros por década, niveles de dificultad (Normal / Difícil / Experto),
 * lista inteligente "Repasar falladas" y evaluación tolerante de respuestas escritas en modo Classic Experto.
 */

export const DifficultyLevels = Object.freeze({
  NORMAL: 'normal',
  HARD: 'hard',
  EXPERT: 'expert'
});

export const DecadeFilters = Object.freeze({
  ALL: 'all',
  CLASSIC_60S_70S: 'classic',
  DECADES_80S: '1980s',
  DECADES_90S: '1990s',
  DECADES_00S: '2000s',
  DECADES_10S: '2010s',
  DECADES_20S: '2020s'
});

export const DIFFICULTY_SCORE_MULTIPLIER = Object.freeze({
  [DifficultyLevels.NORMAL]: 1.0,
  [DifficultyLevels.HARD]: 1.25,
  [DifficultyLevels.EXPERT]: 1.5
});

export const DECADE_LABELS = Object.freeze({
  [DecadeFilters.ALL]: 'Todas',
  [DecadeFilters.CLASSIC_60S_70S]: '60s–70s',
  [DecadeFilters.DECADES_80S]: '80s',
  [DecadeFilters.DECADES_90S]: '90s',
  [DecadeFilters.DECADES_00S]: '2000s',
  [DecadeFilters.DECADES_10S]: '2010s',
  [DecadeFilters.DECADES_20S]: '2020s'
});

/**
 * Comprueba si una canción pertenece a la década seleccionada.
 * @param {Object|null|undefined} song
 * @param {string} decadeKey
 * @returns {boolean}
 */
export function matchesDecadeFilter(song, decadeKey) {
  if (!decadeKey || decadeKey === DecadeFilters.ALL) return true;
  const year = Number(song?.year);
  if (!Number.isFinite(year) || year <= 0) return false;

  switch (decadeKey) {
    case DecadeFilters.CLASSIC_60S_70S:
      return year <= 1979;
    case DecadeFilters.DECADES_80S:
      return year >= 1980 && year <= 1989;
    case DecadeFilters.DECADES_90S:
      return year >= 1990 && year <= 1999;
    case DecadeFilters.DECADES_00S:
      return year >= 2000 && year <= 2009;
    case DecadeFilters.DECADES_10S:
      return year >= 2010 && year <= 2019;
    case DecadeFilters.DECADES_20S:
      return year >= 2020;
    default:
      return true;
  }
}

/**
 * Filtra una lista de canciones según la década elegida sin mutar el array original.
 * @param {Array<Object>} songs
 * @param {string} [decadeKey='all']
 * @returns {Array<Object>}
 */
export function filterSongsByDecade(songs, decadeKey = DecadeFilters.ALL) {
  if (!Array.isArray(songs)) return [];
  if (!decadeKey || decadeKey === DecadeFilters.ALL) {
    return [...songs];
  }
  return songs.filter((song) => matchesDecadeFilter(song, decadeKey));
}

/**
 * Resuelve los IDs de canciones falladas frente a uno o varios catálogos (maestro + activo)
 * manteniendo unicidad y priorizando el orden más reciente primero.
 *
 * @param {string[]} failedSongIds
 * @param {Array<Object>} catalogPool
 * @returns {Array<Object>}
 */
export function getFailedSongsFromCatalog(failedSongIds, catalogPool) {
  if (!Array.isArray(failedSongIds) || failedSongIds.length === 0 || !Array.isArray(catalogPool)) {
    return [];
  }

  const byId = new Map();
  for (const song of catalogPool) {
    if (song && typeof song.id === 'string' && !byId.has(song.id)) {
      byId.set(song.id, song);
    }
  }

  const resolved = [];
  const seen = new Set();
  // Recorrer del fallo más reciente al más antiguo
  for (let i = failedSongIds.length - 1; i >= 0; i -= 1) {
    const id = failedSongIds[i];
    if (typeof id !== 'string' || seen.has(id)) continue;
    const match = byId.get(id);
    if (match) {
      seen.add(id);
      resolved.push(match);
    }
  }

  return resolved;
}

/**
 * Normaliza un título o respuesta escrita para comparación tolerante (Unicode NFD, sin tildes ni paréntesis).
 * @param {string} value
 * @returns {string}
 */
export function normalizeClassicAnswer(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\((feat|ft|with|official|remaster|remastered|radio edit|version|remix|live)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distancia de edición de Levenshtein iterativa O(min(m, n)) en memoria.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const shortStr = a.length <= b.length ? a : b;
  const longStr = a.length <= b.length ? b : a;

  let prev = new Array(shortStr.length + 1);
  let curr = new Array(shortStr.length + 1);

  for (let j = 0; j <= shortStr.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= longStr.length; i += 1) {
    curr[0] = i;
    const longChar = longStr.charCodeAt(i - 1);
    for (let j = 1; j <= shortStr.length; j += 1) {
      const cost = longChar === shortStr.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[shortStr.length];
}

/**
 * Evalúa una respuesta de escritura libre en modo Classic Experto.
 * Acepta el título exacto, título con errata menor (Levenshtein tolerante según longitud),
 * o combinaciones "Título - Artista" / "Artista - Título".
 *
 * @param {string} rawInput
 * @param {Object|null|undefined} song
 * @returns {{ isCorrect: boolean, matchType: 'exact'|'fuzzy'|'title_artist'|'empty'|'mismatch', distance: number }}
 */
export function evaluateClassicTypedAnswer(rawInput, song) {
  const userNorm = normalizeClassicAnswer(rawInput);
  if (!userNorm || !song?.title) {
    return { isCorrect: false, matchType: 'empty', distance: Infinity };
  }

  const titleNorm = normalizeClassicAnswer(song.title);
  const titleNoParens = normalizeClassicAnswer(String(song.title).replace(/\([^)]*\)/g, ''));
  const artistNorm = normalizeClassicAnswer(song.artist || '');
  const primaryArtistNorm = normalizeClassicAnswer(
    String(song.artist || '').split(/\b(?:feat\.?|ft\.?|featuring|with|&|x)\b|,|\//i)[0]
  );

  const titleTargets = Array.from(new Set([titleNorm, titleNoParens].filter(Boolean)));
  const comboTargets = [];
  for (const t of titleTargets) {
    if (artistNorm) {
      comboTargets.push(`${t} ${artistNorm}`);
      comboTargets.push(`${artistNorm} ${t}`);
    }
    if (primaryArtistNorm && primaryArtistNorm !== artistNorm) {
      comboTargets.push(`${t} ${primaryArtistNorm}`);
      comboTargets.push(`${primaryArtistNorm} ${t}`);
    }
  }

  // 1. Coincidencia exacta de título
  if (titleTargets.includes(userNorm)) {
    return { isCorrect: true, matchType: 'exact', distance: 0 };
  }

  // 2. Coincidencia exacta o muy cercana de "Título + Artista"
  for (const combo of comboTargets) {
    if (userNorm === combo) {
      return { isCorrect: true, matchType: 'title_artist', distance: 0 };
    }
    const maxComboDist = combo.length >= 12 ? 2 : 1;
    const dist = levenshteinDistance(userNorm, combo);
    if (dist <= maxComboDist) {
      return { isCorrect: true, matchType: 'title_artist', distance: dist };
    }
  }

  // 3. Coincidencia tolerante (Levenshtein) frente al título
  let bestDist = Infinity;
  for (const target of titleTargets) {
    const dist = levenshteinDistance(userNorm, target);
    if (dist < bestDist) bestDist = dist;

    const maxAllowedDist = target.length >= 10 ? 2 : (target.length >= 5 ? 1 : 0);
    if (dist <= maxAllowedDist) {
      return { isCorrect: true, matchType: 'fuzzy', distance: dist };
    }

    // También aceptar si el usuario escribió el título completo seguido de texto extra (ej. artista)
    if (target.length >= 5 && userNorm.includes(target) && primaryArtistNorm && userNorm.includes(primaryArtistNorm)) {
      return { isCorrect: true, matchType: 'title_artist', distance: 0 };
    }
  }

  return { isCorrect: false, matchType: 'mismatch', distance: bestDist };
}

/**
 * Genera una pista progresiva para el modo Classic Experto (nivel 1: artista y año; nivel 2: iniciales del título).
 * @param {Object|null|undefined} song
 * @param {number} level - 1 o 2
 * @returns {string}
 */
export function buildClassicExpertHint(song, level = 1) {
  if (!song) return '';
  const artistPart = song.artist ? `Artista: ${song.artist}` : '';
  const yearPart = song.year ? `${song.year}` : '';
  const genrePart = song.genre ? `${song.genre}` : '';

  const level1 = [artistPart, yearPart, genrePart].filter(Boolean).join(' · ');
  if (level <= 1) {
    return level1 || 'Escucha el estribillo con atención.';
  }

  const maskedTitle = String(song.title || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) return word;
      return `${word[0]}${'_'.repeat(Math.min(6, word.length - 1))}`;
    })
    .join(' ');

  return `${level1 ? `${level1} · ` : ''}Título: ${maskedTitle}`;
}
