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
