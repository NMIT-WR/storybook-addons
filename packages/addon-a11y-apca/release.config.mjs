if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Releases are restricted to run inside GitHub Actions")
}

const releaseRules = [
  { type: "major", release: "minor" },
  { breaking: true, release: "patch" },
  { type: "feat", release: "patch" },
  { type: "fix", release: "patch" },
  { type: "perf", release: "patch" },
  { type: "refactor", release: "patch" },
  { type: "docs", release: "patch" },
  { type: "chore", release: "patch" },
  { type: "test", release: "patch" },
  { type: "ci", release: "patch" },
  { type: "build", release: "patch" },
  { type: "style", release: "patch" },
  { type: "revert", release: "patch" },
]

const config = {
  branches: ["master", "main"],
  tagFormat: "storybook-better-a11y-v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { releaseRules }],
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/github",
    ["@semantic-release/npm", { pkgRoot: ".", npmPublish: true }],
    ["@semantic-release/git", { assets: ["CHANGELOG.md", "package.json"] }],
  ],
}

export default config
