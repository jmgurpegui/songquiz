/**
 * @fileoverview Lógica de negocio, puntuación, temporizador, modo "Lyrics Challenge" con carga
 * diferida, prevención de race conditions (_roundToken) y audio de respaldo auténtico sin engaños.
 */

import { GameStates, GameModes } from './gameState.js';
import { shuffle, generateOptions } from '../utils/random.js';
import { sfx } from '../audio/soundFX.js';
import { youtubePlayer, hasAuthenticLocalAudio } from '../audio/youtubePlayer.js';
import { readStorageJSON, writeStorageJSON, removeStorageKey } from '../utils/storageManager.js';
import { sanitizeImportedCatalog } from '../utils/catalogValidator.js';
import { evaluateLyricsAnswer, buildLyricsRoundData } from './lyricsChallengeEngine.js';

export const STORAGE_KEYS = Object.freeze({
  HIGH_SCORE: 'songquiz_high_score',
  GAMES_PLAYED: 'songquiz_games_count',
  BEST_STREAK: 'songquiz_best_streak',
  CUSTOM_PLAYLIST: 'songquiz_custom_playlist_v3'
});

const LYRICS_BANK_URL = './src/data/lyricsBank.json';

export class GameLogic {
  /**
   * @param {import('./gameState.js').GameState} gameState
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine
   * @param {import('../ui/visualizer.js').AudioVisualizer} visualizer
   * @param {import('../audio/youtubePlayer.js').YouTubePlayerEngine} [ytPlayer=youtubePlayer]
   */
  constructor(gameState, audioEngine, visualizer, ytPlayer = youtubePlayer) {
    this.gameState = gameState;
    this.audioEngine = audioEngine;
    this.visualizer = visualizer;
    this.youtubePlayer = ytPlayer;

    this.allSongs = [];
    this.masterCatalog = [];
    this.lastRoundOptions = [];
    this.isOrderedMode = false;
    this.timerInterval = null;
    this.roundStartTime = 0;
    this.isTimerRunning = false;

    /** Token incremental para descartar promesas o callbacks obsoletos de rondas anteriores. */
    this._roundToken = 0;

    /** Banco de letras cargado bajo demanda al activar Lyrics Challenge. @type {Map<string, Object>|null} */
    this._lyricsBankMap = null;
    /** @type {Promise<Map<string, Object>>|null} */
    this._lyricsBankPromise = null;

    // Vincular finalización natural de la pista de audio local
    this.audioEngine.onEnded(() => {
      if (this.gameState.status === GameStates.PLAYING) {
        this.handleTimeout();
      }
    });

    // Vincular evento startTimer de GameState
    this.gameState.addEventListener('startTimer', () => {
      this.startRoundTimer(true);
    });

    // Sincronización Pre-Roll y manejo seguro de errores de YouTube
    if (this.youtubePlayer) {
      this.youtubePlayer.onAudioActuallyPlaying((_time, loadedVideoId) => {
        const currentYt = this.gameState.currentSong?.youtubeId?.trim();
        if (loadedVideoId && currentYt && loadedVideoId !== currentYt) return;
        if (this.gameState.status === GameStates.AWAITING_AUDIO) {
          this.gameState.startTimer();
        }
      });

      this.youtubePlayer.onError((errCode, failedVideoId) => {
        const tokenAtError = this._roundToken;
        const currentSong = this.gameState.currentSong;
        if (!currentSong) return;
        if (failedVideoId && currentSong.youtubeId && failedVideoId !== currentSong.youtubeId.trim()) {
          return;
        }
        this._handleAudioFallbackOrUnavailable(currentSong, tokenAtError, errCode);
      });
    }
  }

