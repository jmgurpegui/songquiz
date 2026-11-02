/**
 * @fileoverview Utilidades matemáticas y algorítmicas de aleatorización sin sesgo.
 * Implementa el algoritmo de Fisher-Yates (Knuth) y generadores dinámicos de distractores.
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
 * Genera un conjunto de opciones (1 correcta + N-1 distractores dinámicos)
 * seleccionados inteligentemente del catálogo sin duplicados.
 * 
 * @param {Object} currentSong - Canción de la ronda actual.
 * @param {Object[]} allSongs - Catálogo completo de canciones disponibles.
 * @param {number} [totalOptions=4] - Número total de opciones a generar.
 * @returns {{ options: string[], correctAnswer: string }} Objeto con opciones mezcladas y respuesta correcta.
 */
export function generateOptions(currentSong, allSongs, totalOptions = 4) {
  const correctAnswer = `${currentSong.title} - ${currentSong.artist}`;
  const neededDistractors = Math.max(1, totalOptions - 1);

  // Excluir la canción actual
  const candidates = allSongs.filter(s => s.id !== currentSong.id);

  // Priorizar canciones de género o época afín para mayor reto pedagógico
  const relatedCandidates = candidates.filter(s => s.genre === currentSong.genre);
  const otherCandidates = candidates.filter(s => s.genre !== currentSong.genre);

  // Barajar ambos grupos
  const shuffledRelated = shuffle(relatedCandidates);
  const shuffledOthers = shuffle(otherCandidates);

  // Combinar priorizando las relacionadas
  const pool = [...shuffledRelated, ...shuffledOthers];

  // Extraer los distractores necesarios
  const distractors = pool
    .slice(0, neededDistractors)
    .map(s => `${s.title} - ${s.artist}`);

  // Si el catálogo es menor a las opciones requeridas, agregar alternativas genéricas
  while (distractors.length < neededDistractors) {
    distractors.push(`Desconocido - Pista ${distractors.length + 1}`);
  }

  // Mezclar la respuesta correcta entre los distractores
  const finalOptions = shuffle([correctAnswer, ...distractors]);

  return {
    options: finalOptions,
    correctAnswer
  };
}
