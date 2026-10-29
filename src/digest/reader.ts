import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight, ReadNightResult } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

const statuses = new Set<DigestStatus>(['ok', 'retry', 'fail']);
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.at === 'string' &&
    timestampPattern.test(record.at) &&
    Number.isFinite(Date.parse(record.at)) &&
    typeof record.job === 'string' &&
    record.job.trim().length > 0 &&
    typeof record.status === 'string' &&
    statuses.has(record.status as DigestStatus) &&
    (typeof record.owner === 'string' || record.owner === null) &&
    (record.error === undefined || typeof record.error === 'string')
  );
}

function emptyResult(): ReadNightResult {
  return {
    rows: [],
    counts: { ok: 0, retry: 0, fail: 0 },
    malformedLines: 0,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) {
    throw new RangeError('night must be a YYYY-MM-DD date');
  }

  const date = new Date(`${night}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== night) {
    throw new RangeError('night must be a valid calendar date');
  }

  const root = resolve(runsDir);
  const file = resolve(root, `${night}.jsonl`);
  const fileFromRoot = relative(root, file);
  if (fileFromRoot === '..' || fileFromRoot.startsWith(`..${sep}`) || isAbsolute(fileFromRoot)) {
    throw new RangeError('night must resolve within runsDir');
  }

  let contents: string;
  try {
    contents = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyResult();
    throw error;
  }

  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const result = emptyResult();
  const rowsByJob = new Map<string, DigestRow>();

  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      result.malformedLines += 1;
      continue;
    }

    if (!isRunRecord(value)) {
      result.malformedLines += 1;
      continue;
    }

    result.counts[value.status] += 1;
    const row = rowsByJob.get(value.job);
    if (row === undefined) {
      const newRow: DigestRow = {
        job: value.job,
        owner: value.owner,
        runs: 1,
        retries: value.status === 'retry' ? 1 : 0,
        lastStatus: value.status,
        firstAt: value.at,
        lastAt: value.at,
      };
      if (value.error !== undefined) newRow.lastError = value.error;
      rowsByJob.set(value.job, newRow);
      continue;
    }

    row.owner = value.owner;
    row.runs += 1;
    if (value.status === 'retry') row.retries += 1;
    row.lastStatus = value.status;
    row.lastAt = value.at;
    if (value.error === undefined) {
      delete row.lastError;
    } else {
      row.lastError = value.error;
    }
  }

  result.rows = [...rowsByJob.values()];
  return result;
};
