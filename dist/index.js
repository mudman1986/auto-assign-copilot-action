#!/usr/bin/env node
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 6636:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


/**
 * Assign Copilot to GitHub Issues
 *
 * This script handles automatic assignment of GitHub Copilot to issues
 * based on priority labels and various constraints.
 */

const fs = __nccwpck_require__(9896)
const path = __nccwpck_require__(6928)
const logger = __nccwpck_require__(8033)

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
  const labels = normalizeIssueLabels(issue)
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    body: issue.body || '',
    isAssigned: issue.assignees.nodes.length > 0,
    hasSubIssues: issue.trackedIssues?.totalCount > 0,
    isSubIssue: issue.trackedInIssues?.totalCount > 0,
    isRefactorIssue: labels.some((l) => l.name === 'refactor'),
    labels
  }
}

/**
 * Find the first assignable issue from a list
 * @param {Array} issues - Array of issue objects from GraphQL
 * @param {boolean} allowParentIssues - Whether to allow assigning issues with sub-issues (open or closed)
 * @param {Array<string>} [skipLabels=[]] - Array of label names to skip (default: empty array)
 * @param {string|null} [requiredLabel=null] - Label that must be present for assignment (default: null)
 * @returns {Object|null} - First assignable issue or null
 */
function findAssignableIssue (
  issues,
  allowParentIssues = false,
  skipLabels = [],
  requiredLabel = null
) {
  for (const issue of issues) {
    const parsed = parseIssueData(issue)
    const { shouldSkip } = shouldSkipIssue(
      parsed,
      allowParentIssues,
      skipLabels
    )

    if (shouldSkip) {
      continue
    }

    // Check if the issue has the required label (if specified)
    if (!hasRequiredLabel(parsed, requiredLabel)) {
      continue
    }

    return parsed
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
 * Validate template path for security
 * @param {string} templatePath - Path to validate
 * @param {string} workspaceRoot - Workspace root directory
 * @returns {string|null} - Absolute path if valid, null if invalid
 */
function validateTemplatePath (templatePath, workspaceRoot) {
  if (path.isAbsolute(templatePath) || templatePath.startsWith('\\\\')) {
    logger.info(`Template path ${templatePath} is absolute or UNC, using default content`)
    return null
  }

  const absolutePath = path.resolve(workspaceRoot, templatePath)
  const relativePath = path.relative(workspaceRoot, absolutePath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    logger.info(`Template path ${templatePath} is outside workspace, using default content`)
    return null
  }

  const allowedExtensions = ['.md', '.txt']
  const ext = path.extname(absolutePath).toLowerCase()
  if (!allowedExtensions.includes(ext)) {
    logger.info(`Template file extension ${ext} not allowed, using default content`)
    return null
  }

  return absolutePath
}

/**
 * Check if a candidate path is within a root directory
 * @param {string} candidatePath - Candidate absolute path
 * @param {string} rootPath - Root absolute path
 * @returns {boolean} - True when candidate is inside root
 */
function isPathWithinRoot (candidatePath, rootPath) {
  const normalizedCandidatePath = path.normalize(candidatePath)
  const normalizedRootPath = path.normalize(rootPath)
  const isWindows = process.platform === 'win32'
  const candidateForComparison = isWindows
    ? normalizedCandidatePath.toLowerCase()
    : normalizedCandidatePath
  const rootForComparison = isWindows
    ? normalizedRootPath.toLowerCase()
    : normalizedRootPath
  const relativePath = path.relative(rootForComparison, candidateForComparison)
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

/**
 * Read the content of the refactor issue template file
 * Enhanced with additional security validations (V03: Path Traversal Protection)
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

  if (!templatePath?.trim()) {
    logger.info('No custom template path provided, using default content')
    return defaultContent
  }

  try {
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd()
    const absolutePath = validateTemplatePath(templatePath, workspaceRoot)

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      if (!absolutePath) return defaultContent
      logger.info(`Template file not found at ${absolutePath}, using default content`)
      return defaultContent
    }

    let realWorkspaceRoot
    let realTemplatePath
    try {
      realWorkspaceRoot = fs.realpathSync(workspaceRoot)
      realTemplatePath = fs.realpathSync(absolutePath)
    } catch (error) {
      logger.info(`Failed to resolve template real path: ${error.message}, using default content`)
      return defaultContent
    }
    if (!isPathWithinRoot(realTemplatePath, realWorkspaceRoot)) {
      logger.info(`Template path ${templatePath} resolves outside workspace, using default content`)
      return defaultContent
    }

    const stats = fs.statSync(realTemplatePath)
    const MAX_SIZE = 100 * 1024
    if (stats.size > MAX_SIZE) {
      logger.info(`Template file too large (${stats.size} bytes), using default content`)
      return defaultContent
    }

    const content = fs.readFileSync(realTemplatePath, 'utf8')
    logger.info(`Successfully loaded template from ${realTemplatePath}`)
    return content
  } catch (error) {
    logger.info(`Error reading template file: ${error.message}, using default content`)
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
  return issue?.title?.includes('[AUTO]') || false
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

/**
 * Check if an issue has the required label for assignment
 * @param {Object} issue - Issue object with labels
 * @param {string|null} requiredLabel - Label that must be present (null or empty string means no requirement)
 * @returns {boolean} - True if issue has the required label or no label is required
 */
function hasRequiredLabel (issue, requiredLabel) {
  if (!requiredLabel?.trim()) {
    return true
  }

  const labels = normalizeIssueLabels(issue)
  return labels.some((label) => label.name === requiredLabel)
}

module.exports = {
  shouldSkipIssue,
  shouldAssignNewIssue,
  parseIssueData,
  findAssignableIssue,
  normalizeIssueLabels,
  hasRecentRefactorIssue,
  readRefactorIssueTemplate,
  isAutoCreatedRefactorIssue,
  shouldWaitForCooldown,
  hasRequiredLabel
}


/***/ }),

/***/ 8033:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

let corePromise

function loadCore () {
  return Promise.all(/* import() */[__nccwpck_require__.e(119), __nccwpck_require__.e(421)]).then(__nccwpck_require__.bind(__nccwpck_require__, 6421))
    .then(module => module.default || module)
    .catch(() => null)
}

let coreLoader = loadCore

async function getCore () {
  corePromise ??= coreLoader()

  return corePromise
}

function logWithCore (method, fallback, message) {
  const text = String(message)

  return getCore()
    .then((core) => {
      if (core?.[method]) {
        core[method](text)
        return
      }

      fallback(text)
    })
    .catch(() => {
      fallback(text)
    })
}

function info (message) {
  return logWithCore('info', console.log, message)
}

function warning (message) {
  return logWithCore('warning', console.warn, message)
}

function error (message) {
  return logWithCore('error', console.error, message)
}

module.exports = {
  info,
  warning,
  error,
  __getCoreForTests: getCore,
  __setCoreLoaderForTests (loader) {
    coreLoader = loader
    corePromise = undefined
  },
  __resetCoreLoaderForTests () {
    coreLoader = loadCore
    corePromise = undefined
  }
}


/***/ }),

