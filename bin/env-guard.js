#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { inspectEnv } from '../src/index.js';

const HELP = [
  'env-guard — validate dotenv files without printing secret values',
  '',
  'Usage: env-guard [options]',
  '',
  'Options:',
  '  --env FILE       Environment file (default .env)',
  '  --schema FILE    JSON schema (default env.schema.json)',
  '  --strict         Treat variables absent from the schema as errors',
  '  --json           Print a structured, redacted JSON report',
  '  --quiet          Print only failures in text mode',
  '  -h, --help       Print this help',
  '',
  'Exit codes: 0 valid, 1 invalid configuration, 2 usage/file/schema error.',
].join('\n');

async function main(args) {
  const opts = { env: '.env', schema: 'env.schema.json', strict: false, json: false, quiet: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') { process.stdout.write(HELP + '\n'); return; }
    if (arg === '--strict') { opts.strict = true; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--quiet') { opts.quiet = true; continue; }
    if (arg === '--env' || arg === '--schema') {
      const file = args[++i];
      if (!file || file.startsWith('--')) throw new Error('Expected a filename after ' + arg);
      opts[arg.slice(2)] = file;
      continue;
    }
    throw new Error('Unknown argument: ' + arg);
  }
  const [environment, schema] = await Promise.all([
    readFile(opts.env, 'utf8'), readFile(opts.schema, 'utf8'),
  ]);
  const report = inspectEnv(environment, schema, { strictUnknown: opts.strict });
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    for (const entry of report.checks) {
      if (opts.quiet && entry.status !== 'error') continue;
      process.stdout.write(entry.status.toUpperCase().padEnd(9) + ' ' + entry.key + ': ' + entry.message + '\n');
    }
    if (!opts.quiet || !report.valid) {
      process.stdout.write('Result: ' + (report.valid ? 'VALID' : 'INVALID') +
        ' (' + report.summary.errors + ' errors, ' + report.summary.warnings + ' warnings)\n');
    }
  }
  if (!report.valid) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => {
  // File system exceptions may expose paths but never loaded secret values.
  process.stderr.write('env-guard: ' + (error.code === 'ENOENT' ? 'File not found: ' + error.path :
    error.message) + '\n');
  process.exitCode = 2;
});
