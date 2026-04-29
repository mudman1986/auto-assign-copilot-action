const RELEASE_TYPE_PRIORITY = {
  patch: 1,
  minor: 2,
  major: 3
}

const RELEASE_LABELS = {
  'release:patch': 'patch',
  'release:minor': 'minor',
  'release:major': 'major'
}

function parseVersion (version) {
  if (typeof version !== 'string') {
    throw new Error('Invalid semantic version')
  }

  const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/)

  if (!match) {
    throw new Error('Invalid semantic version')
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  }
}

function determineReleaseType (labels = []) {
  let selectedType = 'patch'

  for (const label of labels) {
    const releaseType = RELEASE_LABELS[label?.name?.toLowerCase()]

    if (releaseType && RELEASE_TYPE_PRIORITY[releaseType] > RELEASE_TYPE_PRIORITY[selectedType]) {
      selectedType = releaseType
    }
  }

  return selectedType
}

function bumpVersion (currentVersion, releaseType) {
  if (!Object.prototype.hasOwnProperty.call(RELEASE_TYPE_PRIORITY, releaseType)) {
    throw new Error('Invalid release type')
  }

  const version = parseVersion(currentVersion)

  if (releaseType === 'major') {
    return `${version.major + 1}.0.0`
  }

  if (releaseType === 'minor') {
    return `${version.major}.${version.minor + 1}.0`
  }

  return `${version.major}.${version.minor}.${version.patch + 1}`
}

function getNextReleaseVersion (currentVersion, labels = []) {
  const releaseType = determineReleaseType(labels)

  return {
    releaseType,
    version: bumpVersion(currentVersion, releaseType)
  }
}

function isMissingGitRefError (error) {
  return Boolean(
    error &&
    (
      error.status === 404 ||
      (error.status === 422 && /reference does not exist/i.test(error.message || ''))
    )
  )
}

function isExistingGitRefError (error) {
  return Boolean(
    error &&
    error.status === 422 &&
    /reference already exists/i.test(error.message || '')
  )
}

async function syncTagRef ({ github, owner, repo, tag, sha, force = true }) {
  const ref = `tags/${tag}`
  const fullRef = `refs/${ref}`
  let refExists = true

  try {
    await github.rest.git.getRef({ owner, repo, ref })
  } catch (error) {
    if (!isMissingGitRefError(error)) {
      throw error
    }

    refExists = false
  }

  if (refExists) {
    try {
      await github.rest.git.updateRef({ owner, repo, ref, sha, force })
      return 'updated'
    } catch (error) {
      if (!isMissingGitRefError(error)) {
        throw error
      }
    }
  }

  try {
    await github.rest.git.createRef({ owner, repo, ref: fullRef, sha })
    return 'created'
  } catch (error) {
    if (!isExistingGitRefError(error)) {
      throw error
    }

    await github.rest.git.updateRef({ owner, repo, ref, sha, force })
    return 'updated'
  }
}

module.exports = {
  determineReleaseType,
  bumpVersion,
  getNextReleaseVersion,
  isMissingGitRefError,
  isExistingGitRefError,
  syncTagRef
}
