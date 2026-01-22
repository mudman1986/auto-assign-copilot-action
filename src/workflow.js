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
 * @param {boolean} params.force - Force assignment even if copilot has issues
 * @param {boolean} params.dryRun - Dry run mode
 * @param {boolean} params.allowParentIssues - Allow assigning parent issues
 * @param {Array<string>} params.skipLabels - Labels to skip
 * @param {number} params.refactorThreshold - Number of closed issues to check
 * @param {boolean} params.createRefactorIssue - Whether to create new refactor issues
 * @param {string} params.refactorIssueTemplate - Path to the refactor issue template file
 * @param {number} params.waitSeconds - Number of seconds to wait for issue events (default: 0)
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
  waitSeconds = 0
}) => {
  const helpers = require('./helpers.js')

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
        owner: context.repo.owner,
        repo: context.repo.repo,
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
    {
      owner: context.repo.owner,
      repo: context.repo.repo
    }
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
    {
      owner: context.repo.owner,
      repo: context.repo.repo
    }
  )

  const allIssues = allIssuesResponse.repository.issues.nodes
  console.log(`Found ${allIssues.length} total open issues`)

  const currentIssues = allIssues.filter((issue) =>
    issue.assignees.nodes.some((assignee) => assignee.login === copilotLogin)
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
      {
        owner: context.repo.owner,
        repo: context.repo.repo
      }
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
      {
        owner: context.repo.owner,
        repo: context.repo.repo
      }
    )

    if (!labelInfo.repository.label) {
      throw new Error('Refactor label not found in repository.')
    }
    const refactorLabelId = labelInfo.repository.label.id

    // Read the template content
    const issueBody = helpers.readRefactorIssueTemplate(refactorIssueTemplate)

    // Create and assign issue to Copilot
    if (dryRun) {
      console.log(
        `[DRY RUN] Would create refactor issue with title: refactor: codebase improvements - ${new Date().toISOString()}`
      )
      console.log(
        `[DRY RUN] Would assign to Copilot bot (ID: ${copilotBotId})`
      )
      // Return a mock issue for dry-run mode
      return {
        issue: {
          id: 'dry-run-id',
          number: 0,
          title: `refactor: codebase improvements - ${new Date().toISOString()}`,
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
        title: `refactor: codebase improvements - ${new Date().toISOString()}`,
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
          owner: context.repo.owner,
          repo: context.repo.repo,
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
        {
          owner: context.repo.owner,
          repo: context.repo.repo
        }
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
