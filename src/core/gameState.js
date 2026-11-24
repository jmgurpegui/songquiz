/**
 * @fileoverview Máquina de estados finitos (FSM) estricta y contenedor reactivo de estado para SongQuiz.
 * Emplea EventTarget nativo, bloquea transiciones ilegales y persiste preferencias mediante storageManager.
 */

import { readStorageRaw, readStorageJSON, writeStorageJSON } from '../utils/storageManager.js';

export const GameStates = Object.freeze({
  IDLE: 'IDLE',
  AWAITING_AUDIO: 'AWAITING_AUDIO',
  PLAYING: 'PLAYING',
  ROUND_OVER: 'ROUND_OVER',
  GAME_OVER: 'GAME_OVER'
});

export const GameModes = Object.freeze({
  CLASSIC: 'CLASSIC',
  LYRICS: 'LYRICS'
});

export const LyricsInputLevels = Object.freeze({
  RECOGNITION: 'recognition',
  GUIDED: 'guided'
});

const GAME_MODE_STORAGE_KEY = 'songquiz_game_mode';
const LYRICS_LEVEL_STORAGE_KEY = 'songquiz_lyrics_level';

/** Mapa de transiciones permitidas por la FSM. Toda transición fuera de este grafo es rechazada. */
const VALID_TRANSITIONS = Object.freeze({
  [GameStates.IDLE]: [GameStates.IDLE, GameStates.AWAITING_AUDIO, GameStates.PLAYING],
  [GameStates.AWAITING_AUDIO]: [
    GameStates.IDLE,
    GameStates.AWAITING_AUDIO,
    GameStates.PLAYING,
    GameStates.ROUND_OVER,
    GameStates.GAME_OVER
  ],
  [GameStates.PLAYING]: [
    GameStates.IDLE,
    GameStates.AWAITING_AUDIO,
    GameStates.PLAYING,
    GameStates.ROUND_OVER,
    GameStates.GAME_OVER
  ],
  [GameStates.ROUND_OVER]: [
    GameStates.IDLE,
    GameStates.AWAITING_AUDIO,
    GameStates.PLAYING,
    GameStates.GAME_OVER
  ],
  [GameStates.GAME_OVER]: [
    GameStates.IDLE,
    GameStates.AWAITING_AUDIO,
    GameStates.PLAYING
  ]
});

export class GameState extends EventTarget {
  constructor() {
    super();

    /** @type {keyof typeof GameStates} */
    this.status = GameStates.IDLE;

    /** @type {keyof typeof GameModes} */
    this.gameMode = this._loadSavedGameMode();

    /** @type {'recognition'|'guided'} */
    this.lyricsLevel = this._loadSavedLyricsLevel();

    /** @type {Array<Object>} */
    this.playlist = [];
    this.currentIndex = 0;

    /** @type {Object|null} */
    this.currentSong = null;
    /** @type {string[]} */
    this.currentOptions = [];
    /** @type {string} */
    this.correctAnswer = '';

    /** @type {Object|null} */
    this.lyricsChallengeData = null;

    // Métricas y puntuación (30 segundos sincronizados con el preview gratuito sin anuncios)
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.timeRemaining = 30;
    this.maxRoundTime = 30;

    /** @type {Array<{songId: string, correct: boolean, timeSpent: number, points: number, mode: string}>} */
    this.history = [];
  }

  /**
   * Carga el modo guardado (compatible con formato JSON y cadenas heredadas).
   * @private
   * @returns {keyof typeof GameModes}
   */
  _loadSavedGameMode() {
    const jsonVal = readStorageJSON(GAME_MODE_STORAGE_KEY, null, (v) => Object.values(GameModes).includes(v));
    if (jsonVal) return jsonVal;

    const rawVal = readStorageRaw(GAME_MODE_STORAGE_KEY, '');
    if (Object.values(GameModes).includes(rawVal)) {
      return rawVal;
    }
    return GameModes.CLASSIC;
  }

  /**
   * Carga el nivel de andamiaje guardado para Lyrics Challenge.
   * @private
   * @returns {'recognition'|'guided'}
   */
  _loadSavedLyricsLevel() {
    return readStorageJSON(
      LYRICS_LEVEL_STORAGE_KEY,
      LyricsInputLevels.RECOGNITION,
      (v) => Object.values(LyricsInputLevels).includes(v)
    );
  }

  /**
   * Cambia el modo de juego activo y persiste la preferencia.
   * @param {keyof typeof GameModes} mode
   */
  setGameMode(mode) {
    if (!Object.values(GameModes).includes(mode)) return;
    this.gameMode = mode;
    writeStorageJSON(GAME_MODE_STORAGE_KEY, mode);

    this.dispatchEvent(new CustomEvent('modeChange', {
      detail: { mode: this.gameMode }
    }));
  }

  /**
   * Cambia el nivel de andamiaje en Lyrics Challenge ('recognition' o 'guided').
   * @param {'recognition'|'guided'} level
   */
  setLyricsLevel(level) {
    if (!Object.values(LyricsInputLevels).includes(level)) return;
    this.lyricsLevel = level;
    writeStorageJSON(LYRICS_LEVEL_STORAGE_KEY, level);

    this.dispatchEvent(new CustomEvent('lyricsLevelChange', {
      detail: { level: this.lyricsLevel }
    }));
  }

