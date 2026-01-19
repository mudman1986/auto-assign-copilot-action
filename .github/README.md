# Auto Assign Copilot to Issues

A GitHub Action that automatically assigns GitHub Copilot to issues based on priority labels and configurable rules.

## Features

- 🎯 **Priority-based assignment**: Assigns issues by priority (bug > documentation > refactor > enhancement)
- 🔄 **Refactor mode**: Creates or assigns refactor issues to ensure Copilot always has work
- 🏷️ **Label filtering**: Skip issues with specific labels (e.g., `no-ai`, `refining`)
- 🌳 **Parent issue handling**: Optionally skip issues with sub-issues
- 🧪 **Dry run mode**: Preview what would be assigned without making changes
- ⚡ **Force assignment**: Override existing assignments when needed
- 📊 **Configurable ratios**: Control refactor issue frequency (default: 1 in 5 closed issues)

## Usage

### Basic Example

```yaml
name: Assign Copilot to Issues

on:
  schedule:
    - cron: "0 10 * * *" # Daily at 10 AM UTC
  issues:
    types: [closed]
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  assign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Assign Copilot to issue
        uses: ./actions/auto-assign-copilot
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Example

```yaml
- name: Assign Copilot to issue
  uses: ./actions/auto-assign-copilot
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    mode: auto
    label-override: "bug" # Only assign bug issues
    force: false
    dry-run: false
    allow-parent-issues: false
    skip-labels: "no-ai,refining,on-hold"
    refactor-threshold: 4
```

## Inputs

| Input                 | Description                                                          | Required | Default          |
| --------------------- | -------------------------------------------------------------------- | -------- | ---------------- |
| `github-token`        | GitHub token with `issues:write` permission                          | Yes      | N/A              |
| `mode`                | Assignment mode: `auto` or `refactor`                                | No       | `auto`           |
| `label-override`      | Priority label to filter by (auto mode only)                         | No       | `""`             |
| `force`               | Force assignment even if Copilot already has an issue                | No       | `false`          |
| `dry-run`             | Log what would be done without making changes                        | No       | `false`          |
| `allow-parent-issues` | Allow assigning issues that have sub-issues                          | No       | `false`          |
| `skip-labels`         | Comma-separated list of labels to skip                               | No       | `no-ai,refining` |
| `refactor-threshold`  | Number of closed issues to check for refactor label (1 in N+1 ratio) | No       | `4`              |

## Outputs

| Output                  | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| `assigned-issue-number` | Number of the issue assigned to Copilot (empty if none)   |
| `assigned-issue-url`    | URL of the issue assigned to Copilot (empty if none)      |
| `assignment-mode`       | The effective mode used for assignment (auto or refactor) |

## Assignment Logic

### Auto Mode

1. Checks if Copilot already has an assigned issue (skips if true and `force=false`)
2. Searches for unassigned issues by priority:
   - bug
   - documentation
   - refactor
   - enhancement
3. Skips issues that:
   - Are already assigned
   - Have sub-issues (unless `allow-parent-issues=true`)
   - Have labels in `skip-labels` list
4. If no priority issues found, searches all open issues
5. If no issues found, creates/assigns a refactor issue

### Refactor Mode

1. Searches for existing unassigned refactor issues
2. Assigns the first available refactor issue
3. If none found, creates a new refactor issue and assigns it

### Refactor Ratio

When an issue is closed, the action checks the last N closed issues (where N = `refactor-threshold`):

- If none have the `refactor` label, switches to refactor mode
- This ensures a 1 in N+1 ratio of refactor issues (default: 1 in 5)

## Permissions

The GitHub token must have the following permissions:

```yaml
permissions:
  contents: read
  issues: write
```

For private repositories or advanced features, use a Personal Access Token (PAT) or GitHub App token.

## Examples

### Manual Trigger with Options

```yaml
on:
  workflow_dispatch:
    inputs:
      mode:
        description: "Assignment mode"
        required: true
        default: "auto"
        type: choice
        options:
          - auto
          - refactor
      dry_run:
        description: "Dry run mode"
        required: false
        type: boolean
        default: false

jobs:
  assign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Assign Copilot to issue
        uses: ./actions/auto-assign-copilot
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          mode: ${{ inputs.mode }}
          dry-run: ${{ inputs.dry_run }}
```

### Bug Priority Only

```yaml
- name: Assign bug to Copilot
  uses: ./actions/auto-assign-copilot
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    label-override: "bug"
```

### Allow Parent Issues

```yaml
- name: Assign any issue to Copilot
  uses: ./actions/auto-assign-copilot
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    allow-parent-issues: true
```

## Development

### Build the Action

```bash
cd actions/auto-assign-copilot
npm install
npm run build
```

This uses `@vercel/ncc` to compile the action into a single `dist/index.js` file with all dependencies bundled.

### Testing

```bash
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please see [MIGRATION.md](MIGRATION.md) for instructions on transferring this action to another repository.
