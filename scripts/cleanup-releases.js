#!/usr/bin/env node

/**
 * Script to cleanup old releases from GitHub repository
 * Uses the release-cleanup module to determine which releases to delete
 */

const { filterReleasesToKeep } = require('../src/release-cleanup')

/**
 * Calculate age of a release in days
 * @param {string} publishedAt - ISO date string
 * @returns {number} - Age in days
 */
function getReleaseDays (publishedAt) {
  return Math.floor((Date.now() - new Date(publishedAt)) / (1000 * 60 * 60 * 24))
}

/**
 * Load getOctokit in a way that works with ESM-only package exports
 * @param {Function} importModule - Import function to use
 * @returns {Promise<Function>} - getOctokit function
 */
async function loadGetOctokit (importModule = async (moduleName) => import(moduleName)) {
  const githubModule = await importModule('@actions/github')

  if (typeof githubModule?.getOctokit === 'function') {
    return githubModule.getOctokit
  }

  if (typeof githubModule?.default?.getOctokit === 'function') {
    return githubModule.default.getOctokit
  }

  throw new Error('Unable to load getOctokit from @actions/github')
}

/**
 * Main function to cleanup releases
 * @param {Object} options - Cleanup options
 * @returns {Promise<number>} - Process exit code
 */
async function cleanupReleases ({
  env = process.env,
  importModule,
  log = console.log,
  error = console.error,
  warn = console.warn
} = {}) {
  const token = env.GITHUB_TOKEN
  const dryRun = env.DRY_RUN === 'true'
  const [owner, repo] = (env.GITHUB_REPOSITORY || '').split('/')

  if (!token) {
    error('Error: GITHUB_TOKEN environment variable is required')
    return 1
  }

  if (!owner || !repo) {
    error('Error: GITHUB_REPOSITORY environment variable is required (format: owner/repo)')
    return 1
  }

  log(`Repository: ${owner}/${repo}`)
  log(`Dry run: ${dryRun}`)
  log('')

  try {
    const getOctokit = await loadGetOctokit(importModule)
    const octokit = getOctokit(token)

    // Fetch all releases
    log('Fetching releases...')
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 100
    })

    log(`Found ${releases.length} releases`)

    if (releases.length === 0) {
      log('No releases found. Nothing to cleanup.')
      return 0
    }

    // Determine which releases to keep
    const releasesToKeep = filterReleasesToKeep(releases)
    const tagsToKeep = new Set(releasesToKeep.map(r => r.tag_name))

    log(`\nReleases to keep (${releasesToKeep.length}):`)
    releasesToKeep
      .sort((a, b) => b.tag_name.localeCompare(a.tag_name))
      .forEach(r => {
        const age = getReleaseDays(r.published_at)
        log(`  - ${r.tag_name} (published ${age} days ago)`)
      })

    // Identify releases to delete
    const releasesToDelete = releases.filter(r => !tagsToKeep.has(r.tag_name))

    if (releasesToDelete.length === 0) {
      log('\nNo releases to delete.')
      return 0
    }

    log(`\nReleases to delete (${releasesToDelete.length}):`)
    releasesToDelete
      .sort((a, b) => b.tag_name.localeCompare(a.tag_name))
      .forEach(r => {
        const age = getReleaseDays(r.published_at)
        log(`  - ${r.tag_name} (published ${age} days ago)`)
      })

    if (dryRun) {
      log('\nDry run mode - no releases will be deleted.')
      log(`Would delete ${releasesToDelete.length} release(s)`)
      return 0
    }

    // Delete releases
    log('\nDeleting releases...')
    for (const release of releasesToDelete) {
      try {
        await octokit.rest.repos.deleteRelease({
          owner,
          repo,
          release_id: release.id
        })
        log(`  ✓ Deleted release: ${release.tag_name}`)

        // Also delete the associated tag
        try {
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `tags/${release.tag_name}`
          })
          log(`  ✓ Deleted tag: ${release.tag_name}`)
        } catch (tagError) {
          warn(`  ⚠ Failed to delete tag ${release.tag_name}: ${tagError.message}`)
        }
      } catch (releaseError) {
        warn(`  ✗ Failed to delete release ${release.tag_name}: ${releaseError.message}`)
      }
    }

    log(`\n✓ Cleanup complete. Deleted ${releasesToDelete.length} release(s).`)
    return 0
  } catch (caughtError) {
    error('Error during cleanup:', caughtError.message)
    return 1
  }
}

if (require.main === module) {
  cleanupReleases()
    .then((exitCode) => {
      if (exitCode !== 0) {
        process.exit(exitCode)
      }
    })
    .catch((error) => {
      console.error('Failed to complete cleanup:', error)
      process.exit(1)
    })
}

module.exports = {
  getReleaseDays,
  loadGetOctokit,
  cleanupReleases
}
