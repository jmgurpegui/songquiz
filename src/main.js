/**
 * @fileoverview Punto de entrada (bootstrap) de la aplicación SongQuiz.
 * Coordina la inyección de dependencias, YouTube Player, Web Audio y gestor de listas.
 */

import { GameState } from './core/gameState.js';
import { GameLogic } from './core/gameLogic.js';
import { audioEngine } from './audio/audioEngine.js';
import { sfx } from './audio/soundFX.js';
import { youtubePlayer } from './audio/youtubePlayer.js';
import { AudioVisualizer } from './ui/visualizer.js';
import { DOMRenderer } from './ui/domRenderer.js';

async function bootstrap() {
  console.log('%c🎵 SongQuiz v2.9.0', 'color: #1db954; font-weight: bold; font-size: 14px;');

  const canvas = document.getElementById('visualizer-canvas');
  if (!canvas) {
    console.error('Canvas #visualizer-canvas no encontrado en el DOM.');
    return;
  }

  // Inicializar YouTube IFrame API en segundo plano
  youtubePlayer.init('ytplayer').catch((e) => {
    console.warn('YouTube IFrame API no disponible inmediatamente:', e);
  });

  const visualizer = new AudioVisualizer(canvas, audioEngine);
  const gameState = new GameState();
  const gameLogic = new GameLogic(gameState, audioEngine, visualizer, youtubePlayer);

  try {
    const response = await fetch('./src/data/songs.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const defaultSongs = await response.json();

    // Iniciar renderizador del DOM
    new DOMRenderer(gameState, gameLogic, audioEngine, sfx, defaultSongs, youtubePlayer);

    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = '▶ Comenzar Partida';
    }

    gameLogic.startNewGame(defaultSongs);
  } catch (err) {
    console.error('Error al inicializar el catálogo de canciones:', err);
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
      statusMsg.textContent = '⚠️ Error al cargar el catálogo de canciones local.';
      statusMsg.style.color = 'var(--color-error)';
    }
  }

  // Registro PWA Offline First
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('ServiceWorker registrado:', reg.scope))
        .catch((err) => console.warn('ServiceWorker error:', err));
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
