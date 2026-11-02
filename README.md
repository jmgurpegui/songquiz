# 🎵 SongQuiz Pro - Trivia Musical y Aprendizaje Activo

Aplicación web interactiva de trivia musical y aprendizaje activo basada en **Web Audio API** y arquitectura modular en **JavaScript ES6 Vanilla**. Diseñada bajo la premisa de **100% Client-Side**: sin dependencias de APIs de terceros (sin YouTube IFrame API, sin Spotify, sin Deezer) y sin IA en tiempo de ejecución.

Compatible de forma nativa con **GitHub Pages** y configurable opcionalmente con **Vite**.

---

## 🚀 Características Principales

- **Zero-API & Zero-IA:** Todo el catálogo musical, lógica de puntuación y generación de distractores se procesan localmente en el navegador.
- **Motor de Audio Híbrido:**
  - **HTML5 `<audio>` + AnalyserNode:** Carga y reproducción de clips de audio locales con extracción de frecuencias en tiempo real.
  - **Síntesis Procedural (Web Audio API):** Efectos de sonido (arpegios mayores para acierto, zumbador con ondas diente de sierra para error, pulso de reloj y fanfarria final) generados al vuelo mediante osciladores, sin descargar archivos de audio auxiliares.
- **Visualizador Espectral en Canvas:** Espectrograma en tiempo real a 60 fps con gradientes de neón cian/magenta y físicas de picos flotantes.
- **Algoritmia Insesgada (Fisher-Yates):** Sustitución del antipatrón `sort(() => Math.random() - 0.5)` por el algoritmo de barajeo equiprobable de Knuth/Fisher-Yates.
- **Gamificación Avanzada:**
  - Temporizador de 15 segundos con bonificación por velocidad de respuesta.
  - Multiplicador de racha (combos x1.5 y x2.0).
  - Persistencia de récords y estadísticas en `localStorage`.
- **Dimensión Pedagógica:** Exhibición simultánea de letras en inglés y su traducción al español, junto a anécdotas e historia cultural de cada composición.
- **Accesibilidad Universal (WCAG 2.1 AA):** Atajos de teclado completos (`1-4` para opciones, `Espacio` para reproducción, `N` o `Enter` para siguiente pista, `M` para silenciar), regiones `aria-live` y compatibilidad con `prefers-reduced-motion`.
- **PWA Offline-First:** `manifest.json` y `Service Worker` (`sw.js`) con estrategia Cache-First.

---

## 📁 Estructura del Proyecto

```text
SongQuiz/
├── index.html              # Estructura semántica accesible HTML5
├── manifest.json           # Manifiesto PWA para instalación de escritorio/móvil
├── sw.js                   # Service Worker para funcionamiento 100% offline
├── package.json            # Scripts opcionales de desarrollo (Vite)
├── assets/
│   ├── audio/              # Clips de audio locales (.wav / .mp3)
│   └── icons/              # Iconos vectoriales y favicons SVG
└── src/
    ├── main.js             # Punto de entrada y orquestador (bootstrap)
    ├── core/
    │   ├── gameState.js    # Máquina de estados finitos (IDLE, PLAYING, ROUND_OVER, GAME_OVER)
    │   └── gameLogic.js    # Reglas de negocio, temporizador y persistencia local
    ├── audio/
    │   ├── audioEngine.js  # Motor de audio HTML5 conectado a AnalyserNode
    │   └── soundFX.js      # Síntesis procedural de efectos con osciladores
    ├── data/
    │   └── songs.json      # Catálogo tipado con letras y datos culturales
    ├── utils/
    │   └── random.js       # Barajeo Fisher-Yates y generador dinámico de distractores
    ├── ui/
    │   ├── visualizer.js   # Espectrograma Canvas a 60fps
    │   └── domRenderer.js  # Renderizado reactivo y atajos de teclado
    └── styles/
        ├── variables.css   # Tokens de diseño, colores cyberpunk y fluid typography clamp()
        └── main.css        # Layout responsive con CSS Grid / Flexbox
```

---

## 💻 Desarrollo Local

### Opción 1: Con Vite (Recomendado)
```bash
npm install
npm run dev
```

### Opción 2: Con cualquier servidor HTTP estático
```bash
# Python 3
python3 -m http.server 8080

# O con npx serve
npx serve .
```

Abre `http://localhost:8080` en tu navegador.

---

## 🌐 Despliegue en GitHub Pages

Dado que la arquitectura se basa en módulos ES6 nativos del navegador (`<script type="module">`), el proyecto se ejecuta directamente desde la raíz del repositorio en GitHub Pages sin necesidad de pasos de compilación obligatorios:

1. Ve a **Settings > Pages** en tu repositorio de GitHub.
2. Selecciona la rama `main` y la carpeta `/ (root)`.
3. ¡Tu SongQuiz estará activo en segundos!
