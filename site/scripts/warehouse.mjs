import { execFileSync } from 'node:child_process';

/** Runs a query in the warehouse container and returns rows as string arrays. */
export function query(sql) {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'dwh-postgres', 'psql', '-U', 'dwh', '-d', 'dwh', '-At', '-F', '\t', '-c', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter(Boolean)
    .map((line) => line.split('\t'));
}
