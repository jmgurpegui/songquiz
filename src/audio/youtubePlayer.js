/**
 * @fileoverview Motor de integración oficial con YouTube IFrame API para SongQuiz.
 * Permite reproducir vídeos y audios oficiales de YouTube con controles completos,
 * soporte de escucha continua y eventos de sincronización.
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
  }

  /**
   * Carga la API de YouTube de forma asíncrona e inicializa el reproductor en el DOM.
   * @param {string} containerId - ID del contenedor div (ej. 'ytplayer').
   * @returns {Promise<void>}
   */
  init(containerId = 'ytplayer') {
    if (this._readyPromise) return this._readyPromise;

    this._readyPromise = new Promise((resolve, reject) => {
      // 1. Inyectar script de la API si no existe
      if (!window.YT || !window.YT.Player) {
        const existingTag = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (!existingTag) {
          const tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        // Definir callback global requerido por YouTube
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
          controls: 1, // Controles habilitados para permitir escucha completa
          rel: 0,
          modestbranding: 1,
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
            if (typeof this._onStateChangeCb === 'function') {
              this._onStateChangeCb(event);
            }
          },
          onError: (event) => {
            console.warn('YouTube Player error code:', event.data);
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
   * Carga y comienza a reproducir un vídeo por su ID de YouTube.
   * @param {string} videoId
   * @param {number} [startSeconds=0]
   */
  async loadVideo(videoId, startSeconds = 0) {
    await this.init();
    if (!this.player || !videoId) return;

    this.currentVideoId = videoId;

    try {
      if (typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({
          videoId: videoId,
          startSeconds: startSeconds
        });
        this.player.unMute();
      }
    } catch (e) {
      console.warn('Error al cargar vídeo en YT.Player:', e);
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
   * Detiene el vídeo y lo reinicia al segundo 0.
   */
  stop() {
    if (this.player && typeof this.player.stopVideo === 'function') {
      try {
        this.player.stopVideo();
      } catch (e) {}
    }
  }

  /**
   * Alterna entre reproducir y pausar.
   * @returns {boolean} True si está reproduciendo.
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
    if (this.player && typeof this.player.getPlayerState === 'function') {
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
   * Alterna el modo silenciado en YouTube.
   * @returns {boolean}
   */
  toggleMute() {
    if (!this.player) return false;
    if (typeof this.player.isMuted === 'function' && typeof this.player.mute === 'function') {
      if (this.player.isMuted()) {
        this.player.unMute();
        this.isMuted = false;
      } else {
        this.player.mute();
        this.isMuted = true;
      }
    }
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
}

export const youtubePlayer = new YouTubePlayerEngine();
