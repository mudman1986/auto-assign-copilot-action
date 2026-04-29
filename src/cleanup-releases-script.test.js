const path = require('node:path')

describe('cleanup releases script', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'cleanup-releases.js')

  afterEach(() => {
    jest.resetModules()
  })

  test('loads getOctokit through a dynamic import-compatible helper', async () => {
    const { loadGetOctokit } = require(scriptPath)
    const getOctokit = jest.fn()

    await expect(loadGetOctokit(async () => ({ getOctokit }))).resolves.toBe(getOctokit)
  })

  test('uses the dynamically loaded octokit client during cleanup', async () => {
    const { cleanupReleases } = require(scriptPath)
    const listReleases = jest.fn().mockResolvedValue({ data: [] })
    const getOctokit = jest.fn().mockReturnValue({
      rest: {
        repos: {
          listReleases
        }
      }
    })
    const importModule = jest.fn().mockResolvedValue({ getOctokit })
    const log = jest.fn()
    const error = jest.fn()
    const warn = jest.fn()

    await cleanupReleases({
      env: {
        GITHUB_TOKEN: 'token',
        GITHUB_REPOSITORY: 'mudman1986/auto-assign-copilot-action',
        DRY_RUN: 'true'
      },
      importModule,
      log,
      error,
      warn
    })

    expect(importModule).toHaveBeenCalledWith('@actions/github')
    expect(getOctokit).toHaveBeenCalledWith('token')
    expect(listReleases).toHaveBeenCalledWith({
      owner: 'mudman1986',
      repo: 'auto-assign-copilot-action',
      per_page: 100
    })
    expect(log).toHaveBeenCalledWith('No releases found. Nothing to cleanup.')
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  test('returns a failure code when loading the GitHub client fails', async () => {
    const { cleanupReleases } = require(scriptPath)
    const error = jest.fn()

    await expect(cleanupReleases({
      env: {
        GITHUB_TOKEN: 'token',
        GITHUB_REPOSITORY: 'mudman1986/auto-assign-copilot-action'
      },
      importModule: jest.fn().mockRejectedValue(new Error('boom')),
      error
    })).resolves.toBe(1)

    expect(error).toHaveBeenCalledWith('Error during cleanup:', 'boom')
  })
})
