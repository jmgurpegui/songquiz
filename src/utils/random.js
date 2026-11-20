/**
 * @fileoverview Utilidades matemáticas y algorítmicas de aleatorización sin sesgo.
 * Implementa el algoritmo de Fisher-Yates (Knuth) y el generador dinámico de
 * distractores garantizando que las opciones de respuesta cambien en cada canción.
 */

/**
 * Baraja un arreglo de elementos utilizando el algoritmo insesgado Fisher-Yates.
 * Garantiza una permutación equiprobable O(n) sin mutar el arreglo original.
 *
 * @template T
 * @param {T[]} array - Arreglo a barajar.
 * @returns {T[]} Nuevo arreglo barajado.
 */
export function shuffle(array) {
  if (!Array.isArray(array)) return [];
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Extrae el género principal normalizado de una cadena (ej. "Pop Rock / New Wave" -> "pop rock").
 *
 * @param {string} [genre='']
 * @returns {string}
 */
function primaryGenre(genre = '') {
  return String(genre || '').split('/')[0].trim().toLowerCase();
}

/**
 * Genera un conjunto de 4 opciones de respuesta (1 correcta + 3 distractores dinámicos)
 * garantizando que cambien completamente en cada canción respecto a la ronda anterior
 * y aprovechando géneros principales y cercanía de década.
 *
 * @param {Object} currentSong - Canción de la ronda actual.
 * @param {Object[]} allSongs - Catálogo completo de canciones disponibles.
 * @param {number} [totalOptions=4] - Número total de opciones a generar.
 * @param {string[]} [previousOptions=[]] - Opciones mostradas en la canción anterior para evitar repeticiones.
 * @returns {{ options: string[], correctAnswer: string }}
 */
export function generateOptions(currentSong, allSongs, totalOptions = 4, previousOptions = []) {
  const correctAnswer = `${currentSong.title} - ${currentSong.artist}`;
  const neededDistractors = Math.max(1, totalOptions - 1);
  const prevSet = new Set((previousOptions || []).map(o => String(o).toLowerCase().trim()));
  const currentTitleNorm = String(currentSong.title || '').toLowerCase().trim();
  const currentPrimaryGenre = primaryGenre(currentSong.genre);
  const currentDecade = Number.isInteger(currentSong.year) ? Math.floor(currentSong.year / 10) * 10 : null;

  // Filtrar canciones candidatas excluyendo la actual y evitando repetir las de la ronda previa
  const freshCandidates = (allSongs || []).filter(s => {
    if (!s || !s.title || !s.artist) return false;
    if (s.id === currentSong.id) return false;
    if (String(s.title).toLowerCase().trim() === currentTitleNorm) return false;
    const label = `${s.title} - ${s.artist}`.toLowerCase().trim();
    return !prevSet.has(label);
  });

  // Fallback si la lista es muy pequeña (< 4 canciones)
  const fallbackCandidates = (allSongs || []).filter(s => {
    if (!s || !s.title || !s.artist) return false;
    if (s.id === currentSong.id) return false;
    return String(s.title).toLowerCase().trim() !== currentTitleNorm;
  });

  const basePool = freshCandidates.length >= neededDistractors ? freshCandidates : fallbackCandidates;

  // Combinar candidatos de género principal o década cercana (hasta 2) con variedad global
  const sameGenre = shuffle(basePool.filter(s => currentPrimaryGenre && primaryGenre(s.genre) === currentPrimaryGenre));
  const sameDecade = shuffle(basePool.filter(s =>
    currentDecade !== null &&
    Number.isInteger(s.year) &&
    Math.floor(s.year / 10) * 10 === currentDecade &&
    primaryGenre(s.genre) !== currentPrimaryGenre
  ));
  const others = shuffle(basePool);

  const mixedPool = [];
  if (sameGenre.length > 0) mixedPool.push(sameGenre[0]);
  if (sameDecade.length > 0) mixedPool.push(sameDecade[0]);
  mixedPool.push(...shuffle([...sameGenre.slice(1), ...sameDecade.slice(1), ...others]));

  const distractors = [];
  const usedLabels = new Set([correctAnswer.toLowerCase().trim()]);
  const usedTitles = new Set([currentTitleNorm]);

  for (const s of mixedPool) {
    if (distractors.length >= neededDistractors) break;
    const label = `${s.title} - ${s.artist}`;
    const norm = label.toLowerCase().trim();
    const titleNorm = String(s.title).toLowerCase().trim();
    if (!usedLabels.has(norm) && !usedTitles.has(titleNorm)) {
      usedLabels.add(norm);
      usedTitles.add(titleNorm);
      distractors.push(label);
    }
  }

  while (distractors.length < neededDistractors) {
    distractors.push(`Clásico Musical #${distractors.length + 1}`);
  }

  const finalOptions = shuffle([correctAnswer, ...distractors]);

  return {
    options: finalOptions,
    correctAnswer
  };
}
