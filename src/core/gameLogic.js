/**
 * @fileoverview Lógica de negocio, puntuación, temporizador, modo "Lyrics Challenge" con carga
 * diferida, resolución multimedia sin anuncios (previews oficiales 30s + biblioteca local MP3/MP4),
 * prevención de race conditions (_roundToken) y persistencia resiliente de progreso.
 */

import { GameStates, GameModes } from './gameState.js';
import { shuffle, generateOptions } from '../utils/random.js';
import { sfx } from '../audio/soundFX.js';
import {
  resolveSongMedia,
  prefetchSongMedia,
  localMediaLibrary,
  hasAuthenticLocalAudio
} from '../audio/mediaResolver.js';
import { readStorageJSON, writeStorageJSON, removeStorageKey } from '../utils/storageManager.js';
import { sanitizeImportedCatalog } from '../utils/catalogValidator.js';
import { evaluateLyricsAnswer, buildLyricsRoundData } from './lyricsChallengeEngine.js';

export const STORAGE_KEYS = Object.freeze({
  HIGH_SCORE: 'songquiz_high_score',
  GAMES_PLAYED: 'songquiz_games_count',
  BEST_STREAK: 'songquiz_best_streak',
  CUSTOM_PLAYLIST: 'songquiz_custom_playlist_v3',
  PROGRESS: 'songquiz_progress_v1'
});

const MAX_TRACKED_SONG_IDS = 300;
const LYRICS_BANK_URL = './src/data/lyricsBank.json';

/**
 * Crea una estructura limpia de progreso del jugador.
 * @returns {Object}
 */
function createEmptyProgress() {
  return {
    failedSongIds: [],
    masteredSongIds: [],
    classicStats: { played: 0, correct: 0 },
    lyricsStats: { played: 0, correct: 0, exact: 0, contraction: 0, fuzzy: 0, hintsUsed: 0 },
    updatedAt: null
  };
}

