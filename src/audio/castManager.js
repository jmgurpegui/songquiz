/**
 * @fileoverview Gestor de envío a Chromecast / TV optimizado para Chrome en Android.
 *
 * Qué es posible realmente desde una web en Chrome móvil:
 * 1. Google Cast Web Sender SDK (`cast_sender.js`): funciona en Chrome Android y escritorio (HTTPS).
 *    El receptor multimedia por defecto de Chromecast solo reproduce URLs de medios/imágenes, NO vídeos
 *    de YouTube embebidos. Por eso se usa como "pantalla de marcador": al responder, el TV muestra la
 *    carátula oficial de la canción acertada/fallada (sin spoilers durante la adivinanza).
 * 2. Duplicar pantalla de Android (Ajustes rápidos ➔ "Enviar pantalla" o app Google Home ➔ "Enviar mi pantalla"):
 *    la ÚNICA vía que lleva al TV el vídeo de YouTube + el audio + el juego completo a la vez.
 *    Se ofrece un acceso directo a la app Google Home mediante intent de Android.
 * 3. Escritorio: Presentation API (menú ⋮ ➔ Enviar…) proyecta la vista de TV (?tv=1).
 */

const isAndroid = /Android/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = isAndroid || isIOS || /Mobi/i.test(navigator.userAgent);

export class CastManager extends EventTarget {
  /**
   * @param {import('./audioEngine.js').AudioEngine} audioEngine
   * @param {import('./youtubePlayer.js').YouTubePlayerEngine} youtubePlayer
   */
  constructor(audioEngine, youtubePlayer) {
    super();
    this.audioEngine = audioEngine;
    this.youtubePlayer = youtubePlayer;

    this.isAndroid = isAndroid;
    this.isIOS = isIOS;
    this.isMobile = isMobile;
    this.isSecureContext = window.isSecureContext;

    this.isConnected = false;
    this.activeMethod = null; // 'gcast' | 'presentation' | 'tv_mode' | null
    this.deviceName = '';
    this.isCastSdkAvailable = false;
    this.castDevicesAvailable = false;
    this.isTvDisplayMode = new URLSearchParams(window.location.search).get('tv') === '1';

    /** @type {any} */
    this.castSession = null;
    /** @type {any} */
    this.presentationRequest = null;
    /** @type {any} */
    this.presentationConnection = null;

    this._lastRevealPayload = null;
    this._lastRoundPayload = null;
    this._init();
  }

  /** @private */
  _init() {
    if (this.isTvDisplayMode || (typeof navigator !== 'undefined' && navigator.presentation?.receiver)) {
      document.body.classList.add('tv-cast-mode');
      this._setupPresentationReceiver();
    }

    // iOS no admite el SDK web de Cast (WebKit): no se carga para no bloquear nada.
    if (this.isIOS || !this.isSecureContext) return;

    if (window.__gcastAvailable || (window.cast?.framework && window.chrome?.cast)) {
      this._setupGoogleCastSdk();
    } else {
      window.__onGCastApiReadyCallbacks = window.__onGCastApiReadyCallbacks || [];
      window.__onGCastApiReadyCallbacks.push((isAvailable) => {
        if (isAvailable) this._setupGoogleCastSdk();
        else this._emit('availabilityChange', { available: false, engine: 'gcast' });
      });

      const prevGCastCb = window.__onGCastApiAvailable;
      window.__onGCastApiAvailable = (isAvailable) => {
        if (typeof prevGCastCb === 'function') prevGCastCb(isAvailable);
        if (isAvailable) this._setupGoogleCastSdk();
        else this._emit('availabilityChange', { available: false, engine: 'gcast' });
      };
    }

    // Presentation API con URL http(s) solo está soportada en Chrome de escritorio
    if (!this.isMobile) {
      this._setupPresentationApi();
    }
  }

  /** @private */
  _setupGoogleCastSdk() {
    try {
      const castFramework = window.cast?.framework;
      const chromeCast = window.chrome?.cast;
      if (!castFramework || !chromeCast) return;

      const context = castFramework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED
      });
      this.isCastSdkAvailable = true;

