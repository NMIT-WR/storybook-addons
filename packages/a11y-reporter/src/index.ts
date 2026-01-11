import path from 'node:path';
import fs from 'fs-extra';
import { getStoryContext, type TestRunnerConfig } from '@storybook/test-runner';

export interface ReporterOptions {
  outputDir?: string;
  failOnViolations?: boolean;
  writeJUnit?: boolean;
  waitForResultsMs?: number;
}

export interface StoryReportEntry {
  storyId: string;
  title: string;
  name: string;
  url: string;
  parameters?: Record<string, unknown> | null;
  results: any | null;
}

const DEFAULT_OPTIONS: Required<ReporterOptions> = {
  outputDir: 'a11y-report',
  failOnViolations: true,
  writeJUnit: true,
  waitForResultsMs: 8000,
};

function resolveOptions(options?: ReporterOptions): Required<ReporterOptions> {
  const envOutputDir = process.env.A11Y_REPORT_OUTPUT_DIR;
  const envFail = process.env.A11Y_REPORT_FAIL_ON_VIOLATIONS;
  const envJUnit = process.env.A11Y_REPORT_JUNIT;
  const envWait = process.env.A11Y_REPORT_WAIT_MS;
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    outputDir: envOutputDir || options?.outputDir || DEFAULT_OPTIONS.outputDir,
    failOnViolations:
      envFail !== undefined ? envFail !== 'false' : options?.failOnViolations ?? DEFAULT_OPTIONS.failOnViolations,
    writeJUnit:
      envJUnit !== undefined ? envJUnit !== 'false' : options?.writeJUnit ?? DEFAULT_OPTIONS.writeJUnit,
    waitForResultsMs: envWait ? Number(envWait) : options?.waitForResultsMs ?? DEFAULT_OPTIONS.waitForResultsMs,
  };
}

function countViolations(results: any | null): number {
  if (!results) return 0;
  return Array.isArray(results.violations) ? results.violations.length : 0;
}

function countApcaViolations(results: any | null): number {
  if (!results || !Array.isArray(results.violations)) return 0;
  return results.violations.filter((violation: any) => violation?.id === 'apca-contrast').length;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSummary(entries: StoryReportEntry[]): string {
  const total = entries.length;
  const withViolations = entries.filter((entry) => countViolations(entry.results) > 0);
  const totalViolations = withViolations.reduce((sum, entry) => sum + countViolations(entry.results), 0);
  const apcaViolations = withViolations.reduce((sum, entry) => sum + countApcaViolations(entry.results), 0);

  const lines: string[] = [];
  lines.push('# Storybook A11y Report');
  lines.push('');
  lines.push(`- Total stories: ${total}`);
  lines.push(`- Stories with violations: ${withViolations.length}`);
  lines.push(`- Total violations: ${totalViolations}`);
  lines.push(`- APCA violations: ${apcaViolations}`);
  lines.push('');
  lines.push('| Story | Violations | APCA |');
  lines.push('| --- | --- | --- |');

  for (const entry of entries) {
    const violations = countViolations(entry.results);
    const apca = countApcaViolations(entry.results);
    const name = `${entry.title} / ${entry.name}`;
    lines.push(`| ${name} | ${violations} | ${apca} |`);
  }

  return lines.join('\n');
}

function formatJUnit(entries: StoryReportEntry[]): string {
  const testcases = entries.map((entry) => {
    const violations = countViolations(entry.results);
    const name = `${entry.title} / ${entry.name}`;
    const className = entry.title;
    if (violations > 0) {
      const message = `${violations} accessibility violation(s)`;
      return `  <testcase classname="${escapeXml(className)}" name="${escapeXml(name)}">\n    <failure message="${escapeXml(message)}" />\n  </testcase>`;
    }
    return `  <testcase classname="${escapeXml(className)}" name="${escapeXml(name)}" />`;
  });

  const failures = entries.filter((entry) => countViolations(entry.results) > 0).length;
  const tests = entries.length;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="storybook-a11y" tests="${tests}" failures="${failures}">`,
    ...testcases,
    '</testsuite>',
    ''
  ].join('\n');
}

async function writeReports(entries: StoryReportEntry[], options: Required<ReporterOptions>) {
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  await fs.ensureDir(outputDir);

  const reportPath = path.join(outputDir, 'report.json');
  await fs.writeJSON(reportPath, entries, { spaces: 2 });

  const summaryPath = path.join(outputDir, 'summary.md');
  await fs.writeFile(summaryPath, formatSummary(entries));

  if (options.writeJUnit) {
    const junitPath = path.join(outputDir, 'junit.xml');
    await fs.writeFile(junitPath, formatJUnit(entries));
  }
}

export function createA11yReporter(options?: ReporterOptions): TestRunnerConfig {
  const resolved = resolveOptions(options);
  const entries: StoryReportEntry[] = [];

  return {
    async postVisit(page, context) {
      const storyId = context.id;
      const storyContext = await getStoryContext(page, context).catch(() => null);

      await page.waitForFunction(
        (id: string) => (window as any).__TECHSIO_A11Y_RESULTS__?.storyId === id,
        storyId,
        { timeout: resolved.waitForResultsMs }
      );

      const pageResults = await page.evaluate(() => (window as any).__TECHSIO_A11Y_RESULTS__ ?? null);

      const entry: StoryReportEntry = {
        storyId,
        title: context.title,
        name: context.name,
        url: page.url(),
        parameters: (storyContext as any)?.parameters?.a11y ?? null,
        results: pageResults?.results ?? null,
      };

      entries.push(entry);
      await writeReports(entries, resolved);

      if (resolved.failOnViolations && countViolations(entry.results) > 0) {
        throw new Error(`A11y violations detected in ${context.title} / ${context.name}`);
      }
    },
  };
}

export function readReport(filePath = 'a11y-report/report.json'): StoryReportEntry[] {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  return fs.readJSONSync(resolvedPath);
}

export function printSummary(entries: StoryReportEntry[]): string {
  return formatSummary(entries);
}
