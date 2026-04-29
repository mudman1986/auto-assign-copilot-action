const { determineReleaseType, bumpVersion, getNextReleaseVersion } = require('./release')

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
})
