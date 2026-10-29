export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError?: string;
  firstAt: string;
  lastAt: string;
};

export type ReadNightResult = {
  rows: DigestRow[];
  counts: Record<DigestStatus, number>;
  malformedLines: number;
};

export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
