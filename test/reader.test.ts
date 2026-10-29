import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('night run reader', () => {
  it('aggregates the fixture and counts malformed lines', () => {
    const result = readNight('runs', '2026-10-28');

    expect(result.rows).toHaveLength(5);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result.malformedLines).toBe(1);
    expect(result.rows.find(({ job }) => job === 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(result.rows.find(({ job }) => job === 'notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
    expect(result.rows.find(({ job }) => job === 'fixtures/refresh')).not.toHaveProperty('lastError');
  });

  it('keeps jobs whose latest owner is null', () => {
    const result = readNight('runs', '2026-10-28');

    expect(result.rows.find(({ job }) => job === 'digest/render')).toMatchObject({
      job: 'digest/render',
      owner: null,
      runs: 1,
      lastStatus: 'ok',
    });
  });

  it('returns an empty result when the night file is missing', () => {
    expect(readNight('runs', '2026-10-26')).toEqual({
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      malformedLines: 0,
    });
  });

  it('rejects a night value that could escape the run directory', () => {
    expect(() => readNight('runs', '..\\outside')).toThrow(RangeError);
  });
});
