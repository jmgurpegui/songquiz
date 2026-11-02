/**
 * @fileoverview Motor de reproducción de audio HTML5 conectado a AnalyserNode de Web Audio.
 * Proporciona control de reproducción para clips musicales y extracción de espectro en tiempo real.
 */

export class AudioEngine {
  constructor() {
    /** @type {HTMLAudioElement} */
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

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
    this.volume = 0.8;
    this._isInitialized = false;

    // Callbacks
    this._onEndedCb = null;
    this._onErrorCb = null;

    this._bindAudioEvents();
  }

  /**
   * Enlaza eventos nativos del elemento HTML5 Audio.
   * @private
   */
  _bindAudioEvents() {
    this.audio.addEventListener('ended', () => {
      if (typeof this._onEndedCb === 'function') {
        this._onEndedCb();
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Error en AudioEngine al reproducir clip:', e);
      if (typeof this._onErrorCb === 'function') {
        this._onErrorCb(e);
      }
    });
  }

  /**
   * Inicializa la cadena de nodos Web Audio tras el primer gesto de usuario.
   * AudioElement -> MediaElementSource -> AnalyserNode -> GainNode -> Destination
   */
  initContext() {
    if (this._isInitialized) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.source = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128; // 64 bandas de frecuencia, óptimo para 60fps
      this.analyser.smoothingTimeConstant = 0.8;

      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      this.source.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this._isInitialized = true;
    } catch (err) {
      console.warn('Fallo en la conexión de MediaElementSource a Web Audio:', err);
    }
  }

  /**
   * Carga una nueva fuente de audio.
   * @param {string} src - Ruta relativa o URL del archivo de audio.
   * @returns {Promise<void>}
   */
  load(src) {
    return new Promise((resolve, reject) => {
      this.audio.src = src;
      this.audio.load();

      const onCanPlay = () => {
        this.audio.removeEventListener('canplaythrough', onCanPlay);
        this.audio.removeEventListener('error', onError);
        resolve();
      };

      const onError = (e) => {
        this.audio.removeEventListener('canplaythrough', onCanPlay);
        this.audio.removeEventListener('error', onError);
        reject(e);
      };

      this.audio.addEventListener('canplaythrough', onCanPlay, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
    });
  }

  /**
   * Inicia o reanuda la reproducción asegurando el contexto de audio.
   * @returns {Promise<void>}
   */
  async play() {
    this.initContext();

    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    try {
      await this.audio.play();
    } catch (err) {
      console.warn('Autoplay bloqueado por el navegador hasta interacción del usuario:', err);
      throw err;
    }
  }

  /**
   * Pausa la reproducción del clip.
   */
  pause() {
    this.audio.pause();
  }

  /**
   * Detiene la reproducción y reinicia la aguja a 0.
   */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  /**
   * Ajusta el volumen de la pista (0.0 a 1.0).
   * @param {number} val
   */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.isMuted && this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Alterna el modo silencio del reproductor.
   * @returns {boolean} Estado actual de silencio.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  /**
   * Obtiene la matriz de frecuencias en tiempo real para el visualizador Canvas.
   * @returns {Uint8Array}
   */
  getFrequencyData() {
    if (this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      return this.frequencyData;
    }
    return new Uint8Array(64);
  }

  /**
   * Suscribe un callback al finalizar el clip de audio.
   * @param {Function} cb
   */
  onEnded(cb) {
    this._onEndedCb = cb;
  }

  /**
   * Suscribe un callback si ocurre un error de reproducción.
   * @param {Function} cb
   */
  onError(cb) {
    this._onErrorCb = cb;
  }
}

export const audioEngine = new AudioEngine();
