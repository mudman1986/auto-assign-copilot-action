/**
 * Tests for release cleanup functionality
 * Validates logic for keeping releases based on semver and age
 */

const { filterReleasesToKeep, parseVersion, isOlderThanMonths } = require('./release-cleanup')

describe('Release Cleanup', () => {
  describe('parseVersion', () => {
    test('should parse valid semver versions', () => {
      expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
      expect(parseVersion('v2.0.1')).toEqual({ major: 2, minor: 0, patch: 1 })
      expect(parseVersion('v10.15.7')).toEqual({ major: 10, minor: 15, patch: 7 })
    })

    test('should parse versions without v prefix', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
      expect(parseVersion('2.0.1')).toEqual({ major: 2, minor: 0, patch: 1 })
    })

    test('should return null for invalid versions', () => {
      expect(parseVersion('invalid')).toBeNull()
      expect(parseVersion('v1.2')).toBeNull()
      expect(parseVersion('1.x.3')).toBeNull()
      expect(parseVersion('')).toBeNull()
      expect(parseVersion(null)).toBeNull()
      expect(parseVersion(undefined)).toBeNull()
    })

    test('should handle uppercase V prefix', () => {
      expect(parseVersion('V1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
    })
  })

  describe('isOlderThanMonths', () => {
    test('should return true for releases older than specified months', () => {
      const twoMonthsAgo = new Date()
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

      expect(isOlderThanMonths(twoMonthsAgo.toISOString(), 1)).toBe(true)
    })

    test('should return false for releases younger than specified months', () => {
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

      expect(isOlderThanMonths(twoDaysAgo.toISOString(), 1)).toBe(false)
    })

    test('should handle edge case at exactly one month', () => {
      const exactlyOneMonth = new Date()
      exactlyOneMonth.setMonth(exactlyOneMonth.getMonth() - 1)

      // Should be false since it's not OLDER than one month
      expect(isOlderThanMonths(exactlyOneMonth.toISOString(), 1)).toBe(false)
    })

    test('should return false for invalid dates', () => {
      expect(isOlderThanMonths('invalid', 1)).toBe(false)
      expect(isOlderThanMonths(null, 1)).toBe(false)
      expect(isOlderThanMonths(undefined, 1)).toBe(false)
    })
  })

  describe('filterReleasesToKeep', () => {
    const createRelease = (tagName, publishedAt) => ({
      tag_name: tagName,
      published_at: publishedAt
    })

    // Helper to create a date N months ago
    const monthsAgo = (n) => {
      const date = new Date()
      date.setMonth(date.getMonth() - n)
      return date.toISOString()
    }

    // Helper to create a date N days ago
    const daysAgo = (n) => {
      const date = new Date()
      date.setDate(date.getDate() - n)
      return date.toISOString()
    }

    test('should keep all releases less than 1 month old', () => {
      const releases = [
        createRelease('v3.1.0', monthsAgo(0.5)),
        createRelease('v3.0.9', monthsAgo(0.3)),
        createRelease('v3.0.8', monthsAgo(0.2)),
        createRelease('v2.5.0', monthsAgo(2)),
        createRelease('v2.4.0', monthsAgo(3))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      expect(tags).toContain('v3.1.0')
      expect(tags).toContain('v3.0.9')
      expect(tags).toContain('v3.0.8')
    })

    test('should keep max 3 major versions', () => {
      const releases = [
        createRelease('v5.0.0', monthsAgo(2)),
        createRelease('v4.0.0', monthsAgo(3)),
        createRelease('v3.0.0', monthsAgo(4)),
        createRelease('v2.0.0', monthsAgo(5)),
        createRelease('v1.0.0', monthsAgo(6))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      expect(tags).toContain('v5.0.0')
      expect(tags).toContain('v4.0.0')
      expect(tags).toContain('v3.0.0')
      expect(tags).not.toContain('v2.0.0')
      expect(tags).not.toContain('v1.0.0')
    })

    test('should keep 5 releases of latest major', () => {
      const releases = [
        createRelease('v3.5.0', monthsAgo(2)),
        createRelease('v3.4.0', monthsAgo(3)),
        createRelease('v3.3.0', monthsAgo(4)),
        createRelease('v3.2.0', monthsAgo(5)),
        createRelease('v3.1.0', monthsAgo(6)),
        createRelease('v3.0.0', monthsAgo(7)),
        createRelease('v2.0.0', monthsAgo(8))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      expect(tags).toContain('v3.5.0')
      expect(tags).toContain('v3.4.0')
      expect(tags).toContain('v3.3.0')
      expect(tags).toContain('v3.2.0')
      expect(tags).toContain('v3.1.0')
      expect(tags).not.toContain('v3.0.0')
    })

    test('should keep 3 releases of second major', () => {
      const releases = [
        createRelease('v3.0.0', monthsAgo(2)),
        createRelease('v2.5.0', monthsAgo(3)),
        createRelease('v2.4.0', monthsAgo(4)),
        createRelease('v2.3.0', monthsAgo(5)),
        createRelease('v2.2.0', monthsAgo(6)),
        createRelease('v2.1.0', monthsAgo(7))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      expect(tags).toContain('v2.5.0')
      expect(tags).toContain('v2.4.0')
      expect(tags).toContain('v2.3.0')
      expect(tags).not.toContain('v2.2.0')
      expect(tags).not.toContain('v2.1.0')
    })

    test('should keep 2 releases of third major', () => {
      const releases = [
        createRelease('v3.0.0', monthsAgo(2)),
        createRelease('v2.0.0', monthsAgo(3)),
        createRelease('v1.9.9', monthsAgo(4)),
        createRelease('v1.8.0', monthsAgo(5)),
        createRelease('v1.7.0', monthsAgo(6))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      expect(tags).toContain('v1.9.9')
      expect(tags).toContain('v1.8.0')
      expect(tags).not.toContain('v1.7.0')
    })

    test('should handle the complete example with 5-3-2 pattern', () => {
      const releases = [
        createRelease('v3.4.0', monthsAgo(2)),
        createRelease('v3.3.0', monthsAgo(3)),
        createRelease('v3.2.0', monthsAgo(4)),
        createRelease('v3.1.0', monthsAgo(5)),
        createRelease('v3.0.9', monthsAgo(6)),
        createRelease('v3.0.8', monthsAgo(7)),
        createRelease('v3.0.7', monthsAgo(8)),
        createRelease('v2.5.0', monthsAgo(4)),
        createRelease('v2.4.0', monthsAgo(5)),
        createRelease('v2.3.0', daysAgo(170)), // ~5.6 months, safely under 6 months
        createRelease('v2.2.0', monthsAgo(7)),
        createRelease('v1.9.9', monthsAgo(4)),
        createRelease('v1.8.0', monthsAgo(5)),
        createRelease('v1.7.0', monthsAgo(6)),
        createRelease('v0.1.0', monthsAgo(11))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      // Latest major (v3): keep 5 releases
      expect(tags).toContain('v3.4.0')
      expect(tags).toContain('v3.3.0')
      expect(tags).toContain('v3.2.0')
      expect(tags).toContain('v3.1.0')
      expect(tags).toContain('v3.0.9')
      expect(tags).not.toContain('v3.0.8')
      expect(tags).not.toContain('v3.0.7')

      // Second major (v2): keep 3 releases
      expect(tags).toContain('v2.5.0')
      expect(tags).toContain('v2.4.0')
      expect(tags).toContain('v2.3.0')
      expect(tags).not.toContain('v2.2.0')

      // Third major (v1): keep 2 releases
      expect(tags).toContain('v1.9.9')
      expect(tags).toContain('v1.8.0')
      expect(tags).not.toContain('v1.7.0')

      // Fourth major (v0): deleted entirely
      expect(tags).not.toContain('v0.1.0')
    })

    test('should remove non-latest major releases older than 6 months', () => {
      const releases = [
        createRelease('v3.0.0', monthsAgo(2)),
        createRelease('v2.5.0', monthsAgo(3)), // Should keep (< 6 months)
        createRelease('v2.4.0', monthsAgo(4)), // Should keep (< 6 months)
        createRelease('v2.3.0', monthsAgo(7)), // Should delete (> 6 months, non-latest major)
        createRelease('v1.9.9', monthsAgo(5)), // Should keep (< 6 months)
        createRelease('v1.8.0', monthsAgo(8)) // Should delete (> 6 months, non-latest major)
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      // Latest major (v3) should keep regardless of age
      expect(tags).toContain('v3.0.0')

      // Second major (v2): keep only releases < 6 months
      expect(tags).toContain('v2.5.0')
      expect(tags).toContain('v2.4.0')
      expect(tags).not.toContain('v2.3.0') // Older than 6 months

      // Third major (v1): keep only releases < 6 months
      expect(tags).toContain('v1.9.9')
      expect(tags).not.toContain('v1.8.0') // Older than 6 months
    })

    test('should keep top N releases per major, prioritizing latest patches', () => {
      const releases = [
        createRelease('v3.1.5', monthsAgo(2)),
        createRelease('v3.1.4', monthsAgo(3)),
        createRelease('v3.1.3', monthsAgo(4)),
        createRelease('v3.1.2', monthsAgo(5)),
        createRelease('v3.1.1', monthsAgo(6)),
        createRelease('v3.0.5', monthsAgo(7)),
        createRelease('v3.0.4', monthsAgo(8)),
        createRelease('v3.0.3', monthsAgo(9))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      // Should keep top 5 releases: 3.1.5, 3.1.4, 3.1.3, 3.1.2, 3.1.1
      expect(tags).toContain('v3.1.5')
      expect(tags).toContain('v3.1.4')
      expect(tags).toContain('v3.1.3')
      expect(tags).toContain('v3.1.2')
      expect(tags).toContain('v3.1.1')
      expect(tags).not.toContain('v3.0.5')
      expect(tags).not.toContain('v3.0.4')
      expect(tags).not.toContain('v3.0.3')
    })

    test('should handle releases with invalid version tags', () => {
      const releases = [
        createRelease('v3.1.0', monthsAgo(2)),
        createRelease('invalid-tag', monthsAgo(3)),
        createRelease('v3.0.0', monthsAgo(4)),
        createRelease('v2.0.0', monthsAgo(5))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      // Should skip invalid tags but process valid ones
      expect(tags).toContain('v3.1.0')
      expect(tags).toContain('v3.0.0')
      expect(tags).not.toContain('invalid-tag')
    })

    test('should handle empty releases array', () => {
      const toKeep = filterReleasesToKeep([])
      expect(toKeep).toEqual([])
    })

    test('should protect recent releases even if they would otherwise be deleted', () => {
      const releases = [
        createRelease('v10.0.0', monthsAgo(0.5)), // Recent, but would be deleted by major limit
        createRelease('v9.0.0', monthsAgo(2)),
        createRelease('v8.0.0', monthsAgo(3)),
        createRelease('v7.0.0', monthsAgo(4)),
        createRelease('v6.0.0', monthsAgo(5)),
        createRelease('v5.0.0', monthsAgo(6))
      ]

      const toKeep = filterReleasesToKeep(releases)
      const tags = toKeep.map(r => r.tag_name)

      // v10.0.0 should be kept even though we have 3+ majors,
      // because it's less than a month old
      expect(tags).toContain('v10.0.0')
    })
  })
})
