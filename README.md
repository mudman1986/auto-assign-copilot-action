<div align="center">

# Auto Assign Copilot to Issues

[![GitHub release](https://img.shields.io/github/v/release/mudman1986/auto-assign-copilot-action)](https://github.com/mudman1986/auto-assign-copilot-action/releases)
[![CI Tests](https://github.com/mudman1986/auto-assign-copilot-action/workflows/ci%20tests/badge.svg)](https://github.com/mudman1986/auto-assign-copilot-action/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Autonomous agent orchestration for GitHub Copilot - intelligent, priority-based issue assignment**

[Features](#features) • [Quick Start](#quick-start) • [Configuration](#configuration) • [Examples](#examples)

</div>

---

## Features

<table>
<tr>
<td width="33%" valign="top">

### Intelligent Assignment
- **Priority-based routing**: bug → documentation → refactor → enhancement
- **Adaptive fallback**: Autonomous selection from available issues
- **Grace period**: 5-minute wait after issue closure for human intervention

</td>
<td width="33%" valign="top">

### Autonomous Refactor Management
- **Self-healing**: Creates refactor tasks when needed
- **Template-driven**: Custom issue templates for consistent agent instructions
- **Configurable ratio**: Control refactor frequency (default: 1 in 5)

</td>
<td width="33%" valign="top">

### Safety & Control
- **Dry run mode**: Preview agent decisions without executing
- **Label-based filtering**: Skip issues marked for human attention
- **Override capability**: Manual control when needed

</td>
</tr>
</table>

### Additional Capabilities

- **Customizable agent instructions** via issue templates
- **Parent task handling** - Skip or allow issues with sub-tasks
- **Flexible orchestration** - Enable/disable autonomous refactor creation
- **Actionable outputs** - Issue number, URL, and assignment mode
- **Secure by design** - Path validation prevents directory traversal attacks

---

## Quick Start

### 1. Create Agent Workflow

Create `.github/workflows/assign-copilot.yml`:

```yaml
name: Autonomous Issue Assignment

on:
  schedule:
    - cron: "0 10 * * *"  # Daily agent check at 10 AM UTC
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
      - name: Assign AI Agent to Issue
        uses: mudman1986/auto-assign-copilot-action@v1.1.0
        with:
          github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
```

### 2. Set Up Authentication

Create a Personal Access Token (PAT) with `issues:write` permission and add it to your repository secrets as `COPILOT_ASSIGN_PAT`.

### 3. Deploy

The action will autonomously assign issues to Copilot based on intelligent priority routing.

---

## Configuration

### All Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| **`github-token`** | PAT with `issues:write` permission | ✅ Yes | - |
| `mode` | Assignment mode: `auto` or `refactor` | No | `auto` |
| `label-override` | Specific label to filter (auto mode only) | No | `""` |
| `force` | Force assignment even if Copilot has issues | No | `false` |
| `dry-run` | Preview mode - no actual changes | No | `false` |
| `allow-parent-issues` | Allow issues with sub-issues | No | `false` |
| `skip-labels` | Comma-separated labels to skip | No | `no-ai,refining` |
| `refactor-threshold` | Closed issues to check for refactor (N in 1:N+1 ratio) | No | `4` |
| `create-refactor-issue` | Whether to create new refactor issues | No | `true` |
| `refactor-issue-template` | Path to custom refactor issue template | No | `.github/REFACTOR_ISSUE_TEMPLATE.md` |

### Outputs

| Output | Description |
|--------|-------------|
| `assigned-issue-number` | Issue number assigned to Copilot |
| `assigned-issue-url` | Full URL of the assigned issue |
| `assignment-mode` | Effective mode used (`auto` or `refactor`) |

---

## How It Works

### Auto Mode (Default) - Intelligent Agent Orchestration

```mermaid
graph TD
    A[Issue Closed] --> B{Agent has<br/>active task?}
    B -->|Yes + force=false| C[Skip - Agent Busy]
    B -->|No or force=true| D[Intelligent Priority Routing]
    D --> E{Bug tasks?}
    E -->|Yes| F[Assign Bug]
    E -->|No| G{Documentation tasks?}
    G -->|Yes| H[Assign Doc]
    G -->|No| I{Refactor tasks?}
    I -->|Yes| J[Assign Refactor]
    I -->|No| K{Enhancement tasks?}
    K -->|Yes| L[Assign Enhancement]
    K -->|No| M{Any open task?}
    M -->|Yes| N[Assign First Available]
    M -->|No| O[Generate Refactor Task]
```

### Refactor Mode - Autonomous Task Generation

1. Search for existing unassigned refactor tasks
2. Assign first available task to agent
3. If none found → autonomously generate new refactor task (if enabled)

### Adaptive Refactor Ratio

After closing an issue, the system analyzes the last **N** closed issues (N = `refactor-threshold`):
- If **none** have `refactor` label → autonomously switches to refactor mode
- Maintains **1 in N+1** ratio (default: 1 in 5 issues) for balanced workload

---

## Examples

### Basic Usage

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
```

### Bug Priority Only

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    label-override: "bug"
```

### Force Assignment

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    force: true
```

### Custom Skip Labels

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    skip-labels: "no-ai,needs-review,on-hold"
```

### Allow Parent Issues

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    allow-parent-issues: true
```

### Dry Run (Preview)

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    dry-run: true
```

### Custom Refactor Template

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    refactor-issue-template: ".github/templates/custom-refactor.md"
```

### Disable Refactor Creation

```yaml
- uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
    create-refactor-issue: false
```

### Manual Workflow Dispatch

```yaml
on:
  workflow_dispatch:
    inputs:
      mode:
        description: "Assignment mode"
        type: choice
        options:
          - auto
          - refactor
        default: "auto"
      dry_run:
        description: "Dry run mode"
        type: boolean
        default: false

jobs:
  assign:
    runs-on: ubuntu-latest
    steps:
      - uses: mudman1986/auto-assign-copilot-action@v1.1.0
        with:
          github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}
          mode: ${{ inputs.mode }}
          dry-run: ${{ inputs.dry_run }}
```

---

## Custom Agent Instructions via Templates

Define agent behavior and task scope by creating a custom template at `.github/REFACTOR_ISSUE_TEMPLATE.md`:

```markdown
Review the codebase and identify opportunities for improvement.

## Suggested Areas to Review:

- Code quality and maintainability
- Test coverage and reliability
- Documentation completeness
- Performance optimizations
- Security best practices
- Code duplication
- Error handling
- Dependencies and updates

## Guidelines:

- Prioritize high-impact, low-risk improvements
- Make focused, incremental changes
- Run existing tests and linters before completing
- Document any significant changes
- Consider backward compatibility
- **Delegate tasks to suitable agents** in the `.github/agents` folder when available

**Note:** If the scope is too large for a single session, create additional issues with the `refactor` label for remaining work.
```

---

## Security

### Path Validation

The action implements strict security controls for file access:
- Cross-platform path validation using `path.relative()`
- Workspace-scoped access restrictions
- Graceful fallback to default content on validation failures

### Dependency Security

- Production dependencies: **0 vulnerabilities**
- Dev dependencies: Minimal vulnerabilities (semantic-release internal npm)
- Automated security updates via Dependabot

---

## Development

### Prerequisites

- Node.js 22+ (for development)
- npm 10+

### Build

```bash
npm install
npm run build
```

### Test

```bash
npm test
npm test -- --coverage
```

### Lint

```bash
npx standard
npx standard --fix  # Auto-fix issues
```

---

## Outputs Example

```yaml
- name: Assign issue
  id: assign
  uses: mudman1986/auto-assign-copilot-action@v1.1.0
  with:
    github-token: ${{ secrets.COPILOT_ASSIGN_PAT }}

- name: Show results
  run: |
    echo "Assigned Issue: #${{ steps.assign.outputs.assigned-issue-number }}"
    echo "Issue URL: ${{ steps.assign.outputs.assigned-issue-url }}"
    echo "Mode: ${{ steps.assign.outputs.assignment-mode }}"
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add/update tests
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## License

MIT © [mudman1986](https://github.com/mudman1986)

---

## Links

- [Releases](https://github.com/mudman1986/auto-assign-copilot-action/releases)
- [Issues](https://github.com/mudman1986/auto-assign-copilot-action/issues)
- [Release Documentation](RELEASE.md)
- [Security Policy](SECURITY.md)

---

<div align="center">

**Autonomous AI Agent Orchestration for GitHub Copilot**

</div>
