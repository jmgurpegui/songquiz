/**
 * @fileoverview Renderizador de interfaz reactivo con diseño estilo Spotify,
 * gestión de eventos del DOM, atajos de teclado y modal de importación de playlists.
 */

import { GameStates } from '../core/gameState.js';

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

    this.dom.btnOpenImporter?.addEventListener('click', () => {
      this._openPlaylistModal();
    });

    this.dom.btnCloseImporter?.addEventListener('click', () => {
      this.dom.playlistModal?.classList.remove('open');
    });
  }

  /**
   * Gestión del modal importador de playlist.
   * @private
   */
  _bindPlaylistManagerEvents() {
    // Exportar JSON actual
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

    // Aplicar JSON importado
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

    // Restablecer a la lista por defecto
    this.dom.btnResetDefaultSongs?.addEventListener('click', () => {
      if (confirm('¿Restablecer el catálogo a las canciones oficiales por defecto?')) {
        this.gameLogic.resetToDefaultPlaylist(this.defaultSongs);
        this._renderPlaylistTable();
        alert('Catálogo restablecido.');
      }
    });

    // Pestañas del gestor
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
   * Configura la interfaz al iniciar una ronda activa con estética Spotify.
   * @private
   */
  _renderPlayingState({ options, roundNumber, totalRounds }) {
    this.dom.discoveryPanel.classList.remove('active');
    this.dom.statusMsg.textContent = '';
    this.dom.statusMsg.className = 'status-msg';

    if (this.dom.roundIndicator) {
      this.dom.roundIndicator.textContent = `Pista ${roundNumber} / ${totalRounds}`;
    }

    this.dom.stageOverlay.classList.remove('hidden');
    this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
    this.dom.stageSubtitle.textContent = 'Escucha con atención las frecuencias...';

    this._updateTimer(this.gameState.maxRoundTime, this.gameState.maxRoundTime);

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
   * Revela la vista oficial de letras y curiosidades pedagógicas estilo Spotify.
   * @private
   */
  _renderRoundOverState({ selectedOption, isCorrect, correctAnswer, song, pointsEarned, isTimeout }) {
    const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
    buttons.forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.option === correctAnswer) {
        btn.classList.add('correct');
      } else if (btn.dataset.option === selectedOption && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    if (isTimeout) {
      this.dom.statusMsg.textContent = '⏰ ¡Tiempo agotado!';
      this.dom.statusMsg.style.color = 'var(--color-warning)';
    } else if (isCorrect) {
      this.dom.statusMsg.textContent = `¡Correcto! +${pointsEarned} pts 🎉`;
      this.dom.statusMsg.style.color = 'var(--spotify-green-light)';
    } else {
      this.dom.statusMsg.textContent = '¡Incorrecto! Sigue disfrutando la música 🎵';
      this.dom.statusMsg.style.color = 'var(--color-error)';
    }

    this.dom.stageTitle.textContent = `${song.title}`;
    this.dom.stageSubtitle.textContent = `${song.artist} • ${song.year || ''}`;

    if (this.dom.genreBadge) {
      this.dom.genreBadge.textContent = song.genre || 'Música';
    }
    this.dom.lyricsEn.textContent = song.lyrics?.en || 'Letra no disponible';
    this.dom.lyricsEs.textContent = song.lyrics?.es || '';
    this.dom.cultureText.textContent = song.culturalTrivia || 'Sin información adicional.';

    this.dom.discoveryPanel.classList.add('active');

    setTimeout(() => {
      this.dom.discoveryPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 250);
  }

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
