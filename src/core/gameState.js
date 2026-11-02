/**
 * @fileoverview Máquina de estados finitos (FSM) y contenedor reactivo de estado para SongQuiz.
 * Emplea la API nativa EventTarget para emisión desacoplada de eventos sin librerías externas.
 * Soporta modos de juego: Classic Trivia y Lyrics Challenge.
 */

export const GameStates = Object.freeze({
  IDLE: 'IDLE',
  PLAYING: 'PLAYING',
  ROUND_OVER: 'ROUND_OVER',
  GAME_OVER: 'GAME_OVER'
});

export const GameModes = Object.freeze({
  CLASSIC: 'CLASSIC',
  LYRICS: 'LYRICS'
});

export class GameState extends EventTarget {
  constructor() {
    super();

    /** @type {keyof typeof GameStates} */
    this.status = GameStates.IDLE;

    /** @type {keyof typeof GameModes} */
    this.gameMode = this._loadSavedGameMode();

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

    // Métricas y puntuación
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.timeRemaining = 15;
    this.maxRoundTime = 15;

    /** @type {Array<{songId: string, correct: boolean, timeSpent: number, points: number}>} */
    this.history = [];
  }

  /**
   * Carga el modo guardado en localStorage o usa CLASSIC por defecto.
   * @private
   */
  _loadSavedGameMode() {
    try {
      const saved = localStorage.getItem('songquiz_game_mode');
      if (saved && Object.values(GameModes).includes(saved)) {
        return saved;
      }
    } catch {}
    return GameModes.CLASSIC;
  }

  /**
   * Cambia el modo de juego activo.
   * @param {keyof typeof GameModes} mode
   */
  setGameMode(mode) {
    if (!Object.values(GameModes).includes(mode)) return;
    this.gameMode = mode;
    try {
      localStorage.setItem('songquiz_game_mode', mode);
    } catch {}

    this.dispatchEvent(new CustomEvent('modeChange', {
      detail: { mode: this.gameMode }
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
   * Transiciona a un nuevo estado de juego emitiendo el evento correspondiente.
   * @param {keyof typeof GameStates} nextState
   * @param {Object} [payload={}]
   */
  transition(nextState, payload = {}) {
    const validTransitions = {
      [GameStates.IDLE]: [GameStates.PLAYING],
      [GameStates.PLAYING]: [GameStates.ROUND_OVER, GameStates.GAME_OVER],
      [GameStates.ROUND_OVER]: [GameStates.PLAYING, GameStates.GAME_OVER],
      [GameStates.GAME_OVER]: [GameStates.IDLE, GameStates.PLAYING]
    };

    if (!validTransitions[this.status]?.includes(nextState)) {
      console.warn(`Transición de estado no válida: de ${this.status} a ${nextState}`);
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
  }

  /**
   * Reinicia todos los marcadores y prepara una nueva partida con la lista de reproducción.
   * @param {Array<Object>} shuffledSongs
   */
  initGame(shuffledSongs) {
    this.playlist = [...shuffledSongs];
    this.currentIndex = 0;
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.history = [];
    this.timeRemaining = this.maxRoundTime;
    this.status = GameStates.IDLE;
    this.lyricsChallengeData = null;

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
    if (this.currentIndex < this.playlist.length) {
      return true;
    }
    return false;
  }
}