  /**
   * Obtiene la canción actual de la ronda.
   */
  get currentTrack() {
    return this.playlist[this.currentIndex] || null;
  }

  /**
   * Obtiene el número total de rondas en la partida actual.
   */
  get totalRounds() {
    return this.playlist.length;
  }

  /**
   * Valida y ejecuta una transición de estado de la FSM.
   * Bloquea cualquier transición no permitida devolviendo `false` sin mutar `this.status`.
   *
   * @param {keyof typeof GameStates} nextState
   * @param {Object} [payload={}]
   * @returns {boolean} True si la transición fue aplicada; false si fue bloqueada.
   */
  transition(nextState, payload = {}) {
    const allowed = VALID_TRANSITIONS[this.status];
    if (!allowed || !allowed.includes(nextState)) {
      console.warn(`Transición de estado bloqueada: de ${this.status} a ${nextState}`);
      return false;
    }

    const prevState = this.status;
    this.status = nextState;

    this.dispatchEvent(new CustomEvent('stateChange', {
      detail: {
        prevState,
        currentState: this.status,
        gameMode: this.gameMode,
        ...payload
      }
    }));

    return true;
  }

  /**
   * Inicia oficialmente la cuenta atrás de la ronda una vez sincronizado el audio real
   * o tras pulsar el botón manual de salto de anuncio.
   *
   * @returns {boolean} True si pudo iniciar el temporizador.
   */
  startTimer(resetFullTime = false) {
    if (this.status !== GameStates.AWAITING_AUDIO && this.status !== GameStates.PLAYING) {
      return false;
    }

    if (resetFullTime || this.timeRemaining <= 0) {
      this.timeRemaining = this.maxRoundTime;
    }

    if (this.status === GameStates.AWAITING_AUDIO) {
      const moved = this.transition(GameStates.PLAYING, {
        timerOnly: true,
        timeRemaining: this.timeRemaining,
        maxTime: this.maxRoundTime
      });
      if (!moved) return false;
    }

    this.dispatchEvent(new CustomEvent('startTimer', {
      detail: {
        timeRemaining: this.timeRemaining,
        maxTime: this.maxRoundTime
      }
    }));

    return true;
  }

  /**
   * Pausa la ronda volviendo de manera controlada a AWAITING_AUDIO mediante la FSM.
   * @param {Object} [payload={}]
   * @returns {boolean}
   */
  pauseToAwaitingAudio(payload = {}) {
    if (this.status !== GameStates.PLAYING && this.status !== GameStates.AWAITING_AUDIO) {
      return false;
    }
    return this.transition(GameStates.AWAITING_AUDIO, {
      timerOnly: true,
      ...payload
    });
  }

  /**
   * Reinicia todos los marcadores y prepara una nueva partida con la lista de reproducción.
   * @param {Array<Object>} shuffledSongs
   */
  initGame(shuffledSongs) {
    this.playlist = [...shuffledSongs];
    this.currentIndex = 0;
    this.currentSong = null;
    this.currentOptions = [];
    this.correctAnswer = '';
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.history = [];
    this.timeRemaining = this.maxRoundTime;
    this.lyricsChallengeData = null;

    this.transition(GameStates.IDLE, { isReset: true });

    this.dispatchEvent(new CustomEvent('gameInit', {
      detail: { totalSongs: this.playlist.length, gameMode: this.gameMode }
    }));
  }

  /**
   * Actualiza el tiempo restante de la ronda.
   * @param {number} seconds
   */
  setTimeRemaining(seconds) {
    this.timeRemaining = Math.max(0, seconds);
    this.dispatchEvent(new CustomEvent('timeTick', {
      detail: { timeRemaining: this.timeRemaining, maxTime: this.maxRoundTime }
    }));
  }

  /**
   * Registra los puntos y la racha de una respuesta.
   * @param {boolean} isCorrect
   * @param {number} pointsEarned
   * @param {number} timeSpent
   */
  recordAnswer(isCorrect, pointsEarned, timeSpent) {
    if (isCorrect) {
      this.score += pointsEarned;
      this.streak += 1;
      if (this.streak > this.maxStreak) {
        this.maxStreak = this.streak;
      }
    } else {
      this.streak = 0;
    }

    if (this.currentSong) {
      this.history.push({
        songId: this.currentSong.id,
        correct: isCorrect,
        timeSpent,
        points: pointsEarned,
        mode: this.gameMode
      });
    }

    this.dispatchEvent(new CustomEvent('scoreUpdate', {
      detail: {
        score: this.score,
        streak: this.streak,
        maxStreak: this.maxStreak,
        pointsEarned,
        isCorrect
      }
    }));
  }

  /**
   * Avanza el índice a la siguiente ronda.
   * @returns {boolean} True si hay más canciones, false si finalizó la lista.
   */
  advanceRound() {
    this.currentIndex += 1;
    return this.currentIndex < this.playlist.length;
  }
}
