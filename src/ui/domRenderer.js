/**
 * @fileoverview Renderizador de interfaz reactivo para SongQuiz con diseño oscuro modular,
 * accesibilidad WCAG 2.1 AA (inert en fondo de modales, WAI-ARIA tabs, alertdialog,
 * focus trap y atajos seguros sin colisión con modificadores), saneamiento XSS
 * y soporte completo para Classic Trivia y Lyrics Challenge con andamiaje progresivo.
 */

import { GameStates, GameModes, LyricsInputLevels } from '../core/gameState.js';
import { fetchPlaylistFromYouTube, parseTextPlaylist } from '../utils/playlistParser.js';
import { THEMATIC_PLAYLISTS } from '../data/thematicPlaylists.js';
import { readStorageRaw, writeStorageJSON, escapeHtml } from '../utils/storageManager.js';
import { auditSongCatalog, sanitizeImportedCatalog } from '../utils/catalogValidator.js';
import { buildScaffoldingHint } from '../core/lyricsChallengeEngine.js';

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

    // Pila de modales activos para focus trap e inert seguro (soporta alertdialog sobre modal)
    this._modalStack = [];
    this._confirmCallback = null;

    // Estado pedagógico de la ronda actual en Lyrics Challenge
    this._lyricsHintLevel = 0;
    this._lyricsEsRevealed = false;
    this._isCuriosityExpanded = false;

    // Estado de minimizado del reproductor (persistido mediante storageManager)
    const rawMin = readStorageRaw('songquiz_player_minimized', 'false');
    this.isPlayerMinimized = rawMin === 'true';

    this._cacheDOMElements();
    this._applyMinimizeState();
    this._bindDOMEvents();
    this._bindStateListeners();
    this._bindKeyboardShortcuts();
    this._bindPlaylistManagerEvents();
    this._bindCastEvents();
    this._bindConfirmDialogEvents();
    this._updateModeButtons();
    this._updateLyricsLevelButtons();
    this._initDeviceView();
  }

  /**
   * Almacena referencias a los nodos del DOM.
   * @private
   */
  _cacheDOMElements() {
    this.dom = {
      appContainer: document.getElementById('app-container') || document.querySelector('.app-container'),
      scoreDisplay: document.getElementById('score-display'),
      streakDisplay: document.getElementById('streak-display'),
      streakChip: document.getElementById('streak-chip'),
      roundIndicator: document.getElementById('round-indicator'),
      btnMute: document.getElementById('btn-mute'),
      btnOpenImporter: document.getElementById('btn-open-importer'),
      deviceSwitcher: document.getElementById('device-switcher'),
      deviceButtons: document.querySelectorAll('.device-btn'),

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

      // Banner de audio no disponible (salto sin penalización)
      audioUnavailableBanner: document.getElementById('audio-unavailable-banner'),
      audioUnavailableReason: document.getElementById('audio-unavailable-reason'),
      btnSkipUnavailable: document.getElementById('btn-skip-unavailable'),

      // Controles y modal de Chromecast / TV
      btnCast: document.getElementById('btn-cast'),
      castBtnLabel: document.getElementById('cast-btn-label'),
      castModal: document.getElementById('cast-modal'),
      btnCloseCast: document.getElementById('btn-close-cast'),
      castStatusBanner: document.getElementById('cast-status-banner'),
      castStatusDot: document.getElementById('cast-status-dot'),
      castStatusText: document.getElementById('cast-status-text'),
      castInlineHint: document.getElementById('cast-inline-hint'),
      btnConnectChromecast: document.getElementById('btn-connect-chromecast'),
      btnConnectChromecastText: document.getElementById('btn-connect-chromecast-text'),
      btnToggleTvMode: document.getElementById('btn-toggle-tv-mode'),
      btnToggleTvModeText: document.getElementById('btn-toggle-tv-mode-text'),
      btnOpenYtCastApp: document.getElementById('btn-open-yt-cast-app'),

      timerBar: document.getElementById('timer-bar-fill'),
      timerText: document.getElementById('timer-text'),

      // Caja de desafío pedagógico Lyrics Challenge
      lyricsChallengeBox: document.getElementById('lyrics-challenge-box'),
      lyricsDifficultyBadge: document.getElementById('lyrics-difficulty-badge'),
      btnLyricsLevelRecognition: document.getElementById('btn-lyrics-level-recognition'),
      btnLyricsLevelGuided: document.getElementById('btn-lyrics-level-guided'),
      btnLyricsRepeatCue: document.getElementById('btn-lyrics-repeat-cue'),
      btnLyricsHintEs: document.getElementById('btn-lyrics-hint-es'),
      btnLyricsHintLetters: document.getElementById('btn-lyrics-hint-letters'),
      verseEnglishText: document.getElementById('verse-english-text'),
      verseSpanishTranslation: document.getElementById('verse-spanish-translation'),
      lyricsLinguisticNote: document.getElementById('lyrics-linguistic-note'),
      lyricsInputRow: document.getElementById('lyrics-input-row'),
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
      playlistJsonFeedback: document.getElementById('playlist-json-feedback'),
      btnApplyCustomJson: document.getElementById('btn-apply-custom-json'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnResetDefaultSongs: document.getElementById('btn-reset-default-songs'),
      playlistCountBadge: document.getElementById('playlist-count-badge'),

      // Diálogo accesible de confirmación (reemplaza window.confirm)
      confirmDialogModal: document.getElementById('confirm-dialog-modal'),
      confirmDialogTitle: document.getElementById('confirm-dialog-title'),
      confirmDialogMessage: document.getElementById('confirm-dialog-message'),
      btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
      btnConfirmAccept: document.getElementById('btn-confirm-accept')
    };
  }

  /**
   * Devuelve el modal en la cima de la pila o null.
   * @private
   */
  get _activeModal() {
    return this._modalStack.length > 0 ? this._modalStack[this._modalStack.length - 1].element : null;
  }

  /**
   * Aplica el estado visual de minimizado en el escenario del reproductor.
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
   * Comunica mensajes a lectores de pantalla mediante ARIA Live.
   * @param {string} message
   * @param {boolean} [isAlert=false]
   */
  announce(message, isAlert = false) {
    const region = isAlert ? this.dom.a11yAlert : this.dom.a11yAnnouncer;
    if (!region) return;

    region.textContent = '';
    setTimeout(() => {
      region.textContent = message;
    }, 60);
  }

  /**
   * Muestra un aviso inline accesible (reemplazo de window.alert).
   * @param {HTMLElement|null} el
   * @param {string} message
   * @param {'error'|'warning'|'success'} [tone='warning']
   * @private
   */
  _showInlineFeedback(el, message, tone = 'warning') {
    if (!el) return;
    el.textContent = message;
    el.className = `inline-feedback-banner ${tone}`;
    el.classList.remove('hidden');
    this.announce(message, tone === 'error');
  }

  /**
   * Oculta un aviso inline.
   * @param {HTMLElement|null} el
   * @private
   */
  _hideInlineFeedback(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
  }

  /**
   * Enlaza eventos del diálogo accesible `role="alertdialog"`.
   * @private
   */
  _bindConfirmDialogEvents() {
    this.dom.btnConfirmCancel?.addEventListener('click', () => {
      this._closeConfirmDialog();
    });

    this.dom.btnConfirmAccept?.addEventListener('click', () => {
      const cb = this._confirmCallback;
      this._closeConfirmDialog();
      if (typeof cb === 'function') cb();
    });

    this.dom.confirmDialogModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.confirmDialogModal) {
        this._closeConfirmDialog();
      }
    });
  }

  /**
   * Abre un diálogo de confirmación accesible (reemplaza window.confirm).
   * @param {{ title: string, message: string, confirmLabel?: string, onConfirm: () => void }} config
   * @private
   */
  _openConfirmDialog({ title, message, confirmLabel = 'Confirmar', onConfirm }) {
    if (!this.dom.confirmDialogModal) return;
    this._confirmCallback = onConfirm;
    if (this.dom.confirmDialogTitle) this.dom.confirmDialogTitle.textContent = title;
    if (this.dom.confirmDialogMessage) this.dom.confirmDialogMessage.textContent = message;
    if (this.dom.btnConfirmAccept) this.dom.btnConfirmAccept.textContent = confirmLabel;

    this.dom.confirmDialogModal.classList.add('open');
    this._trapFocusInModal(this.dom.confirmDialogModal);
    this.announce(`${title}. ${message}`, true);
  }

  _closeConfirmDialog() {
    this._confirmCallback = null;
    if (this.dom.confirmDialogModal?.classList.contains('open')) {
      this.dom.confirmDialogModal.classList.remove('open');
      this._releaseFocusTrap(this.dom.confirmDialogModal);
    }
  }

  /**
   * Enlaza eventos de clic de los botones principales, selector de modos y Lyrics Challenge.
   * @private
   */
  _bindDOMEvents() {
    this.dom.btnStart?.addEventListener('click', () => {
      this.dom.startScreen?.classList.add('visually-hidden');
      this.gameLogic.startRound();
    });

    this.dom.btnNext?.addEventListener('click', () => {
      this.gameLogic.nextRound();
    });

    this.dom.btnSkipUnavailable?.addEventListener('click', () => {
      this._hideAudioUnavailableBanner();
      this.announce('Pista saltada sin penalización.');
      this.gameLogic.skipRoundWithoutPenalty();
    });

    this.dom.btnToggleCuriosity?.addEventListener('click', () => {
      this._setCuriosityExpanded(!this._isCuriosityExpanded);
    });

    this.dom.btnRestart?.addEventListener('click', () => {
      this._releaseFocusTrap(this.dom.gameOverModal);
      this.dom.gameOverModal?.classList.remove('open');
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
      writeStorageJSON('songquiz_player_minimized', this.isPlayerMinimized);
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

    // Desbloqueo de reproducción en Chrome móvil
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
        this._hideAudioUnavailableBanner();
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

    // Selector de modo de juego (Classic vs Lyrics Challenge con carga diferida)
    this.dom.btnModeClassic?.addEventListener('click', async () => {
      if (this.gameState.gameMode !== GameModes.CLASSIC) {
        const res = await this.gameLogic.switchGameMode(GameModes.CLASSIC);
        this._updateModeButtons();
        if (res.ok) {
          this.announce(`Modo Classic Trivia activado con ${res.trackCount} canciones.`);
        }
      }
    });

    this.dom.btnModeLyrics?.addEventListener('click', async () => {
      if (this.gameState.gameMode !== GameModes.LYRICS) {
        const res = await this.gameLogic.switchGameMode(GameModes.LYRICS);
        this._updateModeButtons();
        if (res.ok) {
          this.announce(`Modo Lyrics Challenge activado con ${res.trackCount} retos de letras en inglés.`);
        } else {
          this.announce(`No se pudo activar Lyrics Challenge: ${res.error || 'Error al cargar banco de letras.'}`, true);
        }
      }
    });

    // Andamiaje progresivo de Lyrics Challenge: nivel reconocimiento vs escritura guiada
    this.dom.btnLyricsLevelRecognition?.addEventListener('click', () => {
      this.gameState.setLyricsLevel(LyricsInputLevels.RECOGNITION);
      this._updateLyricsLevelButtons();
      this._applyLyricsLevelLayout();
      this.announce('Nivel Opciones activado: selecciona entre 4 palabras.');
    });

    this.dom.btnLyricsLevelGuided?.addEventListener('click', () => {
      this.gameState.setLyricsLevel(LyricsInputLevels.GUIDED);
      this._updateLyricsLevelButtons();
      this._applyLyricsLevelLayout();
      this.dom.lyricsInputField?.focus();
      this.announce('Nivel Escritura guiada activado: escribe la palabra que falta en inglés.');
    });

    this.dom.btnLyricsRepeatCue?.addEventListener('click', () => {
      this.gameLogic.repeatLyricsCue();
      this.announce('Repitiendo fragmento del verso.');
    });

    this.dom.btnLyricsHintEs?.addEventListener('click', () => {
      if (!this.gameState.lyricsChallengeData) return;
      this._lyricsEsRevealed = !this._lyricsEsRevealed;
      this.dom.verseSpanishTranslation?.classList.toggle('hidden', !this._lyricsEsRevealed);
      this.dom.btnLyricsHintEs?.setAttribute('aria-pressed', String(this._lyricsEsRevealed));
      if (this._lyricsEsRevealed) {
        this.announce(`Traducción en español: ${this.gameState.lyricsChallengeData.verseEs}`);
      }
    });

    this.dom.btnLyricsHintLetters?.addEventListener('click', () => {
      const ld = this.gameState.lyricsChallengeData;
      if (!ld || this.gameState.status === GameStates.ROUND_OVER) return;
      this._lyricsHintLevel = Math.min(2, this._lyricsHintLevel + 1);
      const hintMask = buildScaffoldingHint(ld.targetWord, /** @type {1|2} */ (this._lyricsHintLevel));
      const blankEl = document.getElementById('lyrics-blank-token');
      if (blankEl) {
        blankEl.textContent = hintMask;
      }
      if (this.dom.btnLyricsHintLetters) {
        this.dom.btnLyricsHintLetters.textContent = this._lyricsHintLevel >= 2 ? '💡 Pista máx.' : '💡 Más pista';
        this.dom.btnLyricsHintLetters.disabled = this._lyricsHintLevel >= 2;
      }
      this.announce(`Pista nivel ${this._lyricsHintLevel}: ${hintMask}`);
    });

    // Envío por teclado en Lyrics Challenge
    const submitTypedAnswer = () => {
      const val = this.dom.lyricsInputField?.value.trim();
      if (val && (this.gameState.status === GameStates.PLAYING || this.gameState.status === GameStates.AWAITING_AUDIO)) {
        const hintsUsed = this._lyricsHintLevel + (this._lyricsEsRevealed ? 1 : 0);
        this.gameLogic.submitAnswer(val, { hintsUsed });
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
   * Actualiza los botones del nivel de andamiaje de Lyrics Challenge.
   * @private
   */
  _updateLyricsLevelButtons() {
    const isRecognition = this.gameState.lyricsLevel === LyricsInputLevels.RECOGNITION;
    if (this.dom.btnLyricsLevelRecognition) {
      this.dom.btnLyricsLevelRecognition.classList.toggle('active', isRecognition);
      this.dom.btnLyricsLevelRecognition.setAttribute('aria-checked', String(isRecognition));
    }
    if (this.dom.btnLyricsLevelGuided) {
      this.dom.btnLyricsLevelGuided.classList.toggle('active', !isRecognition);
      this.dom.btnLyricsLevelGuided.setAttribute('aria-checked', String(!isRecognition));
    }
  }

  /**
   * Muestra u oculta la cuadrícula de opciones o el campo de escritura guiada según el nivel activo.
   * @private
   */
  _applyLyricsLevelLayout() {
    const isLyricsActive = this.gameState.gameMode === GameModes.LYRICS && Boolean(this.gameState.lyricsChallengeData);
    if (!isLyricsActive) {
      this.dom.lyricsChallengeBox?.classList.add('hidden');
      this.dom.lyricsInputRow?.classList.add('hidden');
      this.dom.optionsGrid?.classList.remove('hidden');
      return;
    }

    this.dom.lyricsChallengeBox?.classList.remove('hidden');
    const isGuided = this.gameState.lyricsLevel === LyricsInputLevels.GUIDED;
    this.dom.lyricsInputRow?.classList.toggle('hidden', !isGuided);
    this.dom.optionsGrid?.classList.toggle('hidden', isGuided);
  }

  /**
   * Inicializa el simulador de dispositivos interactivo (PC / Tablet / Móvil).
   * @private
   */
  _initDeviceView() {
    const rawSaved = readStorageRaw('songquiz_device_view', 'pc').replace(/^"|"$/g, '');
    this._setDeviceView(rawSaved || 'pc', false);

    this.dom.deviceButtons?.forEach(btn => {
      btn.addEventListener('click', () => {
        const dev = btn.dataset.device;
        if (dev) {
          this._setDeviceView(dev, true);
        }
      });
    });
  }

  /**
   * Aplica el modo de visualización de pantalla al contenedor principal.
   * @param {'pc'|'tablet'|'mobile'} mode
   * @param {boolean} [notify=true]
   * @private
   */
  _setDeviceView(mode, notify = true) {
    const validModes = ['pc', 'tablet', 'mobile'];
    const currentMode = validModes.includes(mode) ? mode : 'pc';

    document.body.setAttribute('data-device-view', currentMode);

    this.dom.deviceButtons?.forEach(btn => {
      const isActive = btn.dataset.device === currentMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });

    writeStorageJSON('songquiz_device_view', currentMode);

    if (notify) {
      const labels = {
        pc: 'Modo PC / Pantalla Completa activado',
        tablet: 'Modo Tablet (768px) activado',
        mobile: 'Modo Móvil (390px) activado'
      };
      this.announce(labels[currentMode] || currentMode);
    }
  }

  /**
   * Alterna cíclicamente entre PC -> Tablet -> Móvil (atajo tecla D).
   * @private
   */
  _cycleDeviceView() {
    const modes = ['pc', 'tablet', 'mobile'];
    const current = document.body.getAttribute('data-device-view') || 'pc';
    const nextIdx = (modes.indexOf(current) + 1) % modes.length;
    this._setDeviceView(modes[nextIdx], true);
  }

  /**
   * Gestión del modal importador de playlist con WAI-ARIA tabs, validación y avisos inline.
   * @private
   */
  _bindPlaylistManagerEvents() {
    this._renderThematicPlaylists();

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

        const storageRes = this.gameLogic.setCustomPlaylist(songs, false, false);
        this._renderPlaylistTable();
        const quotaNote = storageRes.errorCode === 'QUOTA_EXCEEDED'
          ? ' (Aviso: cuota de almacenamiento llena; activa solo en esta sesión).'
          : '';
        this.announce(`Lista importada con éxito: ${songs.length} pistas activadas.${quotaNote}`);

        if (this.dom.importProgressStatus) {
          this.dom.importProgressStatus.textContent = `✅ ¡Éxito! ${songs.length} pistas extraídas y activadas.${quotaNote}`;
          this.dom.importProgressStatus.style.color = storageRes.ok ? 'var(--spotify-green)' : 'var(--color-warning)';
        }

        setTimeout(() => {
          this._closePlaylistModal();
          this.dom.startScreen?.classList.remove('visually-hidden');
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
        this.dom.btnFetchYoutubePlaylist.textContent = '⬇️ Extraer y Activar';
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

    // Validación con catalogValidator.js y avisos inline (sin window.alert)
    this.dom.btnApplyCustomJson?.addEventListener('click', () => {
      this._hideInlineFeedback(this.dom.playlistJsonFeedback);
      try {
        const text = this.dom.playlistJsonInput?.value.trim() || '';
        if (!text) {
          this._showInlineFeedback(
            this.dom.playlistJsonFeedback,
            'Introduce un array JSON o líneas con el formato "Artista - Título".',
            'warning'
          );
          return;
        }

        let parsed = [];
        let strictAudit = null;
        if (text.startsWith('[')) {
          parsed = JSON.parse(text);
          strictAudit = auditSongCatalog(parsed, { strictSchema: true, requireYoutubeId: false });
        } else {
          parsed = parseTextPlaylist(text);
        }

        const { songs: sanitized, report } = sanitizeImportedCatalog(parsed);
        if (sanitized.length === 0 || !report.isValid) {
          const detail = (strictAudit?.errors?.length ? strictAudit.errors : report.errors).slice(0, 3).join(' ');
          this._showInlineFeedback(
            this.dom.playlistJsonFeedback,
            `Catálogo no válido: ${detail || 'no se detectaron canciones válidas.'}`,
            'error'
          );
          return;
        }

        const storageRes = this.gameLogic.setCustomPlaylist(sanitized, false, false);
        this._renderPlaylistTable();

        if (storageRes.errorCode === 'QUOTA_EXCEEDED') {
          this._showInlineFeedback(
            this.dom.playlistJsonFeedback,
            `Lista activada con ${sanitized.length} canciones en memoria de sesión (localStorage superó su cuota).`,
            'warning'
          );
        } else if (strictAudit && strictAudit.warnings.length > 0) {
          this._showInlineFeedback(
            this.dom.playlistJsonFeedback,
            `Lista guardada con ${sanitized.length} canciones (${strictAudit.warnings.length} avisos menores de calidad).`,
            'success'
          );
        } else {
          this._closePlaylistModal();
        }

        this.dom.startScreen?.classList.remove('visually-hidden');
        this.announce(`Lista personalizada activada con ${sanitized.length} canciones.`);
      } catch (err) {
        this._showInlineFeedback(
          this.dom.playlistJsonFeedback,
          `Error al procesar el catálogo: ${err.message}`,
          'error'
        );
      }
    });

    // Confirmación accesible role="alertdialog" (sin window.confirm)
    this.dom.btnResetDefaultSongs?.addEventListener('click', () => {
      this._openConfirmDialog({
        title: 'Restablecer catálogo oficial',
        message: 'Se eliminará la lista personalizada guardada localmente y volverá a activarse el catálogo oficial verificado.',
        confirmLabel: 'Sí, restablecer',
        onConfirm: () => {
          this.gameLogic.resetToDefaultPlaylist(this.defaultSongs, false);
          this.dom.startScreen?.classList.remove('visually-hidden');
          this._renderPlaylistTable();
          this.announce('Catálogo restablecido al oficial por defecto.');
        }
      });
    });

    // WAI-ARIA Tabs (clic + teclado ArrowLeft/ArrowRight/Home/End)
    const tabBtns = Array.from(document.querySelectorAll('.playlist-tab-btn'));
    const activateTab = (targetBtn, shouldFocus = false) => {
      const targetPanelId = targetBtn.dataset.tab;
      tabBtns.forEach((btn) => {
        const isSelected = btn === targetBtn;
        btn.classList.toggle('active', isSelected);
        btn.setAttribute('aria-selected', String(isSelected));
        btn.setAttribute('tabindex', isSelected ? '0' : '-1');
      });

      document.querySelectorAll('.playlist-tab-content').forEach((panel) => {
        panel.hidden = panel.id !== targetPanelId;
      });

      if (shouldFocus) {
        targetBtn.focus();
      }
    };

    tabBtns.forEach((btn, idx) => {
      btn.addEventListener('click', () => activateTab(btn, false));
      btn.addEventListener('keydown', (e) => {
        let nextIdx = idx;
        if (e.key === 'ArrowRight') {
          nextIdx = (idx + 1) % tabBtns.length;
        } else if (e.key === 'ArrowLeft') {
          nextIdx = (idx - 1 + tabBtns.length) % tabBtns.length;
        } else if (e.key === 'Home') {
          nextIdx = 0;
        } else if (e.key === 'End') {
          nextIdx = tabBtns.length - 1;
        } else {
          return;
        }
        e.preventDefault();
        activateTab(tabBtns[nextIdx], true);
      });
    });
  }

  /**
   * Renderiza las tarjetas de listas temáticas con escape XSS estricto.
   * @private
   */
  _renderThematicPlaylists() {
    if (!this.dom.thematicPlaylistsGrid) return;
    this.dom.thematicPlaylistsGrid.innerHTML = '';

    THEMATIC_PLAYLISTS.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'thematic-card';

      const safeUrl = /^https?:\/\//i.test(pl.youtubeUrl || '') ? pl.youtubeUrl : '#';
      card.innerHTML = `
        <div>
          <div class="thematic-card-header">
            <span class="thematic-card-title">${escapeHtml(pl.name)}</span>
            <span class="brand-badge" style="font-size: 0.65rem;">${escapeHtml(pl.badge)}</span>
          </div>
          <p class="thematic-card-desc" style="margin-top: 4px;">${escapeHtml(pl.description)}</p>
        </div>
        <div class="thematic-card-actions">
          <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: var(--color-secondary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Abrir lista en YouTube Music">
            <span>🔗 YouTube Music</span>
          </a>
          <button type="button" class="btn-spotify-subtle btn-load-theme" data-theme-id="${escapeHtml(pl.id)}" style="padding: 5px 12px; font-size: 0.72rem; border-color: var(--spotify-green); color: var(--spotify-green-light);">
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
   * @param {string} themeId
   * @private
   */
  _activateThematicPlaylist(themeId) {
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

    this.dom.startScreen?.classList.add('visually-hidden');
  }

  _openPlaylistModal() {
    this._renderPlaylistTable();
    this._hideInlineFeedback(this.dom.playlistJsonFeedback);
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
    if (this.dom.confirmDialogModal?.classList.contains('open')) {
      this._closeConfirmDialog();
    } else if (this.dom.playlistModal?.classList.contains('open')) {
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
   * Enlaza eventos para Chromecast y Modo Pantalla TV sin window.alert.
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
        this._showInlineFeedback(
          this.dom.castInlineHint,
          'En tu móvil, desliza el panel de ajustes rápidos superior y pulsa "Transmitir / Enviar pantalla" (o Smart View) para duplicar audio y vídeo en tu TV.',
          'warning'
        );
      }
    });

    this.dom.btnToggleTvMode?.addEventListener('click', () => {
      if (!this.castManager) return;
      const active = this.castManager.toggleTvDisplayMode();
      if (this.dom.btnToggleTvModeText) {
        this.dom.btnToggleTvModeText.textContent = active
          ? '✅ Modo Pantalla TV Activo (Pulsa para salir)'
          : 'Activar Modo Pantalla TV (Salón)';
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
            : 'Conectar Marcador Chromecast (Wi-Fi)';
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

  _showAudioUnavailableBanner(reason) {
    if (this.dom.audioUnavailableReason) {
      this.dom.audioUnavailableReason.textContent = reason;
    }
    this.dom.audioUnavailableBanner?.classList.remove('hidden');
    this.announce(`${reason} Puedes saltar esta pista sin penalización.`, true);
  }

  _hideAudioUnavailableBanner() {
    this.dom.audioUnavailableBanner?.classList.add('hidden');
  }

  _openCastModal() {
    this._hideInlineFeedback(this.dom.castInlineHint);
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
   * Implementa atrapamiento de foco (Focus Trap) y aplica `inert = true` en `.app-container` (WCAG 2.1 AA).
   * @private
   * @param {HTMLElement|null} modalElement
   */
  _trapFocusInModal(modalElement) {
    if (!modalElement) return;

    // Si había un modal inferior abierto, marcarlo como inert temporalmente
    const prevTop = this._modalStack[this._modalStack.length - 1];
    if (prevTop?.element && prevTop.element !== modalElement) {
      prevTop.element.inert = true;
    }

    if (this.dom.appContainer) {
      this.dom.appContainer.inert = true;
    }

    const previousFocusedElement = document.activeElement;

    const getFocusables = () => {
      return Array.from(modalElement.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null && !el.closest('[hidden]'));
    };

    const focusables = getFocusables();
    if (focusables.length > 0) {
      setTimeout(() => focusables[0].focus(), 50);
    }

    const keyHandler = (e) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
        } else if (document.activeElement === last || !modalElement.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modalElement.addEventListener('keydown', keyHandler);
    this._modalStack.push({ element: modalElement, keyHandler, previousFocusedElement });
  }

  /**
   * Libera el atrapamiento de foco, restaura `inert = false` cuando no quedan modales
   * y devuelve el foco al elemento disparador.
   * @private
   * @param {HTMLElement|null} modalElement
   */
  _releaseFocusTrap(modalElement) {
    const idx = this._modalStack.findIndex(item => item.element === modalElement);
    if (idx === -1) return;

    const [entry] = this._modalStack.splice(idx, 1);
    entry.element.removeEventListener('keydown', entry.keyHandler);
    entry.element.inert = false;

    const newTop = this._modalStack[this._modalStack.length - 1];
    if (newTop?.element) {
      newTop.element.inert = false;
    } else if (this.dom.appContainer) {
      this.dom.appContainer.inert = false;
    }

    if (entry.previousFocusedElement && typeof entry.previousFocusedElement.focus === 'function') {
      entry.previousFocusedElement.focus();
    }
  }

  /**
   * Renderiza la tabla de canciones activas escapando cada celda contra XSS.
   * @private
   */
  _renderPlaylistTable() {
    if (!this.dom.playlistTableBody) return;
    this.dom.playlistTableBody.innerHTML = '';
    const songs = this.gameLogic.allSongs;

    if (this.dom.playlistCountBadge) {
      this.dom.playlistCountBadge.textContent = `${songs.length} canciones`;
    }

    const fragment = document.createDocumentFragment();
    songs.forEach((song, idx) => {
      const tr = document.createElement('tr');
      const hasTrivia = Boolean(song.culturalTrivia);
      const rankLabel = song.rank ? `#${song.rank}` : `${idx + 1}`;

      tr.innerHTML = `
        <td style="color: var(--color-text-dim); font-family: var(--font-mono);">${escapeHtml(rankLabel)}</td>
        <td style="font-weight: 700;">${escapeHtml(song.title)}</td>
        <td style="color: var(--color-secondary);">${escapeHtml(song.artist)}</td>
        <td><span class="genre-pill" style="margin: 0; font-size: 0.7rem;">${escapeHtml(song.genre || 'General')}</span></td>
        <td style="text-align: center; font-family: var(--font-mono); color: var(--color-secondary);">${escapeHtml(song.year || '—')}</td>
        <td style="text-align: center;">${hasTrivia ? '✅' : '⚠️'}</td>
      `;
      fragment.appendChild(tr);
    });
    this.dom.playlistTableBody.appendChild(fragment);
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

    this.gameState.addEventListener('lyricsLevelChange', () => {
      this._updateLyricsLevelButtons();
      this._applyLyricsLevelLayout();
    });

    this.gameState.addEventListener('audioUnavailable', (e) => {
      const { reason } = e.detail || {};
      this._showAudioUnavailableBanner(reason || 'No se pudo reproducir el audio oficial de esta pista.');
    });

    this.gameState.addEventListener('timeTick', (e) => {
      const { timeRemaining, maxTime } = e.detail;
      this._updateTimer(timeRemaining, maxTime);

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
   * Actualiza controles visuales de pre-roll / pausa y estado del cronómetro.
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
        this.dom.stageTitle.textContent = 'Completa la Letra (Lyrics Challenge)';
        this.dom.stageSubtitle.textContent = 'Escucha el verso y completa la palabra en inglés que falta...';
      } else {
        this.dom.stageTitle.textContent = '¿Qué canción está sonando?';
        this.dom.stageSubtitle.textContent = 'Escucha con atención las frecuencias...';
      }
    }
  }

  _onStateChange(state, payload) {
    // Las transiciones exclusivas de temporizador no deben redibujar opciones ni resetear pistas
    if (payload?.timerOnly) {
      return;
    }

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

      case GameStates.IDLE:
        this._hideAudioUnavailableBanner();
        break;
    }
  }

  /**
   * Renderiza el bloque pedagógico de Lyrics Challenge con escape XSS estricto.
   * @param {Object|null} lyricsData
   * @private
   */
  _renderLyricsChallengeBox(lyricsData) {
    this._lyricsHintLevel = 0;
    this._lyricsEsRevealed = false;

    if (!lyricsData || this.gameState.gameMode !== GameModes.LYRICS) {
      this._applyLyricsLevelLayout();
      return;
    }

    if (this.dom.lyricsDifficultyBadge) {
      this.dom.lyricsDifficultyBadge.textContent = lyricsData.difficulty || 'B1';
    }

    if (this.dom.verseEnglishText) {
      const parts = String(lyricsData.verseEn || '').split('{{blank}}');
      if (parts.length >= 2) {
        const prefix = escapeHtml(parts[0]);
        const suffix = escapeHtml(parts.slice(1).join(''));
        this.dom.verseEnglishText.innerHTML = `${prefix}<span id="lyrics-blank-token" class="lyrics-blank-token">____</span>${suffix}`;
      } else {
        this.dom.verseEnglishText.textContent = lyricsData.verseEn || '';
      }
    }

    if (this.dom.verseSpanishTranslation) {
      this.dom.verseSpanishTranslation.textContent = `🇪🇸 ${lyricsData.verseEs || ''}`;
      this.dom.verseSpanishTranslation.classList.add('hidden');
    }

    if (this.dom.lyricsLinguisticNote) {
      this.dom.lyricsLinguisticNote.textContent = '';
      this.dom.lyricsLinguisticNote.classList.add('hidden');
    }

    if (this.dom.btnLyricsHintEs) {
      this.dom.btnLyricsHintEs.setAttribute('aria-pressed', 'false');
    }

    if (this.dom.btnLyricsHintLetters) {
      this.dom.btnLyricsHintLetters.textContent = '💡 Pista';
      this.dom.btnLyricsHintLetters.disabled = false;
    }

    if (this.dom.lyricsInputField) {
      this.dom.lyricsInputField.value = '';
      this.dom.lyricsInputField.disabled = false;
    }

    if (this.dom.btnLyricsSubmit) {
      this.dom.btnLyricsSubmit.disabled = false;
    }

    this._applyLyricsLevelLayout();
  }

  /**
   * Configura la interfaz al iniciar una ronda activa con accesibilidad WAI-ARIA y escape XSS.
   * @private
   */
  _renderPlayingState({ options = [], roundNumber, totalRounds, isOrderedMode, song, lyricsData = null, gameMode }) {
    this._hideTapToPlay();
    this._hideAudioUnavailableBanner();
    this.dom.audioStage?.classList.remove('needs-native-tap');
    this.dom.discoveryPanel?.classList.remove('active');
    this._setCuriosityExpanded(false);
    this.dom.btnNext?.classList.add('hidden');
    this.dom.startScreen?.classList.add('visually-hidden');

    if (this.dom.statusMsg) {
      this.dom.statusMsg.textContent = '';
      this.dom.statusMsg.className = 'status-msg';
    }

    if (this.dom.audioStage) {
      this.dom.audioStage.classList.remove('revealed');
    }
    this._updateTimerControlState(false);

    if (this.dom.btnYtExternal) {
      this.dom.btnYtExternal.style.display = 'none';
    }

    if (this.dom.btnOpenYtCastApp && song?.youtubeId) {
      this.dom.btnOpenYtCastApp.href = `https://www.youtube.com/watch?v=${encodeURIComponent(song.youtubeId)}`;
    }

    if (this.dom.playPauseIcon) {
      this.dom.playPauseIcon.textContent = '⏯';
    }
    if (this.dom.playPauseLabel) {
      this.dom.playPauseLabel.textContent = 'Audio';
    }

    this.castManager?.syncRoundStart({
      song,
      roundNumber,
      totalRounds,
      score: this.gameState.score,
      streak: this.gameState.streak,
      options
    });

    if (this.dom.minimizedTitle && this.dom.minimizedSubtitle) {
      this.dom.minimizedTitle.textContent = '🎧 Modo Audio Puro (Adivinando...)';
      this.dom.minimizedSubtitle.textContent = 'Vídeo y título ocultos para evitar spoilers';
    }

    if (this.dom.roundIndicator) {
      if (gameMode === GameModes.LYRICS) {
        this.dom.roundIndicator.textContent = `Lyrics ${roundNumber} / ${totalRounds}`;
      } else if (isOrderedMode || song?.rank) {
        this.dom.roundIndicator.textContent = `Top 100 YT • #${song?.rank || roundNumber} / ${totalRounds}`;
      } else {
        this.dom.roundIndicator.textContent = `Pista ${roundNumber} / ${totalRounds}`;
      }
    }

    this.dom.stageOverlay?.classList.remove('hidden');

    if (this.dom.stageTitle && this.dom.stageSubtitle) {
      if (this.gameLogic.isTimerRunning) {
        this.dom.stageTitle.textContent = gameMode === GameModes.LYRICS
          ? 'Completa la Letra (Lyrics Challenge)'
          : '¿Qué canción está sonando?';
        this.dom.stageSubtitle.textContent = (isOrderedMode && song?.rank)
          ? `Puesto #${song.rank} más reproducido en YouTube (${song.views || 'Top Histórico'})`
          : 'Escucha con atención...';
      } else {
        this.dom.stageTitle.textContent = 'Preparando canción...';
        this.dom.stageSubtitle.textContent = (isOrderedMode && song?.rank)
          ? `Puesto #${song.rank} en YouTube • Sincronizando audio o esperando fin de anuncio...`
          : 'Sincronizando audio o esperando fin de anuncio...';
      }
    }

    this.announce(`Pista ${roundNumber} de ${totalRounds}. Preparando canción. Pulsa S si ya suena la música.`);
    this._updateTimer(this.gameState.maxRoundTime, this.gameState.maxRoundTime);

    // Renderizar Lyrics Challenge si corresponde
    this._renderLyricsChallengeBox(lyricsData);

    // Inyectar las 4 opciones de respuesta en cuadrícula 2x2 con escape XSS estricto
    if (!this.dom.optionsGrid) return;
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

      let labelHtml = `<span class="option-title-main">${escapeHtml(optText)}</span>`;
      if (optText.includes(' - ')) {
        const sepIdx = optText.lastIndexOf(' - ');
        const songTitle = optText.slice(0, sepIdx).trim();
        const songArtist = optText.slice(sepIdx + 3).trim();
        labelHtml = `
          <span class="option-title-main">${escapeHtml(songTitle)}</span>
          <span class="option-artist-sub">${escapeHtml(songArtist)}</span>
        `;
      }

      btn.innerHTML = `
        <span class="option-key">0${index + 1}</span>
        <span class="option-text">${labelHtml}</span>
      `;

      btn.addEventListener('click', () => {
        this._selectOption(btn, optText);
      });

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
    const hintsUsed = this.gameState.gameMode === GameModes.LYRICS
      ? this._lyricsHintLevel + (this._lyricsEsRevealed ? 1 : 0)
      : 0;
    this.gameLogic.submitAnswer(optText, { hintsUsed });
  }

  /**
   * Revela la información de la ronda, nota lingüística y curiosidad musical escapando todo HTML.
   * @private
   */
  _renderRoundOverState({
    selectedOption,
    isCorrect,
    correctAnswer,
    song,
    pointsEarned,
    speedBonus = 0,
    speedBadge = '',
    multiplier = 1,
    isTimeout,
    gameMode,
    lyricsData,
    evaluation
  }) {
    this._hideAudioUnavailableBanner();

    const buttons = this.dom.optionsGrid?.querySelectorAll('.option-btn') || [];
    const norm = (s) => String(s || '').trim().toLowerCase();

    buttons.forEach((btn) => {
      btn.disabled = true;
      const opt = norm(btn.dataset.option);
      if (opt === norm(correctAnswer)) {
        btn.classList.add('correct');
        btn.setAttribute('aria-checked', 'true');
      } else if (opt === norm(selectedOption) && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    if (this.dom.lyricsInputField) {
      this.dom.lyricsInputField.disabled = true;
    }
    if (this.dom.btnLyricsSubmit) {
      this.dom.btnLyricsSubmit.disabled = true;
    }
    if (this.dom.btnLyricsHintLetters) {
      this.dom.btnLyricsHintLetters.disabled = true;
    }

    const blankEl = document.getElementById('lyrics-blank-token');
    if (blankEl) {
      blankEl.textContent = correctAnswer;
      blankEl.className = isCorrect ? 'lyrics-blank-token revealed-correct' : 'lyrics-blank-token revealed-wrong';
    }

    // Revelar siempre la traducción al español y la nota lingüística al terminar ronda en Lyrics Challenge
    if (gameMode === GameModes.LYRICS && lyricsData) {
      this.dom.verseSpanishTranslation?.classList.remove('hidden');
      if (this.dom.lyricsLinguisticNote && lyricsData.linguisticNote) {
        this.dom.lyricsLinguisticNote.textContent = `📚 Clave lingüística: ${lyricsData.linguisticNote}`;
        this.dom.lyricsLinguisticNote.classList.remove('hidden');
      }
    }

    const safeCorrect = escapeHtml(correctAnswer);
    const safeSpeedBadge = escapeHtml(speedBadge);

    if (this.dom.statusMsg) {
      if (isTimeout) {
        this.dom.statusMsg.innerHTML = `
          <div class="score-feedback-card wrong">
            <span>⏰ ¡Tiempo agotado! Respuesta: <strong>"${safeCorrect}"</strong></span>
          </div>
        `;
        this.announce(`Tiempo agotado. La respuesta correcta era: ${correctAnswer}. Pulsa Enter para pasar a la siguiente pista.`, true);
      } else if (isCorrect) {
        const evalHeadline = evaluation?.matchType === 'fuzzy'
          ? `¡Casi exacto! "${safeCorrect}" • `
          : gameMode === GameModes.LYRICS
            ? `"${safeCorrect}" • `
            : '';
        const bonusHtml = speedBonus > 0 ? `<span class="score-speed-tag">${safeSpeedBadge} +${speedBonus}</span>` : '';
        const streakHtml = multiplier > 1 ? `<span class="score-streak-tag">x${multiplier} Racha 🔥</span>` : '';

        this.dom.statusMsg.innerHTML = `
          <div class="score-feedback-card correct">
            <span>¡Correcto! ${evalHeadline}</span>
            <span class="score-points-badge">+${pointsEarned} pts</span>
            ${bonusHtml}
            ${streakHtml}
          </div>
        `;
        this.announce(`${evaluation?.feedback || `¡Correcto! Respuesta: ${correctAnswer}.`} Has obtenido ${pointsEarned} puntos. Pulsa Enter para continuar.`);
      } else {
        this.dom.statusMsg.innerHTML = `
          <div class="score-feedback-card wrong">
            <span>¡Incorrecto! Era <strong>"${safeCorrect}"</strong> 🎶</span>
          </div>
        `;
        this.announce(`Incorrecto. La respuesta correcta era: ${correctAnswer}. Pulsa Enter para continuar.`);
      }
    }

    if (this.dom.stageTitle) this.dom.stageTitle.textContent = `${song.title}`;
    if (this.dom.stageSubtitle) this.dom.stageSubtitle.textContent = `${song.artist} • ${song.year || ''}`;

    if (this.dom.minimizedTitle && this.dom.minimizedSubtitle) {
      this.dom.minimizedTitle.textContent = `${song.title} - ${song.artist} 🎵`;
      this.dom.minimizedSubtitle.textContent = 'Audio en reproducción • Pulsa "Expandir vídeo" para ver el videoclip';
    }

    if (this.dom.audioStage) {
      this.dom.audioStage.classList.remove('ad-skip-mode');
      this.dom.audioStage.classList.add('revealed');
    }
    if (this.dom.btnStartTimer) {
      this.dom.btnStartTimer.style.display = 'none';
    }
    this.dom.btnNext?.classList.remove('hidden');

    this.dom.timerStatusDot?.classList.remove('paused');
    if (this.dom.timerStatusLabel) {
      this.dom.timerStatusLabel.textContent = `🎵 ${song.title} — ${song.artist}`;
    }

    if (this.dom.btnYtExternal) {
      if (song.youtubeId) {
        this.dom.btnYtExternal.href = `https://www.youtube.com/watch?v=${encodeURIComponent(song.youtubeId)}`;
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
    if (this.dom.finalScore) this.dom.finalScore.textContent = String(finalScore);
    if (this.dom.finalAccuracy) this.dom.finalAccuracy.textContent = `${accuracy}%`;
    if (this.dom.finalStreak) this.dom.finalStreak.textContent = `🔥 ${maxStreak}`;
    if (this.dom.finalAvgTime) this.dom.finalAvgTime.textContent = `${avgTime}s`;

    if (this.dom.recordBadge) {
      this.dom.recordBadge.style.display = isNewRecord ? 'inline-block' : 'none';
    }

    this.dom.gameOverModal?.classList.add('open');
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
      this.dom.scoreDisplay.textContent = String(score);
    }
    if (this.dom.streakDisplay) {
      this.dom.streakDisplay.textContent = String(streak);
    }
    if (this.dom.streakChip) {
      this.dom.streakChip.classList.toggle('active', streak >= 2);
    }
  }

  _updateMuteIcon(isMuted) {
    if (!this.dom.btnMute) return;
    this.dom.btnMute.innerHTML = isMuted
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  }

  /**
   * Atajos de teclado accesibles exigiendo ausencia de modificadores (Ctrl/Meta/Alt)
   * para no interceptar atajos nativos del navegador.
   * @private
   */
  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', async (e) => {
      // No interceptar combinaciones con modificadores del sistema/navegador
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (this._activeModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this._closeCurrentModal();
        }
        return;
      }

      const tag = e.target?.tagName || '';
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(e.target?.isContentEditable);

      if (e.key === 'Escape') {
        this._closeCurrentModal();
        return;
      }

      // Espacio: Reproducir / Pausar audio (evitando interferir con inputs o botones enfocados)
      if ((e.code === 'Space' || e.key === ' ') && !isInput && tag !== 'BUTTON' && tag !== 'A') {
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

      if (isInput) return;

      const lowerKey = e.key.toLowerCase();

      // Tecla S: Iniciar cronómetro manualmente
      if (lowerKey === 's') {
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

      // Teclas 1-4 (cuando las opciones están visibles)
      const numKeys = {
        '1': 0, Digit1: 0, Numpad1: 0,
        '2': 1, Digit2: 1, Numpad2: 1,
        '3': 2, Digit3: 2, Numpad3: 2,
        '4': 3, Digit4: 3, Numpad4: 3
      };

      if (Object.prototype.hasOwnProperty.call(numKeys, e.code) || Object.prototype.hasOwnProperty.call(numKeys, e.key)) {
        const gridHidden = this.dom.optionsGrid?.classList.contains('hidden');
        if (!gridHidden && (this.gameState.status === GameStates.PLAYING || this.gameState.status === GameStates.AWAITING_AUDIO)) {
          e.preventDefault();
          const optionIndex = numKeys[e.code] !== undefined ? numKeys[e.code] : numKeys[e.key];
          const buttons = this.dom.optionsGrid.querySelectorAll('.option-btn');
          if (buttons[optionIndex] && !buttons[optionIndex].disabled) {
            buttons[optionIndex].click();
          }
        }
        return;
      }

      // Enter o N: Siguiente canción o reiniciar
      if (e.key === 'Enter' || lowerKey === 'n') {
        if (this.gameState.status === GameStates.ROUND_OVER) {
          e.preventDefault();
          this.gameLogic.nextRound();
        } else if (this.gameState.status === GameStates.GAME_OVER) {
          e.preventDefault();
          this.dom.btnRestart?.click();
        } else if (this.gameState.status === GameStates.IDLE && lowerKey === 'n') {
          e.preventDefault();
          this.dom.btnStart?.click();
        }
        return;
      }

      if (lowerKey === 'm') {
        e.preventDefault();
        this.dom.btnMute?.click();
        return;
      }

      if (lowerKey === 'v') {
        e.preventDefault();
        this.dom.btnToggleMinimize?.click();
        return;
      }

      if (lowerKey === 'c') {
        e.preventDefault();
        this._openCastModal();
        return;
      }

      if (lowerKey === 'd') {
        e.preventDefault();
        this._cycleDeviceView();
      }
    });
  }
}