/***/ 4378:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {


/**
 * Input validation utilities for security hardening
 * Addresses vulnerabilities: V01 (Integer Overflow), V02 (GraphQL Injection), V06 (Label Arrays)
 */

const logger = __nccwpck_require__(8033)

/**
 * Validate and parse a positive integer with bounds checking
 * Prevents integer overflow and negative values
 * @param {string} value - The value to parse
 * @param {string} defaultValue - Default value if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Validated integer
 * @throws {Error} - If value is invalid or out of bounds
 */
function validatePositiveInteger (value, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = parseInt(value || defaultValue, 10)

  if (isNaN(parsed)) {
    throw new Error(`Invalid integer: ${value}. Must be a valid number.`)
  }

  if (parsed < min || parsed > max) {
    throw new Error(`Integer out of range: ${parsed}. Must be between ${min} and ${max}.`)
  }

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Integer not safe: ${parsed}. Value too large.`)
  }

  return parsed
}

/**
 * Validate a label name for safe use in GraphQL queries
 * Prevents GraphQL injection attacks
 * @param {string} label - The label name to validate
 * @returns {string|null} - Validated label name or null if empty
 * @throws {Error} - If label contains invalid characters or is too long
 */
function validateLabelName (label) {
  if (!label || typeof label !== 'string') {
    return null
  }

  const trimmed = label.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.length > 50) {
    throw new Error(`Label too long: ${trimmed.length} characters. Maximum is 50.`)
  }

  if (!/^[a-zA-Z0-9\-_ ]+$/.test(trimmed)) {
    throw new Error(`Label contains invalid characters: "${trimmed}". Only alphanumeric, dash, underscore, and space allowed.`)
  }

  return trimmed
}

/**
 * Validate and limit an array of label names
 * Prevents DoS through excessive labels
 * @param {Array<string>} labels - Array of label names
 * @param {number} maxLabels - Maximum number of labels allowed
 * @returns {Array<string>} - Validated and limited array of labels
 */
function validateLabelArray (labels, maxLabels = 50) {
  if (!Array.isArray(labels)) {
    return []
  }

  const validatedLabels = labels.reduce((acc, label) => {
    try {
      const validated = validateLabelName(label)
      if (validated) {
        acc.push(validated)
      }
    } catch (error) {
      logger.warning(`Skipping invalid label: ${error.message}`)
    }
    return acc
  }, [])

  if (validatedLabels.length > maxLabels) {
    logger.warning(`Too many labels (${validatedLabels.length}). Limiting to ${maxLabels}.`)
    return validatedLabels.slice(0, maxLabels)
  }

  return validatedLabels
}

module.exports = {
  validatePositiveInteger,
  validateLabelName,
  validateLabelArray
}


/***/ }),

/***/ 7864:
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
 * @param {string|null} params.requiredLabel - Label that must be present for assignment eligibility
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

const helpers = __nccwpck_require__(6636)
const logger = __nccwpck_require__(8033)

module.exports = async ({
  github,
  context,
  mode,
  labelOverride,
  requiredLabel,
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
  // Common GraphQL query variables
  const repoVars = {
    owner: context.repo.owner,
    repo: context.repo.repo
  }

  // Common GraphQL fragment for issue fields
  const ISSUE_FIELDS = `
    id
    number
    title
    url
    body
    assignees(first: 10) {
      nodes { login id }
    }
    labels(first: 10) {
      nodes { name }
    }
    trackedIssues(first: 1) {
      totalCount
    }
  `

  // Wait for grace period if this is an issue event and wait-seconds is configured
  if (context.eventName === 'issues' && waitSeconds > 0) {
    logger.info(
      `Issue event detected. Waiting ${waitSeconds} seconds for grace period before proceeding...`
    )
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    logger.info('Grace period complete. Proceeding with assignment.')
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

  /**
   * Assign Copilot to an issue
   * @param {string} issueId - The GraphQL ID of the issue
   * @returns {Promise<void>}
   */
  async function assignCopilotToIssue (issueId) {
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
        issueId,
        assigneeIds: [copilotBotId]
      }
    )
  }

  /**
   * Log and handle assignment (dry run or actual)
   * @param {Object} issue - Issue to assign
   * @param {string} type - Type of issue ('issue' or 'refactor issue')
   * @returns {Promise<Object>} - Result object with issue
   */
  async function handleAssignment (issue, type = 'issue') {
    if (dryRun) {
      logger.info(`[DRY RUN] Would assign ${type} #${issue.number} to Copilot`)
      logger.info(`[DRY RUN] Issue title: ${issue.title}`)
      logger.info(`[DRY RUN] Issue URL: ${issue.url}`)
      return { issue }
    }

    logger.info(`Assigning ${type} #${issue.number} to Copilot...`)
    await assignCopilotToIssue(issue.id)
    logger.info(`✓ Successfully assigned ${type} #${issue.number} to Copilot`)
    logger.info(`  Title: ${issue.title}`)
    logger.info(`  URL: ${issue.url}`)
    return { issue }
  }

  // Step 0: Determine mode based on recent closed issues (for issue close events)
  let effectiveMode = mode
  if (context.eventName === 'issues' && mode === 'auto') {
    logger.info(
      `Checking last ${refactorThreshold} closed issues to determine if refactor is needed...`
    )

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
    logger.info(`Found ${closedIssues.length} recently closed issues`)

    const hasRefactor = helpers.hasRecentRefactorIssue(
      closedIssues,
      refactorThreshold
    )

    if (!hasRefactor) {
      logger.info(
        `None of the last ${refactorThreshold} closed issues have refactor label - switching to refactor mode`
      )
      effectiveMode = 'refactor'
    } else {
      logger.info(
        `At least one of the last ${refactorThreshold} closed issues has refactor label - staying in auto mode`
      )
    }
  }

  logger.info(`Effective mode: ${effectiveMode}`)

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
  logger.info(
    `Found Copilot bot: login="${copilotBot.login}", id="${copilotBotId}"`
  )

  // Step 2: Check if Copilot is already assigned to an issue
  logger.info('Querying for all open issues to check assignees...')
  const allIssuesResponse = await github.graphql(
    `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, states: OPEN) {
            nodes {
              ${ISSUE_FIELDS}
            }
          }
        }
      }
    `,
    repoVars
  )

  const allIssues = allIssuesResponse.repository.issues.nodes
  logger.info(`Found ${allIssues.length} total open issues`)

  const currentIssues = allIssues.filter((issue) =>
    issue.assignees.nodes.some((assignee) => assignee.id === copilotBotId)
  )

  if (currentIssues.length > 0) {
    logger.info(
      `Found ${currentIssues.length} issue(s) assigned to copilot`
    )

    const { shouldAssign, reason } = helpers.shouldAssignNewIssue(
      currentIssues,
      effectiveMode,
      force
    )
    if (!shouldAssign) {
      logger.info(`Skipping assignment: ${reason}`)
      return
    }
    logger.info(`Proceeding with assignment: ${reason}`)
  }

  // Step 3: Handle different modes
  if (effectiveMode === 'refactor') {
    // When effectiveMode is 'refactor', check if we got here due to refactor threshold
    // being reached (no refactor in last N closed issues) vs. explicit refactor mode
    // Threshold-triggered refactor mode should bypass cooldown to maintain ratio
    const thresholdTriggeredRefactorMode = context.eventName === 'issues' && mode === 'auto'
    return handleRefactorMode(thresholdTriggeredRefactorMode)
  }
  if (effectiveMode === 'auto') {
    return assignNextIssue(labelOverride)
  }
  throw new Error(`Unknown mode: ${effectiveMode}`)

  /**
   * Handle refactor mode: assign existing refactor issue or create new one
   * @param {boolean} bypassCooldown - Whether to bypass the cooldown check because the
   *                                    refactor threshold was reached (not enough refactor
   *                                    issues in the last N closed issues)
   */
  async function handleRefactorMode (bypassCooldown = false) {
    logger.info('Refactor mode: checking for available refactor issues...')

    // Get all open issues with detailed info including trackedIssues
    const refactorIssuesResponse = await github.graphql(
      `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issues(first: 100, states: OPEN, labels: ["refactor"], orderBy: {field: CREATED_AT, direction: ASC}) {
              nodes {
                ${ISSUE_FIELDS}
              }
            }
          }
        }
      `,
      repoVars
    )

    const refactorIssues = refactorIssuesResponse.repository.issues.nodes
    logger.info(
      `Found ${refactorIssues.length} open issues with refactor label`
    )

    // Check for sub-issues via REST API
    await enrichWithSubIssues(refactorIssues)

    // Try to find an assignable refactor issue
    const availableRefactorIssue = helpers.findAssignableIssue(
      refactorIssues,
      allowParentIssues,
      skipLabels,
      requiredLabel
    )

    if (availableRefactorIssue) {
      logger.info(
        `Found available refactor issue #${availableRefactorIssue.number}: ${availableRefactorIssue.title}`
      )
      return handleAssignment(availableRefactorIssue, 'refactor issue')
    }

    // Check if we should create a new refactor issue
    if (!createRefactorIssue) {
      logger.info(
        'No available refactor issues found, but create-refactor-issue is disabled. Skipping refactor issue creation.'
      )
      return
    }

    logger.info('No available refactor issues found - creating a new one')
    return createRefactorIssueFunc(bypassCooldown)
  }

  /**
   * Create a refactor issue
   * @param {boolean} bypassCooldown - Whether to bypass the cooldown check because the
   *                                    refactor threshold was reached (not enough refactor
   *                                    issues in the last N closed issues)
   */
  async function createRefactorIssueFunc (bypassCooldown = false) {
    if (!bypassCooldown) {
      logger.info('Checking cooldown period for auto-created refactor issues...')

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
        logger.info(`Skipping refactor issue creation: ${reason}`)
        return
      }

      logger.info(`Proceeding with refactor issue creation: ${reason}`)
    } else {
      logger.info('Refactor threshold reached - bypassing cooldown check')
    }

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

    if (!labelInfo?.repository?.label) {
      throw new Error('Refactor label not found in repository.')
    }
    const refactorLabelId = labelInfo.repository.label.id

    // Read the template content
    const issueBody = helpers.readRefactorIssueTemplate(refactorIssueTemplate)

    // Create issue title with [AUTO] marker to identify auto-created issues
    const issueTitle = `refactor: codebase improvements [AUTO] - ${new Date().toISOString()}`

    // Create and assign issue to Copilot
    if (dryRun) {
      logger.info(
        `[DRY RUN] Would create refactor issue with title: ${issueTitle}`
      )
      logger.info('[DRY RUN] Would assign to Copilot bot')
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

    logger.info(`Created Copilot-assigned issue: ${res.createIssue.issue.url}`)

    // Add refactor label to the issue
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
          issueId: res.createIssue.issue.id,
          labelIds: [refactorLabelId]
        }
      )

      logger.info('Added \'refactor\' label to issue')
    } catch (error) {
      logger.error(`Failed to add refactor label: ${error.message}`)
      logger.error(
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
      logger.info(`Searching for issues with label: ${label}`)

      const issues = await github.graphql(
        `
          query($owner: String!, $repo: String!, $label: String!) {
            repository(owner: $owner, name: $repo) {
              issues(first: 50, states: OPEN, labels: [$label], orderBy: {field: CREATED_AT, direction: ASC}) {
                nodes {
                  ${ISSUE_FIELDS}
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

      logger.info(
        `  Found ${issues.repository.issues.nodes.length} issues with label "${label}"`
      )

      // WORKAROUND: GraphQL trackedIssues returns 0 even when sub-issues exist
      // Solution: Use REST API sub_issues endpoint
      await enrichWithSubIssues(issues.repository.issues.nodes)

      // Find first assignable issue using simplified helper function
      issueToAssign = helpers.findAssignableIssue(
        issues.repository.issues.nodes,
        allowParentIssues,
        skipLabels,
        requiredLabel
      )
      if (issueToAssign) {
        logger.info(
          `Found issue to assign: ${context.repo.owner}/${context.repo.repo}#${issueToAssign.number}`
        )
        break
      }
    }

    // If no issue with priority labels, try other open issues
    if (!issueToAssign && !labelOverride) {
      logger.info('Searching for any open unassigned issue...')

      const allIssues = await github.graphql(
        `
          query($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
              issues(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
                nodes {
                  ${ISSUE_FIELDS}
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
          const labels = helpers.normalizeIssueLabels(issue)
          const hasPriorityLabel = labels.some((l) =>
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
        skipLabels,
        requiredLabel
      )
      if (issueToAssign) {
        logger.info(
          `Found issue to assign: ${context.repo.owner}/${context.repo.repo}#${issueToAssign.number}`
        )
      }
    }

    if (!issueToAssign) {
      logger.info('No suitable issue found to assign to Copilot.')

      // Check if we should create a refactor issue
      if (!createRefactorIssue) {
        logger.info(
          'Skipping refactor issue creation (create-refactor-issue is disabled).'
        )
        return
      }

      logger.info(
        'Creating or assigning a refactor issue instead to ensure Copilot has work.'
      )

      return handleRefactorMode(false)
    }

    return handleAssignment(issueToAssign, 'issue')
  }
}


