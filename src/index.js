#!/usr/bin/env node

/**
 * GitHub Action entry point for auto-assigning Copilot to issues
 * This file integrates with GitHub Actions using @actions/core and @actions/github
 */

const core = require('@actions/core')
const github = require('@actions/github')
const executeWorkflow = require('./workflow.js')
const { validatePositiveInteger, validateLabelName, validateLabelArray } = require('./validation.js')

/**
 * Main action execution
 */
async function run () {
  try {
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
    core.setFailed(`Action failed: ${error.message}`)
    core.error(error.stack || error.message)
  }
}

// Run the action
run()
