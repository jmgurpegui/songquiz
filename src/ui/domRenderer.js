/**
 * @fileoverview Renderizador de interfaz reactivo con diseño estilo Spotify,
 * gestión de eventos del DOM, atajos de teclado, modal de importación de playlists
 * y soporte integral para el modo pedagógico "Lyrics Challenge".
 */

import { GameStates, GameModes } from '../core/gameState.js';

export class DOMRenderer {
  /**
   * @param {import('../core/gameState.js').GameState} gameState
   * @param {import('../core/gameLogic.js').GameLogic} gameLogic
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine
   * @param {import('../audio/soundFX.js').SoundFX} soundFX
   * @param {Array<Object>} defaultSongs
   */
  constructor(gameState, gameLogic, audioEngine, soundFX, defaultSongs = []) {
    this.gameState = gameState;
    this.gameLogic = gameLogic;
    this.audioEngine = audioEngine;
    this.soundFX = soundFX;
    this.defaultSongs = defaultSongs;

    this._cacheDOMElements();
    this._bindDOMEvents();
    this._bindStateListeners();
    this._bindKeyboardShortcuts();
    this._bindPlaylistManagerEvents();
    this._updateModeButtons();
  }

  /**
   * Almacena referencias a los nodos del DOM.
   * @private
   */
  _cacheDOMElements() {
    this.dom = {
      scoreDisplay: document.getElementById('score-display'),
      streakDisplay: document.getElementById('streak-display'),
      streakChip: document.getElementById('streak-chip'),
      roundIndicator: document.getElementById('round-indicator'),
      btnMute: document.getElementById('btn-mute'),
      btnOpenImporter: document.getElementById('btn-open-importer'),

      // Selector de modo
      btnModeClassic: document.getElementById('btn-mode-classic'),
      btnModeLyrics: document.getElementById('btn-mode-lyrics'),

      stageOverlay: document.getElementById('stage-overlay'),
      stageTitle: document.getElementById('stage-title'),
      stageSubtitle: document.getElementById('stage-subtitle'),

      timerBar: document.getElementById('timer-bar-fill'),
      timerText: document.getElementById('timer-text'),

      // Caja de desafío pedagógico Lyrics Challenge
      lyricsChallengeBox: document.getElementById('lyrics-challenge-box'),
      verseEnglishText: document.getElementById('verse-english-text'),
      verseSpanishTranslation: document.getElementById('verse-spanish-translation'),
      lyricsInputField: document.getElementById('lyrics-input-field'),
      btnLyricsSubmit: document.getElementById('btn-lyrics-submit'),

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
      btnRestart: document.getElementById('btn-restart'),

      // Modal de gestión de playlist
      playlistModal: document.getElementById('playlist-modal'),
      btnCloseImporter: document.getElementById('btn-close-importer'),
      playlistTableBody: document.getElementById('playlist-table-body'),
      playlistJsonInput: document.getElementById('playlist-json-input'),
      btnApplyCustomJson: document.getElementById('btn-apply-custom-json'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnResetDefaultSongs: document.getElementById('btn-reset-default-songs'),
      playlistCountBadge: document.getElementById('playlist-count-badge')
    };
  }

  /**
   * Enlaza eventos de clic de los botones principales y selector de modos.
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

    this.dom.btnOpenImporter?.addEventListener('click', () => {
      this._openPlaylistModal();
    });

    this.dom.btnCloseImporter?.addEventListener('click', () => {
      this.dom.playlistModal?.classList.remove('open');
    });

    // Selector de modo de juego (Classic vs Lyrics Challenge)
    this.dom.btnModeClassic?.addEventListener('click', () => {
      if (this.gameState.gameMode !== GameModes.CLASSIC) {
        this.gameState.setGameMode(GameModes.CLASSIC);
        this._updateModeButtons();
        this._handleModeSwitched();
      }
    });

    this.dom.btnModeLyrics?.addEventListener('click', () => {
      if (this.gameState.gameMode !== GameModes.LYRICS) {
        this.gameState.setGameMode(GameModes.LYRICS);
        this._updateModeButtons();
        this._handleModeSwitched();
      }
    });

    // Envío por teclado en Lyrics Challenge
    const submitTypedAnswer = () => {
      const val = this.dom.lyricsInputField?.value.trim();
      if (val && this.gameState.status === GameStates.PLAYING) {
        this.gameLogic.submitAnswer(val);
      }
    };

    this.dom.btnLyricsSubmit?.addEventListener('click', submitTypedAnswer);
    this.dom.lyricsInputField?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitTypedAnswer();
      }
    });
  }

  /**
   * Actualiza el estilo activo de los botones de modo.
   * @private
   */
  _updateModeButtons() {
    const isClassic = this.gameState.gameMode === GameModes.CLASSIC;
    this.dom.btnModeClassic?.classList.toggle('active', isClassic);
    this.dom.btnModeLyrics?.classList.toggle('active', !isClassic);
  }

  /**
   * Responde al cambio voluntario de modo reiniciando la ronda actual si está jugando.
   * @private
   */
  _handleModeSwitched() {
    if (this.gameState.status === GameStates.PLAYING || this.gameState.status === GameStates.ROUND_OVER) {
      this.gameLogic.startRound();
    }
  }

  /**
   * Gestión del modal importador de playlist.
   * @private
   */
  _bindPlaylistManagerEvents() {
    this.dom.btnExportJson?.addEventListener('click', () => {
      const jsonStr = JSON.stringify(this.gameLogic.allSongs, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'songs.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    this.dom.btnApplyCustomJson?.addEventListener('click', () => {
      try {
        const text = this.dom.playlistJsonInput.value.trim();
        if (!text) return;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          alert('El formato debe ser un array de canciones JSON válido.');
          return;
        }
        this.gameLogic.setCustomPlaylist(parsed);
        this.dom.playlistModal?.classList.remove('open');
        this.dom.startScreen.classList.remove('visually-hidden');
        alert(`¡Lista actualizada con éxito! (${parsed.length} canciones activas)`);
      } catch (err) {
        alert('Error al procesar el JSON: ' + err.message);
      }
    });

    this.dom.btnResetDefaultSongs?.addEventListener('click', () => {
      if (confirm('¿Restablecer el catálogo a las canciones oficiales por defecto?')) {
        this.gameLogic.resetToDefaultPlaylist(this.defaultSongs);
        this._renderPlaylistTable();
        alert('Catálogo restablecido.');
      }
    });

    const tabBtns = document.querySelectorAll('.playlist-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        document.querySelectorAll('.playlist-tab-content').forEach(c => {
          c.style.display = c.id === target ? 'block' : 'none';
        });
      });
    });
  }

  _openPlaylistModal() {
    this._renderPlaylistTable();
    if (this.dom.playlistJsonInput) {
      this.dom.playlistJsonInput.value = JSON.stringify(this.gameLogic.allSongs, null, 2);
    }
    this.dom.playlistModal?.classList.add('open');
  }

  _renderPlaylistTable() {
    if (!this.dom.playlistTableBody) return;
    this.dom.playlistTableBody.innerHTML = '';
    const songs = this.gameLogic.allSongs;

    if (this.dom.playlistCountBadge) {
      this.dom.playlistCountBadge.textContent = `${songs.length} canciones`;
    }

    songs.forEach((song, idx) => {
      const tr = document.createElement('tr');
      const hasLyrics = song.lyrics?.en && song.lyrics?.es;
      const hasTrivia = Boolean(song.culturalTrivia);

      tr.innerHTML = `
        <td style="color: var(--color-text-dim); font-family: var(--font-mono);">${idx + 1}</td>
        <td style="font-weight: 700;">${song.title}</td>
        <td style="color: var(--color-secondary);">${song.artist}</td>
        <td><span class="genre-pill" style="margin: 0; font-size: 0.7rem;">${song.genre || 'General'}</span></td>
        <td style="text-align: center;">${hasLyrics ? '✅' : '⚠️'}</td>
        <td style="text-align: center;">${hasTrivia ? '✅' : '⚠️'}</td>
      `;
      this.dom.playlistTableBody.appendChild(tr);
    });
  }

  /**
   * Escucha eventos reactivos del estado.
   * @private
   */
  _bindStateListeners() {
    this.gameState.addEventListener('stateChange', (e) => {
      const { currentState, ...payload } = e.detail;
      this._onStateChange(currentState, payload);
    });

    this.gameState.addEventListener('modeChange', (e) => {
      this._updateModeButtons();
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
   * Configura la interfaz al iniciar una ronda activa adaptándose al modo Classic o Lyrics Challenge.
   * @private
   */
  _renderPlayingState({ options, roundNumber, totalRounds, gameMode, lyricsData, song }) {
    this.dom.discoveryPanel.classList.remove('active');
    this.dom.statusMsg.textContent = '';
    this.dom.statusMsg.className = 'status-msg';

    if (this.dom.roundIndicator) {
      const modeLabel = gameMode === GameModes.LYRICS ? 'Lyrics' : 'Trivia';
      this.dom.roundIndicator.textContent = `${modeLabel} • Pista ${roundNumber} / ${totalRounds}`;
    }

    this.dom.stageOverlay.classList.remove('hidden');

    if (gameMode === GameModes.LYRICS && lyricsData) {
      // MODO LYRICS CHALLENGE
      this.dom.stageTitle.textContent = 'Completa la Letra (Listen & Fill)';
      this.dom.stageSubtitle.textContent = 'Escucha el fragmento y selecciona la palabra que falta...';

      // Mostrar caja pedagógica de desafío
      if (this.dom.lyricsChallengeBox) {
        this.dom.lyricsChallengeBox.classList.remove('hidden');

        // Formatear verso con el hueco [ ? ]
        const regex = new RegExp(`\\b${lyricsData.targetWord}\\b`, 'i');
        const parts = lyricsData.fullLine.split(regex);
        if (parts.length >= 2) {
          this.dom.verseEnglishText.innerHTML = `${parts[0]}<span class="lyrics-blank-token" id="lyrics-blank-token">[ ? ]</span>${parts.slice(1).join('')}`;
        } else {
          this.dom.verseEnglishText.innerHTML = lyricsData.blankedLine.replace('[ _____ ]', '<span class="lyrics-blank-token" id="lyrics-blank-token">[ ? ]</span>');
        }

        if (this.dom.verseSpanishTranslation) {
          this.dom.verseSpanishTranslation.textContent = `💡 Traducción contextual: "${lyricsData.spanishContext}"`;
        }

        if (this.dom.lyricsInputField) {
          this.dom.lyricsInputField.value = '';
          this.dom.lyricsInputField.disabled = false;
        }
      }
    } else {
      // MODO CLASSIC TRIVIA
      this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
      this.dom.stageSubtitle.textContent = 'Escucha con atención las frecuencias...';

      if (this.dom.lyricsChallengeBox) {
        this.dom.lyricsChallengeBox.classList.add('hidden');
      }
    }

    this._updateTimer(this.gameState.maxRoundTime, this.gameState.maxRoundTime);

    // Inyectar opciones de respuesta tipo píldora
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
  _renderRoundOverState({ selectedOption, isCorrect, correctAnswer, song, pointsEarned, isTimeout, gameMode, lyricsData }) {
    // 1. Desactivar todos los botones de opciones
    const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
    const clean = (s) => (s || '').replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();

    buttons.forEach((btn) => {
      btn.disabled = true;
      const opt = clean(btn.dataset.option);
      if (opt === clean(correctAnswer)) {
        btn.classList.add('correct');
      } else if (opt === clean(selectedOption) && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    if (this.dom.lyricsInputField) {
      this.dom.lyricsInputField.disabled = true;
    }

    // 2. Si estamos en Lyrics Challenge, actualizar el hueco del verso en tiempo real
    const blankEl = document.getElementById('lyrics-blank-token');
    if (blankEl) {
      blankEl.textContent = correctAnswer;
      blankEl.className = isCorrect ? 'lyrics-blank-token revealed-correct' : 'lyrics-blank-token revealed-wrong';
    }

    // 3. Actualizar mensaje de estado
    if (isTimeout) {
      this.dom.statusMsg.textContent = '⏰ ¡Tiempo agotado!';
      this.dom.statusMsg.style.color = 'var(--color-warning)';
    } else if (isCorrect) {
      const extra = gameMode === GameModes.LYRICS ? `"${correctAnswer}"` : '';
      this.dom.statusMsg.textContent = `¡Correcto! ${extra} +${pointsEarned} pts 🎉`;
      this.dom.statusMsg.style.color = 'var(--spotify-green-light)';
    } else {
      this.dom.statusMsg.textContent = `¡Incorrecto! La respuesta correcta era "${correctAnswer}" 🎶`;
      this.dom.statusMsg.style.color = 'var(--color-error)';
    }

    // 4. Mostrar datos del tema en el escenario
    this.dom.stageTitle.textContent = `${song.title}`;
    this.dom.stageSubtitle.textContent = `${song.artist} • ${song.year || ''}`;

    if (this.dom.genreBadge) {
      this.dom.genreBadge.textContent = song.genre || 'Música';
    }
    this.dom.lyricsEn.textContent = song.lyrics?.en || 'Letra no disponible';
    this.dom.lyricsEs.textContent = song.lyrics?.es || '';
    this.dom.cultureText.textContent = song.culturalTrivia || 'Sin información adicional.';

    // 5. Desplegar panel pedagógico
    this.dom.discoveryPanel.classList.add('active');

    setTimeout(() => {
      this.dom.discoveryPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 250);
  }

  _renderGameOverState({ finalScore, isNewRecord, accuracy, maxStreak, avgTime, gameMode }) {
    this.dom.finalScore.textContent = finalScore;
    this.dom.finalAccuracy.textContent = `${accuracy}%`;
    this.dom.finalStreak.textContent = `🔥 ${maxStreak}`;
    this.dom.finalAvgTime.textContent = `${avgTime}s`;

    if (this.dom.recordBadge) {
      this.dom.recordBadge.style.display = isNewRecord ? 'inline-block' : 'none';
    }

    this.dom.gameOverModal.classList.add('open');
  }

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

  _updateMuteIcon(isMuted) {
    if (!this.dom.btnMute) return;
    this.dom.btnMute.innerHTML = isMuted
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  }

  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // No interferir con escritura en inputs
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const key = e.key;

      if (['1', '2', '3', '4'].includes(key) && this.gameState.status === GameStates.PLAYING) {
        const index = parseInt(key, 10) - 1;
        const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
        if (buttons[index] && !buttons[index].disabled) {
          buttons[index].click();
        }
      }

      if (key === 'Enter' || key.toLowerCase() === 'n') {
        if (this.gameState.status === GameStates.ROUND_OVER) {
          this.gameLogic.nextRound();
        } else if (this.gameState.status === GameStates.GAME_OVER) {
          this.dom.btnRestart?.click();
        } else if (this.gameState.status === GameStates.IDLE) {
          this.dom.btnStart?.click();
        }
      }

      if (key.toLowerCase() === 'm') {
        this.dom.btnMute?.click();
      }
    });
  }
}
