/**
 * @fileoverview Motor de validación lingüística y andamiaje progresivo para el modo "Lyrics Challenge".
 * Implementa normalización Unicode, equivalencias de contracciones en inglés, distancia de
 * Levenshtein y pistas escalonadas sin dependencias externas.
 */

import { shuffle } from '../utils/random.js';

/** @type {Readonly<Record<string, string>>} */
const ENGLISH_CONTRACTIONS = Object.freeze({
  cant: 'cannot',
  wont: 'will not',
  dont: 'do not',
  doesnt: 'does not',
  didnt: 'did not',
  isnt: 'is not',
  arent: 'are not',
  wasnt: 'was not',
  werent: 'were not',
  im: 'i am',
  ive: 'i have',
  ill: 'i will',
  id: 'i would',
  youre: 'you are',
  youve: 'you have',
  youll: 'you will',
  theyre: 'they are',
  weve: 'we have',
  thats: 'that is',
  theres: 'there is',
  whats: 'what is',
  lets: 'let us',
  gonna: 'going to',
  wanna: 'want to',
  gotta: 'got to',
  cause: 'because',
  aint: 'am not'
});

/**
 * Normaliza una respuesta de texto unificando apóstrofos tipográficos, eliminando diacríticos
 * y limpiando puntuación periférica.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLyricsToken(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02BC`´]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Expande contracciones inglesas frecuentes a su forma canónica para validar equivalencias.
 *
 * @param {string} normalized
 * @returns {string}
 */
function expandContraction(normalized) {
  const noApostrophe = normalized.replace(/'/g, '');
  return ENGLISH_CONTRACTIONS[normalized] || ENGLISH_CONTRACTIONS[noApostrophe] || normalized;
}

/**
 * Calcula la distancia de edición de Levenshtein en O(n*m) tiempo y O(min(n,m)) memoria.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * @typedef {Object} LyricsChallengeEntry
 * @property {string} songId
 * @property {string} verseEn - Verso en inglés con marcador `{{blank}}`.
 * @property {string} verseEs - Traducción pedagógica al español.
 * @property {string} targetWord - Palabra o expresión objetivo.
 * @property {string[]} [acceptedVariants] - Variantes válidas adicionales.
 * @property {number} [cueSeconds] - Segundo recomendado para escuchar el verso.
 * @property {string} [linguisticNote] - Micro-explicación de vocabulario o gramática.
 * @property {string[]} [distractors] - Tres distractores plausibles para modo reconocimiento.
 * @property {'A2'|'B1'|'B2'} [difficulty]
 */

/**
 * @typedef {Object} LyricsEvaluationResult
 * @property {boolean} isCorrect
 * @property {'exact'|'contraction'|'fuzzy'|'wrong'} matchType
 * @property {number} distance
 * @property {string} feedback
 */

/**
 * Evalúa la respuesta de un jugador en modo Lyrics Challenge.
 *
 * @param {string} userInput
 * @param {string} expectedWord
 * @param {string[]} [acceptedVariants=[]]
 * @param {{ allowFuzzy?: boolean }} [options={}]
 * @returns {LyricsEvaluationResult}
 */
export function evaluateLyricsAnswer(userInput, expectedWord, acceptedVariants = [], options = {}) {
  const { allowFuzzy = true } = options;
  const normInput = normalizeLyricsToken(userInput);
  const candidates = [expectedWord, ...(Array.isArray(acceptedVariants) ? acceptedVariants : [])]
    .map(normalizeLyricsToken)
    .filter(Boolean);

  if (!normInput || candidates.length === 0) {
    return {
      isCorrect: false,
      matchType: 'wrong',
      distance: expectedWord ? expectedWord.length : 0,
      feedback: `Respuesta esperada: "${expectedWord}".`
    };
  }

  if (candidates.includes(normInput)) {
    return {
      isCorrect: true,
      matchType: 'exact',
      distance: 0,
      feedback: `¡Exacto! "${expectedWord}" completa correctamente el verso.`
    };
  }

  const expandedInput = expandContraction(normInput);
  const strippedInput = normInput.replace(/'/g, '');
  for (const cand of candidates) {
    if (expandContraction(cand) === expandedInput || cand.replace(/'/g, '') === strippedInput) {
      return {
        isCorrect: true,
        matchType: 'contraction',
        distance: levenshteinDistance(normInput, cand),
        feedback: `¡Correcto! En la canción se canta "${expectedWord}".`
      };
    }
  }

  let minDist = Infinity;
  for (const cand of candidates) {
    const dist = levenshteinDistance(normInput, cand);
    if (dist < minDist) minDist = dist;
    if (allowFuzzy && cand.length >= 5 && dist === 1) {
      return {
        isCorrect: true,
        matchType: 'fuzzy',
        distance: 1,
        feedback: `¡Acierto con pequeña errata! Ortografía exacta: "${expectedWord}".`
      };
    }
  }

  return {
    isCorrect: false,
    matchType: 'wrong',
    distance: minDist,
    feedback: `No coincide. La palabra correcta era "${expectedWord}".`
  };
}

/**
 * Genera una pista escalonada de andamiaje (nivel 1: primera letra y longitud;
 * nivel 2: primera y última letra) sin revelar la solución completa.
 *
 * @param {string} targetWord
 * @param {1|2} [hintLevel=1]
 * @returns {string}
 */
export function buildScaffoldingHint(targetWord, hintLevel = 1) {
  const clean = (targetWord || '').trim();
  if (!clean) return '____';

  return clean
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 2) {
        return `${word[0]}${'_'.repeat(Math.max(1, word.length - 1))}`;
      }
      if (hintLevel === 1) {
        return `${word[0]} ${'_ '.repeat(word.length - 1).trim()}`;
      }
      return `${word[0]} ${'_ '.repeat(word.length - 2).trim()} ${word[word.length - 1]}`;
    })
    .join('   ');
}

/**
 * Construye el paquete completo de una ronda de Lyrics Challenge, incluyendo
 * las 4 opciones barajadas para el nivel de reconocimiento.
 *
 * @param {LyricsChallengeEntry} entry
 * @returns {{
 *   songId: string,
 *   verseEn: string,
 *   verseEs: string,
 *   targetWord: string,
 *   acceptedVariants: string[],
 *   cueSeconds: number,
 *   linguisticNote: string,
 *   difficulty: string,
 *   options: string[]
 * }}
 */
export function buildLyricsRoundData(entry) {
  const target = (entry.targetWord || '').trim();
  const uniquePool = new Set([target.toLowerCase()]);
  const distractors = [];

  for (const d of (entry.distractors || [])) {
    const clean = String(d || '').trim();
    if (clean && !uniquePool.has(clean.toLowerCase())) {
      uniquePool.add(clean.toLowerCase());
      distractors.push(clean);
    }
    if (distractors.length === 3) break;
  }

  const fallbackWords = ['memory', 'shadow', 'moment', 'silence', 'rhythm'];
  for (const fw of fallbackWords) {
    if (distractors.length >= 3) break;
    if (!uniquePool.has(fw)) {
      uniquePool.add(fw);
      distractors.push(fw);
    }
  }

  return {
    songId: entry.songId,
    verseEn: entry.verseEn,
    verseEs: entry.verseEs,
    targetWord: target,
    acceptedVariants: Array.isArray(entry.acceptedVariants) ? [...entry.acceptedVariants] : [],
    cueSeconds: Number.isFinite(entry.cueSeconds) ? Math.max(0, entry.cueSeconds) : 0,
    linguisticNote: entry.linguisticNote || '',
    difficulty: entry.difficulty || 'B1',
    options: shuffle([target, ...distractors])
  };
}
