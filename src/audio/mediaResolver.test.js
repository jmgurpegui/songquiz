import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasAuthenticLocalAudio,
  buildYoutubeEmbedUrl,
  extractValidYoutubeId,
  scoreITunesCandidate,
  normalizeMatchText
} from './mediaResolver.js';

test('excludes all 6 legacy synthesized metallic WAV demos from local audio', () => {
  const synthTracks = [
    { title: 'Bohemian Rhapsody', audioSrc: 'assets/audio/bohemian_rhapsody.wav' },
    { title: 'Shape of You', audioSrc: 'assets/audio/shape_of_you.wav' },
    { title: 'Blinding Lights', audioSrc: 'assets/audio/blinding_lights.wav' },
    { title: 'Billie Jean', audioSrc: 'assets/audio/billie_jean.wav' },
    { title: 'Take On Me', audioSrc: 'assets/audio/take_on_me.wav' },
    { title: "Stayin' Alive", audioSrc: './assets/audio/stayin_alive.wav' }
  ];

  for (const song of synthTracks) {
    assert.equal(hasAuthenticLocalAudio(song), false, `Expected synthesized WAV to be excluded for ${song.title}`);
  }

  assert.equal(hasAuthenticLocalAudio({ title: 'Custom Studio', audioSrc: 'assets/custom/real_track.mp3' }), true);
  assert.equal(hasAuthenticLocalAudio({ title: 'Empty', audioSrc: '' }), false);
});

test('builds safe youtube-nocookie embed URLs and rejects invalid IDs', () => {
  assert.equal(extractValidYoutubeId({ youtubeId: 'fJ9rUzIMcZQ' }), 'fJ9rUzIMcZQ');
  assert.equal(extractValidYoutubeId({ youtubeId: 'invalid<script>' }), null);
  assert.equal(extractValidYoutubeId({ youtubeId: '' }), null);

  const url = buildYoutubeEmbedUrl({ youtubeId: 'fJ9rUzIMcZQ' }, { autoplay: true });
  assert.equal(
    url,
    'https://www.youtube-nocookie.com/embed/fJ9rUzIMcZQ?rel=0&modestbranding=1&playsinline=1&autoplay=1'
  );
  assert.equal(buildYoutubeEmbedUrl({ youtubeId: 'bad' }), null);
});

test('scoreITunesCandidate prefers studio originals over karaoke, 8-bit, and remixes', () => {
  const normTitle = normalizeMatchText('Blinding Lights');
  const normArtist = normalizeMatchText('The Weeknd');

  const studioOriginal = scoreITunesCandidate(
    {
      trackName: 'Blinding Lights',
      artistName: 'The Weeknd',
      collectionName: 'After Hours',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview1.m4a'
    },
    normTitle,
    normArtist,
    'Blinding Lights'
  );

  const remix = scoreITunesCandidate(
    {
      trackName: 'Blinding Lights (Remix)',
      artistName: 'The Weeknd & ROSALÍA',
      collectionName: 'Blinding Lights (Remix) - Single',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview2.m4a'
    },
    normTitle,
    normArtist,
    'Blinding Lights'
  );

  const karaoke = scoreITunesCandidate(
    {
      trackName: 'Blinding Lights (Karaoke Version)',
      artistName: 'Karaoke Tribute Band',
      collectionName: 'Karaoke Hits',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview3.m4a'
    },
    normTitle,
    normArtist,
    'Blinding Lights'
  );

  assert.ok(studioOriginal > remix, `Expected original (${studioOriginal}) > remix (${remix})`);
  assert.ok(remix > karaoke, `Expected remix (${remix}) > karaoke (${karaoke})`);
  assert.ok(studioOriginal >= 90, `Expected high confidence score for studio original, got ${studioOriginal}`);
  assert.ok(karaoke < 22, `Expected karaoke to be rejected (<22), got ${karaoke}`);
});
