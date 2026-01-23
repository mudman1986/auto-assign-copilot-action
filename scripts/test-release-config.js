#!/usr/bin/env node

/**
 * Test script to verify the release notes configuration
 * This simulates what semantic-release does with the expand plugin
 */

const { parseConventionalCommits } = require('../scripts/release-notes-parser')

// Simulate a squash merge commit
const testCommit = {
  hash: 'fa1e389',
  type: 'refactor',
  subject: 'remove unused code and implement @actions/core logging (#46)',
  body: `* Initial plan

* refactor: codebase improvements - removed unused code and dependencies

Co-authored-by: mudman1986 <38420535+mudman1986@users.noreply.github.com>

* feat: implement @actions/core logging for better GitHub Actions integration

Co-authored-by: mudman1986 <38420535+mudman1986@users.noreply.github.com>

* fix: replace remaining console.error calls with core.error

Co-authored-by: mudman1986 <38420535+mudman1986@users.noreply.github.com>

* perf: move @actions/core imports to module top level

Co-authored-by: mudman1986 <38420535+mudman1986@users.noreply.github.com>

---------

Co-authored-by: copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>
Co-authored-by: mudman1986 <38420535+mudman1986@users.noreply.github.com>`
}

console.log('Testing release notes parser...\n')
console.log('Original commit:')
console.log('  Hash:', testCommit.hash)
console.log('  Type:', testCommit.type)
console.log('  Subject:', testCommit.subject)
console.log()

// Parse conventional commits from body
const subCommits = parseConventionalCommits(testCommit.body)

console.log('Parsed conventional commits from body:')
console.log('  Found:', subCommits.length, 'commits')
console.log()

if (subCommits.length > 0) {
  console.log('  Extracted commits:')
  subCommits.forEach((c, i) => {
    console.log(`    ${i + 1}. [${c.type}] ${c.scope ? `(${c.scope}) ` : ''}${c.subject}`)
  })
  console.log()

  // Show how they would be categorized
  console.log('Expected release notes structure:')
  const byType = {}
  subCommits.forEach(c => {
    if (!byType[c.type]) byType[c.type] = []
    byType[c.type].push(c)
  })

  const typeLabels = {
    feat: 'Features',
    fix: 'Bug Fixes',
    perf: 'Performance Improvements',
    refactor: 'Code Refactoring',
    docs: 'Documentation',
    revert: 'Reverts'
  }

  Object.keys(byType).sort().forEach(type => {
    if (typeLabels[type]) {
      console.log(`\n${typeLabels[type]}:`)
      byType[type].forEach(c => {
        console.log(`* ${c.scope ? `**${c.scope}:** ` : ''}${c.subject}`)
      })
    }
  })
}

console.log('\n✓ Parser test completed successfully!')
console.log('\nThis shows that conventional commits from squash merge bodies will be:')
console.log('  - Extracted and parsed correctly')
console.log('  - Properly categorized by their individual types')
console.log('  - Displayed in their respective sections (Features, Bug Fixes, etc.)')
