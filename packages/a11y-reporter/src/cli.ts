import { readReport, printSummary } from './index.js';

const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
const failIndex = args.indexOf('--fail-on-violations');

const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
const fail = failIndex >= 0 ? args[failIndex + 1] !== 'false' : true;

try {
  const entries = readReport(input);
  const summary = printSummary(entries);
  // Print summary to stdout
  console.log(summary);

  const violations = entries.reduce((sum, entry) => {
    const count = Array.isArray(entry.results?.violations) ? entry.results.violations.length : 0;
    return sum + count;
  }, 0);

  if (fail && violations > 0) {
    process.exit(1);
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
