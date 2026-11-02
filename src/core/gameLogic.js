/**
 * @fileoverview Lógica de negocio, reglas de puntuación, cálculo de combos y temporizador.
 * Gestiona los modos "Classic Trivia" y "Lyrics Challenge", con soporte para
 * reproducción de vídeos completos de YouTube y fallback a Web Audio HTML5.
 */

import { GameStates, GameModes } from './gameState.js';
import { shuffle, generateOptions, generateLyricsChallenge } from '../utils/random.js';
import { sfx } from '../audio/soundFX.js';
import { youtubePlayer } from '../audio/youtubePlayer.js';

export const STORAGE_KEYS = {
  HIGH_SCORE: 'songquiz_high_score',
  GAMES_PLAYED: 'songquiz_games_count',
  BEST_STREAK: 'songquiz_best_streak',
  CUSTOM_PLAYLIST: 'songquiz_custom_playlist'
};

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
    this.timerInterval = null;
    this.roundStartTime = 0;

    // Vincular finalización natural de la pista de audio local
    this.audioEngine.onEnded(() => {
      if (this.gameState.status === GameStates.PLAYING) {
        this.handleTimeout();
      }
    });

    // Fallback si YouTube devuelve un error de reproducción
    if (this.youtubePlayer) {
      this.youtubePlayer.onError((errCode) => {
        console.warn(`Error en YouTube embebido (${errCode}). Activando fallback local.`);
        if (this.gameState.currentSong?.audioSrc) {
          this.audioEngine.load(this.gameState.currentSong.audioSrc)
            .then(() => this.audioEngine.play())
            .catch(() => {});
        }
      });
    }
  }

  /**
   * Carga el catálogo maestro e inicia una nueva partida.
   * @param {Array<Object>} defaultSongs
   */
  startNewGame(defaultSongs) {
    const savedCustom = this.getCustomPlaylist();
    if (savedCustom && Array.isArray(savedCustom) && savedCustom.length > 0) {
      this.allSongs = [...savedCustom];
    } else {
      this.allSongs = [...defaultSongs];
    }

    const shuffledSongs = shuffle(this.allSongs);
    this.gameState.initGame(shuffledSongs);
    this.startRound();
  }

  /**
   * Reemplaza la lista activa por una lista importada por el usuario y reinicia el juego.
   * @param {Array<Object>} importedSongs
   */
  setCustomPlaylist(importedSongs) {
    if (!Array.isArray(importedSongs) || importedSongs.length === 0) {
      throw new Error('La lista de canciones no es válida.');
    }
    this.allSongs = [...importedSongs];
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PLAYLIST, JSON.stringify(importedSongs));
    } catch {}
    this.startNewGame(this.allSongs);
  }

  /**
   * Restablece la lista por defecto y borra cualquier lista personalizada local.
   * @param {Array<Object>} defaultSongs
   */
  resetToDefaultPlaylist(defaultSongs) {
    try {
      localStorage.removeItem(STORAGE_KEYS.CUSTOM_PLAYLIST);
    } catch {}
    this.startNewGame(defaultSongs);
  }

  /**
   * Obtiene la lista personalizada almacenada en localStorage, si existe.
   * @returns {Array<Object>|null}
   */
  getCustomPlaylist() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_PLAYLIST);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Inicia una ronda de adivinanza adaptada al modo de juego activo
   * e inicia la reproducción en YouTube con soporte de escucha completa.
   */
  async startRound() {
    this._clearTimer();

    const track = this.gameState.currentTrack;
    if (!track) {
      this.finishGame();
      return;
    }

    this.gameState.currentSong = track;
    this.gameState.timeRemaining = this.gameState.maxRoundTime;

    let roundPayload = {
      song: track,
      roundNumber: this.gameState.currentIndex + 1,
      totalRounds: this.gameState.totalRounds,
      gameMode: this.gameState.gameMode
    };

    if (this.gameState.gameMode === GameModes.LYRICS) {
      const lyricsData = generateLyricsChallenge(track, this.allSongs);
      this.gameState.lyricsChallengeData = lyricsData;
      this.gameState.currentOptions = lyricsData.options;
      this.gameState.correctAnswer = lyricsData.targetWord;

      roundPayload = {
        ...roundPayload,
        options: lyricsData.options,
        correctAnswer: lyricsData.targetWord,
        lyricsData
      };
    } else {
      const { options, correctAnswer } = generateOptions(track, this.allSongs);
      this.gameState.lyricsChallengeData = null;
      this.gameState.currentOptions = options;
      this.gameState.correctAnswer = correctAnswer;

      roundPayload = {
        ...roundPayload,
        options,
        correctAnswer
      };
    }

    // Transición a PLAYING
    this.gameState.transition(GameStates.PLAYING, roundPayload);

    // Iniciar visualizador
    this.visualizer.start();

    // Iniciar reproducción: Priorizar YouTube oficial para escuchar la canción completa
    const hasValidYtId = Boolean(track.youtubeId && /^[a-zA-Z0-9_\-]{11}$/.test(track.youtubeId.trim()));
    if (hasValidYtId && this.youtubePlayer) {
      try {
        this.audioEngine.stop();
        await this.youtubePlayer.loadVideo(track.youtubeId.trim());
      } catch (err) {
        console.warn('Reproducción de YouTube diferida o bloqueada, activando fallback local:', err);
        if (track.audioSrc) {
          try {
            await this.audioEngine.load(track.audioSrc);
            await this.audioEngine.play();
          } catch {}
        }
      }
    } else if (track.audioSrc) {
      try {
        await this.audioEngine.load(track.audioSrc);
        await this.audioEngine.play();
      } catch (e) {
        console.warn('Reproducción de audio local diferida a gesto del usuario:', e);
      }
    }

    this.roundStartTime = performance.now();
    this._startTimer();
  }

  /**
   * Inicia el bucle de temporizador con ticks sonoros.
   * @private
   */
  _startTimer() {
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
  }

  /**
   * Procesa la respuesta seleccionada por el jugador.
   * La música de YouTube NO se interrumpe, permitiendo escucharla completa.
   * @param {string} rawSelectedOption
   * @returns {{ isCorrect: boolean, correctAnswer: string, pointsEarned: number }}
   */
  submitAnswer(rawSelectedOption) {
    if (this.gameState.status !== GameStates.PLAYING) {
      return { isCorrect: false, correctAnswer: this.gameState.correctAnswer, pointsEarned: 0 };
    }

    this._clearTimer();
    const timeSpent = Math.max(0, (performance.now() - this.roundStartTime) / 1000);

    const selected = (rawSelectedOption || '').trim().toLowerCase();
    const correct = (this.gameState.correctAnswer || '').trim().toLowerCase();

    const cleanWord = (s) => s.replace(/^[^\w]+|[^\w]+$/g, '');
    const isCorrect = cleanWord(selected) === cleanWord(correct);

    let pointsEarned = 0;
    let speedBonus = 0;
    let speedBadge = '';
    let multiplier = 1.0;
    const basePoints = 100;

    if (isCorrect) {
      const remainingSec = this.gameState.timeRemaining;
      const maxTime = this.gameState.maxRoundTime || 120;

      // Bonificación proporcional continua según los segundos restantes (sobre 120s = 2 min)
      speedBonus = Math.max(10, Math.round((remainingSec / maxTime) * 150));

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

    // Revelar sin detener la canción de YouTube para escucharla completa
    this.gameState.transition(GameStates.ROUND_OVER, {
      selectedOption: rawSelectedOption,
      isCorrect,
      correctAnswer: this.gameState.correctAnswer,
      song: this.gameState.currentSong,
      lyricsData: this.gameState.lyricsChallengeData,
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
      pointsEarned
    };
  }

  /**
   * Penalización cuando el tiempo de la ronda llega a cero.
   * Permite que la canción siga reproduciéndose para su escucha.
   */
  handleTimeout() {
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
   * Detiene el reproductor actual para cargar la siguiente pista.
   */
  nextRound() {
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
   * Culmina la partida, calcula el récord y almacena métricas locales.
   */
  finishGame() {
    this._clearTimer();
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

    const bestStreakRecorded = parseInt(localStorage.getItem(STORAGE_KEYS.BEST_STREAK) || '0', 10);
    if (this.gameState.maxStreak > bestStreakRecorded) {
      localStorage.setItem(STORAGE_KEYS.BEST_STREAK, String(this.gameState.maxStreak));
    }

    const gamesPlayed = parseInt(localStorage.getItem(STORAGE_KEYS.GAMES_PLAYED) || '0', 10) + 1;
    localStorage.setItem(STORAGE_KEYS.GAMES_PLAYED, String(gamesPlayed));

    const totalRounds = this.gameState.history.length;
    const correctCount = this.gameState.history.filter(h => h.correct).length;
    const accuracy = totalRounds > 0 ? Math.round((correctCount / totalRounds) * 100) : 0;
    const avgTime = totalRounds > 0 
      ? (this.gameState.history.reduce((acc, h) => acc + h.timeSpent, 0) / totalRounds).toFixed(1)
      : 0;

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
    try {
      return parseInt(localStorage.getItem(STORAGE_KEYS.HIGH_SCORE) || '0', 10);
    } catch {
      return 0;
    }
  }

  saveHighScore(score) {
    try {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, String(score));
    } catch {}
  }
}
