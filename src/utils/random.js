/**
 * @fileoverview Utilidades matemáticas y algorítmicas de aleatorización sin sesgo.
 * Implementa el algoritmo de Fisher-Yates (Knuth), generadores de distractores clásicos
 * y el motor pedagógico para el modo "Lyrics Challenge" (Cloze test activo).
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
 * Genera un conjunto de opciones clásicas (1 correcta + N-1 distractores dinámicos)
 * seleccionados inteligentemente del catálogo.
 * 
 * @param {Object} currentSong - Canción de la ronda actual.
 * @param {Object[]} allSongs - Catálogo completo de canciones disponibles.
 * @param {number} [totalOptions=4] - Número total de opciones a generar.
 * @returns {{ options: string[], correctAnswer: string }}
 */
export function generateOptions(currentSong, allSongs, totalOptions = 4) {
  const correctAnswer = `${currentSong.title} - ${currentSong.artist}`;
  const neededDistractors = Math.max(1, totalOptions - 1);

  // Excluir la canción actual
  const candidates = allSongs.filter(s => s.id !== currentSong.id);

  // Priorizar canciones de género o época afín
  const relatedCandidates = candidates.filter(s => s.genre === currentSong.genre);
  const otherCandidates = candidates.filter(s => s.genre !== currentSong.genre);

  const shuffledRelated = shuffle(relatedCandidates);
  const shuffledOthers = shuffle(otherCandidates);
  const pool = [...shuffledRelated, ...shuffledOthers];

  const distractors = pool
    .slice(0, neededDistractors)
    .map(s => `${s.title} - ${s.artist}`);

  while (distractors.length < neededDistractors) {
    distractors.push(`Desconocido - Pista ${distractors.length + 1}`);
  }

  const finalOptions = shuffle([correctAnswer, ...distractors]);

  return {
    options: finalOptions,
    correctAnswer
  };
}

/**
 * Lista exhaustiva de palabras vacías (stopwords y contracciones) en inglés
 * que no deben seleccionarse como palabras clave de aprendizaje léxico.
 */
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'from', 'by', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'under',
  'up', 'down', 'out', 'off', 'over', 'is', 'am', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'doing', 'can', 'could',
  'shall', 'should', 'will', 'would', 'may', 'might', 'must',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose',
  'not', 'no', 'oh', 'ooh', 'yeah', 'yes', 'ah', 'la', 'just', 'then', 'now',
  'like', 'where', 'there', 'here', 'when', 'why', 'how', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'too', 'very', 'tell', 'said', 'says', 'until', 'since', 'well', 'away', 'okay', 'never', 'ever', 'also',
  // Contracciones sin y con apóstrofe
  'dont', 'cant', 'wont', 'ive', 'youre', 'theyre', 'were', 'im', 'ill', 'id',
  'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'thats', 'whats', 'theres', 'lets'
]);

/**
 * Banco morfológico pedagógico de distractores clasificados por terminación o categoría.
 */
const MORPHOLOGICAL_BACKUP = {
  'ed': ['guided', 'chased', 'wanted', 'fallen', 'drowned', 'blessed', 'healed', 'learned'],
  'ing': ['falling', 'chasing', 'running', 'burning', 'dreaming', 'holding', 'shining', 'speaking'],
  'er': ['lover', 'dancer', 'fighter', 'player', 'runner', 'dreamer', 'leader', 'master'],
  'ly': ['slowly', 'deeply', 'softly', 'loudly', 'blindly', 'freely', 'truly', 'clearly'],
  'y': ['fantasy', 'destiny', 'mystery', 'melody', 'reality', 'tragedy', 'sympathy', 'memory'],
  's': ['lights', 'friends', 'skies', 'eyes', 'dreams', 'shots', 'words', 'nights'],
  'default': ['passion', 'silence', 'shadow', 'freedom', 'promise', 'danger', 'secret', 'spirit']
};

/**
 * Normaliza una palabra eliminando puntuación circundante y apóstrofes.
 * @param {string} rawWord
 * @returns {string}
 */
