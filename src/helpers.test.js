#!/usr/bin/env node

/**
 * Test suite for the auto-assign-copilot action helpers
 */

const helpers = require('../src/helpers.js')

// Helper to create mock issue objects for testing
const createMockIssue = (overrides = {}) => ({
  id: '123',
  number: 42,
  title: 'Test Issue',
  url: 'https://github.com/test/repo/issues/42',
  body: '',
  assignees: { nodes: [] },
  labels: { nodes: [] },
  trackedIssues: { totalCount: 0 },
  trackedInIssues: { totalCount: 0 },
  ...overrides
})

describe('Auto Assign Copilot Helpers', () => {
  describe('shouldSkipIssue', () => {
    test('should skip assigned issues', () => {
      const issue = {
        isAssigned: true,
        hasSubIssues: false,
        labels: []
      }
      const result = helpers.shouldSkipIssue(issue, false, [])
      expect(result.shouldSkip).toBe(true)
      expect(result.reason).toBe('already assigned')
    })

    test('should skip issues with sub-issues when not allowed', () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: true,
        labels: []
      }
      const result = helpers.shouldSkipIssue(issue, false, [])
      expect(result.shouldSkip).toBe(true)
      expect(result.reason).toBe('has sub-issues')
    })

    test('should not skip issues with sub-issues when allowed', () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: true,
        labels: []
      }
      const result = helpers.shouldSkipIssue(issue, true, [])
      expect(result.shouldSkip).toBe(false)
    })

    test('should skip issues with skip labels', () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: false,
        labels: [{ name: 'no-ai' }, { name: 'bug' }]
      }
      const result = helpers.shouldSkipIssue(issue, false, ['no-ai'])
      expect(result.shouldSkip).toBe(true)
      expect(result.reason).toBe('has skip label: no-ai')
    })

    test('should not skip assignable issues', () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: false,
        labels: [{ name: 'bug' }]
      }
      const result = helpers.shouldSkipIssue(issue, false, ['no-ai'])
      expect(result.shouldSkip).toBe(false)
    })
  })

  describe('shouldAssignNewIssue', () => {
    test('should assign when no issues are assigned', () => {
      const result = helpers.shouldAssignNewIssue([], 'auto', false)
      expect(result.shouldAssign).toBe(true)
      expect(result.reason).toBe('Copilot has no assigned issues')
    })

    test('should not assign in refactor mode if already has refactor issue', () => {
      const assignedIssues = [
        {
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]
      const result = helpers.shouldAssignNewIssue(
        assignedIssues,
        'refactor',
        false
      )
      expect(result.shouldAssign).toBe(false)
      expect(result.reason).toBe(
        'Copilot already has a refactor issue assigned'
      )
    })

    test('should assign when force is true', () => {
      const assignedIssues = [{ labels: { nodes: [{ name: 'bug' }] } }]
      const result = helpers.shouldAssignNewIssue(assignedIssues, 'auto', true)
      expect(result.shouldAssign).toBe(true)
      expect(result.reason).toBe('Force flag is set')
    })

    test('should assign in refactor mode when force is true even with existing refactor issue', () => {
      const assignedIssues = [
        {
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]
      const result = helpers.shouldAssignNewIssue(
        assignedIssues,
        'refactor',
        true
      )
      expect(result.shouldAssign).toBe(true)
      expect(result.reason).toBe('Force flag is set')
    })

    test('should assign in refactor mode when force is true with non-refactor issues', () => {
      const assignedIssues = [
        {
          labels: { nodes: [{ name: 'bug' }] }
        }
      ]
      const result = helpers.shouldAssignNewIssue(
        assignedIssues,
        'refactor',
        true
      )
      expect(result.shouldAssign).toBe(true)
      expect(result.reason).toBe('Force flag is set')
    })

    test('should not assign when copilot has issues and force is false', () => {
      const assignedIssues = [{ labels: { nodes: [{ name: 'bug' }] } }]
      const result = helpers.shouldAssignNewIssue(
        assignedIssues,
        'auto',
        false
      )
      expect(result.shouldAssign).toBe(false)
    })
  })

  describe('parseIssueData', () => {
    test('should correctly parse issue data', () => {
      const issue = createMockIssue({
        body: 'Issue description',
        labels: { nodes: [{ name: 'bug' }] },
        trackedInIssues: { totalCount: 1 }
      })
      const result = helpers.parseIssueData(issue)
      expect(result.id).toBe('123')
      expect(result.number).toBe(42)
      expect(result.title).toBe('Test Issue')
      expect(result.isAssigned).toBe(false)
      expect(result.hasSubIssues).toBe(false)
      expect(result.isSubIssue).toBe(true)
    })

    test('should detect assigned issues', () => {
      const issue = createMockIssue({
        assignees: { nodes: [{ login: 'user1' }] }
      })
      const result = helpers.parseIssueData(issue)
      expect(result.isAssigned).toBe(true)
    })

    test('should detect issues with sub-issues', () => {
      const issue = createMockIssue({
        trackedIssues: { totalCount: 3 }
      })
      const result = helpers.parseIssueData(issue)
      expect(result.hasSubIssues).toBe(true)
    })
  })

  describe('findAssignableIssue', () => {
    test('should find first assignable issue', () => {
      const issues = [
        createMockIssue({
          id: '1',
          number: 1,
          title: 'Issue 1',
          url: 'url1',
          assignees: { nodes: [{ login: 'user1' }] }
        }),
        createMockIssue({
          id: '2',
          number: 2,
          title: 'Issue 2',
          url: 'url2'
        })
      ]
      const result = helpers.findAssignableIssue(issues, false, [])
      expect(result).not.toBeNull()
      expect(result.number).toBe(2)
    })

    test('should return null when no assignable issues', () => {
      const issues = [
        createMockIssue({
          id: '1',
          number: 1,
          title: 'Issue 1',
          url: 'url1',
          assignees: { nodes: [{ login: 'user1' }] }
        })
      ]
      const result = helpers.findAssignableIssue(issues, false, [])
      expect(result).toBeNull()
    })
  })

  describe('hasRecentRefactorIssue', () => {
    test('should return true when recent issues have refactor label', () => {
      const issues = [
        { labels: { nodes: [{ name: 'bug' }] } },
        { labels: { nodes: [{ name: 'refactor' }] } }
      ]
      const result = helpers.hasRecentRefactorIssue(issues, 2)
      expect(result).toBe(true)
    })

    test('should return false when no recent issues have refactor label', () => {
      const issues = [
        { labels: { nodes: [{ name: 'bug' }] } },
        { labels: { nodes: [{ name: 'enhancement' }] } }
      ]
      const result = helpers.hasRecentRefactorIssue(issues, 2)
      expect(result).toBe(false)
    })

    test('should handle empty array', () => {
      const result = helpers.hasRecentRefactorIssue([], 4)
      expect(result).toBe(false)
    })
  })

  describe('normalizeIssueLabels', () => {
    test('should normalize GraphQL structure', () => {
      const issue = {
        labels: { nodes: [{ name: 'bug' }] }
      }
      const result = helpers.normalizeIssueLabels(issue)
      expect(result).toEqual([{ name: 'bug' }])
    })

    test('should handle flattened structure', () => {
      const issue = {
        labels: [{ name: 'bug' }]
      }
      const result = helpers.normalizeIssueLabels(issue)
      expect(result).toEqual([{ name: 'bug' }])
    })

    test('should handle missing labels', () => {
      const issue = {}
      const result = helpers.normalizeIssueLabels(issue)
      expect(result).toEqual([])
    })
  })

  describe('readRefactorIssueTemplate', () => {
    const fs = require('fs')
    const path = require('path')

    // Save original process.env
    const originalEnv = process.env.GITHUB_WORKSPACE

    afterEach(() => {
      // Restore original environment
      process.env.GITHUB_WORKSPACE = originalEnv
      // Jest automatically restores spies
      jest.restoreAllMocks()
    })

    test('should read template file when it exists', () => {
      const mockContent = 'Custom template content\n\nWith multiple lines'

      // Mock file system methods using jest.spyOn
      jest.spyOn(fs, 'existsSync').mockReturnValue(true)
      jest.spyOn(fs, 'readFileSync').mockReturnValue(mockContent)

      const result = helpers.readRefactorIssueTemplate('.github/REFACTOR_ISSUE_TEMPLATE.md')
      expect(result).toBe(mockContent)
      expect(fs.existsSync).toHaveBeenCalled()
      expect(fs.readFileSync).toHaveBeenCalled()
    })

    test('should return default content when template file does not exist', () => {
      // Mock file system methods using jest.spyOn
      jest.spyOn(fs, 'existsSync').mockReturnValue(false)

      const result = helpers.readRefactorIssueTemplate('.github/REFACTOR_ISSUE_TEMPLATE.md')
      expect(result).toContain('Review the codebase and identify opportunities')
      expect(result).toContain('Code quality and maintainability')
      expect(fs.existsSync).toHaveBeenCalled()
    })

    test('should return default content when no template path is provided', () => {
      // Mock file system methods using jest.spyOn
      const existsSpy = jest.spyOn(fs, 'existsSync')
      const readSpy = jest.spyOn(fs, 'readFileSync')

      const result = helpers.readRefactorIssueTemplate('')
      expect(result).toContain('Review the codebase and identify opportunities')
      expect(result).toContain('Code quality and maintainability')
      // Should not attempt to read file when no path provided
      expect(existsSpy).not.toHaveBeenCalled()
      expect(readSpy).not.toHaveBeenCalled()
    })

    test('should return default content when reading template fails', () => {
      // Mock file system methods to throw error using jest.spyOn
      jest.spyOn(fs, 'existsSync').mockReturnValue(true)
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File read error')
      })

      const result = helpers.readRefactorIssueTemplate('.github/REFACTOR_ISSUE_TEMPLATE.md')
      expect(result).toContain('Review the codebase and identify opportunities')
      expect(result).toContain('Code quality and maintainability')
    })

    test('should resolve path relative to GITHUB_WORKSPACE', () => {
      const mockWorkspace = '/test/workspace'
      process.env.GITHUB_WORKSPACE = mockWorkspace

      jest.spyOn(fs, 'existsSync').mockReturnValue(true)
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 }) // Mock file size within limits
      jest.spyOn(fs, 'readFileSync').mockReturnValue('test content')

      helpers.readRefactorIssueTemplate('.github/template.md')

      // Verify the path resolution
      const expectedPath = path.resolve(mockWorkspace, '.github/template.md')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
      expect(fs.statSync).toHaveBeenCalledWith(expectedPath)
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8')
    })

    test('should prevent directory traversal attacks', () => {
      const mockWorkspace = '/test/workspace'
      process.env.GITHUB_WORKSPACE = mockWorkspace

      // Try to access a file outside the workspace
      const result = helpers.readRefactorIssueTemplate('../../etc/passwd')

      // Should return default content and not attempt to read the file
      expect(result).toContain('Review the codebase and identify opportunities')
    })
  })

  describe('isAutoCreatedRefactorIssue', () => {
    test('should return true for auto-created issues with [AUTO] marker', () => {
      const issue = {
        title: 'refactor: codebase improvements [AUTO] - 2024-01-01T00:00:00.000Z'
      }
      expect(helpers.isAutoCreatedRefactorIssue(issue)).toBe(true)
    })

    test('should return false for manually created issues without [AUTO] marker', () => {
      const issue = {
        title: 'refactor: codebase improvements'
      }
      expect(helpers.isAutoCreatedRefactorIssue(issue)).toBe(false)
    })

    test('should return false for issues with no title', () => {
      const issue = {}
      expect(helpers.isAutoCreatedRefactorIssue(issue)).toBe(false)
    })

    test('should handle case where title is null', () => {
      const issue = { title: null }
      expect(helpers.isAutoCreatedRefactorIssue(issue)).toBe(false)
    })
  })

  describe('shouldWaitForCooldown', () => {
    test('should not wait when no closed issues', () => {
      const result = helpers.shouldWaitForCooldown([], 7)
      expect(result.shouldWait).toBe(false)
      expect(result.reason).toBe('No closed issues found')
    })

    test('should not wait when no auto-created refactor issue found', () => {
      const issues = [
        {
          title: 'refactor: manual refactor',
          closedAt: new Date().toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        },
        {
          title: 'bug: fix something',
          closedAt: new Date().toISOString(),
          labels: { nodes: [{ name: 'bug' }] }
        }
      ]
      const result = helpers.shouldWaitForCooldown(issues, 7)
      expect(result.shouldWait).toBe(false)
      expect(result.reason).toContain('No auto-created refactor issue found')
    })

    test('should wait when auto-created refactor issue was closed within cooldown period', () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const issues = [
        {
          number: 42,
          title: 'refactor: codebase improvements [AUTO] - 2024-01-01',
          closedAt: threeDaysAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]
      const result = helpers.shouldWaitForCooldown(issues, 7)
      expect(result.shouldWait).toBe(true)
      expect(result.reason).toContain('Wait')
      expect(result.reason).toContain('day')
    })

    test('should not wait when cooldown period has passed', () => {
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const issues = [
        {
          number: 42,
          title: 'refactor: codebase improvements [AUTO] - 2024-01-01',
          closedAt: tenDaysAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]
      const result = helpers.shouldWaitForCooldown(issues, 7)
      expect(result.shouldWait).toBe(false)
      expect(result.reason).toContain('No auto-created refactor issue found')
    })

    test('should check all issues, not just the most recent one', () => {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      // Most recent issue is manual, but there's an auto-created one from 1 day ago
      const issues = [
        {
          number: 43,
          title: 'refactor: manual refactor',
          closedAt: oneDayAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        },
        {
          number: 44,
          title: 'bug: some bug',
          closedAt: oneDayAgo.toISOString(),
          labels: { nodes: [{ name: 'bug' }] }
        },
        {
          number: 42,
          title: 'refactor: codebase improvements [AUTO] - 2024-01-01',
          closedAt: oneDayAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        },
        {
          number: 41,
          title: 'refactor: old auto [AUTO] - 2024-01-01',
          closedAt: tenDaysAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]
      const result = helpers.shouldWaitForCooldown(issues, 7)
      expect(result.shouldWait).toBe(true)
      expect(result.reason).toContain('Wait')
    })

    test('should ignore auto-created refactor issues outside cooldown period', () => {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const issues = [
        {
          number: 43,
          title: 'refactor: manual refactor',
          closedAt: oneDayAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        },
        {
          number: 42,
          title: 'refactor: codebase improvements [AUTO] - 2024-01-01',
          closedAt: tenDaysAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]
      const result = helpers.shouldWaitForCooldown(issues, 7)
      expect(result.shouldWait).toBe(false)
      expect(result.reason).toContain('No auto-created refactor issue found')
    })

    test('should use custom cooldown days', () => {
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

      const issues = [
        {
          number: 42,
          title: 'refactor: codebase improvements [AUTO] - 2024-01-01',
          closedAt: twoDaysAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]

      // With 1 day cooldown, should not wait (2 days > 1 day)
      const result1 = helpers.shouldWaitForCooldown(issues, 1)
      expect(result1.shouldWait).toBe(false)

      // With 5 day cooldown, should wait (2 days < 5 days)
      const result2 = helpers.shouldWaitForCooldown(issues, 5)
      expect(result2.shouldWait).toBe(true)
    })

    test('should not wait when cooldown is set to 0 (disabled)', () => {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)

      const issues = [
        {
          number: 42,
          title: 'refactor: codebase improvements [AUTO] - 2024-01-01',
          closedAt: oneDayAgo.toISOString(),
          labels: { nodes: [{ name: 'refactor' }] }
        }
      ]

      // With 0 day cooldown, should never wait (cooldown disabled)
      const result = helpers.shouldWaitForCooldown(issues, 0)
      expect(result.shouldWait).toBe(false)
      expect(result.reason).toContain('No auto-created refactor issue found')
    })
  })

  describe('hasRequiredLabel', () => {
    test('should return true when no required label is specified', () => {
      const issue = {
        labels: [{ name: 'bug' }, { name: 'enhancement' }]
      }
      const result = helpers.hasRequiredLabel(issue, null)
      expect(result).toBe(true)
    })

    test('should return true when no required label is specified (empty string)', () => {
      const issue = {
        labels: [{ name: 'bug' }, { name: 'enhancement' }]
      }
      const result = helpers.hasRequiredLabel(issue, '')
      expect(result).toBe(true)
    })

    test('should return true when issue has the required label', () => {
      const issue = {
        labels: [{ name: 'bug' }, { name: 'copilot-ready' }]
      }
      const result = helpers.hasRequiredLabel(issue, 'copilot-ready')
      expect(result).toBe(true)
    })

    test('should return false when issue does not have the required label', () => {
      const issue = {
        labels: [{ name: 'bug' }, { name: 'enhancement' }]
      }
      const result = helpers.hasRequiredLabel(issue, 'copilot-ready')
      expect(result).toBe(false)
    })

    test('should return false when issue has no labels', () => {
      const issue = {
        labels: []
      }
      const result = helpers.hasRequiredLabel(issue, 'copilot-ready')
      expect(result).toBe(false)
    })

    test('should handle issues with GraphQL label structure', () => {
      const issue = {
        labels: { nodes: [{ name: 'bug' }, { name: 'copilot-ready' }] }
      }
      const result = helpers.hasRequiredLabel(issue, 'copilot-ready')
      expect(result).toBe(true)
    })

    test('should be case-sensitive when matching labels', () => {
      const issue = {
        labels: [{ name: 'Copilot-Ready' }]
      }
      const result = helpers.hasRequiredLabel(issue, 'copilot-ready')
      expect(result).toBe(false)
    })
  })
})
