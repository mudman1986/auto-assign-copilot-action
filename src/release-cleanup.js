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
 * - Keep 3 minor versions of the latest major
 * - Keep 2 minor versions of the second to last major
 * - Keep 1 minor version of the third to last major
 * - Don't remove any release less than a month old
 *
 * @param {Array} releases - Array of release objects with tag_name and published_at
 * @returns {Array} - Filtered array of releases to keep
 */
function filterReleasesToKeep (releases) {
  if (!releases || !Array.isArray(releases) || releases.length === 0) {
    return []
  }

  // Parse and sort releases by version (descending)
  const parsedReleases = releases
    .map(release => {
      const version = parseVersion(release.tag_name)
      return {
        ...release,
        version
      }
    })
    .filter(r => r.version !== null)
    .sort((a, b) => {
      // Sort by major, then minor, then patch (descending)
      if (a.version.major !== b.version.major) {
        return b.version.major - a.version.major
      }
      if (a.version.minor !== b.version.minor) {
        return b.version.minor - a.version.minor
      }
      return b.version.patch - a.version.patch
    })

  // Group by major version
  const majorGroups = new Map()
  parsedReleases.forEach(release => {
    const major = release.version.major
    if (!majorGroups.has(major)) {
      majorGroups.set(major, [])
    }
    majorGroups.get(major).push(release)
  })

  // Get top 3 major versions
  const sortedMajors = Array.from(majorGroups.keys()).sort((a, b) => b - a)
  const topMajors = sortedMajors.slice(0, 3)

  const releasesToKeep = new Set()

  // Add all releases less than 1 month old (protected releases)
  parsedReleases.forEach(release => {
    if (!isOlderThanMonths(release.published_at, 1)) {
      releasesToKeep.add(release.tag_name)
    }
  })

  // Process each major version
  topMajors.forEach((major, index) => {
    const releases = majorGroups.get(major)

    // Determine how many releases to keep based on position
    let releasesToKeepCount
    if (index === 0) {
      releasesToKeepCount = 3 // Latest major: keep up to 3 releases
    } else if (index === 1) {
      releasesToKeepCount = 2 // Second major: keep up to 2 releases
    } else {
      releasesToKeepCount = 1 // Third major: keep up to 1 release
    }

    // Releases are already sorted by version (descending within this major)
    // Take the top N releases
    const topReleases = releases.slice(0, releasesToKeepCount)
    topReleases.forEach(release => {
      releasesToKeep.add(release.tag_name)
    })
  })

  // Return releases in original order, filtered by what we want to keep
  return releases.filter(r => releasesToKeep.has(r.tag_name))
}

module.exports = {
  parseVersion,
  isOlderThanMonths,
  filterReleasesToKeep
}
