/**
 * @fileoverview Renderizador de interfaz reactivo, gestión de eventos del DOM y modales accesibles.
 * Traduce las transiciones de estado a actualizaciones del DOM y gestiona los atajos de teclado.
 */

import { GameStates } from '../core/gameState.js';

export class DOMRenderer {
  /**
   * @param {import('../core/gameState.js').GameState} gameState
   * @param {import('../core/gameLogic.js').GameLogic} gameLogic
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine
   * @param {import('../audio/soundFX.js').SoundFX} soundFX
   */
  constructor(gameState, gameLogic, audioEngine, soundFX) {
    this.gameState = gameState;
    this.gameLogic = gameLogic;
    this.audioEngine = audioEngine;
    this.soundFX = soundFX;

    this._cacheDOMElements();
    this._bindDOMEvents();
    this._bindStateListeners();
    this._bindKeyboardShortcuts();
  }

  /**
   * Almacena referencias a los nodos críticos del DOM.
   * @private
   */
  _cacheDOMElements() {
    this.dom = {
      scoreDisplay: document.getElementById('score-display'),
      streakDisplay: document.getElementById('streak-display'),
      streakChip: document.getElementById('streak-chip'),
      roundIndicator: document.getElementById('round-indicator'),
      btnMute: document.getElementById('btn-mute'),

      stageOverlay: document.getElementById('stage-overlay'),
      stageTitle: document.getElementById('stage-title'),
      stageSubtitle: document.getElementById('stage-subtitle'),

      timerBar: document.getElementById('timer-bar-fill'),
      timerText: document.getElementById('timer-text'),

      optionsGrid: document.getElementById('options-grid'),
      statusMsg: document.getElementById('status-msg'),

      startScreen: document.getElementById('start-screen'),
      btnStart: document.getElementById('btn-start'),

      discoveryPanel: document.getElementById('discovery-panel'),
      lyricsEn: document.getElementById('lyrics-en'),
      lyricsEs: document.getElementById('lyrics-es'),
      cultureText: document.getElementById('culture-text'),
      genreBadge: document.getElementById('genre-badge'),
      btnNext: document.getElementById('btn-next'),

      gameOverModal: document.getElementById('game-over-modal'),
      finalScore: document.getElementById('final-score'),
      finalAccuracy: document.getElementById('final-accuracy'),
      finalStreak: document.getElementById('final-streak'),
      finalAvgTime: document.getElementById('final-avg-time'),
      recordBadge: document.getElementById('record-badge'),
      btnRestart: document.getElementById('btn-restart')
    };
  }

  /**
   * Enlaza eventos de clic de los botones principales.
   * @private
   */
  _bindDOMEvents() {
    this.dom.btnStart?.addEventListener('click', () => {
      this.dom.startScreen.classList.add('visually-hidden');
      this.gameLogic.startRound();
    });

    this.dom.btnNext?.addEventListener('click', () => {
      this.gameLogic.nextRound();
    });

    this.dom.btnRestart?.addEventListener('click', () => {
      this.dom.gameOverModal.classList.remove('open');
      this.gameLogic.startNewGame(this.gameLogic.allSongs);
    });

    this.dom.btnMute?.addEventListener('click', () => {
      const isMuted = this.audioEngine.toggleMute();
      this.soundFX.toggleMute();
      this._updateMuteIcon(isMuted);
    });
  }

  /**
   * Escucha eventos reactivos de la máquina de estados.
   * @private
   */
  _bindStateListeners() {
    this.gameState.addEventListener('stateChange', (e) => {
      const { currentState, ...payload } = e.detail;
      this._onStateChange(currentState, payload);
    });

    this.gameState.addEventListener('timeTick', (e) => {
      const { timeRemaining, maxTime } = e.detail;
      this._updateTimer(timeRemaining, maxTime);
    });

    this.gameState.addEventListener('scoreUpdate', (e) => {
      const { score, streak } = e.detail;
      this._updateScoreAndStreak(score, streak);
    });
  }

  /**
   * Manejador central de cambios de estado.
   * @private
   */
  _onStateChange(state, payload) {
    switch (state) {
      case GameStates.PLAYING:
        this._renderPlayingState(payload);
        break;

      case GameStates.ROUND_OVER:
        this._renderRoundOverState(payload);
        break;

      case GameStates.GAME_OVER:
        this._renderGameOverState(payload);
        break;
    }
  }

