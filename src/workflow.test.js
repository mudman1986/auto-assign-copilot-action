/**
 * Test suite for the auto-assign-copilot action workflow
 */

const executeWorkflow = require('./workflow.js')

// Mock GitHub API client
const createMockGithub = (overrides = {}) => {
  return {
    graphql: jest.fn(async (query, variables) => {
      // Check overrides first
      if (overrides.graphql) {
        const overrideResult = await overrides.graphql(query, variables)
        if (overrideResult && Object.keys(overrideResult).length > 0) {
          return overrideResult
        }
      }

      // Default mock responses
      if (query.includes('suggestedActors')) {
        return {
          repository: {
            id: 'repo-id-123',
            suggestedActors: {
              nodes: [
                {
                  login: 'copilot-swe-agent',
                  __typename: 'Bot',
                  id: 'copilot-bot-id-123'
                }
              ]
            }
          }
        }
      }
      if (query.includes('issues(first: 100, states: OPEN)')) {
        return {
          repository: {
            issues: {
              nodes: []
            }
          }
        }
      }
      if (query.includes('issues(first: 20, states: CLOSED')) {
        // Mock response for recent closed issues (for cooldown check)
        return {
          repository: {
            issues: {
              nodes: []
            }
          }
        }
      }
      if (query.includes('states: OPEN, labels: ["refactor"]')) {
        return {
          repository: {
            issues: {
              nodes: []
            }
          }
        }
      }
      if (query.includes('states: OPEN, labels:')) {
        return {
          repository: {
            issues: {
              nodes: [
                {
                  id: 'issue-id-1',
                  number: 42,
                  title: 'Test Issue',
                  body: 'Test body',
                  url: 'https://github.com/test/repo/issues/42',
                  assignees: { nodes: [] },
                  labels: {
                    nodes: [{ name: 'bug' }]
                  },
                  trackedIssues: { totalCount: 0 },
                  trackedInIssues: { totalCount: 0 }
                }
              ]
            }
          }
        }
      }
      return overrides.graphql?.(query, variables) || {}
    }),
    request: jest.fn(async (endpoint, params) => {
      // Mock sub-issues endpoint
      if (endpoint.includes('sub_issues')) {
        return { data: [] }
      }
      return overrides.request?.(endpoint, params) || { data: [] }
    })
  }
}

const createMockContext = () => ({
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  },
  eventName: 'workflow_dispatch'
})

