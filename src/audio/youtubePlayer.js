/**
 * @fileoverview Motor de integración oficial con YouTube IFrame API para SongQuiz.
 * Permite reproducir vídeos y audios oficiales de YouTube con controles completos,
 * salto de anuncios e intros (+15s / -10s), soporte de escucha continua y eventos de sincronización.
 */

export class YouTubePlayerEngine {
  constructor() {
    /** @type {any} */
    this.player = null;
    this.isReady = false;
    this.currentVideoId = null;
    this.isMuted = false;
    this.volume = 100;

    this._readyPromise = null;
    this._onStateChangeCb = null;
    this._onErrorCb = null;
    this._onAudioActuallyPlayingCb = null;
    this._playbackWatcherInterval = null;
    this._audioStartedForCurrentTrack = false;
  }

  /**
   * Indica si el reproductor está listo y cargado.
   * @returns {boolean}
   */
  get isLoaded() {
    return Boolean(this.isReady && this.player);
  }

  /**
   * Carga la API de YouTube de forma asíncrona e inicializa el reproductor en el DOM.
   * @param {string} containerId - ID del contenedor div (ej. 'ytplayer').
   * @returns {Promise<void>}
   */
  init(containerId = 'ytplayer') {
    if (this._readyPromise) return this._readyPromise;

    this._readyPromise = new Promise((resolve, reject) => {
      if (!window.YT || !window.YT.Player) {
        const existingTag = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (!existingTag) {
          const tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        const prevApiReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (typeof prevApiReady === 'function') prevApiReady();
          this._createPlayer(containerId, resolve, reject);
        };
      } else {
        this._createPlayer(containerId, resolve, reject);
      }
    });

    return this._readyPromise;
  }

