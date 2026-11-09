/**
 * @fileoverview Renderizador de interfaz reactivo con diseño estilo Spotify,
 * gestión completa de accesibilidad WCAG 2.1 AA, navegación por teclado,
 * control de foco (focus trap), lector de pantalla (ARIA live) y gestor de playlists.
 */

import { GameStates, GameModes } from '../core/gameState.js';
import { fetchPlaylistFromYouTube, parseTextPlaylist } from '../utils/playlistParser.js';
import { THEMATIC_PLAYLISTS } from '../data/thematicPlaylists.js';

export class DOMRenderer {
  /**
   * @param {import('../core/gameState.js').GameState} gameState
   * @param {import('../core/gameLogic.js').GameLogic} gameLogic
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine
   * @param {import('../audio/soundFX.js').SoundFX} soundFX
   * @param {Array<Object>} defaultSongs
   * @param {import('../audio/youtubePlayer.js').YouTubePlayerEngine} [youtubePlayer=null]
   * @param {import('../audio/castManager.js').CastManager} [castManager=null]
   */
  constructor(gameState, gameLogic, audioEngine, soundFX, defaultSongs = [], youtubePlayer = null, castManager = null) {
    this.gameState = gameState;
    this.gameLogic = gameLogic;
    this.audioEngine = audioEngine;
    this.soundFX = soundFX;
    this.defaultSongs = defaultSongs;
    this.youtubePlayer = youtubePlayer;
    this.castManager = castManager;

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
    this._bindCastEvents();
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

      // Selector de modo y listas temáticas
      btnModeClassic: document.getElementById('btn-mode-classic'),
      btnModeLyrics: document.getElementById('btn-mode-lyrics'),
      themePillsBar: document.getElementById('theme-pills-bar'),
      thematicPlaylistsGrid: document.getElementById('thematic-playlists-grid'),

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
      antiSpoilerTopShield: document.getElementById('anti-spoiler-top-shield'),
      adSkipControlBar: document.getElementById('ad-skip-control-bar'),
      timerStatusDot: document.getElementById('timer-status-dot'),
      timerStatusLabel: document.getElementById('timer-status-label'),
      btnSeekBack: document.getElementById('btn-seek-back'),
      btnSeekForward: document.getElementById('btn-seek-forward'),
      btnStartTimer: document.getElementById('btn-start-timer'),
      btnPlayPause: document.getElementById('btn-play-pause'),
      playPauseIcon: document.getElementById('play-pause-icon'),
      playPauseLabel: document.getElementById('play-pause-label'),
      btnTapToPlay: document.getElementById('btn-tap-to-play'),
      tapToPlaySub: document.getElementById('tap-to-play-sub'),

      // Controles y modal de Chromecast / TV
      btnCast: document.getElementById('btn-cast'),
      castBtnLabel: document.getElementById('cast-btn-label'),
      castModal: document.getElementById('cast-modal'),
      btnCloseCast: document.getElementById('btn-close-cast'),
      castStatusBanner: document.getElementById('cast-status-banner'),
      castStatusDot: document.getElementById('cast-status-dot'),
      castStatusText: document.getElementById('cast-status-text'),
      btnConnectChromecast: document.getElementById('btn-connect-chromecast'),
      btnConnectChromecastText: document.getElementById('btn-connect-chromecast-text'),
      btnToggleTvMode: document.getElementById('btn-toggle-tv-mode'),
      btnToggleTvModeText: document.getElementById('btn-toggle-tv-mode-text'),
      btnOpenYtCastApp: document.getElementById('btn-open-yt-cast-app'),

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
      cultureText: document.getElementById('culture-text'),
      genreBadge: document.getElementById('genre-badge'),
      curiosityPreview: document.getElementById('curiosity-preview'),
      btnToggleCuriosity: document.getElementById('btn-toggle-curiosity'),
      curiosityToggleText: document.getElementById('curiosity-toggle-text'),
      curiosityChevron: document.getElementById('curiosity-chevron'),
      curiosityBody: document.getElementById('curiosity-body'),
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

    this.dom.btnToggleCuriosity?.addEventListener('click', () => {
      this._setCuriosityExpanded(!this._isCuriosityExpanded);
    });

    this.dom.btnRestart?.addEventListener('click', () => {
      this._releaseFocusTrap(this.dom.gameOverModal);
      this.dom.gameOverModal.classList.remove('open');
      this.gameLogic.startNewGame(this.gameLogic.allSongs, this.gameLogic.isOrderedMode);
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

    this.dom.btnSeekBack?.addEventListener('click', () => {
      this.gameLogic.seekAudio(-10);
      this.announce('Retrocediendo 10 segundos en la canción');
    });

    this.dom.btnSeekForward?.addEventListener('click', () => {
      this.gameLogic.seekAudio(15);
      this.announce('Adelantando 15 segundos para escuchar la letra');
    });

    this.dom.btnPlayPause?.addEventListener('click', async () => {
      this.audioEngine.initContext();
      let isPlaying = false;
      if (this.youtubePlayer && this.youtubePlayer.isLoaded && this.youtubePlayer.currentVideoId) {
        isPlaying = this.youtubePlayer.togglePlayPause();
      } else {
        isPlaying = await this.audioEngine.togglePlayPause();
      }
      if (this.dom.playPauseIcon) {
        this.dom.playPauseIcon.textContent = isPlaying ? '⏸' : '▶';
      }
      if (this.dom.playPauseLabel) {
        this.dom.playPauseLabel.textContent = isPlaying ? 'Pausar' : 'Sonar';
      }
      this.announce(isPlaying ? 'Audio en reproducción' : 'Audio en pausa');
    });

    // Desbloqueo de reproducción en Chrome móvil: el toque del usuario concede el permiso de autoplay
    this._tapAttempts = 0;
    this.dom.btnTapToPlay?.addEventListener('click', () => {
      this._tapAttempts += 1;
      this.audioEngine.initContext();
      if (this.youtubePlayer && this.youtubePlayer.isLoaded && this.youtubePlayer.currentVideoId) {
        this.youtubePlayer.forcePlay();
      } else if (this.gameState.currentSong?.audioSrc) {
        this.audioEngine.play().catch(() => {});
      }
      this._hideTapToPlay();
    });

    if (this.youtubePlayer) {
      this.youtubePlayer.onPlaybackBlocked(() => {
        const s = this.gameState.status;
        if (s !== GameStates.PLAYING && s !== GameStates.AWAITING_AUDIO && s !== GameStates.ROUND_OVER) return;
        if (this._tapAttempts >= 1) {
          // Segundo intento: mostrar el vídeo para que el usuario pulse el ▶ nativo de YouTube
          this.dom.audioStage?.classList.add('needs-native-tap');
          if (this.isPlayerMinimized) {
            this.isPlayerMinimized = false;
            this._applyMinimizeState();
          }
          this.announce('Pulsa el botón de reproducción del vídeo de YouTube.', true);
          return;
        }
        this._showTapToPlay();
      });

      this.youtubePlayer.onPlaying(() => {
        this._tapAttempts = 0;
        this._hideTapToPlay();
        this.dom.audioStage?.classList.remove('needs-native-tap');
        if (this.dom.playPauseIcon) this.dom.playPauseIcon.textContent = '⏸';
        if (this.dom.playPauseLabel) this.dom.playPauseLabel.textContent = 'Pausar';
      });
    }

    this.dom.btnStartTimer?.addEventListener('click', () => {
      if (!this.gameLogic.isTimerRunning) {
        this.gameState.startTimer();
        this.announce('Cronómetro iniciado en 2 minutos exactos. ¡Adivina la canción!');
      } else {
        this.gameLogic.pauseRoundTimer();
        this.announce('Cronómetro en pausa para saltar anuncio de YouTube');
      }
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
      if (val && (this.gameState.status === GameStates.PLAYING || this.gameState.status === GameStates.AWAITING_AUDIO)) {
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
    if (
      this.gameState.status === GameStates.PLAYING ||
      this.gameState.status === GameStates.AWAITING_AUDIO ||
      this.gameState.status === GameStates.ROUND_OVER
    ) {
      this.gameLogic.startRound();
    }
  }

  /**
   * Gestión del modal importador de playlist con Focus Trap.
   * @private
   */
  _bindPlaylistManagerEvents() {
    this._renderThematicPlaylists();

    // Píldoras de selección rápida de listas temáticas en la pantalla principal
    this.dom.themePillsBar?.querySelectorAll('.theme-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const themeId = pill.dataset.themeId;
        this._activateThematicPlaylist(themeId);
      });
    });

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

        this.gameLogic.setCustomPlaylist(songs, false, false);
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

        this.gameLogic.setCustomPlaylist(parsed, false, false);
        this._closePlaylistModal();
        this.dom.startScreen.classList.remove('visually-hidden');
        this.announce(`Lista personalizada activada con ${parsed.length} canciones.`);
      } catch (err) {
        alert('Error al procesar el catálogo: ' + err.message);
      }
    });