describe('Workflow executeWorkflow', () => {
  describe('dry-run mode', () => {
    test('should return issue data in dry-run mode for auto assignment', async () => {
      const mockGithub = createMockGithub()
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return issue data even in dry-run
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(42)
      expect(result.issue.title).toBe('Test Issue')
      expect(result.issue.url).toBe('https://github.com/test/repo/issues/42')

      // Should not call mutation in dry-run mode
      const mutations = mockGithub.graphql.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('addAssigneesToAssignable')
      )
      expect(mutations.length).toBe(0)
    })

    test('should return issue data in dry-run mode for refactor assignment', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          // Match refactor issues query
          if (query.includes('refactor') && query.includes('orderBy')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      id: 'refactor-issue-id',
                      number: 100,
                      title: 'Refactor Issue',
                      body: 'Refactor body',
                      url: 'https://github.com/test/repo/issues/100',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'refactor' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('label(name: "refactor")')) {
            return {
              repository: {
                label: {
                  id: 'refactor-label-id'
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        },
        request: async (endpoint, params) => {
          // Mock sub-issues endpoint - return empty for refactor issue
          if (endpoint.includes('sub_issues')) {
            return { data: [] }
          }
          return { data: [] }
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'refactor',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return issue data even in dry-run
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(100)
      expect(result.issue.title).toBe('Refactor Issue')

      // Should not call mutation in dry-run mode
      const mutations = mockGithub.graphql.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('addAssigneesToAssignable')
      )
      expect(mutations.length).toBe(0)
    })

    test('should return mock issue data in dry-run mode when creating refactor issue', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('label(name: "refactor")')) {
            return {
              repository: {
                label: {
                  id: 'refactor-label-id'
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'refactor',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return mock issue data even in dry-run
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(0)
      expect(result.issue.title).toContain('refactor:')
      expect(result.issue.url).toContain('DRY RUN')

      // Should not call createIssue mutation in dry-run mode
      const mutations = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(mutations.length).toBe(0)
    })

    test('should not make API changes in dry-run mode', async () => {
      const mockGithub = createMockGithub()
      const mockContext = createMockContext()

      await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Verify no mutations were called
      const allCalls = mockGithub.graphql.mock.calls
      const mutations = allCalls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          (call[0].includes('mutation') || call[0].includes('createIssue'))
      )

      expect(mutations.length).toBe(0)
    })
  })

  describe('non-dry-run mode', () => {
    test('should make API changes in non-dry-run mode', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('addAssigneesToAssignable')) {
            return {
              addAssigneesToAssignable: {
                assignable: {
                  assignees: {
                    nodes: [{ login: 'copilot-swe-agent' }]
                  }
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels:')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      id: 'issue-id-1',
                      number: 42,
                      title: 'Test Issue',
                      body: 'Test body',
                      url: 'https://github.com/test/repo/issues/42',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'bug' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    }
                  ]
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return issue data
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()

      // Should call mutation in non-dry-run mode
      const mutations = mockGithub.graphql.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('addAssigneesToAssignable')
      )
      expect(mutations.length).toBeGreaterThan(0)
    })
  })

  describe('createRefactorIssue parameter', () => {
    test('should skip refactor issue creation when createRefactorIssue is false in refactor mode', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'refactor',
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: false,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return undefined/null since no issue was created
      expect(result).toBeUndefined()

      // Verify createIssue was NOT called
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBe(0)
    })

    test('should create refactor issue when createRefactorIssue is true in refactor mode', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('createIssue')) {
            return {
              createIssue: {
                issue: {
                  id: 'new-refactor-issue-id',
                  number: 200,
                  title: 'refactor: codebase improvements',
                  url: 'https://github.com/test/repo/issues/200',
                  assignees: {
                    nodes: [{ login: 'copilot-swe-agent' }]
                  }
                }
              }
            }
          }
          if (query.includes('addLabelsToLabelable')) {
            return {
              addLabelsToLabelable: {
                labelable: {
                  labels: {
                    nodes: [{ name: 'refactor' }]
                  }
                }
              }
            }
          }
          if (query.includes('label(name: "refactor")')) {
            return {
              repository: {
                label: {
                  id: 'refactor-label-id'
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'refactor',
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return the created issue
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(200)

      // Verify createIssue was called
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBeGreaterThan(0)
    })

    test('should skip refactor issue creation when createRefactorIssue is false in auto mode with no issues', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN, orderBy:')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels:')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: false,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return undefined/null since no issue was created
      expect(result).toBeUndefined()

      // Verify createIssue was NOT called
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBe(0)
    })

    test('should still assign existing refactor issues when createRefactorIssue is false', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('addAssigneesToAssignable')) {
            return {
              addAssigneesToAssignable: {
                assignable: {
                  assignees: {
                    nodes: [{ login: 'copilot-swe-agent' }]
                  }
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      id: 'refactor-issue-id',
                      number: 100,
                      title: 'Existing Refactor Issue',
                      body: 'Refactor body',
                      url: 'https://github.com/test/repo/issues/100',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'refactor' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    }
                  ]
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'refactor',
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: false,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should return the existing refactor issue
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(100)
      expect(result.issue.title).toBe('Existing Refactor Issue')

      // Verify createIssue was NOT called
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBe(0)

      // Verify addAssigneesToAssignable was called
      const assignCalls = mockGithub.graphql.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('addAssigneesToAssignable')
      )
      expect(assignCalls.length).toBeGreaterThan(0)
    })
  })

  describe('wait functionality', () => {
    test('should wait when event is issues and waitSeconds is set', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          // Mock the closed issues query for issue events
          if (query.includes('states: CLOSED')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      number: 1,
                      title: 'Recently closed issue',
                      closedAt: new Date().toISOString(),
                      labels: {
                        nodes: [{ name: 'refactor' }]
                      }
                    }
                  ]
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        },
        eventName: 'issues'
      }

      const startTime = Date.now()
      await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md',
        waitSeconds: 2
      })
      const elapsedTime = Date.now() - startTime

      // Should have waited at least 2 seconds (2000ms)
      expect(elapsedTime).toBeGreaterThanOrEqual(2000)
    })

    test('should not wait when event is not issues', async () => {
      const mockGithub = createMockGithub()
      const mockContext = createMockContext() // workflow_dispatch

      const startTime = Date.now()
      await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md',
        waitSeconds: 2
      })
      const elapsedTime = Date.now() - startTime

      // Should not have waited
      expect(elapsedTime).toBeLessThan(1000)
    })

    test('should not wait when waitSeconds is 0', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          // Mock the closed issues query for issue events
          if (query.includes('states: CLOSED')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      number: 1,
                      title: 'Recently closed issue',
                      closedAt: new Date().toISOString(),
                      labels: {
                        nodes: [{ name: 'refactor' }]
                      }
                    }
                  ]
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        },
        eventName: 'issues'
      }

      const startTime = Date.now()
      await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md',
        waitSeconds: 0
      })
      const elapsedTime = Date.now() - startTime

      // Should not have waited
      expect(elapsedTime).toBeLessThan(1000)
    })
  })

  describe('refactor threshold and cooldown interaction', () => {
    test('should bypass cooldown when refactor threshold is reached', async () => {
      const REFACTOR_THRESHOLD = 4
      const FETCH_COUNT = REFACTOR_THRESHOLD + 1 // Workflow fetches threshold + 1 to include just-closed issue

      // Create a recently closed auto-created refactor issue (within cooldown period)
      const recentlyClosedAutoRefactor = {
        number: 50,
        title: 'refactor: codebase improvements [AUTO] - 2024-01-01T00:00:00.000Z',
        closedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        labels: {
          nodes: [{ name: 'refactor' }]
        }
      }

      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          // Mock closed issues for threshold check
          // fetchCount will be REFACTOR_THRESHOLD + 1
          if (query.includes('states: CLOSED') && variables.fetchCount === FETCH_COUNT) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      number: 1,
                      title: 'Bug fix',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'bug' }] }
                    },
                    {
                      number: 2,
                      title: 'Feature',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'enhancement' }] }
                    },
                    {
                      number: 3,
                      title: 'Doc update',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'documentation' }] }
                    },
                    {
                      number: 4,
                      title: 'Another bug',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'bug' }] }
                    }
                  ]
                }
              }
            }
          }
          // Mock recent closed issues for cooldown check (includes auto-created refactor)
          if (query.includes('states: CLOSED') && query.includes('first: 20')) {
            return {
              repository: {
                issues: {
                  nodes: [recentlyClosedAutoRefactor]
                }
              }
            }
          }
          // Mock createIssue mutation
          if (query.includes('createIssue')) {
            return {
              createIssue: {
                issue: {
                  id: 'new-refactor-issue-id',
                  number: 100,
                  title: 'refactor: codebase improvements [AUTO]',
                  url: 'https://github.com/test/repo/issues/100',
                  assignees: {
                    nodes: [{ login: 'copilot-swe-agent' }]
                  }
                }
              }
            }
          }
          if (query.includes('addLabelsToLabelable')) {
            return {
              addLabelsToLabelable: {
                labelable: {
                  labels: {
                    nodes: [{ name: 'refactor' }]
                  }
                }
              }
            }
          }
          if (query.includes('label(name: "refactor")')) {
            return {
              repository: {
                label: {
                  id: 'refactor-label-id'
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })

      const mockContext = {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        },
        eventName: 'issues' // Issue event triggers threshold check
      }

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto', // Start in auto mode
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: REFACTOR_THRESHOLD, // Check last N issues
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md',
        waitSeconds: 0,
        refactorCooldownDays: 7 // 7 day cooldown
      })

      // Should have created the issue despite being within cooldown period
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(100)

      // Verify createIssue was called (cooldown bypassed)
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBeGreaterThan(0)
    })

    test('should respect cooldown when threshold is NOT reached', async () => {
      // Create a recently closed auto-created refactor issue (within cooldown period)
      const recentlyClosedAutoRefactor = {
        number: 50,
        title: 'refactor: codebase improvements [AUTO] - 2024-01-01T00:00:00.000Z',
        closedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        labels: {
          nodes: [{ name: 'refactor' }]
        }
      }

      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          // Mock recent closed issues for cooldown check
          if (query.includes('states: CLOSED') && query.includes('first: 20')) {
            return {
              repository: {
                issues: {
                  nodes: [recentlyClosedAutoRefactor]
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels:')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN, orderBy:')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })

      const mockContext = {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        },
        eventName: 'workflow_dispatch' // Not an issue event, no threshold check
      }

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto', // Auto mode, no issues available
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md',
        waitSeconds: 0,
        refactorCooldownDays: 7 // 7 day cooldown
      })

      // Should NOT have created an issue (cooldown respected)
      expect(result).toBeUndefined()

      // Verify createIssue was NOT called (cooldown blocked it)
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBe(0)
    })

    test('should bypass cooldown when mode is explicitly set to refactor and threshold is reached via issue event', async () => {
      const REFACTOR_THRESHOLD = 4
      const FETCH_COUNT = REFACTOR_THRESHOLD + 1 // Workflow fetches threshold + 1 to include just-closed issue

      // This tests the case where threshold determines mode switch
      const recentlyClosedAutoRefactor = {
        number: 50,
        title: 'refactor: codebase improvements [AUTO] - 2024-01-01T00:00:00.000Z',
        closedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        labels: {
          nodes: [{ name: 'refactor' }]
        }
      }

      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          // Mock closed issues for threshold check (no refactor in last N)
          // fetchCount will be REFACTOR_THRESHOLD + 1
          if (query.includes('states: CLOSED') && variables.fetchCount === FETCH_COUNT) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      number: 1,
                      title: 'Bug fix',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'bug' }] }
                    },
                    {
                      number: 2,
                      title: 'Feature',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'enhancement' }] }
                    },
                    {
                      number: 3,
                      title: 'Doc update',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'documentation' }] }
                    },
                    {
                      number: 4,
                      title: 'Another bug',
                      closedAt: new Date().toISOString(),
                      labels: { nodes: [{ name: 'bug' }] }
                    }
                  ]
                }
              }
            }
          }
          // Mock recent closed for cooldown (has recent auto-created refactor)
          if (query.includes('states: CLOSED') && query.includes('first: 20')) {
            return {
              repository: {
                issues: {
                  nodes: [recentlyClosedAutoRefactor]
                }
              }
            }
          }
          if (query.includes('createIssue')) {
            return {
              createIssue: {
                issue: {
                  id: 'new-refactor-issue-id',
                  number: 101,
                  title: 'refactor: codebase improvements [AUTO]',
                  url: 'https://github.com/test/repo/issues/101',
                  assignees: {
                    nodes: [{ login: 'copilot-swe-agent' }]
                  }
                }
              }
            }
          }
          if (query.includes('addLabelsToLabelable')) {
            return {
              addLabelsToLabelable: {
                labelable: {
                  labels: {
                    nodes: [{ name: 'refactor' }]
                  }
                }
              }
            }
          }
          if (query.includes('label(name: "refactor")')) {
            return {
              repository: {
                label: {
                  id: 'refactor-label-id'
                }
              }
            }
          }
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          return {}
        }
      })

      const mockContext = {
        repo: {
          owner: 'test-owner',
          repo: 'test-repo'
        },
        eventName: 'issues' // Issue event - triggers threshold check
      }

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto', // Will switch to refactor due to threshold
        labelOverride: null,
        force: false,
        dryRun: false,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: REFACTOR_THRESHOLD,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md',
        waitSeconds: 0,
        refactorCooldownDays: 7
      })

      // Should create issue despite cooldown (threshold bypasses it)
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(101)

      // Verify createIssue was called
      const createIssueCalls = mockGithub.graphql.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('createIssue')
      )
      expect(createIssueCalls.length).toBeGreaterThan(0)
    })
  })

  describe('required label security feature', () => {
    test('should skip issues without required label when requiredLabel is set', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels:')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      id: 'issue-id-1',
                      number: 42,
                      title: 'Test Issue Without Required Label',
                      body: 'Test body',
                      url: 'https://github.com/test/repo/issues/42',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'bug' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    },
                    {
                      id: 'issue-id-2',
                      number: 43,
                      title: 'Test Issue With Required Label',
                      body: 'Test body',
                      url: 'https://github.com/test/repo/issues/43',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'bug' }, { name: 'copilot-ready' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    }
                  ]
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        requiredLabel: 'copilot-ready',
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should assign issue #43 which has the required label
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(43)
      expect(result.issue.title).toBe('Test Issue With Required Label')
    })

    test('should assign issues when requiredLabel is not set', async () => {
      const mockGithub = createMockGithub()
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'auto',
        labelOverride: null,
        requiredLabel: null,
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should assign first available issue (backward compatible behavior)
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(42)
    })

    test('should apply required label to refactor issues', async () => {
      const mockGithub = createMockGithub({
        graphql: async (query, variables) => {
          if (query.includes('suggestedActors')) {
            return {
              repository: {
                id: 'repo-id-123',
                suggestedActors: {
                  nodes: [
                    {
                      login: 'copilot-swe-agent',
                      __typename: 'Bot',
                      id: 'copilot-bot-id-123'
                    }
                  ]
                }
              }
            }
          }
          if (query.includes('issues(first: 100, states: OPEN)')) {
            return {
              repository: {
                issues: {
                  nodes: []
                }
              }
            }
          }
          if (query.includes('states: OPEN, labels: ["refactor"]')) {
            return {
              repository: {
                issues: {
                  nodes: [
                    {
                      id: 'refactor-issue-id-1',
                      number: 100,
                      title: 'Refactor Without Required Label',
                      body: 'Refactor body',
                      url: 'https://github.com/test/repo/issues/100',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'refactor' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    },
                    {
                      id: 'refactor-issue-id-2',
                      number: 101,
                      title: 'Refactor With Required Label',
                      body: 'Refactor body',
                      url: 'https://github.com/test/repo/issues/101',
                      assignees: { nodes: [] },
                      labels: {
                        nodes: [{ name: 'refactor' }, { name: 'copilot-ready' }]
                      },
                      trackedIssues: { totalCount: 0 },
                      trackedInIssues: { totalCount: 0 }
                    }
                  ]
                }
              }
            }
          }
          return {}
        }
      })
      const mockContext = createMockContext()

      const result = await executeWorkflow({
        github: mockGithub,
        context: mockContext,
        mode: 'refactor',
        labelOverride: null,
        requiredLabel: 'copilot-ready',
        force: false,
        dryRun: true,
        allowParentIssues: false,
        skipLabels: ['no-ai'],
        refactorThreshold: 4,
        createRefactorIssue: true,
        refactorIssueTemplate: '.github/REFACTOR_ISSUE_TEMPLATE.md'
      })

      // Should assign refactor issue #101 which has the required label
      expect(result).not.toBeNull()
      expect(result.issue).toBeDefined()
      expect(result.issue.number).toBe(101)
      expect(result.issue.title).toBe('Refactor With Required Label')
    })
  })
})
