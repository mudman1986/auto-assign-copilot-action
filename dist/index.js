#!/usr/bin/env node
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 325:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


/**
 * Assign Copilot to GitHub Issues
 *
 * This script handles automatic assignment of GitHub Copilot to issues
 * based on priority labels and various constraints.
 */

const fs = __nccwpck_require__(896)
const path = __nccwpck_require__(928)

// Constants
const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Check if an issue should be skipped for assignment
 * @param {Object} issue - Issue object from parseIssueData
 * @param {boolean} issue.isAssigned - Whether issue already has assignees
 * @param {boolean} issue.hasSubIssues - Whether issue has any sub-issues (open or closed)
 * @param {boolean} [allowParentIssues=false] - Whether to allow assigning issues with sub-issues (default: false)
 * @param {Array<string>} [skipLabels=[]] - Array of label names to skip (default: empty array)
 * @returns {Object} - {shouldSkip: boolean, reason: string}
 */
function shouldSkipIssue (issue, allowParentIssues = false, skipLabels = []) {
  if (issue.isAssigned) {
    return { shouldSkip: true, reason: 'already assigned' }
  }
  if (issue.hasSubIssues && !allowParentIssues) {
    return { shouldSkip: true, reason: 'has sub-issues' }
  }
  if (skipLabels.length > 0 && issue.labels) {
    const issueLabels = issue.labels.map((l) => l.name)
    const matchedLabel = skipLabels.find((skipLabel) =>
      issueLabels.includes(skipLabel)
    )
    if (matchedLabel) {
      return { shouldSkip: true, reason: `has skip label: ${matchedLabel}` }
    }
  }
  return { shouldSkip: false, reason: null }
}

/**
 * Normalize labels from GraphQL response or flattened structure
 * @param {Object} issue - Issue with potentially different label structures
 * @returns {Array} - Array of label objects with normalized structure
 */
function normalizeIssueLabels (issue) {
  if (issue.labels?.nodes) return issue.labels.nodes
  if (Array.isArray(issue.labels)) return issue.labels
  return []
}

/**
 * Check if Copilot should be assigned a new issue
 * @param {Array} assignedIssues - Array of issues currently assigned to Copilot
 * @param {string} mode - Assignment mode ('auto' or 'refactor')
 * @param {boolean} force - Whether to force assignment even if Copilot has work
 * @returns {Object} - {shouldAssign: boolean, reason: string}
 */
function shouldAssignNewIssue (assignedIssues, mode, force) {
  if (assignedIssues.length === 0) {
    return { shouldAssign: true, reason: 'Copilot has no assigned issues' }
  }

  // Force flag overrides all other checks in both modes
  if (force) {
    return {
      shouldAssign: true,
      reason: 'Force flag is set'
    }
  }

  if (mode === 'refactor') {
    // Check if already working on a refactor issue
    const hasRefactorIssue = assignedIssues.some((issue) => {
      const labels = normalizeIssueLabels(issue)
      return labels.some((label) => label.name === 'refactor')
    })
    if (hasRefactorIssue) {
      return {
        shouldAssign: false,
        reason: 'Copilot already has a refactor issue assigned'
      }
    }
    // If working on non-refactor issues, skip to avoid disruption
    return {
      shouldAssign: false,
      reason: 'Copilot is working on other issues, skipping refactor creation'
    }
  }

  // Auto mode
  return {
    shouldAssign: false,
    reason: 'Copilot already has assigned issues and force=false'
  }
}

/**
 * Parse issue data from GraphQL response
 * @param {Object} issue - Raw issue object from GraphQL
 * @returns {Object} - Parsed issue with boolean flags
 */
function parseIssueData (issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    body: issue.body || '',
    isAssigned: issue.assignees.nodes.length > 0,
    hasSubIssues: issue.trackedIssues?.totalCount > 0,
    isSubIssue: issue.trackedInIssues?.totalCount > 0,
    isRefactorIssue: issue.labels.nodes.some((l) => l.name === 'refactor'),
    labels: issue.labels.nodes
  }
}

/**
 * Find the first assignable issue from a list
 * @param {Array} issues - Array of issue objects from GraphQL
 * @param {boolean} allowParentIssues - Whether to allow assigning issues with sub-issues (open or closed)
 * @param {Array<string>} [skipLabels=[]] - Array of label names to skip (default: empty array)
 * @returns {Object|null} - First assignable issue or null
 */