/**
 * Valida la integridad del objeto de progreso hidratado desde almacenamiento local.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidProgressRecord(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.failedSongIds) &&
    Array.isArray(value.masteredSongIds) &&
    value.classicStats && typeof value.classicStats.played === 'number' &&
    value.lyricsStats && typeof value.lyricsStats.played === 'number'
  );
}

export class GameLogic {
  /**
   * @param {import('./gameState.js').GameState} gameState
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine
   * @param {import('../ui/visualizer.js').AudioVisualizer} visualizer
   */
  constructor(gameState, audioEngine, visualizer) {
    this.gameState = gameState;
    this.audioEngine = audioEngine;
    this.visualizer = visualizer;

    this.allSongs = [];
    this.masterCatalog = [];
    this.lastRoundOptions = [];
    this.isOrderedMode = false;
    this.isLocalMediaSession = false;
    this.timerInterval = null;
    this.roundStartTime = 0;
    this.isTimerRunning = false;

    /** Metadatos multimedia resueltos para la ronda activa (carátula HD, fuente, enlace YT). */
    this.currentRoundMedia = null;

    /** Token incremental para descartar promesas o callbacks obsoletos de rondas anteriores. */
    this._roundToken = 0;
    /** @type {AbortController|null} */
    this._mediaAbortController = null;

    /** Banco de letras cargado bajo demanda al activar Lyrics Challenge. @type {Map<string, Object>|null} */
    this._lyricsBankMap = null;
    /** @type {Promise<Map<string, Object>>|null} */
    this._lyricsBankPromise = null;

    // Evento al iniciar reproducción real de audio/vídeo
    this.audioEngine.onPlaying(() => {
      if (this.gameState.status === GameStates.AWAITING_AUDIO) {
        this.gameState.startTimer();
      }
    });

    // Evento startTimer desde la FSM
    this.gameState.addEventListener('startTimer', () => {
      this.startRoundTimer(true);
    });
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
    this._abortPendingMedia();
    this._roundToken += 1;
    const initToken = this._roundToken;

    if (Array.isArray(defaultSongs) && defaultSongs.length >= 100 && this.masterCatalog.length === 0) {
      this.masterCatalog = [...defaultSongs];
    }

    this.isOrderedMode = Boolean(ordered);
    this.lastRoundOptions = [];

    if (!this.isLocalMediaSession) {
      const savedCustom = this.getCustomPlaylist();
      if (!ordered && savedCustom && Array.isArray(savedCustom) && savedCustom.length > 0) {
        this.allSongs = [...savedCustom];
      } else if (Array.isArray(defaultSongs) && defaultSongs.length > 0) {
        this.allSongs = [...defaultSongs];
      }
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

    if (this.isLocalMediaSession) {
      localMediaLibrary.revokeAll();
      this.isLocalMediaSession = false;
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
   * Activa una sesión temporal en memoria con archivos personales MP3/M4A/WAV/MP4 del dispositivo.
   * No escribe URLs `blob:` en `localStorage` ni modifica el catálogo oficial.
   *
   * @param {Array<Object>} localTracks
   * @param {boolean} [autoStart=true]
   */
  setLocalMediaPlaylist(localTracks, autoStart = true) {
    if (!Array.isArray(localTracks) || localTracks.length === 0) {
      throw new Error('No se encontraron archivos de audio o vídeo compatibles.');
    }

    this.isLocalMediaSession = true;
    this.isOrderedMode = false;
    this.allSongs = [...localTracks];

    // En biblioteca local personal activamos modo Classic para adivinar título y artista
    if (this.gameState.gameMode !== GameModes.CLASSIC) {
      this.gameState.setGameMode(GameModes.CLASSIC);
    }

    this.startNewGame(this.allSongs, false, autoStart);
  }

  /**
   * Restablece la lista por defecto y borra cualquier lista personalizada local o biblioteca temporal.
   * @param {Array<Object>} defaultSongs
   * @param {boolean} [autoStart=true]
   */
  resetToDefaultPlaylist(defaultSongs, autoStart = true) {
    if (this.isLocalMediaSession) {
      localMediaLibrary.revokeAll();
      this.isLocalMediaSession = false;
    }
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
   * Aborta cualquier resolución multimedia de una ronda anterior.
   * @private
   */
  _abortPendingMedia() {
    if (this._mediaAbortController) {
      try {
        this._mediaAbortController.abort();
      } catch {}
      this._mediaAbortController = null;
    }
  }

  /**
   * Inicia una ronda de adivinanza con audio 100% libre de anuncios y protección `_roundToken`.
   */
  async startRound() {
    this._clearTimer();
    this._abortPendingMedia();
    this.audioEngine.stop();

    this._roundToken += 1;
    const roundToken = this._roundToken;

    const track = this.gameState.currentTrack;
    if (!track) {
      this.finishGame();
      return;
    }

    this.gameState.currentSong = track;
    this.gameState.timeRemaining = this.gameState.maxRoundTime;
    this.currentRoundMedia = null;

    let options = [];
    let correctAnswer = '';
    let lyricsData = null;

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
      } else {
        const distractorPool = this._buildDistractorPool();
        const classicSet = generateOptions(track, distractorPool, 4, this.lastRoundOptions);
        options = classicSet.options;
        correctAnswer = classicSet.correctAnswer;
      }
    } else {
      const distractorPool = this._buildDistractorPool();
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
      isLocalVideo: Boolean(track.isLocalVideo),
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

    // Resolver fuente sin anuncios (Archivo local -> WAV auténtico -> Preview 30s iTunes)
    const abortCtrl = new AbortController();
    this._mediaAbortController = abortCtrl;

    let resolved;
    try {
      resolved = await resolveSongMedia(track, { signal: abortCtrl.signal });
    } catch (err) {
      if (err?.name === 'AbortError' || roundToken !== this._roundToken) return;
      resolved = {
        sourceType: 'unavailable',
        mediaUrl: null,
        artworkUrl: null,
        collectionName: '',
        externalYoutubeUrl: null,
        isCrossOrigin: false,
        reason: 'No se pudo obtener el audio sin anuncios para esta pista.'
      };
    }

    if (roundToken !== this._roundToken) return;
    this.currentRoundMedia = resolved;

    this.gameState.dispatchEvent(new CustomEvent('roundMediaReady', {
      detail: { song: track, media: resolved }
    }));

    // Precargar la siguiente canción en segundo plano para agilizar la siguiente ronda
    const nextTrack = this.gameState.playlist[this.gameState.currentIndex + 1];
    if (nextTrack) {
      prefetchSongMedia(nextTrack);
    }

    if (!resolved.mediaUrl || resolved.sourceType === 'unavailable') {
      this._emitAudioUnavailable(track, resolved.reason || 'No se encontró preview de 30 s disponible para esta canción.');
      return;
    }

    try {
      await this.audioEngine.loadMedia({
        url: resolved.mediaUrl,
        isVideo: resolved.sourceType === 'local-video',
        isCrossOrigin: resolved.isCrossOrigin,
        loop: true
      });
      if (roundToken !== this._roundToken) return;

      await this.audioEngine.play();
      if (roundToken !== this._roundToken) return;

      if (this.gameState.status === GameStates.AWAITING_AUDIO) {
        this.gameState.startTimer();
      }
    } catch (playErr) {
      if (roundToken !== this._roundToken) return;

      if (playErr?.name === 'NotAllowedError' || /user didn't interact|autoplay|not allowed/i.test(String(playErr?.message || ''))) {
        // Bloqueo de autoplay del navegador móvil/iOS: mostrar botón táctil para desbloquear
        this.gameState.dispatchEvent(new CustomEvent('playbackBlocked', {
          detail: { song: track, media: resolved }
        }));
      } else {
        this._emitAudioUnavailable(track, 'No se pudo reproducir el clip de audio de esta pista.');
      }
    }
  }

  /**
   * Construye el pool de distractores ampliándolo con el catálogo maestro si la lista local es pequeña.
   * @returns {Array<Object>}
   * @private
   */
  _buildDistractorPool() {
    if (this.allSongs.length >= 20) {
      return this.allSongs;
    }
    return [...this.allSongs, ...this.masterCatalog];
  }

  /**
   * Notifica audio no disponible y detiene el reloj para permitir saltar sin penalización.
   * @param {Object} track
   * @param {string} reason
   * @private
   */
  _emitAudioUnavailable(track, reason) {
    this._clearTimer();
    this.audioEngine.stop();
    this.gameState.pauseToAwaitingAudio({ audioUnavailable: true });
    this.gameState.dispatchEvent(new CustomEvent('audioUnavailable', {
      detail: {
        song: track,
        reason
      }
    }));
  }

  /**
   * Reintenta reproducir el medio activo tras un gesto explícito del usuario (móvil/iOS).
   * @returns {Promise<boolean>}
   */
  async unlockPlaybackFromGesture() {
    try {
      await this.audioEngine.play();
      if (this.gameState.status === GameStates.AWAITING_AUDIO) {
        this.gameState.startTimer();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Salta la pista actual cuando el audio no está disponible sin penalizar puntuación ni racha.
   */
  skipRoundWithoutPenalty() {
    this._clearTimer();
    this._abortPendingMedia();
    this._roundToken += 1;
    this.audioEngine.stop();

    const hasMore = this.gameState.advanceRound();
    if (hasMore) {
      this.startRound();
    } else {
      this.finishGame();
    }
  }

  /**
   * Repite el fragmento de audio en modo Lyrics Challenge (desde el inicio del preview o cue local).
   */
  repeatLyricsCue() {
    const isFullLocal = this.currentRoundMedia?.sourceType === 'local-audio' ||
      this.currentRoundMedia?.sourceType === 'local-video';
    const cue = isFullLocal ? (this.gameState.lyricsChallengeData?.cueSeconds ?? 0) : 0;
    this.audioEngine.seekTo(cue);
    this.audioEngine.play().catch(() => {});
  }

  /**
   * Inicia o reanuda el cronómetro de la ronda.
   * @param {boolean} [resetFullTime=false]
   */
  startRoundTimer(resetFullTime = false) {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) return;
    if (this.isTimerRunning) return;

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
   * @param {string} rawSelectedOption
   * @param {{ hintsUsed?: number }} [meta={}]
   * @returns {{ isCorrect: boolean, correctAnswer: string, pointsEarned: number, evaluation?: Object }}
   */
  submitAnswer(rawSelectedOption, meta = {}) {
    if (this.gameState.status !== GameStates.PLAYING && this.gameState.status !== GameStates.AWAITING_AUDIO) {
      return { isCorrect: false, correctAnswer: this.gameState.correctAnswer, pointsEarned: 0 };
    }

    this._clearTimer();
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
      const maxTime = this.gameState.maxRoundTime || 30;
      const remainingRatio = remainingSec / maxTime;

      speedBonus = Math.max(10, Math.round(remainingRatio * 150));
      if (hintsUsed > 0) {
        speedBonus = Math.max(10, speedBonus - hintsUsed * 20);
      }

      if (remainingRatio >= 0.8) {
        speedBadge = 'Relámpago';
      } else if (remainingRatio >= 0.6) {
        speedBadge = 'Súper rápido';
      } else if (remainingRatio >= 0.4) {
        speedBadge = 'Buen ritmo';
      } else if (remainingRatio >= 0.2) {
        speedBadge = 'A tiempo';
      } else {
        speedBadge = 'Al límite';
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
    this.recordRoundProgress({
      songId: this.gameState.currentSong?.id || null,
      mode: this.gameState.gameMode,
      isCorrect,
      matchType: evaluation?.matchType || null,
      hintsUsed
    });

    this.gameState.transition(GameStates.ROUND_OVER, {
      selectedOption: rawSelectedOption,
      isCorrect,
      correctAnswer: this.gameState.correctAnswer,
      song: this.gameState.currentSong,
      roundMedia: this.currentRoundMedia,
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
    this.recordRoundProgress({
      songId: this.gameState.currentSong?.id || null,
      mode: this.gameState.gameMode,
      isCorrect: false,
      matchType: 'timeout',
      hintsUsed: 0
    });

    this.gameState.transition(GameStates.ROUND_OVER, {
      selectedOption: null,
      isCorrect: false,
      isTimeout: true,
      correctAnswer: this.gameState.correctAnswer,
      song: this.gameState.currentSong,
      roundMedia: this.currentRoundMedia,
      lyricsData: this.gameState.lyricsChallengeData,
      pointsEarned: 0,
      gameMode: this.gameState.gameMode
    });
  }

  /**
   * Pasa a la siguiente canción de la lista o finaliza.
   */
  nextRound() {
    this._abortPendingMedia();
    this._roundToken += 1;
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
    this._abortPendingMedia();
    this._roundToken += 1;
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

  /**
   * Recupera el progreso persistido (canciones falladas, dominadas y métricas de Classic/Lyrics).
   * @returns {Object}
   */
  getProgressStats() {
    const raw = readStorageJSON(STORAGE_KEYS.PROGRESS, null, isValidProgressRecord);
    if (!raw) return createEmptyProgress();

    return {
      failedSongIds: raw.failedSongIds.filter((id) => typeof id === 'string').slice(0, MAX_TRACKED_SONG_IDS),
      masteredSongIds: raw.masteredSongIds.filter((id) => typeof id === 'string').slice(0, MAX_TRACKED_SONG_IDS),
      classicStats: {
        played: Math.max(0, Number(raw.classicStats.played) || 0),
        correct: Math.max(0, Number(raw.classicStats.correct) || 0)
      },
      lyricsStats: {
        played: Math.max(0, Number(raw.lyricsStats.played) || 0),
        correct: Math.max(0, Number(raw.lyricsStats.correct) || 0),
        exact: Math.max(0, Number(raw.lyricsStats.exact) || 0),
        contraction: Math.max(0, Number(raw.lyricsStats.contraction) || 0),
        fuzzy: Math.max(0, Number(raw.lyricsStats.fuzzy) || 0),
        hintsUsed: Math.max(0, Number(raw.lyricsStats.hintsUsed) || 0)
      },
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
    };
  }

  /**
   * Registra de forma resiliente el resultado de cada ronda (aciertos, canciones falladas
   * y métricas pedagógicas de Lyrics Challenge) sin bloquear si falla la cuota.
   *
   * @param {{ songId: string|null, mode: string, isCorrect: boolean, matchType?: string|null, hintsUsed?: number }} entry
   * @returns {import('../utils/storageManager.js').StorageWriteResult}
   */
  recordRoundProgress({ songId, mode, isCorrect, matchType = null, hintsUsed = 0 }) {
    const progress = this.getProgressStats();

    if (songId) {
      const failedSet = new Set(progress.failedSongIds);
      const masteredSet = new Set(progress.masteredSongIds);
      if (isCorrect) {
        failedSet.delete(songId);
        masteredSet.add(songId);
      } else {
        failedSet.add(songId);
      }
      progress.failedSongIds = Array.from(failedSet).slice(-MAX_TRACKED_SONG_IDS);
      progress.masteredSongIds = Array.from(masteredSet).slice(-MAX_TRACKED_SONG_IDS);
    }

    if (mode === GameModes.LYRICS) {
      progress.lyricsStats.played += 1;
      progress.lyricsStats.hintsUsed += Math.max(0, Number(hintsUsed) || 0);
      if (isCorrect) {
        progress.lyricsStats.correct += 1;
        if (matchType === 'exact') progress.lyricsStats.exact += 1;
        else if (matchType === 'contraction' || matchType === 'variant') progress.lyricsStats.contraction += 1;
        else if (matchType === 'fuzzy') progress.lyricsStats.fuzzy += 1;
      }
    } else {
      progress.classicStats.played += 1;
      if (isCorrect) {
        progress.classicStats.correct += 1;
      }
    }

    progress.updatedAt = new Date().toISOString();
    return writeStorageJSON(STORAGE_KEYS.PROGRESS, progress);
  }

  /** Re-export helper for tests/callers. */
  hasAuthenticLocalAudio(song) {
    return hasAuthenticLocalAudio(song);
  }
}
