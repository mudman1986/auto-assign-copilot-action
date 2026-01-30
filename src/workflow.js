#!/usr/bin/env node

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

const core = require('@actions/core')
const helpers = require('./helpers.js')

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
    core.info(
      `Issue event detected. Waiting ${waitSeconds} seconds for grace period before proceeding...`
    )
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    core.info('Grace period complete. Proceeding with assignment.')
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
      core.info(`[DRY RUN] Would assign ${type} #${issue.number} to Copilot`)
      core.info(`[DRY RUN] Issue title: ${issue.title}`)
      core.info(`[DRY RUN] Issue URL: ${issue.url}`)
      return { issue }
    }

    core.info(`Assigning ${type} #${issue.number} to Copilot...`)
    await assignCopilotToIssue(issue.id)
    core.info(`✓ Successfully assigned ${type} #${issue.number} to Copilot`)
    core.info(`  Title: ${issue.title}`)
    core.info(`  URL: ${issue.url}`)
    return { issue }
  }

  // Step 0: Determine mode based on recent closed issues (for issue close events)
  let effectiveMode = mode
  if (context.eventName === 'issues' && mode === 'auto') {
    core.info(
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
    core.info(`Found ${closedIssues.length} recently closed issues`)

    const hasRefactor = helpers.hasRecentRefactorIssue(
      closedIssues,
      refactorThreshold
    )

    if (!hasRefactor) {
      core.info(
        `None of the last ${refactorThreshold} closed issues have refactor label - switching to refactor mode`
      )
      effectiveMode = 'refactor'
    } else {
      core.info(
        `At least one of the last ${refactorThreshold} closed issues has refactor label - staying in auto mode`
      )
    }
  }

  core.info(`Effective mode: ${effectiveMode}`)

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
  core.info(
    `Found Copilot bot: login="${copilotBot.login}", id="${copilotBotId}"`
  )

  // Step 2: Check if Copilot is already assigned to an issue
  core.info('Querying for all open issues to check assignees...')
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
  core.info(`Found ${allIssues.length} total open issues`)

  const currentIssues = allIssues.filter((issue) =>
    issue.assignees.nodes.some((assignee) => assignee.id === copilotBotId)
  )

  if (currentIssues.length > 0) {
    core.info(
      `Found ${currentIssues.length} issue(s) assigned to copilot`
    )

    const { shouldAssign, reason } = helpers.shouldAssignNewIssue(
      currentIssues,
      effectiveMode,
      force
    )
    if (!shouldAssign) {
      core.info(`Skipping assignment: ${reason}`)
      return
    }
    core.info(`Proceeding with assignment: ${reason}`)
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
    core.info('Refactor mode: checking for available refactor issues...')

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
    core.info(
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
      core.info(
        `Found available refactor issue #${availableRefactorIssue.number}: ${availableRefactorIssue.title}`
      )
      return handleAssignment(availableRefactorIssue, 'refactor issue')
    }

    // Check if we should create a new refactor issue
    if (!createRefactorIssue) {
      core.info(
        'No available refactor issues found, but create-refactor-issue is disabled. Skipping refactor issue creation.'
      )
      return
    }

    core.info('No available refactor issues found - creating a new one')
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
      core.info('Checking cooldown period for auto-created refactor issues...')

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
        core.info(`Skipping refactor issue creation: ${reason}`)
        return
      }

      core.info(`Proceeding with refactor issue creation: ${reason}`)
    } else {
      core.info('Refactor threshold reached - bypassing cooldown check')
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
      core.info(
        `[DRY RUN] Would create refactor issue with title: ${issueTitle}`
      )
      core.info('[DRY RUN] Would assign to Copilot bot')
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

    core.info(`Created Copilot-assigned issue: ${res.createIssue.issue.url}`)

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

      core.info('Added \'refactor\' label to issue')
    } catch (error) {
      core.error(`Failed to add refactor label: ${error.message}`)
      core.error(
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
      core.info(`Searching for issues with label: ${label}`)

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

      core.info(
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
        core.info(
          `Found issue to assign: ${context.repo.owner}/${context.repo.repo}#${issueToAssign.number}`
        )
        break
      }
    }

    // If no issue with priority labels, try other open issues
    if (!issueToAssign && !labelOverride) {
      core.info('Searching for any open unassigned issue...')

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
        core.info(
          `Found issue to assign: ${context.repo.owner}/${context.repo.repo}#${issueToAssign.number}`
        )
      }
    }

    if (!issueToAssign) {
      core.info('No suitable issue found to assign to Copilot.')

      // Check if we should create a refactor issue
      if (!createRefactorIssue) {
        core.info(
          'Skipping refactor issue creation (create-refactor-issue is disabled).'
        )
        return
      }

      core.info(
        'Creating or assigning a refactor issue instead to ensure Copilot has work.'
      )

      return handleRefactorMode(false)
    }

    return handleAssignment(issueToAssign, 'issue')
  }
}
