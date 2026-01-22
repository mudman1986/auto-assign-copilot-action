#!/usr/bin/env node

/**
 * Assign Copilot to GitHub Issues
 *
 * This script handles automatic assignment of GitHub Copilot to issues
 * based on priority labels and various constraints.
 */

const fs = require('fs')
const path = require('path')

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
