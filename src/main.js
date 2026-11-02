/**
 * @fileoverview Punto de entrada (bootstrap) de la aplicación SongQuiz.
 * Coordina la inyección de dependencias, la carga del catálogo y el registro de PWA.
 */

import { GameState } from './core/gameState.js';
import { GameLogic } from './core/gameLogic.js';
import { audioEngine } from './audio/audioEngine.js';
import { sfx } from './audio/soundFX.js';
import { AudioVisualizer } from './ui/visualizer.js';
import { DOMRenderer } from './ui/domRenderer.js';

async function bootstrap() {
  console.log('%c🎵 SongQuiz Pro Engine v2.0 (Zero-API / Zero-IA)', 'color: #66fcf1; font-weight: bold; font-size: 14px;');

  // 1. Obtener referencia del canvas
  const canvas = document.getElementById('visualizer-canvas');
  if (!canvas) {
    console.error('Canvas #visualizer-canvas no encontrado en el DOM.');
    return;
  }

  // 2. Inyección de dependencias modular
  const visualizer = new AudioVisualizer(canvas, audioEngine);
  const gameState = new GameState();
  const gameLogic = new GameLogic(gameState, audioEngine, visualizer);
  new DOMRenderer(gameState, gameLogic, audioEngine, sfx);

  // 3. Cargar catálogo de canciones estructurado
  try {
    const response = await fetch('./src/data/songs.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const songs = await response.json();

    // Habilitar el botón de inicio
    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = '▶ Comenzar Partida';
    }

    // Inicializar lógica de juego con catálogo cargado
    gameLogic.startNewGame(songs);
  } catch (err) {
    console.error('Error al inicializar el catálogo de canciones:', err);
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) {
      statusMsg.textContent = '⚠️ Error al cargar el catálogo de canciones local.';
      statusMsg.style.color = 'var(--color-error)';
    }
  }

  // 4. Registro del Service Worker para funcionamiento Offline / PWA
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('ServiceWorker registrado con éxito:', reg.scope))
        .catch((err) => console.warn('Fallo en el registro de ServiceWorker:', err));
    });
  }
}

// Ejecutar bootstrap al cargar el árbol DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