export function cleanWord(rawWord) {
  return (rawWord || '')
    .replace(/[’']/g, '')
    .replace(/^[^\w]+|[^\w]+$/g, '')
    .toLowerCase();
}

/**
 * Genera un desafío pedagógico tipo "Cloze Test" (completar huecos) para el modo Lyrics Challenge.
 * 
 * @param {Object} currentSong - Canción actual del catálogo con letras en inglés y español.
 * @param {Object[]} allSongs - Catálogo completo para extraer distractores auténticos.
 * @param {number} [totalOptions=4] - Opciones totales a presentar al estudiante.
 * @returns {{
 *   fullLine: string,
 *   blankedLine: string,
 *   targetWord: string,
 *   options: string[],
 *   spanishContext: string,
 *   fullLyricsEn: string,
 *   fullLyricsEs: string
 * }}
 */
export function generateLyricsChallenge(currentSong, allSongs, totalOptions = 4) {
  const lyricsEn = currentSong.lyrics?.en || '';
  const lyricsEs = currentSong.lyrics?.es || '';

  const linesEn = lyricsEn.split('\n').filter(l => l.trim().length > 0);
  const linesEs = lyricsEs.split('\n').filter(l => l.trim().length > 0);

  // Buscar el verso con palabras pedagógicas más significativas (longitud >= 4 y no stopwords)
  let chosenLineIndex = 0;
  let candidateWords = [];

  for (let idx = 0; idx < linesEn.length; idx++) {
    const rawWords = linesEn[idx].split(/\s+/);
    const valid = rawWords.filter(w => {
      const cleaned = cleanWord(w);
      return cleaned.length >= 4 && !ENGLISH_STOPWORDS.has(cleaned);
    });

    if (valid.length > candidateWords.length) {
      chosenLineIndex = idx;
      candidateWords = valid;
    }
  }

  // Si no se encontraron palabras >= 4, aceptar >= 3
  if (candidateWords.length === 0 && linesEn.length > 0) {
    const rawWords = linesEn[0].split(/\s+/);
    candidateWords = rawWords.filter(w => {
      const cleaned = cleanWord(w);
      return cleaned.length >= 3 && !ENGLISH_STOPWORDS.has(cleaned);
    });
  }

  const chosenLine = linesEn[chosenLineIndex] || 'I feel the music in the night';
  const spanishContext = linesEs[chosenLineIndex] || linesEs[0] || 'Siento la música en la noche';

  // Seleccionar la palabra objetivo limpia
  const rawTarget = candidateWords[Math.floor(Math.random() * candidateWords.length)] || 'music';
  const targetWord = cleanWord(rawTarget);

  // Reemplazar la palabra en el verso por un marcador de hueco
  const regex = new RegExp(`\\b${targetWord}\\b`, 'i');
  const blankedLine = chosenLine.replace(regex, '[ _____ ]');

  // Recolectar vocabulario del catálogo para distractores auténticos
  const vocabularyPool = new Set();
  allSongs.forEach(song => {
    if (song.lyrics?.en) {
      song.lyrics.en.split(/\s+/).forEach(w => {
        const c = cleanWord(w);
        if (c.length >= 4 && !ENGLISH_STOPWORDS.has(c) && c !== targetWord) {
          vocabularyPool.add(c);
        }
      });
    }
  });

  // Determinar sufijo morfológico para coherencia gramatical
  let suffix = 'default';
  for (const s of ['ing', 'ed', 'er', 'ly', 'y', 's']) {
    if (targetWord.endsWith(s)) {
      suffix = s;
      break;
    }
  }

  // Filtrar vocabulario afín
  const poolArray = Array.from(vocabularyPool);
  const morphMatches = poolArray.filter(w => suffix !== 'default' && w.endsWith(suffix));
  const lengthMatches = poolArray.filter(w => Math.abs(w.length - targetWord.length) <= 2);

  const distractorCandidates = [
    ...shuffle(morphMatches),
    ...shuffle(lengthMatches),
    ...(MORPHOLOGICAL_BACKUP[suffix] || MORPHOLOGICAL_BACKUP.default)
  ].filter(w => cleanWord(w) !== targetWord);

  const uniqueDistractors = [];
  for (const word of distractorCandidates) {
    const c = cleanWord(word);
    if (c && !uniqueDistractors.includes(c) && c !== targetWord) {
      uniqueDistractors.push(c);
    }
    if (uniqueDistractors.length >= totalOptions - 1) break;
  }

  // Rellenar si hiciera falta
  for (const fw of MORPHOLOGICAL_BACKUP.default) {
    if (uniqueDistractors.length >= totalOptions - 1) break;
    const c = cleanWord(fw);
    if (!uniqueDistractors.includes(c) && c !== targetWord) {
      uniqueDistractors.push(c);
    }
  }

  const finalOptions = shuffle([targetWord, ...uniqueDistractors.slice(0, totalOptions - 1)]);

  return {
    fullLine: chosenLine,
    blankedLine,
    targetWord,
    options: finalOptions,
    spanishContext,
    fullLyricsEn: lyricsEn,
    fullLyricsEs: lyricsEs
  };
}
