/**
 * Release cleanup module
 * Provides functionality to filter releases based on semver and age
 */

/**
 * Parse a semantic version string
 * @param {string} versionString - Version string (e.g., "v1.2.3" or "1.2.3")
 * @returns {Object|null} - Parsed version { major, minor, patch } or null if invalid
 */
function parseVersion (versionString) {
  if (!versionString || typeof versionString !== 'string') {
    return null
  }

  // Remove v or V prefix if present
  const cleaned = versionString.replace(/^[vV]/, '')

  // Match semantic version pattern: major.minor.patch
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/)

  if (!match) {
    return null
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  }
}

/**
 * Check if a date is older than specified number of months
 * @param {string} dateString - ISO date string
 * @param {number} months - Number of months
 * @returns {boolean} - True if date is older than the specified months
 */
function isOlderThanMonths (dateString, months) {
  if (!dateString || typeof dateString !== 'string') {
    return false
  }

  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return false
  }

  const now = new Date()
  const threshold = new Date(now)
  threshold.setMonth(threshold.getMonth() - months)

  return date < threshold
}

/**
 * Filter releases to keep based on requirements:
 * - Keep max 3 major versions
 * - Keep 5 releases of the latest major (no age limit)
 * - Keep 3 releases of the second to last major (removed if older than 6 months)
 * - Keep 2 releases of the third to last major (removed if older than 6 months)
 * - Don't remove any release less than a month old
 *
 * @param {Array} releases - Array of release objects with tag_name and published_at
 * @returns {Array} - Filtered array of releases to keep
 */
function filterReleasesToKeep (releases) {
  if (!releases?.length) {
    return []
  }

  const parsedReleases = releases
    .map(release => ({
      ...release,
      version: parseVersion(release.tag_name)
    }))
    .filter(r => r.version !== null)
    .sort((a, b) => {
      if (a.version.major !== b.version.major) {
        return b.version.major - a.version.major
      }
      if (a.version.minor !== b.version.minor) {
        return b.version.minor - a.version.minor
      }
      return b.version.patch - a.version.patch
    })

  const majorGroups = new Map()
  parsedReleases.forEach(release => {
    const major = release.version.major
    if (!majorGroups.has(major)) {
      majorGroups.set(major, [])
    }
    majorGroups.get(major).push(release)
  })

  const topMajors = Array.from(majorGroups.keys()).sort((a, b) => b - a).slice(0, 3)
  const releasesToKeep = new Set()

  parsedReleases.forEach(release => {
    if (!isOlderThanMonths(release.published_at, 1)) {
      releasesToKeep.add(release.tag_name)
    }
  })

  const keepCounts = [5, 3, 2]
  topMajors.forEach((major, index) => {
    const releases = majorGroups.get(major)
    const releasesToKeepCount = keepCounts[index]

    const filteredReleases = index === 0
      ? releases.slice(0, releasesToKeepCount)
      : releases
        .slice(0, releasesToKeepCount)
        .filter(r => !isOlderThanMonths(r.published_at, 6))

    filteredReleases.forEach(release => {
      releasesToKeep.add(release.tag_name)
    })
  })

  return releases.filter(r => releasesToKeep.has(r.tag_name))
}

module.exports = {
  parseVersion,
  isOlderThanMonths,
  filterReleasesToKeep
}
