# AGENTS

## Upstream sync policy
This addon is derived from Storybook's official `@storybook/addon-a11y`.

When Storybook releases updates to the upstream addon, we must merge or rebase:
1. Pull upstream changes from `storybookjs/storybook` (or the tracked fork).
2. Re-apply APCA-specific patches on top of upstream changes.
3. Re-run unit tests and update proof screenshots.
4. Document the upstream version in the release notes.

Keep the diff with upstream minimal to make future merges straightforward.
