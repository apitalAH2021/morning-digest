# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight.

Read a night's digest at `/digest/YYYY-MM-DD`: one row per job, with retry and failure
warnings and a count of malformed log lines. Missing or invalid nights return 404; empty
nights show "nothing ran".

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).
