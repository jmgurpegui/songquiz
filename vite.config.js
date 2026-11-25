import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Plugin ligero sin dependencias externas que asegura que el build de producción (`dist/`)
 * incluya todos los recursos estáticos PWA, audios locales auténticos y catálogos JSON
 * usados en tiempo de ejecución tanto en publicación web (AI Studio / Cloud) como en GitHub Pages.
 */
function songquizStaticAssetsPlugin() {
  return {
    name: 'songquiz-static-assets',
    enforce: 'post',
    transformIndexHtml(html) {
      // Garantizar que el manifest siempre se sirva desde la raíz (./manifest.json)
      // para que sus rutas relativas (start_url "./" e iconos "./assets/icons/...") resuelvan bien.
      return html.replace(
        /<link\s+rel="manifest"\s+href="[^"]*"\s*\/?>/i,
        '<link rel="manifest" href="./manifest.json">'
      );
    },
    closeBundle() {
      const rootDir = process.cwd();
      const distDir = path.resolve(rootDir, 'dist');

      const filesToCopy = [
        'manifest.json',
        'sw.js',
        'src/data/songs.json',
        'src/data/lyricsBank.json'
      ];

      for (const relPath of filesToCopy) {
        const srcPath = path.resolve(rootDir, relPath);
        const destPath = path.resolve(distDir, relPath);
        if (fs.existsSync(srcPath)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
        }
      }

      const dirsToCopy = [
        'assets/icons'
      ];

      for (const relDir of dirsToCopy) {
        const srcDir = path.resolve(rootDir, relDir);
        const destDir = path.resolve(distDir, relDir);
        if (fs.existsSync(srcDir)) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.cpSync(srcDir, destDir, { recursive: true, force: true });
        }
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [songquizStaticAssetsPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
