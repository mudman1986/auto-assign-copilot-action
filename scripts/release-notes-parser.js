/**
 * Custom semantic-release plugin to parse squash commit bodies
 * and extract conventional commits for better release notes
 */

const CONVENTIONAL_PATTERN = /^\*\s+(feat|fix|perf|revert|docs|refactor|test|build|ci|chore)(\([^)]+\))?:\s+(.+)$/

/**
 * Parse conventional commits from a squash merge body
 * @param {string} body - The commit body
 * @returns {Array} - Array of parsed commits
 */
function parseConventionalCommits (body) {
  if (!body) return []

  const lines = body.split('\n')
  const commits = []

  for (const line of lines) {
    const match = line.match(CONVENTIONAL_PATTERN)
    if (match) {
      const type = match[1]
      const scope = match[2] ? match[2].slice(1, -1) : undefined
      const subject = match[3]

      commits.push({ type, scope, subject })
    }
  }

  return commits
}

/**
 * Expand commits by extracting conventional commits from squash merge bodies
 * @param {Array} commits - Original commits
 * @returns {Array} - Expanded commits
 */
function expandSquashCommits (commits) {
  const expandedCommits = []

  for (const commit of commits) {
    const subCommits = parseConventionalCommits(commit.body)

    if (subCommits.length > 0) {
      // Add each sub-commit as a separate commit
      for (const subCommit of subCommits) {
        expandedCommits.push({
          ...commit,
          type: subCommit.type,
          scope: subCommit.scope,
          subject: subCommit.subject,
          // Mark as expanded to avoid double-processing
          _expanded: true
        })
      }
    } else {
      // Keep original commit if no sub-commits found
      expandedCommits.push(commit)
    }
  }

  return expandedCommits
}

module.exports = { parseConventionalCommits, expandSquashCommits }
