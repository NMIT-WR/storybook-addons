if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Releases are restricted to run inside GitHub Actions")
}

const config = {
  branches: ["master", "main"],
  tagFormat: "storybook-better-a11y-v${version}",
  releaseRules: [{ breaking: true, release: "minor" }],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/github",
    ["@semantic-release/npm", { pkgRoot: ".", npmPublish: true }],
    ["@semantic-release/git", { assets: ["CHANGELOG.md", "package.json"] }],
  ],
}

export default config
