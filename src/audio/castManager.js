/**
 * @fileoverview Gestor integral de transmisión a Chromecast y Segunda Pantalla (TV) en la misma red Wi-Fi.
 * Integra 4 motores complementarios para máxima compatibilidad en móvil (Android/iOS), tablet y escritorio:
 * 1. Google Cast Web Sender SDK oficial (`cast.framework.CastContext` / `chrome.cast`).
 * 2. W3C Presentation API (`navigator.presentation.PresentationRequest`) para pantalla receptora TV (`?tv=1`).
 * 3. W3C Remote Playback API (`HTMLMediaElement.remote`) y Apple AirPlay (`webkitShowPlaybackTargetPicker`).
 * 4. Canal de sincronización en tiempo real (`PresentationConnection` + `BroadcastChannel`) para Modo TV.
 */

export class CastManager extends EventTarget {
  /**
   * @param {import('./audioEngine.js').AudioEngine} audioEngine
   * @param {import('./youtubePlayer.js').YouTubePlayerEngine} youtubePlayer
   */
  constructor(audioEngine, youtubePlayer) {
    super();
    this.audioEngine = audioEngine;
    this.youtubePlayer = youtubePlayer;

    this.isConnected = false;
    this.activeMethod = null; // 'gcast' | 'presentation' | 'remote' | 'tv_mode' | null
    this.deviceName = '';
    this.isCastSdkAvailable = false;
    this.isTvDisplayMode = new URLSearchParams(window.location.search).get('tv') === '1';

    /** @type {any} */
    this.castSession = null;
    /** @type {any} */
    this.presentationRequest = null;
    /** @type {any} */
    this.presentationConnection = null;

    /** @type {BroadcastChannel|null} */
    this.broadcastChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('songquiz_chromecast_sync')
      : null;

    this._lastStatePayload = null;
    this._init();
  }

