# Release Process

This document describes the automated release process for the Auto Assign Copilot action.

## Overview

The project uses [semantic-release](https://github.com/semantic-release/semantic-release) to automate version management and package releases. This ensures consistent, predictable releases based on conventional commits.

## How It Works

### Automatic Version Bumping

Version numbers are automatically determined based on commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- **Major version** (x.0.0): Breaking changes
  - Commit with `BREAKING CHANGE:` in the footer
  - Example: `feat!: remove deprecated API`
  
- **Minor version** (0.x.0): New features
  - Commits starting with `feat:`
  - Example: `feat: add new assignment mode`
  
- **Patch version** (0.0.x): Bug fixes and improvements
  - Commits starting with `fix:`, `perf:`, `docs:`, or `refactor:`
  - Example: `fix: resolve issue assignment bug`

### Commit Types

The following commit types are recognized:

| Type | Description | Release |
|------|-------------|---------|
| `feat` | New feature | Minor |
| `fix` | Bug fix | Patch |
| `perf` | Performance improvement | Patch |
| `docs` | Documentation update | Patch |
| `refactor` | Code refactoring | Patch |
| `revert` | Revert previous commit | Patch |
| `chore` | Maintenance tasks | No release |
| `test` | Test updates | No release |
| `build` | Build system changes | No release |
| `ci` | CI configuration changes | No release |

### Release Workflow

The release process runs automatically on every push to the `main` branch:

1. **Build**: The action is built and tested
2. **Version Calculation**: semantic-release analyzes commits since the last release
3. **Changelog Generation**: A changelog is automatically generated from commit messages
4. **Git Tag**: A new git tag is created (e.g., v1.2.3)
5. **GitHub Release**: A GitHub release is created with the changelog

**Note**: Due to branch protection rules requiring PRs, the changelog and version updates are NOT committed back to the repository. Instead, they are only reflected in the GitHub releases and tags. This is a common pattern for repositories with strict branch protection.

## Writing Commit Messages

To ensure proper versioning, follow these guidelines:

### Good Examples

```bash
# Feature (minor version bump)
feat: add support for custom priority labels

# Bug fix (patch version bump)
fix: prevent assignment to issues with sub-issues

# Breaking change (major version bump)
feat!: change default assignment behavior

BREAKING CHANGE: The default mode is now 'auto' instead of 'refactor'
```

### Bad Examples

```bash
# Too vague
update code

# Missing type
added new feature

# Wrong type for the change
chore: add important new feature  # Should be 'feat'
```

## Changelog

The changelog is automatically generated in `CHANGELOG.md` and includes:

- Features
- Bug Fixes
- Performance Improvements
- Documentation updates
- Code Refactoring
- Reverts

Each entry includes:
- Commit message
- Link to the commit
- PR reference (if applicable)

## GitHub Marketplace Publishing

By default, releases are **NOT** published to the GitHub Marketplace. This is intentional to give maintainers control over marketplace releases.

### To Publish to Marketplace

1. **Via Workflow Dispatch** (Future):
   - Go to Actions → build action workflow
   - Click "Run workflow"
   - Check the "Publish to GitHub Marketplace" option
   - Note: This currently only adds a notification; actual publishing requires manual steps

2. **Manual Process** (Current):
   - Go to the repository's Releases page
   - Find the release you want to publish
   - Click "Edit release"
   - Check "Publish this Action to the GitHub Marketplace"
   - Follow the prompts

### Why Manual Marketplace Publishing?

- Gives maintainers control over what's publicly available
- Allows for additional review before marketplace publication
- Prevents accidental publication of experimental features
- Complies with GitHub Marketplace policies

## Tags and Releases

### Version Tags

All releases are tagged with semantic versioning:
- Format: `vX.Y.Z` (e.g., `v1.2.3`)
- Created automatically by semantic-release
- Immutable once created

### Major Version Tags

For GitHub Actions, it's common to maintain major version tags (e.g., `v1`, `v2`) that point to the latest minor/patch version:

```bash
# After releasing v1.2.3, update v1 tag
git tag -fa v1 -m "Update v1 tag"
git push origin v1 --force
```

This allows users to reference `@v1` and automatically get bug fixes and features.

## Troubleshooting

### No Release Created

If a release wasn't created, check:
1. Are there any commits since the last release?
2. Do commits follow conventional commit format?
3. Are commits types that trigger releases (feat, fix, etc.)?
4. Check workflow logs for errors

### Wrong Version Bumped

If the wrong version was bumped:
1. Review commit messages - they determine the version
2. Use `feat:` for features (minor)
3. Use `fix:` for bug fixes (patch)
4. Use `BREAKING CHANGE:` for breaking changes (major)

### Changelog Not Updated

The changelog is only updated during releases. If no release occurs (e.g., only chore commits), the changelog won't change.

## Manual Release

In rare cases, you may need to trigger a release manually:

```bash
# Install dependencies
npm ci

# Run semantic-release locally
npx semantic-release --dry-run  # Test first
npx semantic-release            # Actually release
```

## Configuration

Release configuration is stored in `.releaserc.json`. Modify this file to:
- Change release rules
- Customize changelog format
- Add/remove plugins
- Adjust commit analysis

See [semantic-release documentation](https://semantic-release.gitbook.io/semantic-release/) for details.