function findAssignableIssue (
  issues,
  allowParentIssues = false,
  skipLabels = []
) {
  for (const issue of issues) {
    const parsed = parseIssueData(issue)
    const { shouldSkip } = shouldSkipIssue(
      parsed,
      allowParentIssues,
      skipLabels
    )

    if (!shouldSkip) {
      return parsed
    }
  }
  return null
}

/**
 * Check if any of the last N closed issues have the refactor label
 * @param {Array} closedIssues - Array of recently closed issues (sorted by closed_at desc)
 * @param {number} count - Number of recent issues to check (default: 4)
 * @returns {boolean} - True if any of the last N closed issues have refactor label
 */
function hasRecentRefactorIssue (closedIssues, count = 4) {
  if (!closedIssues || closedIssues.length === 0) {
    return false
  }

  return closedIssues.slice(0, count).some((issue) => {
    const labels = normalizeIssueLabels(issue)
    return labels.some((label) => label.name === 'refactor')
  })
}

/**
 * Find an available refactor issue (open, unassigned, with refactor label)
 * @param {Array} issues - Array of issue objects from GraphQL (already filtered for refactor label)
 * @param {boolean} allowParentIssues - Whether to allow assigning issues with sub-issues
 * @param {Array<string>} skipLabels - Array of label names to skip
 * @returns {Object|null} - First available refactor issue or null
 */
function findAvailableRefactorIssue (
  issues,
  allowParentIssues = false,
  skipLabels = []
) {
  return findAssignableIssue(issues, allowParentIssues, skipLabels)
}

/**
 * Read the content of the refactor issue template file
 * @param {string} templatePath - Path to the template file (relative to workspace root)
 * @returns {string} - Template content or default content if file doesn't exist or path is empty
 */
function readRefactorIssueTemplate (templatePath) {
  const defaultContent = [
    'Review the codebase and identify opportunities for improvement.',
    '',
    '## Suggested Areas to Review:',
    '',
    '- Code quality and maintainability',
    '- Test coverage and reliability',
    '- Documentation completeness',
    '- Performance optimizations',
    '- Security best practices',
    '- Code duplication',
    '- Error handling',
    '- Dependencies and updates',
    '',
    '## Guidelines:',
    '',
    '- Prioritize high-impact, low-risk improvements',
    '- Make focused, incremental changes',
    '- Run existing tests and linters before completing',
    '- Document any significant changes',
    '- Consider backward compatibility',
    '- **Delegate tasks to suitable agents** in the `.github/agents` folder when available',
    '',
    '**Note:** If the scope is too large for a single session, create additional issues with the `refactor` label for remaining work.'
  ].join('\n')

  // If no template path provided, use default content
  if (!templatePath || templatePath.trim() === '') {
    console.log('No custom template path provided, using default content')
    return defaultContent
  }

  try {
    // Resolve the template path relative to the workspace
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd()
    const absolutePath = path.resolve(workspaceRoot, templatePath)

    // Validate that the resolved path is within the workspace to prevent directory traversal
    const normalizedWorkspace = path.resolve(workspaceRoot)
    const normalizedPath = path.resolve(absolutePath)
    const relativePath = path.relative(normalizedWorkspace, normalizedPath)

    // Check if the relative path escapes the workspace (contains '..' or is absolute)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      console.log(`Template path ${templatePath} is outside workspace, using default content`)
      return defaultContent
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.log(`Template file not found at ${absolutePath}, using default content`)
      return defaultContent
    }

    // Read and return the template content
    const content = fs.readFileSync(absolutePath, 'utf8')
    console.log(`Successfully loaded template from ${absolutePath}`)
    return content
  } catch (error) {
    console.log(`Error reading template file: ${error.message}, using default content`)
    return defaultContent
  }
}

/**
 * Check if an issue was auto-created by this action
 * Auto-created issues have [AUTO] in their title
 * @param {Object} issue - Issue object
 * @returns {boolean} - True if issue was auto-created
 */
function isAutoCreatedRefactorIssue (issue) {
  return issue?.title?.includes('[AUTO]') ?? false
}

/**
 * Check if an auto-created refactor issue was closed within the cooldown period
 * @param {Array} closedIssues - Array of recently closed issues
 * @param {number} cooldownDays - Number of days to wait
 * @returns {Object} - {shouldWait: boolean, reason: string}
 */