    this.dom.btnResetDefaultSongs?.addEventListener('click', () => {
      if (confirm('¿Restablecer el catálogo a las canciones oficiales por defecto?')) {
        this.gameLogic.resetToDefaultPlaylist(this.defaultSongs, false);
        this.dom.startScreen?.classList.remove('visually-hidden');
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

  /**
   * Renderiza las tarjetas de listas populares por temática en YouTube Music dentro del modal.
   * @private
   */
  _renderThematicPlaylists() {
    if (!this.dom.thematicPlaylistsGrid) return;
    this.dom.thematicPlaylistsGrid.innerHTML = '';

    THEMATIC_PLAYLISTS.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'thematic-card';
      card.innerHTML = `
        <div>
          <div class="thematic-card-header">
            <span class="thematic-card-title">${pl.name}</span>
            <span class="brand-badge" style="font-size: 0.65rem;">${pl.badge}</span>
          </div>
          <p class="thematic-card-desc" style="margin-top: 4px;">${pl.description}</p>
        </div>
        <div class="thematic-card-actions">
          <a href="${pl.youtubeUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: var(--color-secondary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Abrir lista en YouTube Music">
            <span>🔗 YouTube Music</span>
          </a>
          <button type="button" class="btn-spotify-subtle btn-load-theme" data-theme-id="${pl.id}" style="padding: 5px 12px; font-size: 0.72rem; border-color: var(--spotify-green); color: var(--spotify-green-light);">
            ▶ Jugar (${pl.songs.length})
          </button>
        </div>
      `;

      const loadBtn = card.querySelector('.btn-load-theme');
      loadBtn?.addEventListener('click', () => {
        this._activateThematicPlaylist(pl.id);
        this._closePlaylistModal();
      });

      this.dom.thematicPlaylistsGrid.appendChild(card);
    });
  }

  /**
   * Activa una lista temática predefinida y actualiza la partida en curso.
   * Si la lista tiene `ordered: true` (ej. Top 100 YouTube), reproduce en orden estricto #1 a #100.
   * @param {string} themeId
   * @private
   */
  _activateThematicPlaylist(themeId) {
    // Actualizar estado activo de las píldoras superiores
    this.dom.themePillsBar?.querySelectorAll('.theme-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.themeId === themeId);
    });

    if (themeId === 'default') {
      this.gameLogic.resetToDefaultPlaylist(this.defaultSongs, true);
      this.announce(`Catálogo Maestro de ${this.defaultSongs.length} canciones y curiosidades activado.`);
    } else {
      const found = THEMATIC_PLAYLISTS.find(p => p.id === themeId);
      if (!found) return;
      this.gameLogic.setCustomPlaylist(found.songs, Boolean(found.ordered), true);
      this.announce(`Lista ${found.name} activada con ${found.songs.length} canciones${found.ordered ? ' en orden estricto del #1 al #100' : ''}.`);
    }

    this._renderPlaylistTable();
    if (this.dom.roundIndicator) {
      const prefix = this.gameLogic.isOrderedMode ? 'Top 100 YT • #1' : 'Pista 1';
      this.dom.roundIndicator.textContent = `${prefix} / ${this.gameState.totalRounds}`;
    }

    // Asegurar que la pantalla de inicio esté oculta
    this.dom.startScreen?.classList.add('visually-hidden');
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
    } else if (this.dom.castModal?.classList.contains('open')) {
      this._closeCastModal();
    } else if (this.dom.gameOverModal?.classList.contains('open')) {
      this.dom.gameOverModal.classList.remove('open');
      this._releaseFocusTrap(this.dom.gameOverModal);
      this.announce('Ventana de resultados cerrada.');
    }
  }

  /**
   * Enlaza eventos para enviar a Chromecast en la misma red Wi-Fi y controlar el Modo Pantalla TV.
   * @private
   */
  _bindCastEvents() {
    this.dom.btnCast?.addEventListener('click', () => {
      this._openCastModal();
    });

    this.dom.btnCloseCast?.addEventListener('click', () => {
      this._closeCastModal();
    });

    this.dom.castModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.castModal) {
        this._closeCastModal();
      }
    });

    this.dom.playlistModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.playlistModal) {
        this._closePlaylistModal();
      }
    });

    this.dom.btnConnectChromecast?.addEventListener('click', async () => {
      if (!this.castManager) return;
      if (this.dom.castStatusText) {
        this.dom.castStatusText.textContent = 'Buscando dispositivos Chromecast en tu red Wi-Fi...';
      }
      const res = await this.castManager.connectToChromecast();
      if (this.dom.castStatusText && res?.message) {
        this.dom.castStatusText.textContent = res.message;
      }
      this.announce(res?.message || 'Estado de Chromecast actualizado');
    });

    const btnAndroid = document.getElementById('btn-android-screen-cast');
    btnAndroid?.addEventListener('click', () => {
      if (this.castManager?.isAndroid) {
        this.castManager.openAndroidScreenCast();
        this.announce('Abriendo Google Home para transmitir pantalla completa al TV.');
      } else {
        alert('En tu móvil, desliza el panel de ajustes rápidos superior y pulsa "Transmitir / Enviar pantalla" (o Smart View) para duplicar la pantalla completa con audio y vídeo en tu TV.');
      }
    });

    this.dom.btnToggleTvMode?.addEventListener('click', () => {
      if (!this.castManager) return;
      const active = this.castManager.toggleTvDisplayMode();
      if (this.dom.btnToggleTvModeText) {
        this.dom.btnToggleTvModeText.textContent = active
          ? '✅ Modo Pantalla TV Activo (Pulsa para salir)'
          : 'Activar Modo Pantalla TV (Salón / Duplicar Pestaña)';
      }
      this.announce(active ? 'Modo Pantalla TV activado' : 'Modo Pantalla TV desactivado');
    });

    if (this.castManager) {
      this.castManager.addEventListener('connectionChange', (e) => {
        const { isConnected, deviceName } = e.detail;
        this.dom.btnCast?.classList.toggle('connected', isConnected);
        if (this.dom.castBtnLabel) {
          this.dom.castBtnLabel.textContent = isConnected ? 'TV ✓' : 'Cast';
        }
        if (this.dom.castStatusDot) {
          this.dom.castStatusDot.classList.toggle('paused', !isConnected);
        }
        if (this.dom.castStatusText) {
          this.dom.castStatusText.textContent = isConnected
            ? `📡 Conectado a "${deviceName}" en la red Wi-Fi`
            : 'Asegúrate de que tu móvil/tablet y el Chromecast estén en la misma red Wi-Fi.';
        }
        if (this.dom.btnConnectChromecastText) {
          this.dom.btnConnectChromecastText.textContent = isConnected
            ? `Desconectar (${deviceName})`
            : 'Buscar Chromecast en mi red Wi-Fi';
        }
      });
    }
  }

  _showTapToPlay() {
    this.dom.btnTapToPlay?.classList.remove('hidden');
    this.announce('El navegador ha pausado el audio. Toca el botón para escuchar la canción.', true);
  }

  _hideTapToPlay() {
    this.dom.btnTapToPlay?.classList.add('hidden');
  }

  _openCastModal() {
    if (this.castManager && this.dom.castStatusText && !this.castManager.isConnected) {
      this.dom.castStatusText.textContent = this.castManager.getSupportSummary();
    }
    this.dom.castModal?.classList.add('open');
    this._trapFocusInModal(this.dom.castModal);
    this.announce('Panel de envío a Chromecast abierto.');
  }

  _closeCastModal() {
    if (this.dom.castModal?.classList.contains('open')) {
      this.dom.castModal.classList.remove('open');
      this._releaseFocusTrap(this.dom.castModal);
      this.announce('Panel de Chromecast cerrado.');
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
      const hasTrivia = Boolean(song.culturalTrivia);
      const rankLabel = song.rank ? `#${song.rank}` : `${idx + 1}`;

      tr.innerHTML = `
        <td style="color: var(--color-text-dim); font-family: var(--font-mono);">${rankLabel}</td>
        <td style="font-weight: 700;">${song.title}</td>
        <td style="color: var(--color-secondary);">${song.artist}</td>
        <td><span class="genre-pill" style="margin: 0; font-size: 0.7rem;">${song.genre || 'General'}</span></td>
        <td style="text-align: center; font-family: var(--font-mono); color: var(--color-secondary);">${song.year || '—'}</td>
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

    this.gameState.addEventListener('timerStateChange', (e) => {
      const { isTimerRunning } = e.detail;
      this._updateTimerControlState(isTimerRunning);
    });
  }

  /**
   * Alterna la expansión del acordeón compacto "Curiosidad Musical".
   * @param {boolean} expanded
   * @private
   */
  _setCuriosityExpanded(expanded) {
    this._isCuriosityExpanded = Boolean(expanded);
    if (this.dom.curiosityBody) {
      this.dom.curiosityBody.hidden = !this._isCuriosityExpanded;
    }
    if (this.dom.btnToggleCuriosity) {
      this.dom.btnToggleCuriosity.setAttribute('aria-expanded', String(this._isCuriosityExpanded));
    }
    if (this.dom.curiosityToggleText) {
      this.dom.curiosityToggleText.textContent = this._isCuriosityExpanded ? 'Ocultar' : 'Ver más';
    }
    if (this.dom.curiosityChevron) {
      this.dom.curiosityChevron.textContent = this._isCuriosityExpanded ? '▴' : '▾';
    }
  }

  /**
   * Actualiza los controles visuales de pre-roll / pausa anti-anuncio y estado del cronómetro.
   * Mientras está en AWAITING_AUDIO (!isTimerRunning), muestra la píldora flotante sobre el reproductor
   * y permite pulsar "Saltar anuncio" manteniendo oculta la franja superior del título.
   * @param {boolean} isTimerRunning
   * @private
   */
  _updateTimerControlState(isTimerRunning) {
    if (this.dom.audioStage) {
      this.dom.audioStage.classList.toggle('ad-skip-mode', !isTimerRunning);
    }
    if (this.dom.timerStatusDot) {
      this.dom.timerStatusDot.classList.toggle('paused', !isTimerRunning);
    }
    if (this.dom.timerStatusLabel) {
      this.dom.timerStatusLabel.textContent = isTimerRunning
        ? '⏱️ Tiempo en marcha (Máx. 2:00)'
        : '⏸️ Pausado por anuncio / carga [Tecla S]';
    }
    if (this.dom.btnStartTimer) {
      this.dom.btnStartTimer.style.display = 'inline-flex';
      this.dom.btnStartTimer.classList.toggle('running', isTimerRunning);
      this.dom.btnStartTimer.textContent = isTimerRunning
        ? '⏸️ Pausar por anuncio'
        : '📢 Anuncio en curso / Pulsa si ya suena la música';
    }

    if (this.dom.stageTitle && this.dom.stageSubtitle && this.gameState.status !== GameStates.ROUND_OVER) {
      if (!isTimerRunning) {
        this.dom.stageTitle.textContent = 'Preparando canción...';
        this.dom.stageSubtitle.textContent = 'Sincronizando audio o esperando fin de anuncio...';
      } else if (this.gameState.gameMode === GameModes.LYRICS) {
        this.dom.stageTitle.textContent = 'Completa la Letra (Listen & Fill)';
        this.dom.stageSubtitle.textContent = 'Escucha el fragmento y selecciona la palabra que falta...';
      } else {
        this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
        this.dom.stageSubtitle.textContent = 'Escucha con atención las frecuencias...';
      }
    }
  }

  _onStateChange(state, payload) {
    switch (state) {
      case GameStates.AWAITING_AUDIO:
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
   * Las 4 opciones de respuesta cambian completamente en cada canción.
   * @private
   */
  _renderPlayingState({ options, roundNumber, totalRounds, isOrderedMode, song }) {
    this._hideTapToPlay();
    this.dom.audioStage?.classList.remove('needs-native-tap');
    this.dom.discoveryPanel?.classList.remove('active');
    this._setCuriosityExpanded(false);
    this.dom.btnNext?.classList.add('hidden');
    this.dom.startScreen?.classList.add('visually-hidden');

    this.dom.statusMsg.textContent = '';
    this.dom.statusMsg.className = 'status-msg';

    // Iniciar en modo espera anti-anuncio para poder saltar la publicidad de YouTube antes de que corra el tiempo
    if (this.dom.audioStage) {
      this.dom.audioStage.classList.remove('revealed');
    }
    this._updateTimerControlState(false);

    if (this.dom.btnYtExternal) {
      this.dom.btnYtExternal.style.display = 'none';
    }

    if (this.dom.btnOpenYtCastApp && song?.youtubeId) {
      this.dom.btnOpenYtCastApp.href = `https://www.youtube.com/watch?v=${song.youtubeId}`;
    }

    if (this.dom.playPauseIcon) {
      this.dom.playPauseIcon.textContent = '⏯';
    }
    if (this.dom.playPauseLabel) {
      this.dom.playPauseLabel.textContent = 'Audio';
    }

    // Sincronizar nueva ronda con Chromecast si está activo en la red Wi-Fi (modo sin spoilers en TV)
    this.castManager?.syncRoundStart({
      song,
      roundNumber,
      totalRounds,
      score: this.gameState.score,
      streak: this.gameState.streak,
      options
    });

    if (this.dom.minimizedTitle) {
      this.dom.minimizedTitle.textContent = '🎧 Modo Audio Puro (Adivinando...)';
      this.dom.minimizedSubtitle.textContent = 'Vídeo y título ocultos para evitar spoilers';
    }

    if (this.dom.roundIndicator) {
      if (isOrderedMode || song?.rank) {
        this.dom.roundIndicator.textContent = `Top 100 YT • #${song?.rank || roundNumber} / ${totalRounds}`;
      } else {
        this.dom.roundIndicator.textContent = `Pista ${roundNumber} / ${totalRounds}`;
      }
    }

    this.dom.stageOverlay.classList.remove('hidden');

    if (this.gameLogic.isTimerRunning) {
      this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
      this.dom.stageSubtitle.textContent = (isOrderedMode && song?.rank)
        ? `Puesto #${song.rank} más reproducido en YouTube (${song.views || 'Top Histórico'})`
        : 'Escucha con atención las frecuencias...';
    } else {
      this.dom.stageTitle.textContent = 'Preparando canción...';
      this.dom.stageSubtitle.textContent = (isOrderedMode && song?.rank)
        ? `Puesto #${song.rank} en YouTube • Sincronizando audio o esperando fin de anuncio...`
        : 'Sincronizando audio o esperando fin de anuncio...';
    }

    this.announce(`Pista ${roundNumber} de ${totalRounds}. Preparando canción. Pulsa S si ya suena la música.`);

    this._updateTimer(this.gameState.maxRoundTime, this.gameState.maxRoundTime);

    // Inyectar las 4 opciones de respuesta en cuadrícula 2x2 con foco visual directo en el título de la canción
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

      let labelHtml = `<span class="option-title-main">${optText}</span>`;
      if (optText.includes(' - ')) {
        const sepIdx = optText.lastIndexOf(' - ');
        const songTitle = optText.slice(0, sepIdx).trim();
        const songArtist = optText.slice(sepIdx + 3).trim();
        labelHtml = `
          <span class="option-title-main">${songTitle}</span>
          <span class="option-artist-sub">${songArtist}</span>
        `;
      }

      btn.innerHTML = `
        <span class="option-key">0${index + 1}</span>
        <span class="option-text">${labelHtml}</span>
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
   * Revela la información de la ronda, habilita el botón CTA "Siguiente Canción" junto al temporizador
   * y muestra la tarjeta horizontal plegable "Curiosidad Musical".
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
          <span>⏰ ¡Tiempo agotado! Respuesta: <strong>"${correctAnswer}"</strong></span>
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
          <span>¡Incorrecto! Era <strong>"${correctAnswer}"</strong> 🎶</span>
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

    // Revelar el vídeo interactivo de YouTube y el botón CTA "Siguiente Canción" junto al temporizador
    if (this.dom.audioStage) {
      this.dom.audioStage.classList.remove('ad-skip-mode');
      this.dom.audioStage.classList.add('revealed');
    }
    if (this.dom.btnStartTimer) {
      this.dom.btnStartTimer.style.display = 'none';
    }
    this.dom.btnNext?.classList.remove('hidden');

    if (this.dom.timerStatusDot) {
      this.dom.timerStatusDot.classList.remove('paused');
    }
    if (this.dom.timerStatusLabel) {
      this.dom.timerStatusLabel.textContent = `🎵 ${song.title} — ${song.artist}`;
    }

    if (this.dom.btnYtExternal) {
      if (song.youtubeId) {
        this.dom.btnYtExternal.href = `https://www.youtube.com/watch?v=${song.youtubeId}`;
        this.dom.btnYtExternal.style.display = 'inline-flex';
      } else {
        this.dom.btnYtExternal.style.display = 'none';
      }
    }

    const triviaText = song.culturalTrivia || `${song.title} es un tema destacado de ${song.artist}.`;
    if (this.dom.genreBadge) {
      this.dom.genreBadge.textContent = song.genre || 'Música';
    }
    if (this.dom.curiosityPreview) {
      this.dom.curiosityPreview.textContent = triviaText;
    }
    if (this.dom.cultureText) {
      this.dom.cultureText.textContent = triviaText;
    }

    this._setCuriosityExpanded(false);
    this.dom.discoveryPanel?.classList.add('active');

    // Sincronizar revelación de canción, carátula y curiosidad musical en la TV / Chromecast
    this.castManager?.syncRoundReveal({
      song,
      isCorrect,
      pointsEarned,
      speedBadge,
      score: this.gameState.score,
      streak: this.gameState.streak,
      correctAnswer
    });
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
      if (remaining <= 10) {
        this.dom.timerBar.classList.add('danger');
      } else if (remaining <= 25) {
        this.dom.timerBar.classList.add('warning');
      }
    }

    if (this.dom.timerText) {
      const mins = Math.floor(remaining / 60);
      const secs = String(remaining % 60).padStart(2, '0');
      this.dom.timerText.textContent = `${mins}:${secs}`;
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
        if (
          this.gameState.status === GameStates.PLAYING ||
          this.gameState.status === GameStates.AWAITING_AUDIO ||
          this.gameState.status === GameStates.ROUND_OVER
        ) {
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

      // Tecla S: Forzar el arranque inmediato del temporizador en 120s exactos cancelando la espera de anuncio
      if (e.key.toLowerCase() === 's') {
        if (
          this.gameState.status === GameStates.AWAITING_AUDIO ||
          (this.gameState.status === GameStates.PLAYING && !this.gameLogic.isTimerRunning)
        ) {
          e.preventDefault();
          this.gameState.startTimer();
          this.announce('Cronómetro iniciado manualmente en 120 segundos exactos.');
        }
        return;
      }

      // Teclas 1, 2, 3, 4 (teclado alfanumérico estándar y numpad)
      const numKeys = {
        '1': 0, 'Digit1': 0, 'Numpad1': 0,
        '2': 1, 'Digit2': 1, 'Numpad2': 1,
        '3': 2, 'Digit3': 2, 'Numpad3': 2,
        '4': 3, 'Digit4': 3, 'Numpad4': 3
      };

      if (numKeys.hasOwnProperty(e.code) || numKeys.hasOwnProperty(e.key)) {
        if (this.gameState.status === GameStates.PLAYING || this.gameState.status === GameStates.AWAITING_AUDIO) {
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

      // Tecla C: Abrir panel de envío a Chromecast / TV
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this._openCastModal();
        return;
      }
    });
  }
}