      // Detecta si hay Chromecast visibles en la red Wi-Fi
      const updateCastState = (state) => {
        this.castDevicesAvailable = state !== castFramework.CastState.NO_DEVICES_AVAILABLE;
        this._emit('availabilityChange', { available: this.castDevicesAvailable, engine: 'gcast' });
      };
      updateCastState(context.getCastState());
      context.addEventListener(castFramework.CastContextEventType.CAST_STATE_CHANGED, (e) => updateCastState(e.castState));

      context.addEventListener(castFramework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
        const S = castFramework.SessionState;
        if (event.sessionState === S.SESSION_STARTED || event.sessionState === S.SESSION_RESUMED) {
          this.castSession = context.getCurrentSession();
          const name = this.castSession?.getCastDevice()?.friendlyName || 'Chromecast';
          this._setConnectedState(true, 'gcast', name);
          if (this._lastRevealPayload) {
            this._pushRevealToCast(this._lastRevealPayload);
          } else if (this._lastRoundPayload) {
            this._pushRoundToCast(this._lastRoundPayload);
          } else {
            this._showWelcomeOnTv();
          }
        } else if (event.sessionState === S.SESSION_ENDED) {
          this.castSession = null;
          if (this.activeMethod === 'gcast') this._setConnectedState(false, null, '');
        }
      });
    } catch (err) {
      console.warn('No se pudo inicializar Google Cast SDK:', err);
    }
  }

  /** @private */
  _setupPresentationApi() {
    try {
      if (typeof window.PresentationRequest !== 'function') return;
      const receiverUrl = new URL(window.location.href);
      receiverUrl.searchParams.set('tv', '1');
      this.presentationRequest = new window.PresentationRequest([receiverUrl.toString()]);
      if (navigator.presentation && 'defaultRequest' in navigator.presentation) {
        navigator.presentation.defaultRequest = this.presentationRequest;
      }
    } catch {}
  }

  /**
   * Devuelve un diagnóstico legible del soporte de Cast en este dispositivo.
   * @returns {string}
   */
  getSupportSummary() {
    if (this.isIOS) {
      return 'iPhone/iPad no permite Chromecast desde el navegador. Usa "Duplicar pantalla" (AirPlay) o la app YouTube.';
    }
    if (!this.isSecureContext) {
      return 'Chromecast requiere abrir el juego por HTTPS (GitHub Pages).';
    }
    if (!this.isCastSdkAvailable) {
      return 'Cargando servicio Cast de Google… Si no aparece, usa "Enviar pantalla" de Android.';
    }
    if (!this.castDevicesAvailable) {
      return 'No se detecta ningún Chromecast. Comprueba que el móvil y el TV están en la MISMA red Wi-Fi.';
    }
    return 'Chromecast detectado en tu red Wi-Fi.';
  }

  /**
   * Abre el selector oficial de Chromecast. Debe llamarse directamente desde un toque del usuario.
   * @returns {Promise<{ connected: boolean, method: string|null, deviceName: string, message: string }>}
   */
  async connectToChromecast() {
    if (this.isConnected && this.activeMethod !== 'tv_mode') {
      this.disconnect();
      return { connected: false, method: null, deviceName: '', message: 'Desconectado del TV.' };
    }

    if (this.isCastSdkAvailable && window.cast?.framework) {
      try {
        // requestSession se invoca de forma síncrona dentro del gesto del usuario (requisito de Chrome)
        await window.cast.framework.CastContext.getInstance().requestSession();
        const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
        const name = session?.getCastDevice()?.friendlyName || 'Chromecast';
        return { connected: true, method: 'gcast', deviceName: name, message: `📡 Conectado a ${name}. El TV mostrará la carátula de cada respuesta.` };
      } catch (err) {
        const code = typeof err === 'string' ? err : err?.code;
        if (code === 'cancel') {
          return { connected: false, method: null, deviceName: '', message: 'Selección de Chromecast cancelada.' };
        }
        if (code === 'receiver_unavailable') {
          return { connected: false, method: null, deviceName: '', message: 'No hay Chromecast disponibles en tu red Wi-Fi.' };
        }
        console.warn('requestSession error:', err);
      }
    }

    if (this.presentationRequest) {
      try {
        const connection = await this.presentationRequest.start();
        this.presentationConnection = connection;
        connection.onclose = () => this._setConnectedState(false, null, '');
        connection.onterminate = () => this._setConnectedState(false, null, '');
        this._setConnectedState(true, 'presentation', 'Pantalla Chromecast');
        return { connected: true, method: 'presentation', deviceName: 'Pantalla Chromecast', message: 'Proyectando la vista TV en el Chromecast.' };
      } catch (err) {
        console.warn('PresentationRequest error:', err);
      }
    }

    return { connected: false, method: 'manual_guide', deviceName: '', message: this.getSupportSummary() };
  }

  /**
   * Abre la app Google Home en Android para "Enviar mi pantalla" (vídeo + audio + juego en el TV).
   * @returns {boolean} true si se lanzó el intent.
   */
  openAndroidScreenCast() {
    if (!this.isAndroid) return false;
    const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.google.android.apps.chromecast.app');
    window.location.href = `intent://#Intent;package=com.google.android.apps.chromecast.app;S.browser_fallback_url=${fallback};end`;
    return true;
  }

  /**
   * Activa/desactiva la interfaz ampliada para TV (útil al duplicar pantalla).
   * @param {boolean} [forceState]
   * @returns {boolean}
   */
  toggleTvDisplayMode(forceState) {
    this.isTvDisplayMode = typeof forceState === 'boolean' ? forceState : !this.isTvDisplayMode;
    document.body.classList.toggle('tv-cast-mode', this.isTvDisplayMode);
    if (this.isTvDisplayMode && !this.isConnected) {
      this._setConnectedState(true, 'tv_mode', 'Modo TV');
    } else if (!this.isTvDisplayMode && this.activeMethod === 'tv_mode') {
      this._setConnectedState(false, null, '');
    }
    return this.isTvDisplayMode;
  }

  disconnect() {
    try {
      if (this.activeMethod === 'gcast' && window.cast?.framework) {
        window.cast.framework.CastContext.getInstance().endCurrentSession(true);
      }
      if (this.presentationConnection) {
        this.presentationConnection.terminate();
        this.presentationConnection = null;
      }
    } catch {}
    this._setConnectedState(false, null, '');
  }

  /**
   * Nueva ronda: en el TV se actualiza el marcador y el reto activo (sin spoilers).
   * @param {Object} payload
   */
  syncRoundStart(payload) {
    this._lastRoundPayload = payload;
    this._lastRevealPayload = null;

    if (this.castSession && this.activeMethod === 'gcast') {
      this._pushRoundToCast(payload);
    }
    if (this.presentationConnection?.state === 'connected') {
      try { this.presentationConnection.send(JSON.stringify({ type: 'ROUND_START', ...payload })); } catch {}
    }
  }

  /**
   * Respuesta revelada: el TV muestra la carátula oficial de la canción con título, artista y puntos.
   * @param {Object} payload
   */
  syncRoundReveal(payload) {
    this._lastRevealPayload = payload;
    this._lastRoundPayload = null;

    if (this.castSession && this.activeMethod === 'gcast') {
      this._pushRevealToCast(payload);
    }
    if (this.presentationConnection?.state === 'connected') {
      try { this.presentationConnection.send(JSON.stringify({ type: 'ROUND_REVEAL', ...payload })); } catch {}
    }
  }

  /** @private */
  _showWelcomeOnTv() {
    const chromeCast = window.chrome?.cast;
    if (!this.castSession || !chromeCast) return;
    try {
      const welcomeUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/A_black_vinyl_record_with_a_blank_label.jpg/1280px-A_black_vinyl_record_with_a_blank_label.jpg';
      const mediaInfo = new chromeCast.media.MediaInfo(welcomeUrl, 'image/jpeg');
      const md = new chromeCast.media.GenericMediaMetadata();
      md.title = 'SongQuiz — ¡Adivina la canción!';
      md.subtitle = 'Sincronizado con tu pantalla. ¡Que empiece la música!';
      md.images = [new chromeCast.Image(welcomeUrl)];
      mediaInfo.metadata = md;
      if (this._lastRevealPayload || this._lastRoundPayload) return;
      const request = new chromeCast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      this.castSession.loadMedia(request).catch(() => {});
    } catch {}
  }

  /**
   * Envía a Chromecast la pantalla de ronda activa (anti-spoilers con marcador en vivo).
   * @private
   * @param {Object} payload
   */
  _pushRoundToCast(payload) {
    const chromeCast = window.chrome?.cast;
    if (!this.castSession || !chromeCast) return;
    try {
      const stageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/A_black_vinyl_record_with_a_blank_label.jpg/1280px-A_black_vinyl_record_with_a_blank_label.jpg';
      const mediaInfo = new chromeCast.media.MediaInfo(stageUrl, 'image/jpeg');
      const md = new chromeCast.media.GenericMediaMetadata();
      const roundTxt = payload.roundNumber ? `Ronda ${payload.roundNumber} / ${payload.totalRounds || '10'}` : 'Nueva ronda';
      md.title = `🎵 ${roundTxt} — ¿Qué canción está sonando?`;
      md.subtitle = `Marcador: ${payload.score || 0} pts • Racha: ${payload.streak || 0} 🔥 • ¡Adivina en tu pantalla!`;
      md.images = [new chromeCast.Image(stageUrl)];
      mediaInfo.metadata = md;
      const request = new chromeCast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      this.castSession.loadMedia(request).catch((err) => {
        console.warn('Chromecast no pudo cargar pantalla de ronda:', err);
      });
    } catch (err) {
      console.warn('Error al enviar estado de ronda a Chromecast:', err);
    }
  }

  /**
   * Envía a Chromecast la carátula oficial en HD y los detalles de la canción resuelta.
   * @private
   * @param {Object} payload
   */
  _pushRevealToCast(payload) {
    const chromeCast = window.chrome?.cast;
    const song = payload?.song;
    if (!this.castSession || !chromeCast || !song?.youtubeId) return;
    try {
      const imageUrl = `https://i.ytimg.com/vi/${song.youtubeId}/hqdefault.jpg`;
      const mediaInfo = new chromeCast.media.MediaInfo(imageUrl, 'image/jpeg');
      const md = new chromeCast.media.GenericMediaMetadata();
      const statusIcon = payload.isCorrect ? '✅ ¡Correcto!' : '❌ Era:';
      const pointsTxt = payload.pointsEarned ? `+${payload.pointsEarned} pts` : '+0 pts';
      md.title = `${statusIcon} ${song.title} — ${song.artist}${song.year ? ` (${song.year})` : ''}`;
      md.subtitle = `${pointsTxt} • Puntuación: ${payload.score || 0} pts • Racha: ${payload.streak || 0} 🔥`;
      md.images = [new chromeCast.Image(imageUrl)];
      mediaInfo.metadata = md;
      const request = new chromeCast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      this.castSession.loadMedia(request).catch((e) => {
        console.warn('Chromecast no pudo mostrar la carátula:', e);
      });
    } catch (err) {
      console.warn('Error al enviar carátula al Chromecast:', err);
    }
  }

  /**
   * Inicializa el receptor de Presentation API para Smart TVs o pantallas secundarias.
   * @private
   */
  _setupPresentationReceiver() {
    if (typeof navigator === 'undefined' || !navigator.presentation?.receiver) return;
    try {
      navigator.presentation.receiver.connectionList
        .then((list) => {
          const handleConnection = (connection) => {
            connection.addEventListener('message', (event) => {
              try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data?.type === 'ROUND_START') {
                  if (data.song?.youtubeId && this.youtubePlayer) {
                    this.youtubePlayer.loadVideo(data.song.youtubeId, { startSeconds: 0 });
                  }
                  this._emit('remoteRoundStart', data);
                } else if (data?.type === 'ROUND_REVEAL') {
                  this._emit('remoteRoundReveal', data);
                }
              } catch (err) {
                console.warn('Error procesando mensaje en Presentation Receiver:', err);
              }
            });
          };
          list.connections.forEach(handleConnection);
          list.addEventListener('connectionavailable', (event) => {
            handleConnection(event.connection);
          });
        })
        .catch((err) => {
          console.debug('Presentation Receiver no activo:', err);
        });
    } catch (err) {
      console.warn('Error en _setupPresentationReceiver:', err);
    }
  }

  /** @private */
  _setConnectedState(connected, method, deviceName) {
    this.isConnected = connected;
    this.activeMethod = method;
    this.deviceName = deviceName;
    this._emit('connectionChange', { isConnected: connected, method, deviceName });
  }

  /** @private */
  _emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}