function shouldWaitForCooldown (closedIssues, cooldownDays = 7) {
  if (!closedIssues || closedIssues.length === 0) {
    return { shouldWait: false, reason: 'No closed issues found' }
  }

  const now = new Date()
  const cooldownMs = cooldownDays * MS_PER_DAY

  // Find any auto-created refactor issue closed within the cooldown period
  const recentAutoCreatedRefactor = closedIssues.find((issue) => {
    const labels = normalizeIssueLabels(issue)
    const hasRefactorLabel = labels.some((label) => label.name === 'refactor')

    if (!hasRefactorLabel || !isAutoCreatedRefactorIssue(issue)) {
      return false
    }

    // Check if it was closed within the cooldown period
    const closedAt = new Date(issue.closedAt)
    const timeSinceClosed = now - closedAt
    return timeSinceClosed < cooldownMs
  })

  if (recentAutoCreatedRefactor) {
    const closedAt = new Date(recentAutoCreatedRefactor.closedAt)
    const daysSinceClosed = Math.floor((now - closedAt) / MS_PER_DAY)
    const daysRemaining = Math.ceil(cooldownDays - daysSinceClosed)

    return {
      shouldWait: true,
      reason: `Auto-created refactor issue #${recentAutoCreatedRefactor.number} was closed ${daysSinceClosed} days ago. Wait ${daysRemaining} more day(s) before creating a new one.`
    }
  }

  return {
    shouldWait: false,
    reason: 'No auto-created refactor issue found closed within the cooldown period'
  }
}

module.exports = {
  shouldSkipIssue,
  shouldAssignNewIssue,
  parseIssueData,
  findAssignableIssue,
  normalizeIssueLabels,
  hasRecentRefactorIssue,
  findAvailableRefactorIssue,
  readRefactorIssueTemplate,
  isAutoCreatedRefactorIssue,
  shouldWaitForCooldown
}


/***/ }),

/***/ 567:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


/**
 * Main workflow logic for assigning GitHub Copilot to issues
 * This script is called from the assign-copilot-issues.yml workflow
 *
 * @param {Object} params - Parameters from workflow
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @param {string} params.mode - Assignment mode ('auto' or 'refactor')
 * @param {string|null} params.labelOverride - Optional label to filter by
 * @param {boolean} params.force - Force assignment even if copilot has issues
 * @param {boolean} params.dryRun - Dry run mode
 * @param {boolean} params.allowParentIssues - Allow assigning parent issues
 * @param {Array<string>} params.skipLabels - Labels to skip
 * @param {number} params.refactorThreshold - Number of closed issues to check
 * @param {boolean} params.createRefactorIssue - Whether to create new refactor issues
 * @param {string} params.refactorIssueTemplate - Path to the refactor issue template file
 * @param {number} params.waitSeconds - Number of seconds to wait for issue events (default: 0)
 * @param {number} params.refactorCooldownDays - Number of days to wait before creating a new auto-created refactor issue (default: 7)
 */
