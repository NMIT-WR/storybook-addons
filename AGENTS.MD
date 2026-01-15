# AGENTS

## Release policy (pre-1.0.0)
- Until any package reaches 1.0.0, we do not follow semver; all releases default to **patch**.
- Do not create minor or major releases unless explicitly instructed by the maintainer.
- If a major update is requested, use the `major:` commit type (pre-1.0 this maps to **minor**, e.g. 0.1.x -> 0.2.0).
- Stable (1.x) releases are **blocked** unless the release workflow is manually dispatched with `allowStable=true`.
