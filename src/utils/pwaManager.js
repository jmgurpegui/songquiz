/**
 * @fileoverview Gestor PWA / Android TWA para SongQuiz (instalación en app,
 * detección de modo standalone, guía iOS Safari y estado de conectividad offline).
 */

/**
 * Detecta si la aplicación se ejecuta ya instalada en modo standalone o TWA.
 * @returns {boolean}
 */
export function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const mqFullscreen = window.matchMedia?.('(display-mode: fullscreen)')?.matches;
  const iosStandalone = Boolean(window.navigator?.standalone);
  const twaReferrer = typeof document !== 'undefined' && document.referrer.startsWith('android-app://');
  return Boolean(mqStandalone || mqFullscreen || iosStandalone || twaReferrer);
}

/**
 * Detecta Safari en iOS/iPadOS donde `beforeinstallprompt` no existe y se requiere guía manual.
 * @returns {boolean}
 */
export function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(ua);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS && isWebKit && !isOtherBrowser;
}

export class PWAManager extends EventTarget {
  constructor() {
    super();

    /** @type {BeforeInstallPromptEvent|null} */
    this.deferredPrompt = null;
    this.isStandalone = isStandaloneMode();
    this.isIOS = isIOSSafari();
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    this.isInstallable = false;

    this._bindEvents();
  }

  /**
   * Suscribe los eventos nativos de instalación PWA y conectividad.
   * @private
   */
  _bindEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event;
      this.isInstallable = !this.isStandalone;
      this._emitState();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isStandalone = true;
      this.isInstallable = false;
      this._emitState();
      this.dispatchEvent(new CustomEvent('installed'));
    });

    const displayModeMq = window.matchMedia?.('(display-mode: standalone)');
    if (displayModeMq && typeof displayModeMq.addEventListener === 'function') {
      displayModeMq.addEventListener('change', (e) => {
        if (e.matches) {
          this.isStandalone = true;
          this.isInstallable = false;
          this.deferredPrompt = null;
          this._emitState();
        }
      });
    }

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.dispatchEvent(new CustomEvent('connectivityChange', { detail: { isOnline: true } }));
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.dispatchEvent(new CustomEvent('connectivityChange', { detail: { isOnline: false } }));
    });
  }

  /**
   * Indica si debe mostrarse el botón de instalación en la cabecera.
   * Oculto automáticamente cuando ya corre en modo standalone / TWA.
   * @returns {boolean}
   */
  shouldShowInstallButton() {
    if (this.isStandalone) return false;
    return this.isInstallable || this.isIOS;
  }

  /**
   * Dispara el diálogo nativo de instalación en Chromium/Android o solicita guía iOS.
   * @returns {Promise<'accepted'|'dismissed'|'ios-guide'|'unavailable'>}
   */
  async promptInstall() {
    if (this.isStandalone) return 'unavailable';

    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        const choice = await this.deferredPrompt.userChoice;
        this.deferredPrompt = null;
        this.isInstallable = false;
        this._emitState();
        return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        return 'unavailable';
      }
    }

    if (this.isIOS) {
      return 'ios-guide';
    }

    return 'unavailable';
  }

  /**
   * Emite estado consolidado hacia la interfaz.
   * @private
   */
  _emitState() {
    this.dispatchEvent(new CustomEvent('installStateChange', {
      detail: {
        shouldShow: this.shouldShowInstallButton(),
        isStandalone: this.isStandalone,
        isIOS: this.isIOS,
        hasNativePrompt: Boolean(this.deferredPrompt)
      }
    }));
  }
}