/***/ }),

/***/ 2613:
/***/ ((module) => {

"use strict";
module.exports = require("assert");

/***/ }),

/***/ 5317:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 6982:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ 4434:
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ 9896:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 8611:
/***/ ((module) => {

"use strict";
module.exports = require("http");

/***/ }),

/***/ 5692:
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ 9278:
/***/ ((module) => {

"use strict";
module.exports = require("net");

/***/ }),

/***/ 4589:
/***/ ((module) => {

"use strict";
module.exports = require("node:assert");

/***/ }),

/***/ 6698:
/***/ ((module) => {

"use strict";
module.exports = require("node:async_hooks");

/***/ }),

/***/ 4573:
/***/ ((module) => {

"use strict";
module.exports = require("node:buffer");

/***/ }),

/***/ 7540:
/***/ ((module) => {

"use strict";
module.exports = require("node:console");

/***/ }),

/***/ 7598:
/***/ ((module) => {

"use strict";
module.exports = require("node:crypto");

/***/ }),

/***/ 3053:
/***/ ((module) => {

"use strict";
module.exports = require("node:diagnostics_channel");

/***/ }),

/***/ 610:
/***/ ((module) => {

"use strict";
module.exports = require("node:dns");

/***/ }),

/***/ 8474:
/***/ ((module) => {

"use strict";
module.exports = require("node:events");

/***/ }),

