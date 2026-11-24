/**
 * @fileoverview Punto de entrada (bootstrap) de la aplicación SongQuiz.
 * Coordina la inyección de dependencias: Audio/Vídeo HTML5 sin anuncios, PWA/TWA y gestor de listas.
 */

import { GameState, GameModes } from './core/gameState.js';
import { GameLogic } from './core/gameLogic.js';
import { audioEngine } from './audio/audioEngine.js';
import { sfx } from './audio/soundFX.js';
import { PWAManager } from './utils/pwaManager.js';
import { AudioVisualizer } from './ui/visualizer.js';
import { DOMRenderer } from './ui/domRenderer.js';

async function bootstrap() {
  const canvas = document.getElementById('visualizer-canvas');
  if (!canvas) {
    console.error('Canvas #visualizer-canvas no encontrado en el DOM.');
    return;
  }

  const localVideoEl = document.getElementById('local-video-player');
  if (localVideoEl) {
    audioEngine.attachVideoElement(localVideoEl);
  }

  const visualizer = new AudioVisualizer(canvas, audioEngine);
  const gameState = new GameState();
  const gameLogic = new GameLogic(gameState, audioEngine, visualizer);
  const pwaManager = new PWAManager();

  // Soporta accesos directos del manifest.json (ej. ./?mode=lyrics)
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get('mode');
  if (requestedMode === GameModes.LYRICS) {
    gameState.setGameMode(GameModes.LYRICS);
  }

  try {
    const response = await fetch('./src/data/songs.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const defaultSongs = await response.json();

    // Iniciar renderizador del DOM con soporte móvil/tablet, biblioteca local y PWA/TWA
    new DOMRenderer(gameState, gameLogic, audioEngine, sfx, defaultSongs, pwaManager);

    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Comenzar partida';
    }

    // Iniciar automáticamente la partida cargando la primera pista sin anuncios
    gameLogic.startNewGame(defaultSongs, false, true);
  } catch (err) {
    console.error('Error al inicializar el catálogo de canciones:', err);
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
      statusMsg.textContent = 'Error al cargar el catálogo de canciones local.';
      statusMsg.style.color = 'var(--color-error)';
    }
  }

  // Registro Service Worker PWA Offline-First (HTTPS o localhost)
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .catch((err) => console.warn('ServiceWorker error:', err));
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
