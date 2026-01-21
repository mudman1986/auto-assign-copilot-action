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
        createRefactorIssue: true
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
        createRefactorIssue: true
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
        createRefactorIssue: true
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
        createRefactorIssue: true
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
        createRefactorIssue: true
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
        createRefactorIssue: false
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
        createRefactorIssue: true
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
        createRefactorIssue: false
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
        createRefactorIssue: false
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
})