/***/ 7067:
/***/ ((module) => {

"use strict";
module.exports = require("node:http");

/***/ }),

/***/ 2467:
/***/ ((module) => {

"use strict";
module.exports = require("node:http2");

/***/ }),

/***/ 7030:
/***/ ((module) => {

"use strict";
module.exports = require("node:net");

/***/ }),

/***/ 643:
/***/ ((module) => {

"use strict";
module.exports = require("node:perf_hooks");

/***/ }),

/***/ 1792:
/***/ ((module) => {

"use strict";
module.exports = require("node:querystring");

/***/ }),

/***/ 7075:
/***/ ((module) => {

"use strict";
module.exports = require("node:stream");

/***/ }),

/***/ 1692:
/***/ ((module) => {

"use strict";
module.exports = require("node:tls");

/***/ }),

/***/ 3136:
/***/ ((module) => {

"use strict";
module.exports = require("node:url");

/***/ }),

/***/ 7975:
/***/ ((module) => {

"use strict";
module.exports = require("node:util");

/***/ }),

/***/ 3429:
/***/ ((module) => {

"use strict";
module.exports = require("node:util/types");

/***/ }),

/***/ 5919:
/***/ ((module) => {

"use strict";
module.exports = require("node:worker_threads");

/***/ }),

/***/ 8522:
/***/ ((module) => {

"use strict";
module.exports = require("node:zlib");

/***/ }),

