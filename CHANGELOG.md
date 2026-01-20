## [1.1.1](https://github.com/mudman1986/auto-assign-copilot-action/compare/v1.1.0...v1.1.1) (2026-01-20)

### Code Refactoring

* remove --no-ci flag since we're already in GitHub Actions CI ([751eba7](https://github.com/mudman1986/auto-assign-copilot-action/commit/751eba7bac9c76c03e1ab0560fc22d91608c9322))

## [1.1.0](https://github.com/mudman1986/auto-assign-copilot-action/compare/v1.0.0...v1.1.0) (2026-01-20)

### Features

* generate full changelog on PR branch using semantic-release prepare phase ([3d72c61](https://github.com/mudman1986/auto-assign-copilot-action/commit/3d72c61bc756b96a0551de2cf86657fbefacf3d4))

### Bug Fixes

* add GITHUB_TOKEN env var to semantic-release step ([3f82e98](https://github.com/mudman1986/auto-assign-copilot-action/commit/3f82e98ac9ec8ea9780a4f6f6078dea1d0ed211d))
* allow semantic-release to analyze commits on PR branches ([b5eb501](https://github.com/mudman1986/auto-assign-copilot-action/commit/b5eb50127f26516fe918f09a316d5f3f04088015))
* correct condition in 'Commit changelog and version to PR' step ([1d78f59](https://github.com/mudman1986/auto-assign-copilot-action/commit/1d78f59aed551482428ef5f2789401f1a9e61c98))
* override branches config with --branches flag during dry-run ([281d22f](https://github.com/mudman1986/auto-assign-copilot-action/commit/281d22fbf6232bf23edf6558a23a49f05bc01588))
* run semantic-release on push events instead of pull_request events ([91f12fe](https://github.com/mudman1986/auto-assign-copilot-action/commit/91f12fea94984c4946caa2fbb2bc44d8b5cc5885))
* use refs/pull/*/merge pattern to match PR merge refs in semantic-release ([8df22ae](https://github.com/mudman1986/auto-assign-copilot-action/commit/8df22ae3a5fd7c5b54066108fbbc95ba7380a7e9))

### Documentation

* clarify CHANGELOG.md is placeholder, actual changelog in GitHub Release ([b58b112](https://github.com/mudman1986/auto-assign-copilot-action/commit/b58b112473f098f24108bca43618ed3cf797b858))
* remove cleanup summary and add guidelines to copilot-instructions ([0bfb838](https://github.com/mudman1986/auto-assign-copilot-action/commit/0bfb83847236887efd7ade3032f72973f331e036))
* update progress - all tasks complete ([6cd707c](https://github.com/mudman1986/auto-assign-copilot-action/commit/6cd707c53dfc0ba8045a35baabfa2d99d012e1e2))

### Code Refactoring

* update refactor issue title format to comply with conventional commits ([7307e4f](https://github.com/mudman1986/auto-assign-copilot-action/commit/7307e4f636452c1d7a3ead4e241e1965c26e18cc))

# Changelog

## [1.0.1] - 2026-01-20

This changelog will be automatically populated when the release is created on merge to main.
See the GitHub release for detailed release notes once this PR is merged.
