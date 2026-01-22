# Release Cleanup

This feature automatically cleans up old releases from the GitHub repository to keep storage manageable while retaining important versions.

## Rules

The cleanup follows these rules:

1. **Keep the last 3 releases** of the latest major version
2. **Keep the last 2 releases** of the second-to-last major version
3. **Keep the last 1 release** of the third-to-last major version
4. **Delete all other major versions** (4th oldest and beyond)
5. **⚠️ PROTECTION: Never delete any release less than 1 month old** (regardless of other rules)

### Example

Given these releases:
- v3.1.0 (2 months old)
- v3.0.9 (3 months old)
- v3.0.8 (4 months old)
- v3.0.7 (5 months old)
- v2.5.0 (6 months old)
- v2.4.0 (7 months old)
- v2.3.0 (8 months old)
- v1.9.9 (9 months old)
- v1.8.0 (10 months old)
- v0.1.0 (11 months old)

**Kept releases:**
- v3.1.0, v3.0.9, v3.0.8 (3 releases from major v3)
- v2.5.0, v2.4.0 (2 releases from major v2)
- v1.9.9 (1 release from major v1)

**Deleted releases:**
- v3.0.7 (4th release from major v3)
- v2.3.0 (3rd release from major v2)
- v1.8.0 (2nd release from major v1)
- v0.1.0 (entire major v0 - outside top 3 majors)

### Age Protection Example

Even if you have 10 major versions and a new release v11.0.0 is created today:
- v11.0.0 **will NOT be deleted** (less than 1 month old)
- Only releases older than 1 month will be considered for deletion
- After 1 month, v11.0.0 will be subject to the normal rules

## How It Works

### Automatic Cleanup

The cleanup runs automatically as the **last step** of the build/release workflow (`build-action.yml`) when:
- Code is pushed to the `main` branch, OR
- The workflow is manually triggered

### Manual Cleanup

You can also run the cleanup script manually:

```bash
# Dry run (preview what would be deleted)
DRY_RUN=true GITHUB_TOKEN=$GITHUB_TOKEN GITHUB_REPOSITORY=owner/repo npm run cleanup-releases

# Actual cleanup
DRY_RUN=false GITHUB_TOKEN=$GITHUB_TOKEN GITHUB_REPOSITORY=owner/repo npm run cleanup-releases
```

### Environment Variables

- `GITHUB_TOKEN` - Required. GitHub authentication token
- `GITHUB_REPOSITORY` - Required. Repository in format `owner/repo`
- `DRY_RUN` - Optional. Set to `true` to preview without deleting (default: `false`)

## Testing

The cleanup logic is fully tested with TDD:

```bash
npm test -- src/release-cleanup.test.js
```

All tests validate:
- ✅ Version parsing (semver with v prefix)
- ✅ Age calculation (1 month threshold)
- ✅ Major version limiting (keep max 3 majors)
- ✅ Release count per major (3, 2, 1 pattern)
- ✅ Protection for releases less than 1 month old
- ✅ Edge cases and invalid data handling

## Safety Features

1. **Dry Run Mode**: Preview deletions before executing
2. **Age Protection**: Never delete recent releases (< 1 month)
3. **Validation**: Skips invalid version tags
4. **Error Handling**: Continues if individual deletions fail
5. **Logging**: Detailed output of what is kept and deleted

## Implementation Details

- **Module**: `src/release-cleanup.js`
- **Tests**: `src/release-cleanup.test.js`
- **Script**: `scripts/cleanup-releases.js`
- **Workflow**: `.github/workflows/build-action.yml`

The implementation uses semantic versioning (semver) to parse and compare versions, ensuring accurate major/minor/patch identification.