/***/ 857:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 6928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 3193:
/***/ ((module) => {

"use strict";
module.exports = require("string_decoder");

/***/ }),

/***/ 3557:
/***/ ((module) => {

"use strict";
module.exports = require("timers");

/***/ }),

/***/ 4756:
/***/ ((module) => {

"use strict";
module.exports = require("tls");

/***/ }),

/***/ 9023:
/***/ ((module) => {

"use strict";
module.exports = require("util");

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
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__nccwpck_require__.m = __webpack_modules__;
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/create fake namespace object */
/******/ 	(() => {
/******/ 		var getProto = Object.getPrototypeOf ? (obj) => (Object.getPrototypeOf(obj)) : (obj) => (obj.__proto__);
/******/ 		var leafPrototypes;
/******/ 		// create a fake namespace object
/******/ 		// mode & 1: value is a module id, require it
/******/ 		// mode & 2: merge all properties of value into the ns
/******/ 		// mode & 4: return value when already ns object
/******/ 		// mode & 16: return value when it's Promise-like
/******/ 		// mode & 8|1: behave like require
/******/ 		__nccwpck_require__.t = function(value, mode) {
/******/ 			if(mode & 1) value = this(value);
/******/ 			if(mode & 8) return value;
/******/ 			if(typeof value === 'object' && value) {
/******/ 				if((mode & 4) && value.__esModule) return value;
/******/ 				if((mode & 16) && typeof value.then === 'function') return value;
/******/ 			}
/******/ 			var ns = Object.create(null);
/******/ 			__nccwpck_require__.r(ns);
/******/ 			var def = {};
/******/ 			leafPrototypes = leafPrototypes || [null, getProto({}), getProto([]), getProto(getProto)];
/******/ 			for(var current = mode & 2 && value; typeof current == 'object' && !~leafPrototypes.indexOf(current); current = getProto(current)) {
/******/ 				Object.getOwnPropertyNames(current).forEach((key) => (def[key] = () => (value[key])));
/******/ 			}
/******/ 			def['default'] = () => (value);
/******/ 			__nccwpck_require__.d(ns, def);
/******/ 			return ns;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nccwpck_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__nccwpck_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__nccwpck_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__nccwpck_require__.f).reduce((promises, key) => {
/******/ 				__nccwpck_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks
/******/ 		__nccwpck_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".index.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/******/ 	/* webpack/runtime/require chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "loaded", otherwise not loaded yet
/******/ 		var installedChunks = {
/******/ 			792: 1
/******/ 		};
/******/ 		
/******/ 		// no on chunks loaded
/******/ 		
/******/ 		var installChunk = (chunk) => {
/******/ 			var moreModules = chunk.modules, chunkIds = chunk.ids, runtime = chunk.runtime;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__nccwpck_require__.o(moreModules, moduleId)) {
/******/ 					__nccwpck_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__nccwpck_require__);
/******/ 			for(var i = 0; i < chunkIds.length; i++)
/******/ 				installedChunks[chunkIds[i]] = 1;
/******/ 		
/******/ 		};
/******/ 		
/******/ 		// require() chunk loading for javascript
/******/ 		__nccwpck_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					installChunk(require("./" + __nccwpck_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		// no external install chunk
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

/**
 * GitHub Action entry point for auto-assigning Copilot to issues
 * This file integrates with GitHub Actions using @actions/core and @actions/github
 */

const executeWorkflow = __nccwpck_require__(7864)
const { validatePositiveInteger, validateLabelName, validateLabelArray } = __nccwpck_require__(4378)

/**
 * Main action execution
 */
async function run () {
  let core
  let github
  try {
    [core, github] = await Promise.all([
      Promise.all(/* import() */[__nccwpck_require__.e(119), __nccwpck_require__.e(421)]).then(__nccwpck_require__.bind(__nccwpck_require__, 6421)),
      Promise.all(/* import() */[__nccwpck_require__.e(119), __nccwpck_require__.e(157)]).then(__nccwpck_require__.bind(__nccwpck_require__, 157))
    ])

    // Get inputs from action.yml
    const token = core.getInput('github-token', { required: true })
    const mode = core.getInput('mode') || 'auto'
    const force = core.getInput('force') === 'true'
    const dryRun = core.getInput('dry-run') === 'true'
    const allowParentIssues = core.getInput('allow-parent-issues') === 'true'
    const createRefactorIssue = core.getInput('create-refactor-issue') !== 'false'
    const refactorIssueTemplate = core.getInput('refactor-issue-template') || ''

    // Validate label override (V02: GraphQL Injection Prevention)
    const labelOverride = validateLabelName(core.getInput('label-override'))
    const requiredLabel = validateLabelName(core.getInput('required-label'))

    // Validate numeric inputs with bounds checking (V01: Integer Overflow Prevention)
    const refactorThreshold = validatePositiveInteger(core.getInput('refactor-threshold'), '4', 1, 100)
    const waitSeconds = validatePositiveInteger(core.getInput('wait-seconds'), '300', 0, 3600)
    const refactorCooldownDays = validatePositiveInteger(core.getInput('refactor-cooldown-days'), '7', 0, 365)

    // Parse and validate skip labels (V06: Label Array Validation)
    const skipLabelsRaw = core.getInput('skip-labels') || 'no-ai,refining'
    const skipLabels = validateLabelArray(
      skipLabelsRaw.split(',').map(l => l.trim()).filter(Boolean),
      50
    )

    core.info(`Running auto-assign-copilot action (mode: ${mode}, force: ${force}, dryRun: ${dryRun})`)

    // Create authenticated Octokit client
    const octokit = github.getOctokit(token)

    // Execute the workflow logic
    const result = await executeWorkflow({
      github: octokit,
      context: github.context,
      mode,
      labelOverride,
      requiredLabel,
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

    core.info('✓ Action completed successfully')
  } catch (error) {
    if (core) {
      core.setFailed(`Action failed: ${error.message}`)
      core.error(error.stack || error.message)
      return
    }

    console.error(error.stack || error.message)
    process.exitCode = 1
  }
}

// Run the action
run()

module.exports = __webpack_exports__;
/******/ })()
;