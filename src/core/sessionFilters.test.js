import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DecadeFilters,
  DifficultyLevels,
  filterSongsByDecade,
  getFailedSongsFromCatalog,
  evaluateClassicTypedAnswer,
  buildClassicExpertHint
} from './sessionFilters.js';
import { generateOptions } from '../utils/random.js';

const SAMPLE_CATALOG = [
  { id: 's1', title: 'Bohemian Rhapsody', artist: 'Queen', genre: 'Progressive Rock', year: 1975 },
  { id: 's2', title: "Don't Stop Me Now", artist: 'Queen', genre: 'Classic Rock', year: 1978 },
  { id: 's3', title: 'We Will Rock You', artist: 'Queen', genre: 'Classic Rock', year: 1977 },
  { id: 's4', title: 'Another One Bites the Dust', artist: 'Queen', genre: 'Classic Rock', year: 1980 },
  { id: 's5', title: 'Billie Jean', artist: 'Michael Jackson', genre: 'Pop / Funk', year: 1982 },
  { id: 's6', title: 'Smells Like Teen Spirit', artist: 'Nirvana', genre: 'Grunge / Rock', year: 1991 },
  { id: 's7', title: 'Viva La Vida', artist: 'Coldplay', genre: 'Alternative Rock', year: 2008 },
  { id: 's8', title: 'Shape of You', artist: 'Ed Sheeran', genre: 'Pop', year: 2017 },
  { id: 's9', title: 'Flowers', artist: 'Miley Cyrus', genre: 'Pop', year: 2023 },
  { id: 's10', title: 'Hey Jude', artist: 'The Beatles', genre: 'Classic Rock', year: 1968 }
];

test('filterSongsByDecade accurately buckets 60s-70s through 2020s', () => {
  assert.equal(filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.ALL).length, 10);
  assert.deepEqual(
    filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.CLASSIC_60S_70S).map((s) => s.id),
    ['s1', 's2', 's3', 's10']
  );
  assert.deepEqual(
    filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.DECADES_80S).map((s) => s.id),
    ['s4', 's5']
  );
  assert.deepEqual(
    filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.DECADES_90S).map((s) => s.id),
    ['s6']
  );
  assert.deepEqual(
    filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.DECADES_00S).map((s) => s.id),
    ['s7']
  );
  assert.deepEqual(
    filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.DECADES_10S).map((s) => s.id),
    ['s8']
  );
  assert.deepEqual(
    filterSongsByDecade(SAMPLE_CATALOG, DecadeFilters.DECADES_20S).map((s) => s.id),
    ['s9']
  );
});

test('getFailedSongsFromCatalog resolves unique failed songs with most recent first', () => {
  const result = getFailedSongsFromCatalog(['s1', 'missing_id', 's8', 's1'], SAMPLE_CATALOG);
  assert.deepEqual(result.map((s) => s.id), ['s1', 's8']);
});

test('evaluateClassicTypedAnswer accepts exact, fuzzy, accent-insensitive, and Title - Artist inputs', () => {
  const song = { title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, genre: 'Progressive Rock' };

  assert.equal(evaluateClassicTypedAnswer('Bohemian Rhapsody', song).isCorrect, true);
  assert.equal(evaluateClassicTypedAnswer('bohemian rapsody', song).isCorrect, true);
  assert.equal(evaluateClassicTypedAnswer('Bohemian Rhapsody - Queen', song).isCorrect, true);
  assert.equal(evaluateClassicTypedAnswer('Queen - Bohemian Rhapsody', song).isCorrect, true);
  assert.equal(evaluateClassicTypedAnswer('Billie Jean', song).isCorrect, false);
  assert.equal(evaluateClassicTypedAnswer('   ', song).isCorrect, false);

  const spanishSong = { title: 'La Bicicleta', artist: 'Carlos Vives & Shakira', year: 2016 };
  assert.equal(evaluateClassicTypedAnswer('lá bicicléta', spanishSong).isCorrect, true);
});

test('buildClassicExpertHint provides progressive artist and masked-title hints', () => {
  const song = { title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, genre: 'Progressive Rock' };
  const h1 = buildClassicExpertHint(song, 1);
  const h2 = buildClassicExpertHint(song, 2);

  assert.ok(h1.includes('Queen') && h1.includes('1975'));
  assert.ok(!h1.includes('Bohemian'));
  assert.ok(h2.includes('B______') && h2.includes('R______'));
});

test('generateOptions in HARD difficulty prioritizes same-artist and same-era distractors', () => {
  const target = SAMPLE_CATALOG[0]; // Bohemian Rhapsody - Queen (1975)
  const { options, correctAnswer } = generateOptions(target, SAMPLE_CATALOG, 4, [], {
    difficulty: DifficultyLevels.HARD
  });

  assert.equal(correctAnswer, 'Bohemian Rhapsody - Queen');
  assert.equal(options.length, 4);
  assert.ok(options.includes(correctAnswer));

  // In HARD mode, all 3 distractors should come from Queen (same artist, same 70s/80s era)
  const queenCount = options.filter((o) => o.endsWith('- Queen')).length;
  assert.equal(queenCount, 4, `Expected hard mode to prioritize Queen distractors, got: ${options.join(' | ')}`);
});
