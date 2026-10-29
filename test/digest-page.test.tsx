import type { ErrorHandler } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import * as reader from '../src/digest/reader.js';
import type { ReadNightResult } from '../src/digest/types.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

afterEach(() => vi.restoreAllMocks());

describe('digest page', () => {
  it('renders the sample night with the shared layout and job-sorted table', async () => {
    const digest = reader.readNight(config.runsDir, '2026-10-28');
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<header>');
    expect(html).toContain('lane-07');
    expect(html).toContain('digest 2026-10-28');
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html.match(/<th scope="row">/g)).toHaveLength(5);
    const positions = digest.rows.map((row) => html.indexOf(`>${row.job}</th>`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain('malformed lines: 1');
    expect(html).not.toContain('<script');
  });

  it('marks retry thresholds and failures, preserves offsets, and escapes log values', async () => {
    const digest: ReadNightResult = {
      rows: [2, 3, 4].map((retries) => ({
        job: `job-${retries}`,
        owner: retries === 2 ? '<owner>' : null,
        runs: retries + 1,
        retries,
        lastStatus: retries === 2 ? 'fail' : 'ok',
        lastError: retries === 2 ? '<script>alert("error")</script>' : undefined,
        firstAt: '2026-10-28T23:00:02+01:00',
        lastAt: '2026-10-29T02:00:02+01:00',
      })),
      counts: { ok: 2, retry: 9, fail: 1 },
      malformedLines: 2,
    };
    const readNight = vi.spyOn(reader, 'readNight').mockReturnValue(digest);
    const res = await createApp({ ...config, runsDir: 'configured-runs' })
      .request('/digest/2026-10-28');
    const html = await res.text();

    expect(readNight).toHaveBeenCalledWith('configured-runs', '2026-10-28');
    expect(html).toContain('<td>2</td>');
    expect(html).not.toContain('<td class="warn">2</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">4</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).not.toContain('<td class="warn">ok</td>');
    expect(html).toContain('<td>—</td>');
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(4);
    expect(html).toContain('&lt;owner&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script');
    expect(html).toContain('2026-10-28T23:00:02+01:00');
    expect(html).toContain('2026-10-29T02:00:02+01:00');
    expect(html).toContain('malformed lines: 2');
  });

  it('renders an empty night', async () => {
    vi.spyOn(reader, 'readNight').mockReturnValue({
      rows: [], counts: { ok: 0, retry: 0, fail: 0 }, malformedLines: 0,
    });
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).toContain('malformed lines: 0');
  });

  it.each(['2099-01-01', 'not-a-date', '2026-02-30', '2026-1-1', ''])(
    'returns 404 for a missing or invalid night: %s',
    async (night) => {
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(404);
    },
  );

  it.each([new Error('unexpected reader failure'), Object.assign(new Error('denied'), { code: 'EACCES' })])(
    'passes unexpected reader errors to Hono error handling: %s',
    async (error) => {
      vi.spyOn(reader, 'readNight').mockImplementation(() => { throw error; });
      const app = createApp(config);
      const onError = vi.fn<ErrorHandler>((_error, c) => c.text('unexpected error', 500));
      app.onError(onError);

      const res = await app.request('/digest/2026-10-28');
      expect(res.status).toBe(500);
      expect(onError.mock.calls[0][0]).toBe(error);
    },
  );
});
