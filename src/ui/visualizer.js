/**
 * @fileoverview Visualizador de espectrograma en tiempo real mediante HTML5 Canvas y Web Audio.
 * Paleta de estudio esmeralda/pizarra, físicas de picos suaves y soporte completo para
 * `prefers-reduced-motion: reduce`.
 */

export class AudioVisualizer {
  /**
   * @param {HTMLCanvasElement} canvasElement - Elemento canvas donde se renderiza el espectro.
   * @param {import('../audio/audioEngine.js').AudioEngine} audioEngine - Instancia del motor de audio.
   */
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    /** @type {CanvasRenderingContext2D} */
    this.ctx = this.canvas.getContext('2d');
    this.audioEngine = audioEngine;

    this.animationId = null;
    this.isRunning = false;
    this.idleTime = 0;

    // Físicas de picos flotantes
    this.peaks = [];
    this.peakDecay = 1.6;

    // Preferencia de accesibilidad: movimiento reducido (WCAG 2.1)
    this._motionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this.prefersReducedMotion = Boolean(this._motionQuery?.matches);

    this._handleResize = this._handleResize.bind(this);
    this._renderLoop = this._renderLoop.bind(this);
    this._handleMotionChange = this._handleMotionChange.bind(this);

    window.addEventListener('resize', this._handleResize);
    if (this._motionQuery) {
      if (typeof this._motionQuery.addEventListener === 'function') {
        this._motionQuery.addEventListener('change', this._handleMotionChange);
      } else if (typeof this._motionQuery.addListener === 'function') {
        this._motionQuery.addListener(this._handleMotionChange);
      }
    }
    this._handleResize();
  }

  /**
   * Responde dinámicamente a cambios en la preferencia del sistema `prefers-reduced-motion`.
   * @param {MediaQueryListEvent} e
   * @private
   */
  _handleMotionChange(e) {
    this.prefersReducedMotion = Boolean(e.matches);
    if (this.prefersReducedMotion) {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this._drawStaticReducedFrame();
    } else if (this.isRunning && !this.animationId) {
      this.animationId = requestAnimationFrame(this._renderLoop);
    }
  }

  /**
   * Adapta el tamaño del canvas al pixel ratio de la pantalla para máxima nitidez (Retina/HiDPI).
   * @private
   */
  _handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;

    if (this.prefersReducedMotion && this.isRunning) {
      this._drawStaticReducedFrame();
    }
  }

  /**
   * Inicia el bucle de renderizado (o pinta un fotograma estático si hay movimiento reducido).
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._handleResize();

    if (this.prefersReducedMotion) {
      this._drawStaticReducedFrame();
      return;
    }

    this.animationId = requestAnimationFrame(this._renderLoop);
  }

  /**
   * Detiene el bucle de renderizado y limpia recursos.
   */
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Dibuja un espectro estático sobrio cuando el usuario prefiere movimiento reducido.
   * @private
   */
  _drawStaticReducedFrame() {
    if (!this.ctx || !this.width || !this.height) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const midY = this.height / 2;
    this.ctx.beginPath();
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeStyle = 'rgba(29, 185, 84, 0.28)';
    this.ctx.moveTo(24, midY);
    this.ctx.lineTo(Math.max(24, this.width - 24), midY);
    this.ctx.stroke();
  }

  /**
   * Bucle principal de animación a 60fps.
   * @private
   */
  _renderLoop() {
    if (!this.isRunning || this.prefersReducedMotion) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    const freqData = this.audioEngine.getFrequencyData();
    let hasSignal = false;

    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > 5) {
        hasSignal = true;
        break;
      }
    }

    if (hasSignal && !this.audioEngine.audio.paused) {
      this._drawSpectrum(freqData);
    } else {
      this._drawIdleWave();
    }

    this.animationId = requestAnimationFrame(this._renderLoop);
  }

  /**
   * Dibuja un espectro discreto estilo estudio Spotify cuando se reproducen archivos locales MP3.
   * @private
   * @param {Uint8Array} freqData
   */
  _drawSpectrum(freqData) {
    const barCount = 36;
    const barSpacing = 5;
    const totalSpacing = barSpacing * (barCount - 1);
    const barWidth = Math.max(3, (this.width - 64 - totalSpacing) / barCount);
    const startX = (this.width - (barCount * barWidth + totalSpacing)) / 2;

    const gradient = this.ctx.createLinearGradient(0, this.height, 0, this.height * 0.45);
    gradient.addColorStop(0, 'rgba(29, 185, 84, 0.12)');
    gradient.addColorStop(0.65, 'rgba(29, 185, 84, 0.34)');
    gradient.addColorStop(1, 'rgba(30, 215, 96, 0.55)');

    if (this.peaks.length !== barCount) {
      this.peaks = new Array(barCount).fill(0);
    }

    const maxBarHeight = Math.max(24, this.height * 0.42);

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor(Math.pow(i / barCount, 1.35) * (freqData.length - 1));
      const value = freqData[dataIndex] || 0;
      const percent = value / 255;
      const barHeight = Math.max(3, percent * maxBarHeight);

      const x = startX + i * (barWidth + barSpacing);
      const y = this.height - barHeight - 10;

      if (barHeight >= this.peaks[i]) {
        this.peaks[i] = barHeight;
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i] - this.peakDecay);
      }

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      if (typeof this.ctx.roundRect === 'function') {
        this.ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      } else {
        this.ctx.rect(x, y, barWidth, barHeight);
      }
      this.ctx.fill();
    }
  }

  /**
   * Renderiza una sutil onda sinusoidal de estudio mientras suena el audio remoto.
   * @private
   */
  _drawIdleWave() {
    this.idleTime += 0.025;
    const midY = this.height / 2;
    const waveCount = 2;

    for (let w = 0; w < waveCount; w++) {
      this.ctx.beginPath();
      this.ctx.lineWidth = w === 0 ? 1.6 : 1;
      this.ctx.strokeStyle = w === 0
        ? 'rgba(29, 185, 84, 0.26)'
        : 'rgba(255, 255, 255, 0.08)';

      for (let x = 0; x < this.width; x += 3) {
        const freq = 0.011 * (w + 1);
        const amp = 7 * (w + 1);
        const y = midY + Math.sin(x * freq + this.idleTime * (w + 1)) * amp;

        if (x === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    }
  }

  /**
   * Limpieza de observadores al desmontar componente.
   */
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._handleResize);
    if (this._motionQuery) {
      if (typeof this._motionQuery.removeEventListener === 'function') {
        this._motionQuery.removeEventListener('change', this._handleMotionChange);
      } else if (typeof this._motionQuery.removeListener === 'function') {
        this._motionQuery.removeListener(this._handleMotionChange);
      }
    }
  }
}
