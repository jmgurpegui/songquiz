#!/usr/bin/env python3
"""
scripts/import_playlist.py
Extractor e importador de listas de reproducción de YouTube para SongQuiz.
Permite convertir cualquier lista de reproducción pública en un catálogo estructurado 'songs.json'
con campos pedagógicos (letras y curiosidades culturales) listos para enriquecer.

Zero-API: No requiere credenciales ni claves de Google Cloud / YouTube Data API.
"""

import sys
import os
import json
import re
import urllib.request
import urllib.parse

def clean_youtube_title(raw_title, raw_author=""):
    """
    Limpia el título de YouTube eliminando ruido común como '(Official Video)',
    '[Lyrics]', '(Remastered)', etc., y separa Artista y Título.
    """
    # Eliminar corchetes y paréntesis con ruido
    title = re.sub(r'[\(\[](official\s*(music)?\s*video|official\s*audio|video\s*oficial|audio|lyrics?|lyric\s*video|letra|remastered?|clip\s*officiel|visualizer|hd|4k|hq)[\)\]]', '', raw_title, flags=re.IGNORECASE)
    # Eliminar pipes o guiones finales
    title = re.sub(r'\s*\|\s*.*$', '', title)
    title = re.sub(r'\s*-\s*$', '', title).strip()

    # Intentar separar por " - " o " – " o " — "
    separator_match = re.split(r'\s*[\-–—:]\s*', title, maxsplit=1)
    if len(separator_match) == 2:
        part1, part2 = separator_match[0].strip(), separator_match[1].strip()
        # Heurística: si part1 parece el artista o coincide con raw_author
        artist = part1
        track_title = part2
    else:
        track_title = title
        artist = raw_author.replace(' - Topic', '').replace('VEVO', '').strip() or "Artista Desconocido"

    # Limpieza final de comillas
    track_title = track_title.strip('"\' ')
    artist = artist.strip('"\' ')

    return track_title, artist

def extract_playlist_videos(playlist_url_or_id):
    """
    Descarga el HTML inicial de la playlist pública y extrae los vídeos sin API Key.
    """
    # Extraer el ID de la lista
    if 'list=' in playlist_url_or_id:
        match = re.search(r'list=([a-zA-Z0-9_\-]+)', playlist_url_or_id)
        if not match:
            raise ValueError("No se pudo detectar el parámetro 'list=' en la URL proporcionada.")
        playlist_id = match.group(1)
    else:
        playlist_id = playlist_url_or_id.strip()

    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    print(f"[*] Conectando a YouTube: {url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response:
        html = response.read().decode('utf-8', errors='ignore')

    # Buscar el objeto ytInitialData en el HTML
    data_match = re.search(r'var ytInitialData\s*=\s*({.*?});</script>', html)
    if not data_match:
        # Intentar formato alternativo window["ytInitialData"]
        data_match = re.search(r'window\["ytInitialData"\]\s*=\s*({.*?});', html)
        if not data_match:
            raise RuntimeError("No se pudo encontrar los datos iniciales de la lista de reproducción. Verifica que la lista sea pública.")

    raw_json = json.loads(data_match.group(1))

    # Navegar el árbol de datos de YouTube
    videos = []
    try:
        tabs = raw_json['contents']['twoColumnBrowseResultsRenderer']['tabs']
        tab_content = tabs[0]['tabRenderer']['content']['sectionListRenderer']['contents']
        item_section = tab_content[0]['itemSectionRenderer']['contents'][0]
        playlist_renderer = item_section.get('playlistVideoListRenderer', {})
        contents = playlist_renderer.get('contents', [])

        for item in contents:
            if 'playlistVideoRenderer' in item:
                v = item['playlistVideoRenderer']
                video_id = v.get('videoId')
                raw_title = v.get('title', {}).get('runs', [{}])[0].get('text', '')
                raw_author = v.get('shortBylineText', {}).get('runs', [{}])[0].get('text', '')

                if video_id and raw_title:
                    title, artist = clean_youtube_title(raw_title, raw_author)
                    videos.append({
                        'videoId': video_id,
                        'title': title,
                        'artist': artist,
                        'rawTitle': raw_title
                    })
    except Exception as e:
        print(f"[!] Error al parsear estructura interna: {e}")

    return playlist_id, videos

def import_and_save(playlist_url_or_id, output_path="src/data/songs.json", append=False):
    playlist_id, raw_videos = extract_playlist_videos(playlist_url_or_id)
    print(f"[+] Se encontraron {len(raw_videos)} canciones en la lista.")

    if not raw_videos:
        print("[!] No se encontraron vídeos válidos. Asegúrate de que la lista no esté vacía o privada.")
        return

    existing_songs = []
    if append and os.path.exists(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8') as f:
                existing_songs = json.load(f)
        except Exception:
            existing_songs = []

    existing_ids = {s['id'] for s in existing_songs}
    new_entries = []

    for v in raw_videos:
        slug_id = re.sub(r'[^a-z0-9_]', '', v['title'].lower().replace(' ', '_'))[:30] or v['videoId']
        if slug_id in existing_ids:
            continue

        entry = {
            "id": slug_id,
            "title": v['title'],
            "artist": v['artist'],
            "genre": "Pop / Variado",
            "year": 2024,
            "audioSrc": f"assets/audio/{slug_id}.wav",
            "youtubeId": v['videoId'],
            "lyrics": {
                "en": f"[Letra original en inglés para {v['title']}]\nAgrega aquí los versos clave para la práctica.",
                "es": f"[Traducción didáctica al español]\nAgrega aquí la traducción correspondiente."
            },
            "culturalTrivia": f"Curiosidad pedagógica sobre '{v['title']}' de {v['artist']}. Añade contexto histórico, anécdotas de grabación o significado cultural."
        }
        new_entries.append(entry)
        existing_ids.add(slug_id)

    final_list = existing_songs + new_entries

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=2)

    print(f"[✓] Archivo guardado con éxito: {output_path}")
    print(f"[✓] Total canciones ahora en el catálogo: {len(final_list)} ({len(new_entries)} añadidas)")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python3 scripts/import_playlist.py <URL_O_ID_DE_PLAYLIST> [--append]")
        print("Ejemplo: python3 scripts/import_playlist.py https://www.youtube.com/playlist?list=RDCLAK5uy_kHSavu4ofFfVIOzsA_wa4SuMS3dc76TYQ")
        sys.exit(1)

    playlist_arg = sys.argv[1]
    is_append = '--append' in sys.argv
    import_and_save(playlist_arg, append=is_append)
