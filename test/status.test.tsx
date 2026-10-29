import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links both fixture nights to digests with valid-entry counts', async () => {
    const app = createApp(config);
    const res = await app.request('/');
    const html = await res.text();
    const nights = [
      { night: '2026-10-28', ok: 10, retry: 4, fail: 1 },
      { night: '2026-10-27', ok: 7, retry: 0, fail: 0 },
    ];
    const items = html.match(/<li>.*?<\/li>/g);

    expect(res.status).toBe(200);
    expect(items).toHaveLength(nights.length);
    for (const [index, { night, ok, retry, fail }] of nights.entries()) {
      expect(items![index]).toContain(`<a href="/digest/${night}">${night}</a>`);
      expect(items![index]).toContain(`ok: ${ok} · retry: ${retry} · fail: ${fail}`);
      const digest = await app.request(`/digest/${night}`);
      expect(digest.status).toBe(200);
      expect(await digest.text()).toContain(`digest ${night}`);
    }
  });
});
