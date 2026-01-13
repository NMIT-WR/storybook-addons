# storybook-addons

Techsio/NMIT-WR maintained Storybook addons and tooling for the RsBuild/RsLib ecosystem.

Packages live in `packages/` and are published independently.

## Reusable workflows

### Storybook A11y (APCA)

This repo ships a reusable GitHub workflow for Storybook a11y checks.

Example usage from another repo:
```yaml
jobs:
  storybook-a11y:
    uses: NMIT-WR/storybook-addons/.github/workflows/storybook-a11y.yml@storybook-a11y-workflow-v0.1.6
    with:
      working-directory: libs/ui
      build-command: pnpm -C {{workdir}} build:storybook
      storybook-static-dir: storybook-static
      storybook-config-dir: .storybook
      themes: '["light","dark"]'
      globals-template: 'theme:{{theme}}'
```

Notes:
- Pin `@vX` to a tag or commit SHA when you publish.
- Your Storybook test-runner should use `@techsio/storybook-a11y-reporter` so `A11Y_REPORT_*` env vars are respected.
- If your repo already defines `packageManager` with pnpm, pass `pnpm-version: ""` to avoid version conflicts.
