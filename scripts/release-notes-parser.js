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

module.exports = { parseConventionalCommits }