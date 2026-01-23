/**
 * Tests for release-notes-expander
 * These tests validate the expansion of squash merge commits
 */

// Mock the @semantic-release/release-notes-generator
jest.mock('@semantic-release/release-notes-generator', () => ({
  generateNotes: jest.fn()
}))

const releaseNotesGenerator = require('@semantic-release/release-notes-generator')
const { generateNotes } = require('../scripts/release-notes-expander')

describe('Release Notes Expander', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock implementation that returns the commits it received
    releaseNotesGenerator.generateNotes.mockImplementation(async (config, context) => {
      return JSON.stringify(context.commits, null, 2)
    })
  })

  describe('expandCommits', () => {
    test('should expand squash merge commit with multiple sub-commits', async () => {
      const commit = {
        hash: 'd2cff43',
        type: 'refactor',
        scope: undefined,
        subject: 'parse conventional commits from squash merge bodies (#48)',
        body: `* refactor: parse conventional commits from squash merge bodies
* refactor: improve maintainability with constants and preserve commit data
* fix: add writerOpts config and remove redundant property assignments`,
        header: 'refactor: parse conventional commits from squash merge bodies (#48)',
        message: 'refactor: parse conventional commits from squash merge bodies (#48)',
        committerDate: '2026-01-23'
      }

      const context = {
        commits: [commit],
        nextRelease: { version: '2.0.3' }
      }

      await generateNotes({}, context)

      expect(releaseNotesGenerator.generateNotes).toHaveBeenCalledTimes(1)
      const expandedContext = releaseNotesGenerator.generateNotes.mock.calls[0][1]
      const expandedCommits = expandedContext.commits

      // Should have 3 expanded commits (no original)
      expect(expandedCommits).toHaveLength(3)

      // First expanded commit should be refactor with correct subject
      expect(expandedCommits[0].type).toBe('refactor')
      expect(expandedCommits[0].subject).toBe('parse conventional commits from squash merge bodies')
      expect(expandedCommits[0]._processedSquash).toBe(true)

      // Second expanded commit
      expect(expandedCommits[1].type).toBe('refactor')
      expect(expandedCommits[1].subject).toBe('improve maintainability with constants and preserve commit data')
      expect(expandedCommits[1]._processedSquash).toBe(true)

      // Third expanded commit
      expect(expandedCommits[2].type).toBe('fix')
      expect(expandedCommits[2].subject).toBe('add writerOpts config and remove redundant property assignments')
      expect(expandedCommits[2]._processedSquash).toBe(true)

      // Verify that header and message are NOT copied from original
      // (they should either be undefined or reconstructed)
      for (const expanded of expandedCommits) {
        if (expanded.header) {
          expect(expanded.header).not.toContain('#48')
        }
        if (expanded.message) {
          expect(expanded.message).not.toContain('#48')
        }
      }
    })

    test('should preserve hash and other metadata from original commit', async () => {
      const commit = {
        hash: 'abc123',
        type: 'feat',
        subject: 'add new feature (#50)',
        body: '* feat: implement feature A\n* fix: fix bug B',
        committerDate: '2026-01-23',
        author: { name: 'Test User' }
      }

      const context = { commits: [commit] }
      await generateNotes({}, context)

      const expandedCommits = releaseNotesGenerator.generateNotes.mock.calls[0][1].commits

      // Both expanded commits should preserve hash and metadata
      expect(expandedCommits[0].hash).toBe('abc123')
      expect(expandedCommits[0].committerDate).toBe('2026-01-23')
      expect(expandedCommits[0].author).toEqual({ name: 'Test User' })

      expect(expandedCommits[1].hash).toBe('abc123')
      expect(expandedCommits[1].committerDate).toBe('2026-01-23')
      expect(expandedCommits[1].author).toEqual({ name: 'Test User' })
    })

    test('should keep original commit when no sub-commits found', async () => {
      const commit = {
        hash: 'xyz789',
        type: 'docs',
        subject: 'update README',
        body: 'Some documentation changes without conventional commits'
      }

      const context = { commits: [commit] }
      await generateNotes({}, context)

      const expandedCommits = releaseNotesGenerator.generateNotes.mock.calls[0][1].commits

      expect(expandedCommits).toHaveLength(1)
      expect(expandedCommits[0]).toEqual(commit)
    })

    test('should not reprocess already processed commits', async () => {
      const commit = {
        hash: 'def456',
        type: 'fix',
        subject: 'fix something',
        body: '* feat: should not be parsed',
        _processedSquash: true
      }

      const context = { commits: [commit] }
      await generateNotes({}, context)

      const expandedCommits = releaseNotesGenerator.generateNotes.mock.calls[0][1].commits

      expect(expandedCommits).toHaveLength(1)
      expect(expandedCommits[0]).toEqual(commit)
    })
  })
})