module.exports = async ({
  github,
  context,
  mode,
  labelOverride,
  force,
  dryRun,
  allowParentIssues,
  skipLabels,
  refactorThreshold,
  createRefactorIssue,
  refactorIssueTemplate,
  waitSeconds = 0,
  refactorCooldownDays = 7
}) => {
  const helpers = __nccwpck_require__(325)

  // Common GraphQL query variables
  const repoVars = {
    owner: context.repo.owner,
    repo: context.repo.repo
  }

  // Wait for grace period if this is an issue event and wait-seconds is configured
  if (context.eventName === 'issues' && waitSeconds > 0) {
    console.log(
      `Issue event detected. Waiting ${waitSeconds} seconds for grace period before proceeding...`
    )
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    console.log('Grace period complete. Proceeding with assignment.')
  }

  /**
   * Fetch sub-issues for an issue using the REST API
   * @param {number} issueNumber - The issue number to check
   * @returns {Promise<number>} - Total count of sub-issues
   */
  async function getSubIssuesCount (issueNumber) {
    try {
      const subIssuesResponse = await github.request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
        {
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issueNumber,
          per_page: 100,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      )
      return subIssuesResponse.data.length
    } catch (error) {
      return 0
    }
  }

  /**
   * Enriches issues with sub-issue counts from REST API
   * Modifies the issues array in-place by setting issue.trackedIssues.totalCount
   * @param {Array} issues - Array of issue objects
   */
  async function enrichWithSubIssues (issues) {
    await Promise.all(
      issues.map(async (issue) => {
        const totalSubIssues = await getSubIssuesCount(issue.number)
        issue.trackedIssues = { totalCount: totalSubIssues }
      })
    )
  }

  // Step 0: Determine mode based on recent closed issues (for issue close events)
  let effectiveMode = mode
  if (context.eventName === 'issues' && mode === 'auto') {
    console.log(
      `Checking last ${refactorThreshold} closed issues to determine if refactor is needed...`
    )

    // Get last N+1 closed issues (including the one just closed)
    const fetchCount = refactorThreshold + 1
    const closedIssuesResponse = await github.graphql(
      `
        query($owner: String!, $repo: String!, $fetchCount: Int!) {
          repository(owner: $owner, name: $repo) {
            issues(first: $fetchCount, states: CLOSED, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes {
                number
                title
                closedAt
                labels(first: 10) {
                  nodes { name }
                }
              }
            }
          }
        }
      `,
      {
        ...repoVars,
        fetchCount
      }
    )

    const closedIssues = closedIssuesResponse.repository.issues.nodes
    console.log(`Found ${closedIssues.length} recently closed issues`)

    // Check if any of the last N closed issues have refactor label
    const hasRefactor = helpers.hasRecentRefactorIssue(
      closedIssues,
      refactorThreshold
    )

    if (!hasRefactor) {
      console.log(
        `None of the last ${refactorThreshold} closed issues have refactor label - switching to refactor mode`
      )
      effectiveMode = 'refactor'
    } else {
      console.log(
        `At least one of the last ${refactorThreshold} closed issues has refactor label - staying in auto mode`
      )
    }
  }

  console.log(`Effective mode: ${effectiveMode}`)

  // Step 1: Get repo ID, Copilot bot ID
  const repoInfo = await github.graphql(
    `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100) {
            nodes { login __typename ... on Bot { id } ... on User { id } }
          }
        }
      }
    `,
    repoVars
  )

  const repoId = repoInfo.repository.id
  const copilotBot = repoInfo.repository.suggestedActors.nodes.find(
    (n) => n.login === 'copilot-swe-agent' && n.__typename === 'Bot'
  )
  if (!copilotBot) {
    throw new Error('Copilot bot agent not found in suggestedActors')
  }
  const copilotBotId = copilotBot.id
  const copilotLogin = copilotBot.login
  console.log(
    `Found Copilot bot: login="${copilotLogin}", id="${copilotBotId}"`
  )

  // Step 2: Check if Copilot is already assigned to an issue
  console.log('Querying for all open issues to check assignees...')
  const allIssuesResponse = await github.graphql(
    `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, states: OPEN) {
            nodes {
              id
              number
              title
              url
              assignees(first: 10) {
                nodes {
                  login
                  id
                }
              }
              labels(first: 10) {
                nodes { name }
              }
            }
          }
        }
      }
    `,
    repoVars
  )

  const allIssues = allIssuesResponse.repository.issues.nodes
  console.log(`Found ${allIssues.length} total open issues`)

  const currentIssues = allIssues.filter((issue) =>
    issue.assignees.nodes.some(
      (assignee) =>
        assignee.login === copilotLogin || assignee.id === copilotBotId
    )
  )

  if (currentIssues.length > 0) {
    console.log(
      `Found ${currentIssues.length} issue(s) assigned to copilot`
    )

    const { shouldAssign, reason } = helpers.shouldAssignNewIssue(
      currentIssues,
      effectiveMode,
      force
    )
    if (!shouldAssign) {
      console.log(`Skipping assignment: ${reason}`)
      return
    }
    console.log(`Proceeding with assignment: ${reason}`)
  }

  // Step 3: Handle different modes
  if (effectiveMode === 'refactor') {
    return handleRefactorMode()
  } else if (effectiveMode === 'auto') {
    return assignNextIssue(labelOverride)
  } else {
    throw new Error(`Unknown mode: ${effectiveMode}`)
  }

  /**
   * Handle refactor mode: assign existing refactor issue or create new one
   */
  async function handleRefactorMode () {
    console.log('Refactor mode: checking for available refactor issues...')

    // Get all open issues with detailed info including trackedIssues
    const refactorIssuesResponse = await github.graphql(
      `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issues(first: 100, states: OPEN, labels: ["refactor"], orderBy: {field: CREATED_AT, direction: ASC}) {
              nodes {
                id
                number
                title
                body
                url
                assignees(first: 10) {
                  nodes { login }
                }
                labels(first: 10) {
                  nodes { name }
                }
                trackedIssues(first: 1) {
                  totalCount
                }
              }
            }
          }
        }
      `,
      repoVars
    )

    const refactorIssues = refactorIssuesResponse.repository.issues.nodes
    console.log(
      `Found ${refactorIssues.length} open issues with refactor label`
    )

    // Check for sub-issues via REST API
    await enrichWithSubIssues(refactorIssues)

    // Try to find an assignable refactor issue
    const availableRefactorIssue = helpers.findAvailableRefactorIssue(
      refactorIssues,
      allowParentIssues,
      skipLabels
    )

    if (availableRefactorIssue) {
      console.log(
        `Found available refactor issue #${availableRefactorIssue.number}: ${availableRefactorIssue.title}`
      )

      // Assign the existing refactor issue to Copilot
      if (dryRun) {
        console.log(
          `[DRY RUN] Would assign refactor issue #${availableRefactorIssue.number} to Copilot (ID: ${copilotBotId})`
        )
        console.log(`[DRY RUN] Issue URL: ${availableRefactorIssue.url}`)
        return { issue: availableRefactorIssue }
      }

      console.log(
        `Assigning refactor issue #${availableRefactorIssue.number} to Copilot...`
      )

      await github.graphql(
        `
          mutation($issueId: ID!, $assigneeIds: [ID!]!) {
            addAssigneesToAssignable(
              input: {
                assignableId: $issueId,
                assigneeIds: $assigneeIds
              }
            ) {
              assignable {
                ... on Issue {
                  assignees(first: 10) {
                    nodes { login }
                  }
                }
              }
            }
          }
        `,
        {
          issueId: availableRefactorIssue.id,
          assigneeIds: [copilotBotId]
        }
      )

      console.log(
        `✓ Successfully assigned refactor issue #${availableRefactorIssue.number} to Copilot`
      )
      console.log(`  Title: ${availableRefactorIssue.title}`)
      console.log(`  URL: ${availableRefactorIssue.url}`)
      return { issue: availableRefactorIssue }
    }

    // Check if we should create a new refactor issue
    if (!createRefactorIssue) {
      console.log(
        'No available refactor issues found, but create-refactor-issue is disabled. Skipping refactor issue creation.'
      )
      return
    }

    console.log('No available refactor issues found - creating a new one')
    return createRefactorIssueFunc()
  }

  /**
   * Create a refactor issue
   */
  async function createRefactorIssueFunc () {
    // Check cooldown period before creating a new auto-created refactor issue
    console.log('Checking cooldown period for auto-created refactor issues...')

    // Fetch recent closed issues to check for cooldown
    const recentClosedResponse = await github.graphql(
      `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issues(first: 20, states: CLOSED, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes {
                number
                title
                closedAt
                labels(first: 10) {
                  nodes { name }
                }
              }
            }
          }
        }
      `,
      repoVars
    )

    const recentClosed = recentClosedResponse.repository.issues.nodes
    const { shouldWait, reason } = helpers.shouldWaitForCooldown(
      recentClosed,
      refactorCooldownDays
    )

    if (shouldWait) {
      console.log(`Skipping refactor issue creation: ${reason}`)
      return
    }

    console.log(`Proceeding with refactor issue creation: ${reason}`)

    // Get refactor label ID
    const labelInfo = await github.graphql(
      `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            label(name: "refactor") {
              id
            }
          }
        }
      `,
      repoVars
    )

    if (!labelInfo.repository.label) {
      throw new Error('Refactor label not found in repository.')
    }
    const refactorLabelId = labelInfo.repository.label.id

    // Read the template content
    const issueBody = helpers.readRefactorIssueTemplate(refactorIssueTemplate)

    // Create issue title with [AUTO] marker to identify auto-created issues
    const issueTitle = `refactor: codebase improvements [AUTO] - ${new Date().toISOString()}`

    // Create and assign issue to Copilot
    if (dryRun) {
      console.log(
        `[DRY RUN] Would create refactor issue with title: ${issueTitle}`
      )
      console.log(
        `[DRY RUN] Would assign to Copilot bot (ID: ${copilotBotId})`
      )
      // Return a mock issue for dry-run mode
      return {
        issue: {
          id: 'dry-run-id',
          number: 0,
          title: issueTitle,
          url: '[DRY RUN - would create new refactor issue]'
        }
      }
    }

    const res = await github.graphql(
      `
        mutation($repositoryId: ID!, $title: String!, $body: String!, $assigneeIds: [ID!]) {
          createIssue(
            input: {
              repositoryId: $repositoryId,
              title: $title,
              body: $body,
              assigneeIds: $assigneeIds
            }
          ) {
            issue {
              id
              number
              url
              title
              assignees(first: 10) { nodes { login } }
            }
          }
        }
      `,
      {
        repositoryId: repoId,
        title: issueTitle,
        body: issueBody,
        assigneeIds: [copilotBotId]
      }
    )

    console.log(`Created Copilot-assigned issue: ${res.createIssue.issue.url}`)

    // Add refactor label to the issue
    const issueId = res.createIssue.issue.id
    try {
      await github.graphql(
        `
          mutation($issueId: ID!, $labelIds: [ID!]!) {
            addLabelsToLabelable(
              input: {
                labelableId: $issueId,
                labelIds: $labelIds
              }
            ) {
              labelable {
                ... on Issue {
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                }
              }
            }
          }
        `,
        {
          issueId,
          labelIds: [refactorLabelId]
        }
      )

      console.log('Added \'refactor\' label to issue')
    } catch (error) {
      console.error(`Failed to add refactor label: ${error.message}`)
      console.error(
        'Issue was created successfully but label could not be added.'
      )
      // Don't throw - issue was created successfully
    }

    // Return the created issue
    return {
      issue: {
        id: res.createIssue.issue.id,
        number: res.createIssue.issue.number,
        title: res.createIssue.issue.title,
        url: res.createIssue.issue.url
      }
    }
  }

  /**
   * Assign Copilot to the next available issue based on priority
   */
  async function assignNextIssue (labelOverride) {
    // Define label priority
    const labelPriority = labelOverride
      ? [labelOverride]
      : ['bug', 'documentation', 'refactor', 'enhancement']

    let issueToAssign = null

    // Try to find an issue by priority
    for (const label of labelPriority) {
      console.log(`Searching for issues with label: ${label}`)

      const issues = await github.graphql(
        `
          query($owner: String!, $repo: String!, $label: String!) {
            repository(owner: $owner, name: $repo) {
              issues(first: 50, states: OPEN, labels: [$label], orderBy: {field: CREATED_AT, direction: ASC}) {
                nodes {
                  id
                  number
                  title
                  body
                  url
                  assignees(first: 10) {
                    nodes { login }
                  }
                  labels(first: 10) {
                    nodes { name }
                  }
                  trackedIssues(first: 1) {
                    totalCount
                  }
                }
              }
            }
          }
        `,
        {
          ...repoVars,
          label
        }
      )

      console.log(
        `  Found ${issues.repository.issues.nodes.length} issues with label "${label}"`
      )

      // WORKAROUND: GraphQL trackedIssues returns 0 even when sub-issues exist
      // Solution: Use REST API sub_issues endpoint
      await enrichWithSubIssues(issues.repository.issues.nodes)

      // Find first assignable issue using simplified helper function
      const assignable = helpers.findAssignableIssue(
        issues.repository.issues.nodes,
        allowParentIssues,
        skipLabels
      )
      if (assignable) {
        issueToAssign = assignable
        console.log(
          `Found issue to assign: ${context.repo.owner}/${context.repo.repo}#${issueToAssign.number}`
        )
        break
      }
    }

    // If no issue with priority labels, try other open issues
    if (!issueToAssign && !labelOverride) {
      console.log('Searching for any open unassigned issue...')

      const allIssues = await github.graphql(
        `
          query($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
              issues(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
                nodes {
                  id
                  number
                  title
                  url
                  body
                  assignees(first: 10) {
                    nodes { login }
                  }
                  labels(first: 10) {
                    nodes { name }
                  }
                  trackedIssues(first: 1) {
                    totalCount
                  }
                }
              }
            }
          }
        `,
        repoVars
      )

      // Filter out priority-labeled issues (already checked)
      const nonPriorityIssues = allIssues.repository.issues.nodes.filter(
        (issue) => {
          const hasPriorityLabel = issue.labels.nodes.some((l) =>
            labelPriority.includes(l.name)
          )
          return !hasPriorityLabel
        }
      )

      // Apply the same REST API sub-issue detection
      await enrichWithSubIssues(nonPriorityIssues)

      issueToAssign = helpers.findAssignableIssue(
        nonPriorityIssues,
        allowParentIssues,
        skipLabels
      )
      if (issueToAssign) {
        console.log(
          `Found issue to assign: ${context.repo.owner}/${context.repo.repo}#${issueToAssign.number}`
        )
      }
    }

    if (!issueToAssign) {
      console.log('No suitable issue found to assign to Copilot.')

      // Check if we should create a refactor issue
      if (!createRefactorIssue) {
        console.log(
          'Skipping refactor issue creation (create-refactor-issue is disabled).'
        )
        return
      }

      console.log(
        'Creating or assigning a refactor issue instead to ensure Copilot has work.'
      )

      // If no regular issues are available, handle refactor mode
      return handleRefactorMode()
    }

    // Assign the issue to Copilot
    if (dryRun) {
      console.log(
        `[DRY RUN] Would assign issue #${issueToAssign.number} to Copilot (ID: ${copilotBotId})`
      )
      console.log(`[DRY RUN] Issue title: ${issueToAssign.title}`)
      console.log(`[DRY RUN] Issue URL: ${issueToAssign.url}`)
      return { issue: issueToAssign }
    }

    console.log(`Assigning issue #${issueToAssign.number} to Copilot...`)

    await github.graphql(
      `
        mutation($issueId: ID!, $assigneeIds: [ID!]!) {
          addAssigneesToAssignable(
            input: {
              assignableId: $issueId,
              assigneeIds: $assigneeIds
            }
          ) {
            assignable {
              ... on Issue {
                assignees(first: 10) {
                  nodes { login }
                }
              }
            }
          }
        }
      `,
      {
        issueId: issueToAssign.id,
        assigneeIds: [copilotBotId]
      }
    )

    console.log(
      `✓ Successfully assigned issue #${issueToAssign.number} to Copilot`
    )
    console.log(`  Title: ${issueToAssign.title}`)
    console.log(`  URL: ${issueToAssign.url}`)
    return { issue: issueToAssign }
  }
}


