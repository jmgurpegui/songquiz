/**
 * @fileoverview Renderizador de interfaz reactivo con diseño estilo Spotify,
 * gestión completa de accesibilidad WCAG 2.1 AA, navegación por teclado,
 * control de foco (focus trap), lector de pantalla (ARIA live) y gestor de playlists.
 */

import { GameStates, GameModes } from '../core/gameState.js';
import { fetchPlaylistFromYouTube, parseTextPlaylist } from '../utils/playlistParser.js';

export class DOMRenderer {
  /**
   * @param {import('../core/gameState.js').GameState} gameState
   * @param {import('../core/gameLogic.js').GameLogic} gameLogic
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine
   * @param {import('../audio/soundFX.js').SoundFX} soundFX
   * @param {Array<Object>} defaultSongs
   * @param {import('../audio/youtubePlayer.js').YouTubePlayerEngine} [youtubePlayer=null]
   */
  constructor(gameState, gameLogic, audioEngine, soundFX, defaultSongs = [], youtubePlayer = null) {
    this.gameState = gameState;
    this.gameLogic = gameLogic;
    this.audioEngine = audioEngine;
    this.soundFX = soundFX;
    this.defaultSongs = defaultSongs;
    this.youtubePlayer = youtubePlayer;

    // Estado interno para accesibilidad y modales
    this._activeModal = null;
    this._previousFocusedElement = null;
    this._modalKeyHandler = null;

    // Estado de minimizado del reproductor (persiste en localStorage)
    this.isPlayerMinimized = localStorage.getItem('songquiz_player_minimized') === 'true';

    this._cacheDOMElements();
    this._applyMinimizeState();
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

      // Regiones de anuncios accesibles ARIA Live
      a11yAnnouncer: document.getElementById('a11y-announcer'),
      a11yAlert: document.getElementById('a11y-alert'),

      // Selector de modo
      btnModeClassic: document.getElementById('btn-mode-classic'),
      btnModeLyrics: document.getElementById('btn-mode-lyrics'),

      stageOverlay: document.getElementById('stage-overlay'),
      stageTitle: document.getElementById('stage-title'),
      stageSubtitle: document.getElementById('stage-subtitle'),
      audioStage: document.getElementById('audio-stage'),
      btnToggleMinimize: document.getElementById('btn-toggle-minimize'),
      iconMinimizeSvg: document.getElementById('icon-minimize-svg'),
      iconExpandSvg: document.getElementById('icon-expand-svg'),
      labelToggleMinimize: document.getElementById('label-toggle-minimize'),
      minimizedAudioBar: document.getElementById('minimized-audio-bar'),
      minimizedTitle: document.getElementById('minimized-title'),
      minimizedSubtitle: document.getElementById('minimized-subtitle'),

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
      btnYtExternal: document.getElementById('btn-yt-external'),

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
      youtubePlaylistUrlInput: document.getElementById('youtube-playlist-url-input'),
      btnFetchYoutubePlaylist: document.getElementById('btn-fetch-youtube-playlist'),
      importProgressStatus: document.getElementById('import-progress-status'),
      playlistTableBody: document.getElementById('playlist-table-body'),
      playlistJsonInput: document.getElementById('playlist-json-input'),
      btnApplyCustomJson: document.getElementById('btn-apply-custom-json'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnResetDefaultSongs: document.getElementById('btn-reset-default-songs'),
      playlistCountBadge: document.getElementById('playlist-count-badge')
    };
  }

  /**
   * Aplica el estado visual de minimizado en el escenario del reproductor.
   * En modo minimizado, el vídeo queda completamente oculto previniendo spoilers de títulos.
   * @private
   */
  _applyMinimizeState() {
    if (!this.dom.audioStage) return;
    this.dom.audioStage.classList.toggle('minimized', this.isPlayerMinimized);

    if (this.dom.iconMinimizeSvg) {
      this.dom.iconMinimizeSvg.style.display = this.isPlayerMinimized ? 'none' : 'block';
    }
    if (this.dom.iconExpandSvg) {
      this.dom.iconExpandSvg.style.display = this.isPlayerMinimized ? 'block' : 'none';
    }
    if (this.dom.labelToggleMinimize) {
      this.dom.labelToggleMinimize.textContent = this.isPlayerMinimized ? 'Expandir vídeo' : 'Ocultar vídeo';
    }
  }

