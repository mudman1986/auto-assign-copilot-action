const {
  determineReleaseType,
  bumpVersion,
  getNextReleaseVersion,
  isMissingGitRefError,
  isExistingGitRefError,
  syncTagRef
} = require('./release')

describe('Release helpers', () => {
  describe('determineReleaseType', () => {
    test('defaults to patch when no release labels are present', () => {
      expect(determineReleaseType()).toBe('patch')
      expect(determineReleaseType([])).toBe('patch')
      expect(determineReleaseType([{ name: 'bug' }])).toBe('patch')
    })

    test('recognizes explicit release labels', () => {
      expect(determineReleaseType([{ name: 'release:patch' }])).toBe('patch')
      expect(determineReleaseType([{ name: 'release:minor' }])).toBe('minor')
      expect(determineReleaseType([{ name: 'release:major' }])).toBe('major')
    })

    test('treats labels case-insensitively', () => {
      expect(determineReleaseType([{ name: 'Release:Minor' }])).toBe('minor')
    })

    test('uses the highest bump when multiple release labels are present', () => {
      expect(determineReleaseType([
        { name: 'release:patch' },
        { name: 'release:minor' }
      ])).toBe('minor')

      expect(determineReleaseType([
        { name: 'release:minor' },
        { name: 'release:major' }
      ])).toBe('major')
    })
  })

  describe('bumpVersion', () => {
    test('bumps patch versions', () => {
      expect(bumpVersion('2.0.4', 'patch')).toBe('2.0.5')
      expect(bumpVersion('v2.0.4', 'patch')).toBe('2.0.5')
    })

    test('bumps minor versions', () => {
      expect(bumpVersion('2.0.4', 'minor')).toBe('2.1.0')
    })

    test('bumps major versions', () => {
      expect(bumpVersion('2.0.4', 'major')).toBe('3.0.0')
    })

    test('throws for invalid versions', () => {
      expect(() => bumpVersion('invalid', 'patch')).toThrow('Invalid semantic version')
    })

    test('throws for invalid release types', () => {
      expect(() => bumpVersion('2.0.4', 'nope')).toThrow('Invalid release type')
    })
  })

  describe('getNextReleaseVersion', () => {
    test('returns the release type and bumped version', () => {
      expect(getNextReleaseVersion('2.0.4', [{ name: 'release:minor' }])).toEqual({
        releaseType: 'minor',
        version: '2.1.0'
      })
    })
  })

  describe('git ref helpers', () => {
    test('detects missing refs from GitHub API errors', () => {
      expect(isMissingGitRefError({ status: 404, message: 'Not Found' })).toBe(true)
      expect(isMissingGitRefError({ status: 422, message: 'Reference does not exist' })).toBe(true)
      expect(isMissingGitRefError({ status: 422, message: 'Validation Failed' })).toBe(false)
    })

    test('detects existing refs from GitHub API errors', () => {
      expect(isExistingGitRefError({ status: 422, message: 'Reference already exists' })).toBe(true)
      expect(isExistingGitRefError({ status: 404, message: 'Not Found' })).toBe(false)
    })
  })

  describe('syncTagRef', () => {
    test('updates an existing ref', async () => {
      const github = {
        rest: {
          git: {
            getRef: jest.fn().mockResolvedValue({}),
            updateRef: jest.fn().mockResolvedValue({}),
            createRef: jest.fn()
          }
        }
      }

      await expect(syncTagRef({
        github,
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        tag: 'v2',
        sha: 'abc123'
      })).resolves.toBe('updated')

      expect(github.rest.git.getRef).toHaveBeenCalledWith({
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        ref: 'tags/v2'
      })
      expect(github.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        ref: 'tags/v2',
        sha: 'abc123',
        force: true
      })
      expect(github.rest.git.createRef).not.toHaveBeenCalled()
    })

    test('creates a missing ref', async () => {
      const github = {
        rest: {
          git: {
            getRef: jest.fn().mockRejectedValue({ status: 404, message: 'Not Found' }),
            updateRef: jest.fn(),
            createRef: jest.fn().mockResolvedValue({})
          }
        }
      }

      await expect(syncTagRef({
        github,
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        tag: 'v2',
        sha: 'abc123'
      })).resolves.toBe('created')

      expect(github.rest.git.updateRef).not.toHaveBeenCalled()
      expect(github.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        ref: 'refs/tags/v2',
        sha: 'abc123'
      })
    })

    test('creates the ref when update reports it missing', async () => {
      const github = {
        rest: {
          git: {
            getRef: jest.fn().mockResolvedValue({}),
            updateRef: jest.fn().mockRejectedValue({ status: 422, message: 'Reference does not exist' }),
            createRef: jest.fn().mockResolvedValue({})
          }
        }
      }

      await expect(syncTagRef({
        github,
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        tag: 'v2',
        sha: 'abc123'
      })).resolves.toBe('created')

      expect(github.rest.git.createRef).toHaveBeenCalledWith({
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        ref: 'refs/tags/v2',
        sha: 'abc123'
      })
    })

    test('updates the ref when it is created concurrently', async () => {
      const github = {
        rest: {
          git: {
            getRef: jest.fn().mockRejectedValue({ status: 404, message: 'Not Found' }),
            updateRef: jest.fn().mockResolvedValue({}),
            createRef: jest.fn().mockRejectedValue({ status: 422, message: 'Reference already exists' })
          }
        }
      }

      await expect(syncTagRef({
        github,
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        tag: 'v2',
        sha: 'abc123'
      })).resolves.toBe('updated')

      expect(github.rest.git.updateRef).toHaveBeenCalledWith({
        owner: 'mudman1986',
        repo: 'auto-assign-copilot-action',
        ref: 'tags/v2',
        sha: 'abc123',
        force: true
      })
    })
  })
})
