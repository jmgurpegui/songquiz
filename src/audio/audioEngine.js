/**
 * @fileoverview Motor unificado de reproducción multimedia HTML5 (Audio y Vídeo local MP4/WebM)
 * con soporte Web Audio AnalyserNode para pistas locales/same-origin y reproducción directa
 * libre de bloqueos CORS para previews oficiales de 30 s sin anuncios.
 */

export class AudioEngine {
  constructor() {
    /** Reproductor HTML5 conectado a Web Audio para archivos same-origin y blobs locales. */
    this.localAudio = new Audio();
    this.localAudio.preload = 'auto';

    /** Reproductor HTML5 directo (sin crossOrigin) para previews remotos de 30 s sin fallos CORS. */
    this.remoteAudio = new Audio();
    this.remoteAudio.preload = 'auto';

    /** @type {HTMLVideoElement|null} Elemento <video> del DOM para MP4/WebM personales. */
    this.videoElement = null;

    /** @type {'local-audio'|'remote-audio'|'local-video'} */
    this.activeMode = 'local-audio';

    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {MediaElementAudioSourceNode|null} */
    this.source = null;
    /** @type {AnalyserNode|null} */
    this.analyser = null;
    /** @type {GainNode|null} */
    this.gainNode = null;

    this.frequencyData = null;
    this.isMuted = false;
    this.volume = 0.85;
    this._isInitialized = false;

    // Conjuntos de listeners (permiten múltiples suscriptores sin sobrescribirse)
    this._onEndedListeners = new Set();
    this._onErrorListeners = new Set();
    this._onPlayingListeners = new Set();
    this._onPauseListeners = new Set();
    this._onWaitingListeners = new Set();

    this._bindElementEvents(this.localAudio, 'local-audio');
    this._bindElementEvents(this.remoteAudio, 'remote-audio');
  }

  /**
   * Devuelve el elemento HTMLMediaElement actualmente activo.
   * @returns {HTMLMediaElement}
   */
  get activeMedia() {
    if (this.activeMode === 'local-video' && this.videoElement) {
      return this.videoElement;
    }
    if (this.activeMode === 'remote-audio') {
      return this.remoteAudio;
    }
    return this.localAudio;
  }

  /** Alias de compatibilidad hacia atrás. */
  get audio() {
    return this.activeMedia;
  }

  /**
   * Vincula el elemento `<video>` del escenario para reproducir vídeos personales locales (MP4/WebM).
   * @param {HTMLVideoElement|null} videoEl
   */
  attachVideoElement(videoEl) {
    if (!videoEl || this.videoElement === videoEl) return;
    this.videoElement = videoEl;
    this.videoElement.preload = 'auto';
    this.videoElement.playsInline = true;
    this._applyVolumeToElement(this.videoElement);
    this._bindElementEvents(this.videoElement, 'local-video');
  }

  /**
   * Enlaza eventos nativos de un elemento multimedia respetando el modo activo.
   * @param {HTMLMediaElement} el
   * @param {'local-audio'|'remote-audio'|'local-video'} mode
   * @private
   */
  _bindElementEvents(el, mode) {
    el.addEventListener('playing', () => {
      if (this.activeMode !== mode) return;
      this._onPlayingListeners.forEach((cb) => cb());
    });

    el.addEventListener('pause', () => {
      if (this.activeMode !== mode) return;
      this._onPauseListeners.forEach((cb) => cb());
    });

    const handleBuffering = () => {
      if (this.activeMode !== mode || el.paused) return;
      this._onWaitingListeners.forEach((cb) => cb());
    };
    el.addEventListener('waiting', handleBuffering);
    el.addEventListener('stalled', handleBuffering);

    el.addEventListener('ended', () => {
      if (this.activeMode !== mode || el.loop) return;
      this._onEndedListeners.forEach((cb) => cb());
    });

    el.addEventListener('error', (e) => {
      if (this.activeMode !== mode) return;
      // Ignorar eventos de error al limpiar `src` intencionalmente
      if (!el.getAttribute('src')) return;
      this._onErrorListeners.forEach((cb) => cb(e));
    });
  }

  /**
   * Inicializa la cadena Web Audio para el reproductor local (espectro en tiempo real).
   */
  initContext() {
    if (this._isInitialized) return;
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.source = this.ctx.createMediaElementSource(this.localAudio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      this.source.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this._isInitialized = true;
    } catch (err) {
      console.warn('Web Audio no disponible, usando reproducción HTML5 directa:', err);
    }
  }

  /**
   * Aplica volumen y silencio actuales a un elemento HTMLMediaElement.
   * @param {HTMLMediaElement} el
   * @private
   */
  _applyVolumeToElement(el) {
    if (!el) return;
    el.muted = this.isMuted;
    el.volume = this.volume;
  }

