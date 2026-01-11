# @techsio/storybook-a11y-reporter

CLI/CI reporter that captures Storybook a11y results (including APCA) and writes JSON/JUnit summaries.

## Usage
1) Configure Storybook test-runner to use this reporter.
2) Run the test-runner in CI.

Example `.storybook/test-runner.ts`:
```ts
import { createA11yReporter } from '@techsio/storybook-a11y-reporter';

export default createA11yReporter({
  outputDir: 'a11y-report',
  failOnViolations: true,
  writeJUnit: true,
});
```

Run:
```bash
storybook test --config-dir .storybook
```

Outputs:
- `a11y-report/report.json`
- `a11y-report/junit.xml`
- Console summary

## CI / PR reporting (GitHub Actions)
The reporter fails the run by default when violations are found. You can override with
`failOnViolations: false` or `A11Y_REPORT_FAIL_ON_VIOLATIONS=false`.

Example workflow snippet that posts a PR comment and a check:
```yaml
jobs:
  a11y:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - run: pnpm install --frozen-lockfile
      - run: pnpm storybook test --config-dir .storybook

      - name: Publish check (JUnit)
        uses: dorny/test-reporter@v1
        with:
          name: Storybook A11y
          path: a11y-report/junit.xml
          reporter: java-junit

      - name: PR comment summary
        run: |
          npx --yes @techsio/storybook-a11y-reporter --input a11y-report/report.json --fail-on-violations false > a11y-summary.md
      - uses: peter-evans/create-or-update-comment@v4
        with:
          issue-number: ${{ github.event.pull_request.number }}
          body-path: a11y-summary.md
```
