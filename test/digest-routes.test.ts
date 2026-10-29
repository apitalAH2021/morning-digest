import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ReadNightResult } from '../src/digest/types.js';

const night = '2026-10-28';
const records = [
  { at: '2026-10-28T23:00:00+01:00', job: 'zulu', owner: 'rook', status: 'fail', error: 'quota exceeded' },
  { at: '2026-10-28T23:01:00+01:00', job: 'alpha', owner: 'rook', status: 'retry', error: 'try again' },
  { at: '2026-10-28T23:02:00+01:00', job: 'middle', owner: null, status: 'ok' },
  { at: '2026-10-29T01:00:00+01:00', job: 'alpha', owner: null, status: 'ok' },
];
const expected: ReadNightResult = {
  rows: [
    {
      job: 'alpha', owner: null, runs: 2, retries: 1, lastStatus: 'ok',
      firstAt: records[1].at, lastAt: records[3].at,
    },
    {
      job: 'middle', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
      firstAt: records[2].at, lastAt: records[2].at,
    },
    {
      job: 'zulu', owner: 'rook', runs: 1, retries: 0, lastStatus: 'fail',
      lastError: 'quota exceeded', firstAt: records[0].at, lastAt: records[0].at,
    },
  ],
  counts: { ok: 2, retry: 1, fail: 1 },
  malformedLines: 0,
};

function tableRows(html: string): string[][] {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)]
      .map((cell) => cell[1]),
  );
}

describe('digest routes with run files', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(process.cwd(), '.digest-route-tests-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    });
  }

  it.each([false, true])(
    'serves matching sorted rows and counts (malformed line: %s)',
    async (malformed) => {
      const lines = records.map((record) => JSON.stringify(record));
      if (malformed) lines.splice(1, 0, '{not valid json');
      writeFileSync(join(runsDir, `${night}.jsonl`), `${lines.join('\n')}\n`, 'utf8');
      const routes = app();
      const [page, api] = await Promise.all([
        routes.request(`/digest/${night}`),
        routes.request(`/api/digest/${night}`),
      ]);

      expect(page.status).toBe(200);
      expect(api.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(api.headers.get('content-type')).toContain('application/json');
      const html = await page.text();
      const digest = await api.json() as ReadNightResult;
      expect(digest).toEqual({ ...expected, malformedLines: Number(malformed) });
      expect(tableRows(html)).toEqual(digest.rows.map((row) => [
        row.job, row.owner || '—', String(row.runs), String(row.retries),
        row.lastStatus, row.lastError || '—', row.firstAt, row.lastAt,
      ]));
      expect(html).toContain(
        `ok: ${digest.counts.ok} · retry: ${digest.counts.retry} · fail: ${digest.counts.fail}`,
      );
      expect(html).toContain(`malformed lines: ${digest.malformedLines}`);
    },
  );

  it('serves an empty file as an empty digest on both routes', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '', 'utf8');
    const routes = app();
    const [page, api] = await Promise.all([
      routes.request(`/digest/${night}`),
      routes.request(`/api/digest/${night}`),
    ]);

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({
      rows: [], counts: { ok: 0, retry: 0, fail: 0 }, malformedLines: 0,
    });
    const html = await page.text();
    expect(tableRows(html)).toEqual([]);
    expect(html).toContain('nothing ran');
    expect(html).toContain('ok: 0 · retry: 0 · fail: 0');
    expect(html).toContain('malformed lines: 0');
  });

  it.each(['2026-10-27', 'not-a-date', '2026-02-30'])(
    'returns 404 on both routes for a missing or invalid night: %s',
    async (missingNight) => {
      const routes = app();
      const [page, api] = await Promise.all([
        routes.request(`/digest/${missingNight}`),
        routes.request(`/api/digest/${missingNight}`),
      ]);

      expect(page.status).toBe(404);
      expect(api.status).toBe(404);
    },
  );
});