/***/ }),

/***/ 781:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 869:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 896:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

/**
 * GitHub Action entry point for auto-assigning Copilot to issues
 * This file integrates with GitHub Actions using @actions/core and @actions/github
 */

const core = __nccwpck_require__(781)
const github = __nccwpck_require__(869)
const executeWorkflow = __nccwpck_require__(567)

/**
 * Main action execution
 */
async function run () {
  try {
    // Get inputs from action.yml
    const token = core.getInput('github-token', { required: true })
    const mode = core.getInput('mode') || 'auto'
    const labelOverride = core.getInput('label-override') || null
    const force = core.getInput('force') === 'true'
    const dryRun = core.getInput('dry-run') === 'true'
    const allowParentIssues = core.getInput('allow-parent-issues') === 'true'
    const skipLabelsRaw = core.getInput('skip-labels') || 'no-ai,refining'
    const refactorThreshold = parseInt(core.getInput('refactor-threshold') || '4', 10)
    const createRefactorIssue = core.getInput('create-refactor-issue') !== 'false'
    const refactorIssueTemplate = core.getInput('refactor-issue-template') || ''
    const waitSeconds = parseInt(core.getInput('wait-seconds') || '300', 10)
    const refactorCooldownDays = parseInt(core.getInput('refactor-cooldown-days') || '7', 10)

    // Parse skip labels from comma-separated string
    const skipLabels = skipLabelsRaw
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label.length > 0)

    console.log(`Running auto-assign-copilot action (mode: ${mode}, force: ${force}, dryRun: ${dryRun})`)

    // Create authenticated Octokit client
    const octokit = github.getOctokit(token)

    // Get the context
    const context = github.context

    // Execute the workflow logic
    const result = await executeWorkflow({
      github: octokit,
      context,
      mode,
      labelOverride,
      force,
      dryRun,
      allowParentIssues,
      skipLabels,
      refactorThreshold,
      createRefactorIssue,
      refactorIssueTemplate,
      waitSeconds,
      refactorCooldownDays
    })

    // Set outputs
    core.setOutput('assigned-issue-number', result?.issue?.number?.toString() || '')
    core.setOutput('assigned-issue-url', result?.issue?.url || '')
    core.setOutput('assignment-mode', mode)

    console.log('✓ Action completed successfully')
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`)
    console.error(error)
  }
}

// Run the action
run()

module.exports = __webpack_exports__;
/******/ })()
;