  /**
   * Carga una fuente de audio o vídeo (local, blob o preview remoto sin anuncios).
   * @param {{ url: string, isVideo?: boolean, isCrossOrigin?: boolean, loop?: boolean }} config
   * @returns {Promise<void>}
   */
  loadMedia({ url, isVideo = false, isCrossOrigin = false, loop = true }) {
    this.stop();

    if (isVideo && this.videoElement) {
      this.activeMode = 'local-video';
    } else if (isCrossOrigin) {
      this.activeMode = 'remote-audio';
    } else {
      this.activeMode = 'local-audio';
    }

    const media = this.activeMedia;
    media.loop = Boolean(loop);
    this._applyVolumeToElement(media);

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeoutId);
        media.removeEventListener('canplay', onReady);
        media.removeEventListener('loadeddata', onReady);
        media.removeEventListener('error', onErr);
      };

      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onErr = (e) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e || new Error('No se pudo cargar el archivo multimedia.'));
      };

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Tiempo de espera agotado al cargar el audio.'));
      }, 10000);

      media.addEventListener('canplay', onReady, { once: true });
      media.addEventListener('loadeddata', onReady, { once: true });
      media.addEventListener('error', onErr, { once: true });

      media.src = url;
      media.load();
    });
  }

  /**
   * Compatibilidad con llamadas previas `load(src)`.
   * @param {string} src
   * @returns {Promise<void>}
   */
  load(src) {
    const isCrossOrigin = /^https?:\/\//i.test(src || '');
    return this.loadMedia({ url: src, isVideo: false, isCrossOrigin, loop: true });
  }

  /**
   * Indica si el medio activo se está reproduciendo.
   * @returns {boolean}
   */
  get isPlaying() {
    const media = this.activeMedia;
    return Boolean(media && !media.paused && !media.ended && media.readyState >= 2);
  }

  /**
   * Alterna entre reproducción y pausa del medio activo.
   * @returns {Promise<boolean>}
   */
  async togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
      return false;
    }
    await this.play();
    return true;
  }

  /**
   * Inicia o reanuda la reproducción del medio activo.
   * @returns {Promise<void>}
   */
  async play() {
    if (this.activeMode === 'local-audio') {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
    }

    const media = this.activeMedia;
    this._applyVolumeToElement(media);
    await media.play();
  }

  /**
   * Pausa la reproducción actual.
   */
  pause() {
    try {
      this.activeMedia.pause();
    } catch {}
  }

  /**
   * Sitúa la reproducción en un segundo determinado si la duración lo permite.
   * @param {number} seconds
   */
  seekTo(seconds) {
    const media = this.activeMedia;
    if (!media) return;
    const safeSec = Math.max(0, Number(seconds) || 0);
    try {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        media.currentTime = safeSec < media.duration - 1 ? safeSec : 0;
      } else {
        media.currentTime = 0;
      }
    } catch {}
  }

  /**
   * Detiene todos los reproductores (audio local, preview remoto y vídeo local).
   */
  stop() {
    for (const el of [this.localAudio, this.remoteAudio, this.videoElement]) {
      if (!el) continue;
      try {
        el.pause();
        el.currentTime = 0;
      } catch {}
    }
  }

  /**
   * Ajusta el volumen global (0.0 a 1.0).
   * @param {number} val
   */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    for (const el of [this.localAudio, this.remoteAudio, this.videoElement]) {
      this._applyVolumeToElement(el);
    }
    if (!this.isMuted && this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Establece explícitamente el silencio.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.isMuted = Boolean(muted);
    for (const el of [this.localAudio, this.remoteAudio, this.videoElement]) {
      this._applyVolumeToElement(el);
    }
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Alterna silencio global.
   * @returns {boolean}
   */
  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Obtiene datos de frecuencia en tiempo real para el visualizador Canvas.
   * @returns {Uint8Array}
   */
  getFrequencyData() {
    if (this.activeMode === 'local-audio' && this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      return this.frequencyData;
    }
    return new Uint8Array(64);
  }

  /** @param {Function} cb */
  onEnded(cb) {
    if (typeof cb === 'function') this._onEndedListeners.add(cb);
  }

  /** @param {Function} cb */
  onError(cb) {
    if (typeof cb === 'function') this._onErrorListeners.add(cb);
  }

  /** @param {Function} cb */
  onPlaying(cb) {
    if (typeof cb === 'function') this._onPlayingListeners.add(cb);
  }

  /** @param {Function} cb */
  onPause(cb) {
    if (typeof cb === 'function') this._onPauseListeners.add(cb);
  }

  /** @param {Function} cb */
  onWaiting(cb) {
    if (typeof cb === 'function') this._onWaitingListeners.add(cb);
  }
}

export const audioEngine = new AudioEngine();
