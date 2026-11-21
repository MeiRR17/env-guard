#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { inspectEnv, EnvGuardError } from '../src/index.js';
import { generateEnvExample } from '../src/example.js';
import { scaffoldEnvSchema } from '../src/scaffold.js';
import { aggregateEnvReport } from '../src/summary.js';

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
  '  --summary-only   Print counts and finding codes; omit variable names',
  '  --quiet          Print only failures in text mode',
  '  --init-example FILE  Write a blank .env example from the schema only',
  '  --init-schema FILE   Create a schema skeleton from .env variable names',
  '  --required-only      Exclude optional variables from example output',
  '  -h, --help       Print this help',
  '',
  'Exit codes: 0 valid, 1 invalid configuration, 2 usage/file/schema error.',
].join('\n');

async function main(args) {
  const opts = { env: '.env', schema: 'env.schema.json', strict: false, json: false, quiet: false, summaryOnly: false, example: null, scaffold: null, requiredOnly: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') { process.stdout.write(HELP + '\n'); return; }
    if (arg === '--strict') { opts.strict = true; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--summary-only') { opts.summaryOnly = true; continue; }
    if (arg === '--quiet') { opts.quiet = true; continue; }
    if (arg === '--required-only') { opts.requiredOnly = true; continue; }
    if (arg === '--init-schema') {
      const filename = args[++i];
      if (!filename || filename.startsWith('--')) throw new Error('Expected a filename after --init-schema.');
      opts.scaffold = filename;
      continue;
    }
    if (arg === '--init-example') {
      const filename = args[++i];
      if (!filename || filename.startsWith('--')) throw new Error('Expected a filename after --init-example.');
      opts.example = filename;
      continue;
    }
    if (arg === '--env' || arg === '--schema') {
      const file = args[++i];
      if (!file || file.startsWith('--')) throw new Error('Expected a filename after ' + arg);
      opts[arg.slice(2)] = file;
      continue;
    }
    throw new Error('Unknown argument: ' + arg);
  }
  if (opts.summaryOnly && opts.quiet) throw new Error('--summary-only cannot be combined with --quiet.');
  if (opts.example !== null && opts.scaffold !== null) {
    throw new Error('Choose only one of --init-example and --init-schema.');
  }
  if (opts.scaffold !== null) {
    if (opts.json || opts.quiet || opts.strict || opts.requiredOnly || opts.summaryOnly) {
      throw new Error('--init-schema cannot be combined with --json, --quiet, --strict or --required-only.');
    }
    // Explicit scaffold mode reads dotenv values only into private process
    // memory; output contains key names and generic string metadata only.
    const envText = await readFile(opts.env, 'utf8');
    const schemaText = scaffoldEnvSchema(envText);
    await writeFile(opts.scaffold, schemaText, { encoding: 'utf8', flag: 'wx' });
    process.stderr.write('Created schema skeleton (variable names only): ' + opts.scaffold + '\n');
    return;
  }
  if (opts.example !== null) {
    if (opts.json || opts.quiet || opts.strict || opts.summaryOnly) {
      throw new Error('--init-example cannot be combined with --json, --quiet or --strict.');
    }
    // Template mode never opens .env or accesses process.env.
    const schemaText = await readFile(opts.schema, 'utf8');
    const exampleText = generateEnvExample(schemaText, { requiredOnly: opts.requiredOnly });
    await writeFile(opts.example, exampleText, { encoding: 'utf8', flag: 'wx' });
    process.stderr.write('Created blank example template: ' + opts.example + '\n');
    return;
  }
  if (opts.requiredOnly) throw new Error('--required-only requires --init-example FILE.');
  const [environment, schema] = await Promise.all([
    readFile(opts.env, 'utf8'), readFile(opts.schema, 'utf8'),
  ]);
  const report = inspectEnv(environment, schema, { strictUnknown: opts.strict });
  if (opts.summaryOnly) {
    const summary = aggregateEnvReport(report);
    if (opts.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    else {
      process.stdout.write('Result: ' + (summary.valid ? 'VALID' : 'INVALID') +
        ' (' + summary.checked + ' checks, ' + summary.errors + ' errors, ' +
        summary.warnings + ' warnings, ' + summary.optional + ' optional)\n');
      for (const { code, count } of summary.codes) {
        process.stdout.write(code + ': ' + count + '\n');
      }
    }
  } else if (opts.json) {
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
  if (process.argv.slice(2).includes('--summary-only')) {
    // Failures can contain schema variable names or filesystem paths.
    // Do not undermine a counts-only report by printing those details.
    const code = error instanceof EnvGuardError ? error.code : 'FILE_OR_USAGE_ERROR';
    process.stderr.write('env-guard: aggregate report unavailable (' + code +
      '). Re-run locally without --summary-only for details.\n');
  } else {
    // File system exceptions may expose paths but never loaded secret values.
    process.stderr.write('env-guard: ' + (error.code === 'ENOENT' ? 'File not found: ' + error.path :
      error.message) + '\n');
  }
  process.exitCode = 2;
});