  /**
   * Configura la interfaz al iniciar una ronda activa.
   * @private
   */
  _renderPlayingState({ options, roundNumber, totalRounds }) {
    // 1. Ocultar sección de descubrimiento y reiniciar mensajes
    this.dom.discoveryPanel.classList.remove('active');
    this.dom.statusMsg.textContent = '';
    this.dom.statusMsg.className = 'status-msg';

    // 2. Actualizar ronda
    if (this.dom.roundIndicator) {
      this.dom.roundIndicator.textContent = `Pista ${roundNumber} / ${totalRounds}`;
    }

    // 3. Estado de la escena de audio
    this.dom.stageOverlay.classList.remove('hidden');
    this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
    this.dom.stageSubtitle.textContent = 'Escucha con atención las frecuencias...';

    // 4. Reiniciar barra de temporizador
    this._updateTimer(this.gameState.maxRoundTime, this.gameState.maxRoundTime);

    // 5. Inyectar botones de respuesta
    this.dom.optionsGrid.innerHTML = '';
    options.forEach((optText, index) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.setAttribute('type', 'button');
      btn.dataset.option = optText;

      btn.innerHTML = `
        <span class="option-key">0${index + 1}</span>
        <span class="option-text">${optText}</span>
      `;

      btn.addEventListener('click', () => {
        this.gameLogic.submitAnswer(optText);
      });

      this.dom.optionsGrid.appendChild(btn);
    });
  }

  /**
   * Revela la información pedagógica y resalta respuestas correctas/erróneas.
   * @private
   */
  _renderRoundOverState({ selectedOption, isCorrect, correctAnswer, song, pointsEarned, isTimeout }) {
    // 1. Desactivar todos los botones de opciones
    const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
    buttons.forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.option === correctAnswer) {
        btn.classList.add('correct');
      } else if (btn.dataset.option === selectedOption && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    // 2. Actualizar mensaje de estado
    if (isTimeout) {
      this.dom.statusMsg.textContent = '⏰ ¡Tiempo agotado!';
      this.dom.statusMsg.style.color = 'var(--color-warning)';
    } else if (isCorrect) {
      this.dom.statusMsg.textContent = `¡Correcto! +${pointsEarned} pts 🎉`;
      this.dom.statusMsg.style.color = 'var(--color-success)';
    } else {
      this.dom.statusMsg.textContent = '¡Incorrecto! Sigue intentándolo 🎶';
      this.dom.statusMsg.style.color = 'var(--color-error)';
    }

    // 3. Escena de audio revelada
    this.dom.stageTitle.textContent = `${song.title}`;
    this.dom.stageSubtitle.textContent = `${song.artist} (${song.year})`;

    // 4. Llenar tarjetas pedagógicas
    if (this.dom.genreBadge) {
      this.dom.genreBadge.textContent = song.genre;
    }
    this.dom.lyricsEn.textContent = song.lyrics.en;
    this.dom.lyricsEs.textContent = song.lyrics.es;
    this.dom.cultureText.textContent = song.culturalTrivia;

    // 5. Desplegar panel con animación
    this.dom.discoveryPanel.classList.add('active');

    // Desplazamiento suave para visualizar el contenido de aprendizaje
    setTimeout(() => {
      this.dom.discoveryPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 250);
  }

  /**
   * Muestra el modal con el informe y métricas finales.
   * @private
   */
  _renderGameOverState({ finalScore, isNewRecord, accuracy, maxStreak, avgTime }) {
    this.dom.finalScore.textContent = finalScore;
    this.dom.finalAccuracy.textContent = `${accuracy}%`;
    this.dom.finalStreak.textContent = `🔥 ${maxStreak}`;
    this.dom.finalAvgTime.textContent = `${avgTime}s`;

    if (this.dom.recordBadge) {
      this.dom.recordBadge.style.display = isNewRecord ? 'inline-block' : 'none';
    }

    this.dom.gameOverModal.classList.add('open');
  }

  /**
   * Actualiza visualmente la barra de temporizador.
   * @private
   */
  _updateTimer(remaining, maxTime) {
    const percent = Math.max(0, (remaining / maxTime) * 100);
    if (this.dom.timerBar) {
      this.dom.timerBar.style.width = `${percent}%`;

      this.dom.timerBar.classList.remove('warning', 'danger');
      if (remaining <= 5) {
        this.dom.timerBar.classList.add('danger');
      } else if (remaining <= 8) {
        this.dom.timerBar.classList.add('warning');
      }
    }

    if (this.dom.timerText) {
      this.dom.timerText.textContent = `${remaining}s`;
    }
  }

  /**
   * Actualiza los marcadores superiores de puntuación y racha.
   * @private
   */
  _updateScoreAndStreak(score, streak) {
    if (this.dom.scoreDisplay) {
      this.dom.scoreDisplay.textContent = score;
    }
    if (this.dom.streakDisplay) {
      this.dom.streakDisplay.textContent = streak;
    }
    if (this.dom.streakChip) {
      if (streak >= 2) {
        this.dom.streakChip.classList.add('active');
      } else {
        this.dom.streakChip.classList.remove('active');
      }
    }
  }

  /**
   * Actualiza el icono de silencio.
   * @private
   */
  _updateMuteIcon(isMuted) {
    if (!this.dom.btnMute) return;
    this.dom.btnMute.innerHTML = isMuted
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  }

  /**
   * Soporte integral para accesibilidad por teclado.
   * 1-4: Seleccionar opción
   * Espacio: Pausar/Reanudar audio
   * Enter / N: Siguiente canción o Reiniciar
   * M: Silenciar
   * @private
   */
  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Evitar interceptar si el usuario está en un input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const key = e.key;

      // 1, 2, 3, 4: Responder
      if (['1', '2', '3', '4'].includes(key) && this.gameState.status === GameStates.PLAYING) {
        const index = parseInt(key, 10) - 1;
        const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
        if (buttons[index] && !buttons[index].disabled) {
          buttons[index].click();
        }
      }

      // Enter o N: Siguiente ronda o Reiniciar
      if (key === 'Enter' || key.toLowerCase() === 'n') {
        if (this.gameState.status === GameStates.ROUND_OVER) {
          this.gameLogic.nextRound();
        } else if (this.gameState.status === GameStates.GAME_OVER) {
          this.dom.btnRestart?.click();
        } else if (this.gameState.status === GameStates.IDLE) {
          this.dom.btnStart?.click();
        }
      }

      // Tecla M: Alternar silencio
      if (key.toLowerCase() === 'm') {
        this.dom.btnMute?.click();
      }
    });
  }
}