  /**
   * Inicializa los motores de detección de Chromecast en la red Wi-Fi local.
   * @private
   */
  _init() {
    // 1. Configurar Google Cast Web Sender SDK
    const prevGCastCb = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (isAvailable) => {
      if (typeof prevGCastCb === 'function') prevGCastCb(isAvailable);
      if (isAvailable) {
        this._setupGoogleCastSdk();
      }
    };

    if (window.cast && window.cast.framework && window.chrome?.cast) {
      this._setupGoogleCastSdk();
    } else {
      this._injectCastSenderScript();
    }

    // 2. Configurar W3C Presentation API (soporte nativo en Chrome Android y Desktop para Chromecast en la red Wi-Fi)
    this._setupPresentationApi();

    // 3. Configurar W3C RemotePlayback API en el motor de audio HTML5
    this._setupRemotePlaybackApi();

    // 4. Escuchar canal de sincronización si esta pestaña actúa como Receptor TV (?tv=1)
    if (this.broadcastChannel) {
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && this.isTvDisplayMode) {
          this._emit('tvReceiverPayload', event.data);
        }
      };
    }

    if (this.isTvDisplayMode) {
      document.body.classList.add('tv-cast-mode');
    }
  }

  /**
   * Inyecta de forma asíncrona el SDK oficial de Google Cast si no está presente.
   * @private
   */
  _injectCastSenderScript() {
    if (document.querySelector('script[src*="cast_sender.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    document.head.appendChild(script);
  }

  /**
   * Inicializa CastContext con el receptor multimedia universal de Chromecast.
   * @private
   */
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

      context.addEventListener(
        castFramework.CastContextEventType.SESSION_STATE_CHANGED,
        (event) => {
          const SessionState = castFramework.SessionState;
          if (
            event.sessionState === SessionState.SESSION_STARTED ||
            event.sessionState === SessionState.SESSION_RESUMED
          ) {
            this.castSession = context.getCurrentSession();
            const friendlyName = this.castSession?.getCastDevice()?.friendlyName || 'Chromecast en Wi-Fi';
            this._setConnectedState(true, 'gcast', friendlyName);
            if (this._lastStatePayload) {
              this._pushToGoogleCastSession(this._lastStatePayload);
            }
          } else if (event.sessionState === SessionState.SESSION_ENDED) {
            this.castSession = null;
            this._setConnectedState(false, null, '');
          }
        }
      );

      this._emit('availabilityChange', { available: true, engine: 'gcast' });
    } catch (err) {
      console.warn('No se pudo inicializar Google Cast SDK:', err);
    }
  }

  /**
   * Inicializa W3C Presentation API para abrir el selector nativo de Chromecast en Android/Desktop.
   * @private
   */
  _setupPresentationApi() {
    try {
      if (typeof window.PresentationRequest === 'function') {
        const receiverUrl = new URL(window.location.href);
        receiverUrl.searchParams.set('tv', '1');

        this.presentationRequest = new window.PresentationRequest([receiverUrl.toString()]);

        if (navigator.presentation && 'defaultRequest' in navigator.presentation) {
          navigator.presentation.defaultRequest = this.presentationRequest;
        }

        this.presentationRequest.getAvailability()
          .then((availability) => {
            this._emit('availabilityChange', { available: availability.value, engine: 'presentation' });
            availability.onchange = () => {
              this._emit('availabilityChange', { available: availability.value, engine: 'presentation' });
            };
          })
          .catch(() => {});
      }

      // Si esta instancia fue abierta en el Chromecast como receptor de presentación
      if (navigator.presentation?.receiver?.connectionList) {
        navigator.presentation.receiver.connectionList.then((list) => {
          list.connections.forEach((conn) => this._bindReceiverConnection(conn));
          list.onconnectionavailable = (evt) => this._bindReceiverConnection(evt.connection);
        }).catch(() => {});
      }
    } catch (e) {
      // Presentation API opcional según navegador
    }
  }

  /**
   * Enlaza mensajes entrantes cuando se ejecuta en modo Receptor TV.
   * @param {any} connection
   * @private
   */
  _bindReceiverConnection(connection) {
    connection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._emit('tvReceiverPayload', data);
      } catch {}
    };
  }

  /**
   * Configura W3C Remote Playback API en el elemento de audio HTML5 (Android Chrome / Safari AirPlay).
   * @private
   */
  _setupRemotePlaybackApi() {
    const audioEl = this.audioEngine?.audio;
    if (!audioEl || !audioEl.remote) return;

    try {
      audioEl.remote.addEventListener('connect', () => {
        this._setConnectedState(true, 'remote', 'Altavoz / TV Chromecast');
      });
      audioEl.remote.addEventListener('connecting', () => {
        this._emit('statusMessage', { message: 'Conectando con dispositivo Chromecast en la red Wi-Fi...' });
      });
      audioEl.remote.addEventListener('disconnect', () => {
        if (this.activeMethod === 'remote') {
          this._setConnectedState(false, null, '');
        }
      });
    } catch {}
  }

  /**
   * Inicia la conexión buscando dispositivos Chromecast en la misma red Wi-Fi.
   * Prueba secuencialmente Google Cast SDK -> Presentation API -> RemotePlayback -> AirPlay.
   * @returns {Promise<{ connected: boolean, method: string|null, deviceName: string, message: string }>}
   */
  async connectToChromecast() {
    // Si ya está conectado, ofrecer desconectar
    if (this.isConnected && this.activeMethod !== 'tv_mode') {
      this.disconnect();
      return {
        connected: false,
        method: null,
        deviceName: '',
        message: 'Desconectado de Chromecast.'
      };
    }

    // 1. Intentar mediante Google Cast SDK oficial (abre el selector nativo de Chromecast en la Wi-Fi)
    if (this.isCastSdkAvailable && window.cast?.framework) {
      try {
        const context = window.cast.framework.CastContext.getInstance();
        await context.requestSession();
        this.castSession = context.getCurrentSession();
        const name = this.castSession?.getCastDevice()?.friendlyName || 'Chromecast Wi-Fi';
        this._setConnectedState(true, 'gcast', name);
        return {
          connected: true,
          method: 'gcast',
          deviceName: name,
          message: `Conectado a ${name}`
        };
      } catch (err) {
        if (err === 'cancel') {
          return {
            connected: false,
            method: null,
            deviceName: '',
            message: 'Selección de Chromecast cancelada.'
          };
        }
        console.warn('Google Cast requestSession fallback:', err);
      }
    }

    // 2. Intentar mediante W3C Presentation API (abre el selector nativo de Chromecast en Chrome Android y Desktop)
    if (this.presentationRequest) {
      try {
        const connection = await this.presentationRequest.start();
        this.presentationConnection = connection;
        this._setConnectedState(true, 'presentation', 'Pantalla Chromecast Wi-Fi');

        connection.onclose = () => this._setConnectedState(false, null, '');
        connection.onterminate = () => this._setConnectedState(false, null, '');

        if (this._lastStatePayload) {
          this._sendPresentationMessage(this._lastStatePayload);
        }

        return {
          connected: true,
          method: 'presentation',
          deviceName: 'Pantalla Chromecast Wi-Fi',
          message: 'Conectado a Chromecast mediante Presentation API.'
        };
      } catch (err) {
        if (err?.name === 'NotAllowedError') {
          return {
            connected: false,
            method: null,
            deviceName: '',
            message: 'Selección de pantalla cancelada.'
          };
        }
        console.warn('PresentationRequest fallback:', err);
      }
    }

    // 3. Intentar mediante RemotePlayback API en el elemento de audio (Android Chrome)
    const audioEl = this.audioEngine?.audio;
    if (audioEl?.remote && typeof audioEl.remote.prompt === 'function') {
      try {
        if (!audioEl.src) {
          audioEl.src = new URL('./assets/audio/blinding_lights.wav', window.location.href).toString();
        }
        await audioEl.remote.prompt();
        this._setConnectedState(true, 'remote', 'Chromecast Audio / TV');
        return {
          connected: true,
          method: 'remote',
          deviceName: 'Chromecast Audio / TV',
          message: 'Transmitiendo audio a Chromecast en la red Wi-Fi.'
        };
      } catch (err) {
        console.warn('RemotePlayback prompt fallback:', err);
      }
    }

    // 4. Intentar mediante Apple AirPlay (iPhone / iPad Safari)
    if (audioEl && typeof audioEl.webkitShowPlaybackTargetPicker === 'function') {
      try {
        audioEl.webkitShowPlaybackTargetPicker();
        this._setConnectedState(true, 'airplay', 'AirPlay / Smart TV');
        return {
          connected: true,
          method: 'airplay',
          deviceName: 'AirPlay / Smart TV',
          message: 'Selector AirPlay abierto.'
        };
      } catch (err) {
        console.warn('AirPlay fallback:', err);
      }
    }

    // 5. Si el navegador requiere abrir el menú de sistema o activar el Modo TV optimizado
    return {
      connected: false,
      method: 'manual_guide',
      deviceName: '',
      message: 'Usa el selector de transmisión de tu dispositivo o activa el Modo Pantalla TV.'
    };
  }

  /**
   * Activa o desactiva el Modo Pantalla TV optimizado para duplicar pestaña/pantalla al Chromecast.
   * @param {boolean} [forceState]
   * @returns {boolean}
   */
  toggleTvDisplayMode(forceState) {
    this.isTvDisplayMode = typeof forceState === 'boolean' ? forceState : !this.isTvDisplayMode;
    document.body.classList.toggle('tv-cast-mode', this.isTvDisplayMode);

    if (this.isTvDisplayMode && !this.isConnected) {
      this._setConnectedState(true, 'tv_mode', 'Modo TV Activo');
    } else if (!this.isTvDisplayMode && this.activeMethod === 'tv_mode') {
      this._setConnectedState(false, null, '');
    }

    return this.isTvDisplayMode;
  }

  /**
   * Desconecta la sesión activa de Chromecast.
   */
  disconnect() {
    try {
      if (this.activeMethod === 'gcast' && window.cast?.framework) {
        window.cast.framework.CastContext.getInstance().endCurrentSession(true);
      }
      if (this.presentationConnection) {
        this.presentationConnection.terminate();
        this.presentationConnection = null;
      }
      if (this.isTvDisplayMode) {
        this.isTvDisplayMode = false;
        document.body.classList.remove('tv-cast-mode');
      }
    } catch {}
    this._setConnectedState(false, null, '');
  }

  /**
   * Sincroniza el inicio de una nueva ronda con el Chromecast conectado (Modo Anti-Spoiler en TV).
   * @param {Object} payload
   */
  syncRoundStart(payload) {
    this._lastStatePayload = {
      type: 'ROUND_START',
      timestamp: Date.now(),
      ...payload
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(this._lastStatePayload);
      } catch {}
    }

    if (this.presentationConnection) {
      this._sendPresentationMessage(this._lastStatePayload);
    }

    if (this.castSession && this.activeMethod === 'gcast') {
      this._pushToGoogleCastSession(this._lastStatePayload);
    }
  }

  /**
   * Sincroniza la revelación de la canción y la Curiosidad Musical en la pantalla del Chromecast.
   * @param {Object} payload
   */
  syncRoundReveal(payload) {
    this._lastStatePayload = {
      type: 'ROUND_REVEAL',
      timestamp: Date.now(),
      ...payload
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(this._lastStatePayload);
      } catch {}
    }

    if (this.presentationConnection) {
      this._sendPresentationMessage(this._lastStatePayload);
    }

    if (this.castSession && this.activeMethod === 'gcast') {
      this._pushToGoogleCastSession(this._lastStatePayload);
    }
  }

  /**
   * Envía metadatos enriquecidos y pista de audio al receptor Google Cast en el televisor.
   * Durante la adivinanza oculta el título ("🎧 ¿Qué canción está sonando?") y al responder
   * muestra la carátula oficial de YouTube, el artista, los puntos y la curiosidad musical.
   * @param {Object} statePayload
   * @private
   */
  _pushToGoogleCastSession(statePayload) {
    const chromeCast = window.chrome?.cast;
    if (!this.castSession || !chromeCast || !statePayload?.song) return;

    try {
      const song = statePayload.song;
      const isReveal = statePayload.type === 'ROUND_REVEAL';

      const audioUrl = new URL(
        song.audioSrc || 'assets/audio/blinding_lights.wav',
        window.location.href
      ).toString();

      const mediaInfo = new chromeCast.media.MediaInfo(audioUrl, 'audio/wav');
      const metadata = new chromeCast.media.MusicTrackMediaMetadata();

      if (isReveal) {
        const prefix = statePayload.isCorrect ? '✅ ¡Correcto!' : '🎵 Respuesta:';
        metadata.title = `${prefix} ${song.title}`;
        metadata.artist = `${song.artist} (${song.year || 'Clásico'}) • +${statePayload.pointsEarned || 0} pts`;
        metadata.albumName = `💡 ${song.culturalTrivia || ''}`;
        const thumbUrl = song.youtubeId
          ? `https://i.ytimg.com/vi/${song.youtubeId}/hqdefault.jpg`
          : new URL('./assets/icons/icon-512.svg', window.location.href).toString();
        metadata.images = [new chromeCast.Image(thumbUrl)];
      } else {
        const rankInfo = song.rank ? `Top YouTube #${song.rank}` : `Pista ${statePayload.roundNumber || 1}/${statePayload.totalRounds || 10}`;
        metadata.title = '🎧 ¿Qué canción está sonando?';
        metadata.artist = `${rankInfo} • Elige una de las 4 opciones en tu móvil o tablet`;
        metadata.albumName = `SongQuiz • 🏆 ${statePayload.score || 0} pts | 🔥 Racha ${statePayload.streak || 0}`;
        const mysteryIcon = new URL('./assets/icons/icon-512.svg', window.location.href).toString();
        metadata.images = [new chromeCast.Image(mysteryIcon)];
      }

      mediaInfo.metadata = metadata;
      const request = new chromeCast.media.LoadRequest(mediaInfo);
      request.autoplay = true;

      this.castSession.loadMedia(request).catch((e) => {
        console.warn('Aviso al actualizar medios en sesión Google Cast:', e);
      });
    } catch (err) {
      console.warn('Error al sincronizar con sesión Google Cast:', err);
    }
  }

  /**
   * Envía estado JSON a través de PresentationConnection.
   * @param {Object} data
   * @private
   */
  _sendPresentationMessage(data) {
    try {
      if (this.presentationConnection && this.presentationConnection.state === 'connected') {
        this.presentationConnection.send(JSON.stringify(data));
      }
    } catch {}
  }

  /**
   * Actualiza el estado de conexión y notifica a la interfaz.
   * @param {boolean} connected
   * @param {string|null} method
   * @param {string} deviceName
   * @private
   */
  _setConnectedState(connected, method, deviceName) {
    this.isConnected = connected;
    this.activeMethod = method;
    this.deviceName = deviceName;

    this._emit('connectionChange', {
      isConnected: this.isConnected,
      method: this.activeMethod,
      deviceName: this.deviceName
    });
  }

  /**
   * Dispara un CustomEvent tipado.
   * @param {string} eventName
   * @param {Object} detail
   * @private
   */
  _emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}
