#!/usr/bin/env node

/**
 * GitHub Action entry point for auto-assigning Copilot to issues
 * This file integrates with GitHub Actions using @actions/core and @actions/github
 */

const core = require('@actions/core')
const github = require('@actions/github')
const executeWorkflow = require('./workflow.js')

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
    const refactorThresholdRaw = core.getInput('refactor-threshold') || '4'
    const refactorThreshold = parseInt(refactorThresholdRaw, 10)

    // Parse skip labels from comma-separated string
    const skipLabels = skipLabelsRaw
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label.length > 0)

    console.log(`Running auto-assign-copilot action:
  mode: ${mode}
  force: ${force}
  labelOverride: ${labelOverride}
  dryRun: ${dryRun}
  allowParentIssues: ${allowParentIssues}
  refactorThreshold: ${refactorThreshold}
  skipLabels: ${JSON.stringify(skipLabels)}`)

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
      refactorThreshold
    })

    // Set outputs
    const assignedIssueNumber = result?.issue?.number?.toString() || ''
    const assignedIssueUrl = result?.issue?.url || ''
    core.setOutput('assigned-issue-number', assignedIssueNumber)
    core.setOutput('assigned-issue-url', assignedIssueUrl)
    core.setOutput('assignment-mode', mode)

    console.log('✓ Action completed successfully')
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`)
    console.error(error)
  }
}

// Run the action
run()
