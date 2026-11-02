/**
 * @fileoverview Motor de síntesis de efectos de sonido procedurales mediante Web Audio API.
 * Genera retroalimentación sonora sin dependencias de red, archivos externos ni APIs de terceros.
 */

export class SoundFX {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.masterGain = null;
    this.isMuted = false;
    this.volume = 0.5;
  }

  /**
   * Inicializa de forma perezosa el contexto de audio tras un gesto del usuario.
   * @private
   */
  _ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Alterna el estado de silencio global para los efectos de sonido.
   * @returns {boolean} Nuevo estado de silencio.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  /**
   * Ajusta el volumen maestro de los efectos de sonido.
   * @param {number} val - Nivel entre 0.0 y 1.0.
   */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.isMuted && this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Emite un arpegio ascendente brillante en acorde mayor para respuesta acertada.
   */
  playCorrect() {
    try {
      this._ensureContext();
      if (this.isMuted) return;

      const now = this.ctx.currentTime;
      // Arpegio C5 -> E5 -> G5 -> C6
      const frequencies = [523.25, 659.25, 783.99, 1046.50];

      frequencies.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        // Curva de envolvente ADSR suave
        const startTime = now + idx * 0.07;
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

        osc.connect(noteGain);
        noteGain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.36);
      });
    } catch (e) {
      console.warn('AudioContext no inicializado:', e);
    }
  }

  /**
   * Emite un zumbador grave y disonante para respuesta errónea.
   */
  playWrong() {
    try {
      this._ensureContext();
      if (this.isMuted) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      // Dos ondas de diente de sierra ligeramente desafinadas para tensión
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(140, now);
      osc1.frequency.linearRampToValueAtTime(80, now + 0.35);

      osc2.frequency.setValueAtTime(147, now);
      osc2.frequency.linearRampToValueAtTime(83, now + 0.35);

      noteGain.gain.setValueAtTime(0.25, now);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.36);
      osc2.stop(now + 0.36);
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
  }

  /**
   * Emite un pulso percutivo sutil (reloj) cuando el tiempo se agota (< 5s).
   */
  playTick() {
    try {
      this._ensureContext();
      if (this.isMuted) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.04);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Ignorar errores menores de timing
    }
  }

  /**
   * Emite un sonido de campanas doradas cuando se alcanza una racha importante.
   */
  playStreak() {
    try {
      this._ensureContext();
      if (this.isMuted) return;

      const now = this.ctx.currentTime;
      const chords = [659.25, 830.61, 987.77, 1318.51]; // Mi Mayor brillante

      chords.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0, now + idx * 0.05);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.05 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.6);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.65);
      });
    } catch (e) {
      // Ignorar
    }
  }

  /**
   * Fanfarria final de cierre de partida.
   */
  playGameOver() {
    try {
      this._ensureContext();
      if (this.isMuted) return;

      const now = this.ctx.currentTime;
      const progression = [523.25, 659.25, 783.99, 1046.50];

      progression.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.2, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.55);
      });
    } catch (e) {
      // Ignorar
    }
  }
}

export const sfx = new SoundFX();