  /**
   * Instancia el reproductor YT.Player.
   * @private
   */
  _createPlayer(containerId, resolve, reject) {
    try {
      this.player = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            this.isReady = true;
            this.player.unMute();
            this.player.setVolume(this.volume);
            resolve();
          },
          onStateChange: (event) => {
            if (event.data === window.YT?.PlayerState?.PLAYING || event.data === 1) {
              if (!this._audioStartedForCurrentTrack) {
                this._startPlaybackWatcher();
              }
            }
            if (typeof this._onStateChangeCb === 'function') {
              this._onStateChangeCb(event);
            }
          },
          onError: (event) => {
            console.warn('YouTube Player error code:', event.data);
            this._clearPlaybackWatcher();
            if (typeof this._onErrorCb === 'function') {
              this._onErrorCb(event.data);
            }
          }
        }
      });
    } catch (err) {
      reject(err);
    }
  }

  /**
   * Watcher de sincronización Pre-Roll que evalúa player.getCurrentTime() cada 250ms
   * tras recibir YT.PlayerState.PLAYING. Dispara onAudioActuallyPlaying únicamente
   * cuando getCurrentTime() > 0.7 segundos y no hay un anuncio pre-roll activo.
   * @private
   */
  _startPlaybackWatcher() {
    this._clearPlaybackWatcher();
    this._playbackWatcherInterval = setInterval(() => {
      if (!this.player || !this.isReady || this._audioStartedForCurrentTrack) {
        this._clearPlaybackWatcher();
        return;
      }

      try {
        const state = typeof this.player.getPlayerState === 'function' ? this.player.getPlayerState() : -1;
        if (state !== window.YT?.PlayerState?.PLAYING && state !== 1) {
          return;
        }

        const currentTime = typeof this.player.getCurrentTime === 'function' ? this.player.getCurrentTime() : 0;
        const videoData = typeof this.player.getVideoData === 'function' ? this.player.getVideoData() : null;
        const loadedVideoId = videoData?.video_id || '';

        // Si loadedVideoId difiere de currentVideoId, YouTube está reproduciendo un anuncio en el iframe
        const isAdActive = Boolean(loadedVideoId && this.currentVideoId && loadedVideoId !== this.currentVideoId);

        if (!isAdActive && currentTime > 0.7) {
          this._audioStartedForCurrentTrack = true;
          this._clearPlaybackWatcher();
          if (typeof this._onAudioActuallyPlayingCb === 'function') {
            this._onAudioActuallyPlayingCb(currentTime);
          }
        }
      } catch (e) {
        console.warn('Error en watcher de sincronización YouTube:', e);
      }
    }, 250);
  }

  /**
   * Limpia el watcher de sincronización activo.
   * @private
   */
  _clearPlaybackWatcher() {
    if (this._playbackWatcherInterval) {
      clearInterval(this._playbackWatcherInterval);
      this._playbackWatcherInterval = null;
    }
  }

  /**
   * Carga y comienza a reproducir un vídeo por su ID de YouTube.
   * @param {string} videoId
   * @param {number} [startSeconds=0]
   */
  async loadVideo(videoId, startSeconds = 0) {
    await this.init();
    if (!this.player || !videoId) return;

    this._clearPlaybackWatcher();
    this._audioStartedForCurrentTrack = false;
    this.currentVideoId = videoId;

    try {
      if (typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({
          videoId: videoId,
          startSeconds: startSeconds
        });
        if (!this.isMuted && typeof this.player.unMute === 'function') {
          this.player.unMute();
        }
      }
    } catch (e) {
      console.warn('Error al cargar vídeo en YT.Player:', e);
    }
  }

  /**
   * Adelanta o retrocede la reproducción un número determinado de segundos.
   * Ideal para saltar introducciones largas y llegar a la letra de la canción.
   * @param {number} deltaSeconds - Segundos a desplazar (ej. +15 o -10).
   */
  seekBy(deltaSeconds) {
    if (!this.player || !this.isReady) return;
    try {
      const current = typeof this.player.getCurrentTime === 'function' ? this.player.getCurrentTime() : 0;
      const target = Math.max(0, current + deltaSeconds);
      if (typeof this.player.seekTo === 'function') {
        this.player.seekTo(target, true);
      }
    } catch (e) {
      console.warn('Error al desplazar tiempo en YouTube:', e);
    }
  }

  /**
   * Inicia o reanuda la reproducción.
   */
  play() {
    if (this.player && typeof this.player.playVideo === 'function') {
      try {
        this.player.playVideo();
      } catch (e) {
        console.warn('Fallo al reproducir vídeo de YouTube:', e);
      }
    }
  }

  /**
   * Pausa la reproducción del vídeo.
   */
  pause() {
    if (this.player && typeof this.player.pauseVideo === 'function') {
      try {
        this.player.pauseVideo();
      } catch (e) {}
    }
  }

  /**
   * Detiene el vídeo.
   */
  stop() {
    this._clearPlaybackWatcher();
    if (this.player && typeof this.player.stopVideo === 'function') {
      try {
        this.player.stopVideo();
      } catch (e) {}
    }
  }

  /**
   * Alterna entre reproducir y pausar.
   * @returns {boolean} True si pasa a estar reproduciendo.
   */
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  /**
   * Indica si el vídeo de YouTube está reproduciéndose activamente.
   * @returns {boolean}
   */
  get isPlaying() {
    if (this.player && typeof this.player.getPlayerState === 'function' && window.YT?.PlayerState) {
      return this.player.getPlayerState() === window.YT.PlayerState.PLAYING;
    }
    return false;
  }

  /**
   * Ajusta el volumen (0 a 100).
   * @param {number} val
   */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(100, val));
    if (this.player && typeof this.player.setVolume === 'function') {
      this.player.setVolume(this.volume);
    }
  }

  /**
   * Establece explícitamente el estado de silencio.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (!this.player) return;
    try {
      if (this.isMuted && typeof this.player.mute === 'function') {
        this.player.mute();
      } else if (!this.isMuted && typeof this.player.unMute === 'function') {
        this.player.unMute();
      }
    } catch {}
  }

  /**
   * Alterna el modo silenciado en YouTube.
   * @returns {boolean}
   */
  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Asigna callback para cambios de estado (PLAYING, PAUSED, ENDED).
   * @param {function(any): void} cb
   */
  onStateChange(cb) {
    this._onStateChangeCb = cb;
  }

  /**
   * Asigna callback para errores de YouTube (101, 150, etc.).
   * @param {function(number): void} cb
   */
  onError(cb) {
    this._onErrorCb = cb;
  }

  /**
   * Asigna callback para cuando el audio real de la canción supera 0.7s tras posibles anuncios pre-roll.
   * @param {function(number): void} cb
   */
  onAudioActuallyPlaying(cb) {
    this._onAudioActuallyPlayingCb = cb;
  }
}

export const youtubePlayer = new YouTubePlayerEngine();