  /**
   * Carga `src/data/lyricsBank.json` bajo demanda (una única vez por sesión) y lo indexa por `songId`.
   * @returns {Promise<Map<string, Object>>}
   */
  async loadLyricsBank() {
    if (this._lyricsBankMap) return this._lyricsBankMap;
    if (this._lyricsBankPromise) return this._lyricsBankPromise;

    this._lyricsBankPromise = fetch(LYRICS_BANK_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar lyricsBank.json (HTTP ${res.status})`);
        return res.json();
      })
      .then((entries) => {
        const map = new Map();
        if (Array.isArray(entries)) {
          entries.forEach((entry) => {
            if (entry && typeof entry.songId === 'string' && entry.verseEn && entry.targetWord) {
              map.set(entry.songId, entry);
            }
          });
        }
        this._lyricsBankMap = map;
        return map;
      })
      .catch((err) => {
        this._lyricsBankPromise = null;
        throw err;
      });

    return this._lyricsBankPromise;
  }

  /**
   * Construye la lista jugable para el modo activo. En modo LYRICS filtra canciones con reto
   * disponible en `lyricsBank.json` (recurriendo al catálogo maestro si la lista actual no tiene).
   *
   * @param {Array<Object>} sourceSongs
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _resolvePlayableSongsForMode(sourceSongs) {
    if (this.gameState.gameMode !== GameModes.LYRICS) {
      return this.isOrderedMode ? [...sourceSongs] : shuffle(sourceSongs);
    }

    const bank = await this.loadLyricsBank();
    let eligible = sourceSongs.filter((s) => s && bank.has(s.id));

    if (eligible.length === 0 && this.masterCatalog.length > 0) {
      eligible = this.masterCatalog.filter((s) => s && bank.has(s.id));
    }

    return this.isOrderedMode ? [...eligible] : shuffle(eligible);
  }

  /**
   * Carga el catálogo maestro e inicia una nueva partida.
   * @param {Array<Object>} defaultSongs
   * @param {boolean} [ordered=false]
   * @param {boolean} [autoStart=true]
   */
  async startNewGame(defaultSongs, ordered = false, autoStart = true) {
    this._roundToken += 1;
    const initToken = this._roundToken;

    if (Array.isArray(defaultSongs) && defaultSongs.length >= 100 && this.masterCatalog.length === 0) {
      this.masterCatalog = [...defaultSongs];
    }

    this.isOrderedMode = Boolean(ordered);
    this.lastRoundOptions = [];

    const savedCustom = this.getCustomPlaylist();
    if (!ordered && savedCustom && Array.isArray(savedCustom) && savedCustom.length > 0) {
      this.allSongs = [...savedCustom];
    } else if (Array.isArray(defaultSongs) && defaultSongs.length > 0) {
      this.allSongs = [...defaultSongs];
    }

    let gameSongs;
    try {
      gameSongs = await this._resolvePlayableSongsForMode(this.allSongs);
    } catch (err) {
      console.warn('Error al preparar modo Lyrics Challenge, volviendo a Classic:', err);
      this.gameState.setGameMode(GameModes.CLASSIC);
      gameSongs = this.isOrderedMode ? [...this.allSongs] : shuffle(this.allSongs);
    }

    if (initToken !== this._roundToken) return;

    this.gameState.initGame(gameSongs);
    if (autoStart) {
      await this.startRound();
    }
  }

  /**
   * Cambia entre Classic Trivia y Lyrics Challenge reiniciando la sesión con las canciones aptas.
   * @param {keyof typeof GameModes} nextMode
   * @returns {Promise<{ ok: boolean, trackCount: number, error?: string }>}
   */
  async switchGameMode(nextMode) {
    if (!Object.values(GameModes).includes(nextMode)) {
      return { ok: false, trackCount: 0, error: 'Modo de juego no válido.' };
    }

    if (nextMode === GameModes.LYRICS) {
      try {
        const bank = await this.loadLyricsBank();
        if (bank.size === 0) {
          return { ok: false, trackCount: 0, error: 'El banco de letras no contiene retos disponibles.' };
        }
      } catch (err) {
        return { ok: false, trackCount: 0, error: err.message };
      }
    }

    this.gameState.setGameMode(nextMode);
    await this.startNewGame(this.allSongs.length > 0 ? this.allSongs : this.masterCatalog, this.isOrderedMode, true);
    return { ok: true, trackCount: this.gameState.totalRounds };
  }

  /**
   * Reemplaza la lista activa por una lista seleccionada o importada y persiste con control de cuota.
   * @param {Array<Object>} importedSongs
   * @param {boolean} [ordered=false]
   * @param {boolean} [autoStart=true]
   * @returns {import('../utils/storageManager.js').StorageWriteResult}
   */
  setCustomPlaylist(importedSongs, ordered = false, autoStart = true) {
    const { songs: sanitized } = sanitizeImportedCatalog(importedSongs);
    if (sanitized.length === 0) {
      throw new Error('La lista de canciones no contiene registros válidos.');
    }

    this.allSongs = [...sanitized];
    this.isOrderedMode = Boolean(ordered);

    let storageResult = { ok: true, usedFallback: false, errorCode: null };
    if (!ordered) {
      storageResult = writeStorageJSON(STORAGE_KEYS.CUSTOM_PLAYLIST, sanitized);
    } else {
      removeStorageKey(STORAGE_KEYS.CUSTOM_PLAYLIST);
    }

    this.startNewGame(this.allSongs, this.isOrderedMode, autoStart);
    return storageResult;
  }

  /**
   * Restablece la lista por defecto y borra cualquier lista personalizada local.
   * @param {Array<Object>} defaultSongs
   * @param {boolean} [autoStart=true]
   */
  resetToDefaultPlaylist(defaultSongs, autoStart = true) {
    removeStorageKey(STORAGE_KEYS.CUSTOM_PLAYLIST);
    const catalog = (Array.isArray(defaultSongs) && defaultSongs.length > 0)
      ? defaultSongs
      : this.masterCatalog;
    this.startNewGame(catalog, false, autoStart);
  }

  /**
   * Obtiene y valida la lista personalizada almacenada en localStorage, si existe.
   * @returns {Array<Object>|null}
   */
  getCustomPlaylist() {
    const stored = readStorageJSON(
      STORAGE_KEYS.CUSTOM_PLAYLIST,
      null,
      (v) => Array.isArray(v) && v.length > 0
    );
    if (!stored) return null;

    const { songs } = sanitizeImportedCatalog(stored);
    return songs.length > 0 ? songs : null;
  }

  /**
   * Inicia una ronda de adivinanza adaptada al modo activo (Classic o Lyrics Challenge)
   * con protección `_roundToken` contra condiciones de carrera.
   */
  async startRound() {
    this._clearTimer();
    this._roundToken += 1;
    const roundToken = this._roundToken;

    const track = this.gameState.currentTrack;
    if (!track) {
      this.finishGame();
      return;
    }

    this.gameState.currentSong = track;
    this.gameState.timeRemaining = this.gameState.maxRoundTime;

    let options = [];
    let correctAnswer = '';
    let lyricsData = null;
    let startSeconds = 0;

    if (this.gameState.gameMode === GameModes.LYRICS) {
      let bank;
      try {
        bank = await this.loadLyricsBank();
      } catch {
        bank = new Map();
      }
      if (roundToken !== this._roundToken) return;

      const lyricsEntry = bank.get(track.id);
      if (lyricsEntry) {
        lyricsData = buildLyricsRoundData(lyricsEntry);
        options = lyricsData.options;
        correctAnswer = lyricsData.targetWord;
        startSeconds = lyricsData.cueSeconds || 0;
      } else {
        // Fallback seguro si una pista personalizada no está en lyricsBank
        const distractorPool = this.allSongs.length >= 20
          ? this.allSongs
          : [...this.allSongs, ...this.masterCatalog];
        const classicSet = generateOptions(track, distractorPool, 4, this.lastRoundOptions);
        options = classicSet.options;
        correctAnswer = classicSet.correctAnswer;
      }
    } else {
      const distractorPool = this.allSongs.length >= 20
        ? this.allSongs
        : [...this.allSongs, ...this.masterCatalog];
      const classicSet = generateOptions(track, distractorPool, 4, this.lastRoundOptions);
      options = classicSet.options;
      correctAnswer = classicSet.correctAnswer;
    }

    this.lastRoundOptions = options;
    this.gameState.lyricsChallengeData = lyricsData;
    this.gameState.currentOptions = options;
    this.gameState.correctAnswer = correctAnswer;

    const roundPayload = {
      song: track,
      roundNumber: this.gameState.currentIndex + 1,
      totalRounds: this.gameState.totalRounds,
      gameMode: this.gameState.gameMode,
      lyricsLevel: this.gameState.lyricsLevel,
      lyricsData,
      isOrderedMode: this.isOrderedMode,
      options,
      correctAnswer
    };

    this.isTimerRunning = false;
    this.roundStartTime = performance.now();

    const transitioned = this.gameState.transition(GameStates.AWAITING_AUDIO, roundPayload);
    if (!transitioned || roundToken !== this._roundToken) return;

    this.gameState.dispatchEvent(new CustomEvent('timerStateChange', {
      detail: { isTimerRunning: false, timeRemaining: this.gameState.timeRemaining }
    }));

    this.visualizer.start();

    const hasValidYtId = Boolean(track.youtubeId && /^[a-zA-Z0-9_-]{11}$/.test(track.youtubeId.trim()));
    if (hasValidYtId && this.youtubePlayer) {
      try {
        this.audioEngine.stop();
        await this.youtubePlayer.loadVideo(track.youtubeId.trim(), startSeconds);
      } catch (err) {
        if (roundToken !== this._roundToken) return;
        console.warn('Reproducción de YouTube no disponible:', err);
        await this._handleAudioFallbackOrUnavailable(track, roundToken, 'NETWORK_OR_EMBED');
      }
    } else {
      await this._handleAudioFallbackOrUnavailable(track, roundToken, 'NO_YOUTUBE_ID');
    }
  }

  /**
   * Si YouTube falla o no hay red, reproduce audio local SOLO cuando existe un archivo auténtico
   * para esa canción; en caso contrario ofrece saltar la pista sin penalización.
   *
   * @param {Object} track
   * @param {number} expectedToken
   * @param {number|string} errorCode
   * @private
   */
  async _handleAudioFallbackOrUnavailable(track, expectedToken, errorCode) {
    if (expectedToken !== this._roundToken) return;
    if (this.gameState.status !== GameStates.AWAITING_AUDIO && this.gameState.status !== GameStates.PLAYING) {
      return;
    }

    if (hasAuthenticLocalAudio(track)) {
      try {
        await this.audioEngine.load(track.audioSrc);
        if (expectedToken !== this._roundToken) return;
        await this.audioEngine.play();
        if (expectedToken !== this._roundToken) return;
        if (this.gameState.status === GameStates.AWAITING_AUDIO) {
          this.gameState.startTimer();
        }
        return;
      } catch (localErr) {
        console.warn('Audio local auténtico diferido o fallido:', localErr);
      }
    }

    // No reproducir un archivo .wav de otra canción: detener reloj y ofrecer salto sin penalización
    this._clearTimer();
    this.audioEngine.stop();
    this.gameState.pauseToAwaitingAudio({ audioUnavailable: true });

    const reason = (typeof navigator !== 'undefined' && navigator.onLine === false)
      ? 'Sin conexión a Internet y esta canción no dispone de pista local.'
      : (errorCode === 101 || errorCode === 150)
        ? 'YouTube restringe la reproducción embebida de este vídeo (código ' + errorCode + ').'
        : 'No se pudo cargar el audio oficial de esta pista.';

    this.gameState.dispatchEvent(new CustomEvent('audioUnavailable', {
      detail: {
        song: track,
        errorCode,
        reason
      }
    }));
  }

  /**
   * Salta la pista actual cuando el audio no está disponible sin penalizar puntuación ni racha.
   */
  skipRoundWithoutPenalty() {
    this._clearTimer();
    this._roundToken += 1;
    if (this.youtubePlayer) {
      this.youtubePlayer.stop();
    }
    this.audioEngine.stop();

    const hasMore = this.gameState.advanceRound();
    if (hasMore) {
      this.startRound();
    } else {
      this.finishGame();
    }
  }

  /**
   * Repite el fragmento cantado (cueSeconds) en el modo Lyrics Challenge.
   */
  repeatLyricsCue() {
    const cue = this.gameState.lyricsChallengeData?.cueSeconds ?? 0;
    if (this.youtubePlayer && this.youtubePlayer.isLoaded && this.youtubePlayer.currentVideoId) {
      this.youtubePlayer.seekTo(cue);
      this.youtubePlayer.play();
    } else if (hasAuthenticLocalAudio(this.gameState.currentSong)) {
      this.audioEngine.audio.currentTime = 0;
      this.audioEngine.play().catch(() => {});
    }
  }

  /**
   * Inicia o reanuda el cronómetro de la ronda.
   * @param {boolean} [resetFullTime=false]
   */
  startRoundTimer(resetFullTime = false) {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) return;
    if (this.isTimerRunning) return;

    this.youtubePlayer?._clearPlaybackWatcher();

    if (resetFullTime || this.gameState.status === GameStates.AWAITING_AUDIO) {
      if (this.gameState.status === GameStates.AWAITING_AUDIO) {
        this.gameState.transition(GameStates.PLAYING, { timerOnly: true });
      }
      this.gameState.setTimeRemaining(this.gameState.maxRoundTime);
    }

    this.isTimerRunning = true;
    this.roundStartTime = performance.now();
    this._startTimer();
    this.gameState.dispatchEvent(new CustomEvent('timerStateChange', {
      detail: { isTimerRunning: true, timeRemaining: this.gameState.timeRemaining }
    }));
  }

  /**
   * Pausa el cronómetro de la ronda de forma controlada mediante la FSM.
   */
  pauseRoundTimer() {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) return;
    this._clearTimer();
    this.gameState.pauseToAwaitingAudio({ pausedByUser: true });
    this.isTimerRunning = false;
    this.gameState.dispatchEvent(new CustomEvent('timerStateChange', {
      detail: { isTimerRunning: false, timeRemaining: this.gameState.timeRemaining }
    }));
  }

  /**
   * Alterna entre iniciar/reanudar y pausar el cronómetro de la ronda.
   * @returns {boolean}
   */
  toggleRoundTimer() {
    if (this.isTimerRunning) {
      this.pauseRoundTimer();
    } else {
      this.gameState.startTimer();
    }
    return this.isTimerRunning;
  }

  /**
   * Reinicia el reloj de la ronda a los 2:00 completos (120s).
   */
  resetRoundTimer() {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) return;
    this._clearTimer();
    this.isTimerRunning = false;
    this.gameState.pauseToAwaitingAudio({ timerReset: true });
    this.gameState.setTimeRemaining(this.gameState.maxRoundTime);
    this.roundStartTime = performance.now();
    this.gameState.dispatchEvent(new CustomEvent('timerStateChange', {
      detail: { isTimerRunning: false, timeRemaining: this.gameState.timeRemaining }
    }));
  }

  /**
   * Adelanta o retrocede la canción actual en YouTube.
   * @param {number} deltaSeconds
   */
  seekAudio(deltaSeconds) {
    if (this.youtubePlayer && this.youtubePlayer.isLoaded && this.youtubePlayer.currentVideoId) {
      this.youtubePlayer.seekBy(deltaSeconds);
    }
  }

  /**
   * Inicia el bucle de temporizador con ticks sonoros.
   * @private
   */
  _startTimer() {
    this._clearTimer();
    this.timerInterval = setInterval(() => {
      const remaining = this.gameState.timeRemaining - 1;
      this.gameState.setTimeRemaining(remaining);

      if (remaining <= 5 && remaining > 0) {
        sfx.playTick();
      }

      if (remaining <= 0) {
        this.handleTimeout();
      }
    }, 1000);
  }

  /**
   * Limpia el temporizador activo.
   * @private
   */
  _clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isTimerRunning = false;
  }

  /**
   * Procesa la respuesta seleccionada o escrita por el jugador.
   * En modo Lyrics Challenge aplica validación tolerante (`evaluateLyricsAnswer`).
   *
   * @param {string} rawSelectedOption
   * @param {{ hintsUsed?: number }} [meta={}]
   * @returns {{ isCorrect: boolean, correctAnswer: string, pointsEarned: number, evaluation?: Object }}
   */
  submitAnswer(rawSelectedOption, meta = {}) {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) {
      return { isCorrect: false, correctAnswer: this.gameState.correctAnswer, pointsEarned: 0 };
    }

    this._clearTimer();
    this.youtubePlayer?._clearPlaybackWatcher();
    const timeSpent = Math.max(0, (performance.now() - this.roundStartTime) / 1000);

    let isCorrect = false;
    let evaluation = null;

    if (this.gameState.gameMode === GameModes.LYRICS && this.gameState.lyricsChallengeData) {
      const ld = this.gameState.lyricsChallengeData;
      evaluation = evaluateLyricsAnswer(
        rawSelectedOption,
        ld.targetWord,
        ld.acceptedVariants,
        { allowFuzzy: true }
      );
      isCorrect = evaluation.isCorrect;
    } else {
      const selected = String(rawSelectedOption || '').trim().toLowerCase();
      const correct = String(this.gameState.correctAnswer || '').trim().toLowerCase();
      isCorrect = selected === correct;
    }

    let pointsEarned = 0;
    let speedBonus = 0;
    let speedBadge = '';
    let multiplier = 1.0;
    const basePoints = 100;
    const hintsUsed = Math.max(0, Number(meta.hintsUsed) || 0);

    if (isCorrect) {
      const remainingSec = this.gameState.timeRemaining;
      const maxTime = this.gameState.maxRoundTime || 120;

      speedBonus = Math.max(10, Math.round((remainingSec / maxTime) * 150));
      if (hintsUsed > 0) {
        speedBonus = Math.max(10, speedBonus - hintsUsed * 20);
      }

      if (remainingSec >= 105) {
        speedBadge = '⚡ Relámpago';
      } else if (remainingSec >= 85) {
        speedBadge = '🔥 Súper Rápido';
      } else if (remainingSec >= 60) {
        speedBadge = '⏱️ Buen Ritmo';
      } else if (remainingSec >= 30) {
        speedBadge = '👍 A Tiempo';
      } else {
        speedBadge = '⏳ Al Límite';
      }

      if (this.gameState.streak >= 4) {
        multiplier = 2.0;
      } else if (this.gameState.streak >= 2) {
        multiplier = 1.5;
      }

      pointsEarned = Math.round((basePoints + speedBonus) * multiplier);
      sfx.playCorrect();

      if (this.gameState.streak + 1 >= 3) {
        setTimeout(() => sfx.playStreak(), 250);
      }
    } else {
      sfx.playWrong();
    }

    this.gameState.recordAnswer(isCorrect, pointsEarned, timeSpent);

    this.gameState.transition(GameStates.ROUND_OVER, {
      selectedOption: rawSelectedOption,
      isCorrect,
      correctAnswer: this.gameState.correctAnswer,
      song: this.gameState.currentSong,
      lyricsData: this.gameState.lyricsChallengeData,
      evaluation,
      pointsEarned,
      basePoints,
      speedBonus,
      speedBadge,
      multiplier,
      gameMode: this.gameState.gameMode
    });

    return {
      isCorrect,
      correctAnswer: this.gameState.correctAnswer,
      pointsEarned,
      evaluation
    };
  }

  /**
   * Penalización cuando el tiempo de la ronda llega a cero.
   */
  handleTimeout() {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) {
      return;
    }
    this._clearTimer();
    sfx.playWrong();
    this.gameState.recordAnswer(false, 0, this.gameState.maxRoundTime);

    this.gameState.transition(GameStates.ROUND_OVER, {
      selectedOption: null,
      isCorrect: false,
      isTimeout: true,
      correctAnswer: this.gameState.correctAnswer,
      song: this.gameState.currentSong,
      lyricsData: this.gameState.lyricsChallengeData,
      pointsEarned: 0,
      gameMode: this.gameState.gameMode
    });
  }

  /**
   * Pasa a la siguiente canción de la lista o finaliza.
   */
  nextRound() {
    this._roundToken += 1;
    if (this.youtubePlayer) {
      this.youtubePlayer.stop();
    }
    this.audioEngine.stop();

    const hasMore = this.gameState.advanceRound();
    if (hasMore) {
      this.startRound();
    } else {
      this.finishGame();
    }
  }

  /**
   * Culmina la partida, calcula el récord y almacena métricas locales de forma segura.
   */
  finishGame() {
    this._clearTimer();
    this._roundToken += 1;
    if (this.youtubePlayer) {
      this.youtubePlayer.stop();
    }
    this.audioEngine.stop();
    sfx.playGameOver();

    const previousHighScore = this.getHighScore();
    const isNewRecord = this.gameState.score > previousHighScore;

    if (isNewRecord) {
      this.saveHighScore(this.gameState.score);
    }

    const bestStreakRecorded = readStorageJSON(
      STORAGE_KEYS.BEST_STREAK,
      0,
      (v) => typeof v === 'number' && Number.isFinite(v)
    );
    if (this.gameState.maxStreak > bestStreakRecorded) {
      writeStorageJSON(STORAGE_KEYS.BEST_STREAK, this.gameState.maxStreak);
    }

    const gamesPlayed = readStorageJSON(
      STORAGE_KEYS.GAMES_PLAYED,
      0,
      (v) => typeof v === 'number' && Number.isFinite(v)
    ) + 1;
    writeStorageJSON(STORAGE_KEYS.GAMES_PLAYED, gamesPlayed);

    const totalRounds = this.gameState.history.length;
    const correctCount = this.gameState.history.filter(h => h.correct).length;
    const accuracy = totalRounds > 0 ? Math.round((correctCount / totalRounds) * 100) : 0;
    const avgTime = totalRounds > 0
      ? (this.gameState.history.reduce((acc, h) => acc + h.timeSpent, 0) / totalRounds).toFixed(1)
      : '0.0';

    this.gameState.transition(GameStates.GAME_OVER, {
      finalScore: this.gameState.score,
      previousHighScore,
      isNewRecord,
      accuracy,
      correctCount,
      totalRounds,
      maxStreak: this.gameState.maxStreak,
      avgTime,
      gameMode: this.gameState.gameMode
    });
  }

  getHighScore() {
    return readStorageJSON(
      STORAGE_KEYS.HIGH_SCORE,
      0,
      (v) => typeof v === 'number' && Number.isFinite(v)
    );
  }

  saveHighScore(score) {
    return writeStorageJSON(STORAGE_KEYS.HIGH_SCORE, Number(score) || 0);
  }
}