  /**
   * Comunica mensajes a lectores de pantalla (NVDA, JAWS, VoiceOver) mediante ARIA Live.
   * @param {string} message - Texto descriptivo.
   * @param {boolean} [isAlert=false] - Si es true, usa aria-live="assertive" (interrumpe la lectura para alertas críticas).
   */
  announce(message, isAlert = false) {
    const region = isAlert ? this.dom.a11yAlert : this.dom.a11yAnnouncer;
    if (!region) return;

    // Limpiar brevemente para garantizar que el lector perciba el cambio de texto
    region.textContent = '';
    setTimeout(() => {
      region.textContent = message;
    }, 60);
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
      this._releaseFocusTrap(this.dom.gameOverModal);
      this.dom.gameOverModal.classList.remove('open');
      this.gameLogic.startNewGame(this.gameLogic.allSongs);
    });

    this.dom.btnMute?.addEventListener('click', () => {
      const isMuted = this.audioEngine.toggleMute();
      this.soundFX.toggleMute();
      if (this.youtubePlayer) {
        this.youtubePlayer.setMuted(isMuted);
      }
      this._updateMuteIcon(isMuted);
      this.announce(isMuted ? 'Sonido silenciado' : 'Sonido activado');
    });

    this.dom.btnToggleMinimize?.addEventListener('click', () => {
      this.isPlayerMinimized = !this.isPlayerMinimized;
      this._applyMinimizeState();
      try {
        localStorage.setItem('songquiz_player_minimized', String(this.isPlayerMinimized));
      } catch {}
      this.announce(this.isPlayerMinimized ? 'Reproductor minimizado (modo audio puro sin spoilers)' : 'Reproductor expandido (vídeo visible)');
    });

    this.dom.btnOpenImporter?.addEventListener('click', () => {
      this._openPlaylistModal();
    });

    this.dom.btnCloseImporter?.addEventListener('click', () => {
      this._closePlaylistModal();
    });

    // Selector de modo de juego (Classic vs Lyrics Challenge)
    this.dom.btnModeClassic?.addEventListener('click', () => {
      if (this.gameState.gameMode !== GameModes.CLASSIC) {
        this.gameState.setGameMode(GameModes.CLASSIC);
        this._updateModeButtons();
        this.announce('Modo cambiado a Classic Trivia');
        this._handleModeSwitched();
      }
    });

    this.dom.btnModeLyrics?.addEventListener('click', () => {
      if (this.gameState.gameMode !== GameModes.LYRICS) {
        this.gameState.setGameMode(GameModes.LYRICS);
        this._updateModeButtons();
        this.announce('Modo cambiado a Lyrics Challenge');
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
    if (this.dom.btnModeClassic) {
      this.dom.btnModeClassic.classList.toggle('active', isClassic);
      this.dom.btnModeClassic.setAttribute('aria-checked', String(isClassic));
    }
    if (this.dom.btnModeLyrics) {
      this.dom.btnModeLyrics.classList.toggle('active', !isClassic);
      this.dom.btnModeLyrics.setAttribute('aria-checked', String(!isClassic));
    }
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
   * Gestión del modal importador de playlist con Focus Trap.
   * @private
   */
  _bindPlaylistManagerEvents() {
    // Importación directa desde enlace de YouTube
    this.dom.btnFetchYoutubePlaylist?.addEventListener('click', async () => {
      const url = this.dom.youtubePlaylistUrlInput?.value.trim();
      if (!url) {
        if (this.dom.importProgressStatus) {
          this.dom.importProgressStatus.textContent = '⚠️ Por favor, introduce una URL o ID de lista de YouTube.';
          this.dom.importProgressStatus.style.color = 'var(--color-warning)';
        }
        return;
      }

      this.dom.btnFetchYoutubePlaylist.disabled = true;
      this.dom.btnFetchYoutubePlaylist.textContent = '⏳ Extrayendo canciones...';

      try {
        const songs = await fetchPlaylistFromYouTube(url, (msg) => {
          if (this.dom.importProgressStatus) {
            this.dom.importProgressStatus.textContent = msg;
            this.dom.importProgressStatus.style.color = 'var(--spotify-green-light)';
          }
        });

        if (songs.length === 0) {
          throw new Error('No se encontraron canciones en la lista.');
        }

        this.gameLogic.setCustomPlaylist(songs);
        this._renderPlaylistTable();
        this.announce(`Lista importada con éxito: ${songs.length} pistas activadas.`);

        if (this.dom.importProgressStatus) {
          this.dom.importProgressStatus.textContent = `✅ ¡Éxito! ${songs.length} pistas extraídas y activadas en el juego.`;
          this.dom.importProgressStatus.style.color = 'var(--spotify-green)';
        }

        setTimeout(() => {
          this._closePlaylistModal();
          this.dom.startScreen.classList.remove('visually-hidden');
        }, 1200);
      } catch (err) {
        console.error('Error al importar playlist:', err);
        if (this.dom.importProgressStatus) {
          this.dom.importProgressStatus.textContent = `❌ ${err.message}`;
          this.dom.importProgressStatus.style.color = 'var(--color-error)';
        }
        this.announce(`Error al importar: ${err.message}`, true);
      } finally {
        this.dom.btnFetchYoutubePlaylist.disabled = false;
        this.dom.btnFetchYoutubePlaylist.textContent = '⬇️ Extraer Canciones y Activar';
      }
    });

    this.dom.btnExportJson?.addEventListener('click', () => {
      const jsonStr = JSON.stringify(this.gameLogic.allSongs, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'songs.json';
      a.click();
      URL.revokeObjectURL(url);
      this.announce('Archivo songs.json descargado.');
    });

    this.dom.btnApplyCustomJson?.addEventListener('click', () => {
      try {
        const text = this.dom.playlistJsonInput.value.trim();
        if (!text) return;

        let parsed = [];
        if (text.startsWith('[')) {
          parsed = JSON.parse(text);
        } else {
          parsed = parseTextPlaylist(text);
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          alert('No se detectaron canciones válidas en el texto o JSON introducido.');
          return;
        }

        this.gameLogic.setCustomPlaylist(parsed);
        this._closePlaylistModal();
        this.dom.startScreen.classList.remove('visually-hidden');
        this.announce(`Lista personalizada activada con ${parsed.length} canciones.`);
      } catch (err) {
        alert('Error al procesar el catálogo: ' + err.message);
      }
    });

    this.dom.btnResetDefaultSongs?.addEventListener('click', () => {
      if (confirm('¿Restablecer el catálogo a las canciones oficiales por defecto?')) {
        this.gameLogic.resetToDefaultPlaylist(this.defaultSongs);
        this._renderPlaylistTable();
        this.announce('Catálogo restablecido al oficial por defecto.');
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
    if (this.dom.importProgressStatus) {
      this.dom.importProgressStatus.textContent = '';
    }
    if (this.dom.playlistJsonInput) {
      this.dom.playlistJsonInput.value = JSON.stringify(this.gameLogic.allSongs, null, 2);
    }
    this.dom.playlistModal?.classList.add('open');
    this._trapFocusInModal(this.dom.playlistModal);
    this.announce('Gestor de playlists abierto. Usa Tab para navegar o Escape para cerrar.');
  }

  _closePlaylistModal() {
    if (this.dom.playlistModal?.classList.contains('open')) {
      this.dom.playlistModal.classList.remove('open');
      this._releaseFocusTrap(this.dom.playlistModal);
      this.announce('Gestor de playlists cerrado.');
    }
  }

  _closeCurrentModal() {
    if (this.dom.playlistModal?.classList.contains('open')) {
      this._closePlaylistModal();
    } else if (this.dom.gameOverModal?.classList.contains('open')) {
      this.dom.gameOverModal.classList.remove('open');
      this._releaseFocusTrap(this.dom.gameOverModal);
      this.announce('Ventana de resultados cerrada.');
    }
  }

  /**
   * Implementa el atrapamiento accesible de foco (Focus Trap) dentro de modales (WCAG 2.1 AA).
   * @private
   * @param {HTMLElement} modalElement
   */
  _trapFocusInModal(modalElement) {
    if (!modalElement) return;
    this._activeModal = modalElement;
    this._previousFocusedElement = document.activeElement;

    const getFocusables = () => {
      return Array.from(modalElement.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null);
    };

    const focusables = getFocusables();
    if (focusables.length > 0) {
      setTimeout(() => focusables[0].focus(), 50);
    }

    this._modalKeyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._closeCurrentModal();
        return;
      }

      if (e.key === 'Tab') {
        const currentFocusables = getFocusables();
        if (currentFocusables.length === 0) return;

        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalElement.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalElement.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    modalElement.addEventListener('keydown', this._modalKeyHandler);
  }

  /**
   * Libera el atrapamiento de foco y devuelve el foco al elemento disparador.
   * @private
   * @param {HTMLElement} modalElement
   */
  _releaseFocusTrap(modalElement) {
    if (this._modalKeyHandler && modalElement) {
      modalElement.removeEventListener('keydown', this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
    if (this._previousFocusedElement && typeof this._previousFocusedElement.focus === 'function') {
      this._previousFocusedElement.focus();
      this._previousFocusedElement = null;
    }
    this._activeModal = null;
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

    this.gameState.addEventListener('modeChange', () => {
      this._updateModeButtons();
    });

    this.gameState.addEventListener('timeTick', (e) => {
      const { timeRemaining, maxTime } = e.detail;
      this._updateTimer(timeRemaining, maxTime);

      // Alerta sonora y textual a lectores de pantalla cuando restan exactamente 5 segundos
      if (timeRemaining === 5) {
        this.announce('Atención: quedan 5 segundos', true);
      }
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
   * Configura la interfaz al iniciar una ronda activa con accesibilidad WAI-ARIA (radiogroup) y Roving Tabindex.
   * @private
   */
  _renderPlayingState({ options, roundNumber, totalRounds, gameMode, lyricsData, song }) {
    this.dom.discoveryPanel.classList.remove('active');
    this.dom.statusMsg.textContent = '';
    this.dom.statusMsg.className = 'status-msg';

    // Ocultar vídeo de YouTube durante la fase de adivinanza
    if (this.dom.audioStage) {
      this.dom.audioStage.classList.remove('revealed');
    }
    if (this.dom.btnYtExternal) {
      this.dom.btnYtExternal.style.display = 'none';
    }

    if (this.dom.minimizedTitle) {
      this.dom.minimizedTitle.textContent = '🎧 Modo Audio Puro (Adivinando...)';
      this.dom.minimizedSubtitle.textContent = 'Vídeo y título ocultos para evitar spoilers';
    }

    if (this.dom.roundIndicator) {
      const modeLabel = gameMode === GameModes.LYRICS ? 'Lyrics' : 'Trivia';
      this.dom.roundIndicator.textContent = `${modeLabel} • Pista ${roundNumber} / ${totalRounds}`;
    }

    this.dom.stageOverlay.classList.remove('hidden');

    if (gameMode === GameModes.LYRICS && lyricsData) {
      this.dom.stageTitle.textContent = 'Completa la Letra (Listen & Fill)';
      this.dom.stageSubtitle.textContent = 'Escucha el fragmento y selecciona la palabra que falta...';

      if (this.dom.lyricsChallengeBox) {
        this.dom.lyricsChallengeBox.classList.remove('hidden');

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

      this.announce(`Pista ${roundNumber} de ${totalRounds}. Modo Lyrics Challenge. Completa el verso: ${lyricsData.blankedLine}. Cuatro opciones disponibles. Usa las teclas 1 a 4 o escribe tu respuesta.`);
    } else {
      this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
      this.dom.stageSubtitle.textContent = 'Escucha con atención las frecuencias...';

      if (this.dom.lyricsChallengeBox) {
        this.dom.lyricsChallengeBox.classList.add('hidden');
      }

      this.announce(`Pista ${roundNumber} de ${totalRounds}. Modo Classic Trivia. ¿Qué canción está sonando? Cuatro opciones disponibles. Usa las teclas 1 a 4 o las flechas para responder. Barra espaciadora para pausar el audio.`);
    }

    this._updateTimer(this.gameState.maxRoundTime, this.gameState.maxRoundTime);

    // Inyectar opciones de respuesta con patrón WAI-ARIA radiogroup y Roving Tabindex
    this.dom.optionsGrid.innerHTML = '';
    options.forEach((optText, index) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('tabindex', index === 0 ? '0' : '-1');
      btn.dataset.index = String(index);
      btn.dataset.option = optText;

      btn.innerHTML = `
        <span class="option-key">0${index + 1}</span>
        <span class="option-text">${optText}</span>
      `;

      btn.addEventListener('click', () => {
        this._selectOption(btn, optText);
      });

      // Navegación accesible por flechas (ArrowUp/Down/Left/Right)
      btn.addEventListener('keydown', (e) => {
        const buttons = Array.from(this.dom.optionsGrid.querySelectorAll('.option-btn'));
        let nextIndex = index;

        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          nextIndex = (index + 1) % buttons.length;
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          nextIndex = (index - 1 + buttons.length) % buttons.length;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this._selectOption(btn, optText);
          return;
        } else {
          return;
        }

        buttons.forEach((b, i) => b.setAttribute('tabindex', i === nextIndex ? '0' : '-1'));
        buttons[nextIndex].focus();
      });

      this.dom.optionsGrid.appendChild(btn);
    });
  }

  _selectOption(btn, optText) {
    const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
    buttons.forEach(b => b.setAttribute('aria-checked', b === btn ? 'true' : 'false'));
    this.gameLogic.submitAnswer(optText);
  }

  /**
   * Revela la información pedagógica y anuncia la evaluación con ARIA Live.
   * @private
   */
  _renderRoundOverState({ selectedOption, isCorrect, correctAnswer, song, pointsEarned, speedBonus = 0, speedBadge = '', multiplier = 1, isTimeout, gameMode, lyricsData }) {
    const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
    const clean = (s) => (s || '').replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();

    buttons.forEach((btn) => {
      btn.disabled = true;
      const opt = clean(btn.dataset.option);
      if (opt === clean(correctAnswer)) {
        btn.classList.add('correct');
        btn.setAttribute('aria-checked', 'true');
      } else if (opt === clean(selectedOption) && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    if (this.dom.lyricsInputField) {
      this.dom.lyricsInputField.disabled = true;
    }

    const blankEl = document.getElementById('lyrics-blank-token');
    if (blankEl) {
      blankEl.textContent = correctAnswer;
      blankEl.className = isCorrect ? 'lyrics-blank-token revealed-correct' : 'lyrics-blank-token revealed-wrong';
    }

    if (isTimeout) {
      this.dom.statusMsg.innerHTML = `
        <div class="score-feedback-card wrong">
          <span>⏰ ¡Tiempo agotado! La respuesta correcta era <strong>"${correctAnswer}"</strong></span>
        </div>
      `;
      this.announce(`Tiempo agotado. La respuesta correcta era: ${correctAnswer}. Pulsa Enter para pasar a la siguiente pista.`, true);
    } else if (isCorrect) {
      const extraWord = gameMode === GameModes.LYRICS ? `"${correctAnswer}" • ` : '';
      const bonusHtml = speedBonus > 0 ? `<span class="score-speed-tag">${speedBadge} +${speedBonus}</span>` : '';
      const streakHtml = multiplier > 1 ? `<span class="score-streak-tag">x${multiplier} Racha 🔥</span>` : '';

      this.dom.statusMsg.innerHTML = `
        <div class="score-feedback-card correct">
          <span>¡Correcto! ${extraWord}</span>
          <span class="score-points-badge">+${pointsEarned} pts</span>
          ${bonusHtml}
          ${streakHtml}
        </div>
      `;
      this.announce(`¡Correcto! Respuesta acertada: ${correctAnswer}. Has obtenido ${pointsEarned} puntos (${speedBadge} +${speedBonus} por tiempo). Pulsa Enter para continuar.`);
    } else {
      this.dom.statusMsg.innerHTML = `
        <div class="score-feedback-card wrong">
          <span>¡Incorrecto! La respuesta correcta era <strong>"${correctAnswer}"</strong> 🎶</span>
        </div>
      `;
      this.announce(`Incorrecto. La respuesta correcta era: ${correctAnswer}. Pulsa Enter para continuar.`);
    }

    this.dom.stageTitle.textContent = `${song.title}`;
    this.dom.stageSubtitle.textContent = `${song.artist} • ${song.year || ''}`;

    if (this.dom.minimizedTitle) {
      this.dom.minimizedTitle.textContent = `${song.title} - ${song.artist} 🎵`;
      this.dom.minimizedSubtitle.textContent = 'Audio en reproducción • Pulsa "Expandir vídeo" para ver el videoclip';
    }

    // Revelar el vídeo interactivo de YouTube para escuchar la canción completa
    if (this.dom.audioStage) {
      this.dom.audioStage.classList.add('revealed');
    }

    if (this.dom.btnYtExternal) {
      if (song.youtubeId) {
        this.dom.btnYtExternal.href = `https://www.youtube.com/watch?v=${song.youtubeId}`;
        this.dom.btnYtExternal.style.display = 'inline-flex';
      } else {
        this.dom.btnYtExternal.style.display = 'none';
      }
    }

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
    this._trapFocusInModal(this.dom.gameOverModal);
    this.announce(`Fin de la sesión. Puntuación final: ${finalScore} puntos. Precisión del ${accuracy} por ciento. Pulsa Enter para jugar otra partida.`);
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

  /**
   * Sistema integral de atajos de teclado accesibles:
   * 1-4 (normal y numpad): Selección directa de opciones.
   * Espacio: Alternar reproducción/pausa de audio.
   * Enter / N: Siguiente pista o reiniciar.
   * Escape: Cerrar modales activos y devolver el foco.
   * M: Silenciar/activar audio.
   * @private
   */
  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', async (e) => {
      // Si hay un modal abierto, Escape y Tab tienen prioridad en el modal
      if (this._activeModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this._closeCurrentModal();
        }
        return;
      }

      const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);

      // Escape general
      if (e.key === 'Escape') {
        this._closeCurrentModal();
        return;
      }

      // Tecla Espacio: Reproducir / Pausar audio (previniendo scroll vertical)
      if ((e.code === 'Space' || e.key === ' ') && !isInput) {
        e.preventDefault();
        if (this.gameState.status === GameStates.PLAYING || this.gameState.status === GameStates.ROUND_OVER) {
          let isPlaying = false;
          if (this.youtubePlayer && this.youtubePlayer.isLoaded && this.youtubePlayer.currentVideoId) {
            isPlaying = this.youtubePlayer.togglePlayPause();
          } else {
            isPlaying = await this.audioEngine.togglePlayPause();
          }
          this.announce(isPlaying ? 'Audio reanudado' : 'Audio pausado');
        }
        return;
      }

      // Si el usuario escribe en el input de lyrics, no interceptar números ni texto
      if (isInput) return;

      // Teclas 1, 2, 3, 4 (teclado alfanumérico estándar y numpad)
      const numKeys = {
        '1': 0, 'Digit1': 0, 'Numpad1': 0,
        '2': 1, 'Digit2': 1, 'Numpad2': 1,
        '3': 2, 'Digit3': 2, 'Numpad3': 2,
        '4': 3, 'Digit4': 3, 'Numpad4': 3
      };

      if (numKeys.hasOwnProperty(e.code) || numKeys.hasOwnProperty(e.key)) {
        if (this.gameState.status === GameStates.PLAYING) {
          e.preventDefault();
          const optionIndex = numKeys[e.code] !== undefined ? numKeys[e.code] : numKeys[e.key];
          const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
          if (buttons[optionIndex] && !buttons[optionIndex].disabled) {
            buttons[optionIndex].click();
          }
        }
        return;
      }

      // Tecla Enter o N: Siguiente canción o Reiniciar
      if (e.key === 'Enter' || e.key.toLowerCase() === 'n') {
        if (this.gameState.status === GameStates.ROUND_OVER) {
          e.preventDefault();
          this.gameLogic.nextRound();
        } else if (this.gameState.status === GameStates.GAME_OVER) {
          e.preventDefault();
          this.dom.btnRestart?.click();
        } else if (this.gameState.status === GameStates.IDLE) {
          e.preventDefault();
          this.dom.btnStart?.click();
        }
        return;
      }

      // Tecla M: Alternar silencio
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        this.dom.btnMute?.click();
        return;
      }

      // Tecla V: Minimizar / Expandir reproductor (Anti-spoilers)
      if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        this.dom.btnToggleMinimize?.click();
        return;
      }
    });
  }
}
