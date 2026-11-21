/**
 * Privacy-preserving aggregate validation status.
 *
 * Does not include dotenv keys, schema labels, values, source line numbers,
 * regex patterns or filesystem paths. Suitable for diagnostics shared with
 * a CI service where variable names themselves might reveal infrastructure.
 */
const MAX_CHECKS = 20_000;
const CODES = new Set(['VALID', 'OPTIONAL', 'MISSING', 'INVALID', 'UNKNOWN']);

export function aggregateEnvReport(report) {
  if (!report || !Array.isArray(report.checks) || report.checks.length > MAX_CHECKS) {
    throw new TypeError('Expected a bounded Env Guard report.');
  }
  const codes = Object.create(null);
  let errors = 0, warnings = 0, optional = 0, passed = 0;
  for (const check of report.checks) {
    if (!check || !CODES.has(check.code) ||
        !['ok', 'optional', 'error', 'warning'].includes(check.status)) {
      throw new TypeError('Invalid Env Guard check.');
    }
    codes[check.code] = (codes[check.code] ?? 0) + 1;
    if (check.status === 'error') errors++;
    else if (check.status === 'warning') warnings++;
    else if (check.status === 'optional') optional++;
    else passed++;
  }
  return {
    format: 'env-guard-summary-v1',
    valid: errors === 0,
    checked: report.checks.length,
    errors,
    warnings,
    optional,
    passed,
    codes: Object.entries(codes)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([code, count]) => ({ code, count })),
    advisory: 'Aggregate format checks only; no application secrets or variable names included.',
  };
}
