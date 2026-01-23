/**
 * Custom semantic-release plugin wrapper that expands squash commits
 * before they are processed by release-notes-generator
 */

const releaseNotesGenerator = require('@semantic-release/release-notes-generator')
const { parseConventionalCommits } = require('./release-notes-parser')

/**
 * Expand commits by parsing squash merge bodies
 * @param {Array} commits - Array of commits
 * @returns {Array} - Expanded array of commits
 */
function expandCommits (commits) {
  const expanded = []

  for (const commit of commits) {
    const subCommits = parseConventionalCommits(commit.body)

    if (subCommits.length > 0) {
      // Add each sub-commit as a separate commit with proper type
      for (const sub of subCommits) {
        expanded.push({
          ...commit,
          type: sub.type,
          scope: sub.scope,
          subject: sub.subject,
          // Clear the body to avoid re-processing
          body: '',
          // Preserve other commit metadata
          hash: commit.hash,
          author: commit.author,
          committer: commit.committer
        })
      }
    } else {
      // No sub-commits, keep original
      expanded.push(commit)
    }
  }

  return expanded
}

/**
 * Generate release notes with expanded commits
 */
async function generateNotes (pluginConfig, context) {
  // Expand squash commits before generating notes
  const expandedCommits = expandCommits(context.commits)

  // Create a new context with expanded commits
  const expandedContext = {
    ...context,
    commits: expandedCommits
  }

  // Call the original release-notes-generator with expanded commits
  return releaseNotesGenerator.generateNotes(pluginConfig, expandedContext)
}

module.exports = { generateNotes }
