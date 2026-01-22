#!/usr/bin/env node

/**
 * Script to cleanup old releases from GitHub repository
 * Uses the release-cleanup module to determine which releases to delete
 */

const { getOctokit } = require('@actions/github')
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
 * Main function to cleanup releases
 */
async function cleanupReleases () {
  const token = process.env.GITHUB_TOKEN
  const dryRun = process.env.DRY_RUN === 'true'
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/')

  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required')
    process.exit(1)
  }

  if (!owner || !repo) {
    console.error('Error: GITHUB_REPOSITORY environment variable is required (format: owner/repo)')
    process.exit(1)
  }

  console.log(`Repository: ${owner}/${repo}`)
  console.log(`Dry run: ${dryRun}`)
  console.log('')

  const octokit = getOctokit(token)

  try {
    // Fetch all releases
    console.log('Fetching releases...')
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 100
    })

    console.log(`Found ${releases.length} releases`)

    if (releases.length === 0) {
      console.log('No releases found. Nothing to cleanup.')
      return
    }

    // Determine which releases to keep
    const releasesToKeep = filterReleasesToKeep(releases)
    const tagsToKeep = new Set(releasesToKeep.map(r => r.tag_name))

    console.log(`\nReleases to keep (${releasesToKeep.length}):`)
    releasesToKeep
      .sort((a, b) => b.tag_name.localeCompare(a.tag_name))
      .forEach(r => {
        const age = getReleaseDays(r.published_at)
        console.log(`  - ${r.tag_name} (published ${age} days ago)`)
      })

    // Identify releases to delete
    const releasesToDelete = releases.filter(r => !tagsToKeep.has(r.tag_name))

    if (releasesToDelete.length === 0) {
      console.log('\nNo releases to delete.')
      return
    }

    console.log(`\nReleases to delete (${releasesToDelete.length}):`)
    releasesToDelete
      .sort((a, b) => b.tag_name.localeCompare(a.tag_name))
      .forEach(r => {
        const age = getReleaseDays(r.published_at)
        console.log(`  - ${r.tag_name} (published ${age} days ago)`)
      })

    if (dryRun) {
      console.log('\nDry run mode - no releases will be deleted.')
      console.log(`Would delete ${releasesToDelete.length} release(s)`)
      return
    }

    // Delete releases
    console.log('\nDeleting releases...')
    for (const release of releasesToDelete) {
      try {
        await octokit.rest.repos.deleteRelease({
          owner,
          repo,
          release_id: release.id
        })
        console.log(`  ✓ Deleted release: ${release.tag_name}`)

        // Also delete the associated tag
        try {
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `tags/${release.tag_name}`
          })
          console.log(`  ✓ Deleted tag: ${release.tag_name}`)
        } catch (tagError) {
          console.warn(`  ⚠ Failed to delete tag ${release.tag_name}: ${tagError.message}`)
        }
      } catch (error) {
        console.error(`  ✗ Failed to delete release ${release.tag_name}: ${error.message}`)
      }
    }

    console.log(`\n✓ Cleanup complete. Deleted ${releasesToDelete.length} release(s).`)
  } catch (error) {
    console.error('Error during cleanup:', error.message)
    process.exit(1)
  }
}

// Run the cleanup
cleanupReleases()
