import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestTable } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    let digest;
    try {
      digest = readNight(config.runsDir, night);
    } catch (error) {
      if (
        error instanceof RangeError ||
        (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      ) {
        return c.notFound();
      }
      throw error;
    }

    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestTable night={night} digest={digest} />
      </Layout>,
    );
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  return app;
}
