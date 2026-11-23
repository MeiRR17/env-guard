/**
 * Privacy-preserving aggregate validation status.
 *
 * Does not include dotenv keys, schema labels, values, source line numbers,
 * regex patterns or filesystem paths. Suitable for diagnostics shared with
 * a CI service where variable names themselves might reveal infrastructure.
 */
const MAX_CHECKS = 20_000;
// UNKNOWN is either warning or error depending on strict validation mode.
const STATUS_BY_CODE = Object.freeze({
  VALID: ['ok'], OPTIONAL: ['optional'], MISSING: ['error'],
  INVALID: ['error'], UNKNOWN: ['warning', 'error'],
});

export function aggregateEnvReport(report) {
  if (!report || typeof report !== 'object' ||
      !Array.isArray(report.checks) || report.checks.length > MAX_CHECKS ||
      !report.summary || typeof report.summary !== 'object' ||
      typeof report.valid !== 'boolean') {
    throw new TypeError('Expected a bounded Env Guard report.');
  }
  const codes = Object.create(null);
  let errors = 0, warnings = 0, optional = 0, passed = 0;
  for (const check of report.checks) {
    if (!check || typeof check !== 'object' ||
        !Object.hasOwn(STATUS_BY_CODE, check.code) ||
        !STATUS_BY_CODE[check.code].includes(check.status)) {
      throw new TypeError('Inconsistent Env Guard status and finding code.');
    }
    codes[check.code] = (codes[check.code] ?? 0) + 1;
    if (check.status === 'error') errors++;
    else if (check.status === 'warning') warnings++;
    else if (check.status === 'optional') optional++;
    else passed++;
  }
  if (report.summary.checked !== report.checks.length ||
      report.summary.errors !== errors || report.summary.warnings !== warnings ||
      report.valid !== (errors === 0)) {
    throw new TypeError('Env Guard report totals or validity do not reconcile.');
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
