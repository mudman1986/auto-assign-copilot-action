#!/usr/bin/env node

/**
 * Fuzzing tests for input validation
 * Tests edge cases and malformed inputs to ensure robustness
 */

const {
  validatePositiveInteger,
  validateLabelName,
  validateLabelArray
} = require('./validation.js')

describe('Fuzzing Tests - Input Validation Edge Cases', () => {
  describe('validatePositiveInteger fuzzing', () => {
    test('should handle extremely large numbers', () => {
      expect(() => validatePositiveInteger('9999999999999999999999', '0', 0, 100))
        .toThrow('Integer out of range')
    })

    test('should handle Number.MAX_SAFE_INTEGER + 1', () => {
      const largeNum = (Number.MAX_SAFE_INTEGER + 1).toString()
      expect(() => validatePositiveInteger(largeNum, '0', 0, Number.MAX_SAFE_INTEGER))
        .toThrow('out of range')
    })

    test('should handle scientific notation', () => {
      // parseInt treats 1e10 as "1" (stops at 'e')
      expect(validatePositiveInteger('1e10', '0', 0, 100)).toBe(1)
    })

    test('should handle negative zero', () => {
      const result = validatePositiveInteger('-0', '1', 0, 100)
      // In JavaScript, -0 === 0 is true, so this passes validation
      expect(result === 0).toBe(true)
    })

    test('should handle floating point numbers', () => {
      expect(validatePositiveInteger('3.14', '0', 0, 100)).toBe(3)
    })

    test('should handle leading zeros', () => {
      expect(validatePositiveInteger('00042', '0', 0, 100)).toBe(42)
    })

    test('should handle whitespace', () => {
      expect(() => validatePositiveInteger('  42  ', '0', 0, 100))
        .not.toThrow()
    })

    test('should handle unicode digits', () => {
      expect(() => validatePositiveInteger('٤٢', '0', 0, 100)) // Arabic-Indic digits
        .toThrow('Invalid integer')
    })

    test('should handle hexadecimal notation', () => {
      // parseInt('0xFF', 10) returns 0 because it stops at 'x'
      expect(validatePositiveInteger('0xFF', '0', 0, 1000)).toBe(0)
    })

    test('should handle octal notation', () => {
      expect(validatePositiveInteger('0o77', '0', 0, 1000)).toBe(0)
    })

    test('should handle binary notation', () => {
      expect(validatePositiveInteger('0b1010', '0', 0, 1000)).toBe(0)
    })

    test('should handle string with letters', () => {
      expect(() => validatePositiveInteger('123abc', '0', 0, 1000))
        .not.toThrow() // parseInt returns 123
      expect(validatePositiveInteger('123abc', '0', 0, 1000)).toBe(123)
    })

    test('should handle empty string with default', () => {
      expect(validatePositiveInteger('', '42', 0, 100)).toBe(42)
    })

    test('should handle null with default', () => {
      expect(validatePositiveInteger(null, '42', 0, 100)).toBe(42)
    })

    test('should handle undefined with default', () => {
      expect(validatePositiveInteger(undefined, '42', 0, 100)).toBe(42)
    })

    test('should handle Infinity', () => {
      expect(() => validatePositiveInteger('Infinity', '0', 0, 100))
        .toThrow('Invalid integer')
    })

    test('should handle -Infinity', () => {
      expect(() => validatePositiveInteger('-Infinity', '0', 0, 100))
        .toThrow('Invalid integer')
    })

    test('should handle NaN string', () => {
      expect(() => validatePositiveInteger('NaN', '0', 0, 100))
        .toThrow('Invalid integer')
    })
  })

  describe('validateLabelName fuzzing', () => {
    test('should handle SQL injection attempts', () => {
      expect(() => validateLabelName("bug'; DROP TABLE issues;--"))
        .toThrow('invalid characters')
    })

    test('should handle XSS attempts', () => {
      expect(() => validateLabelName('<script>alert(1)</script>'))
        .toThrow('invalid characters')
    })

    test('should handle command injection attempts', () => {
      expect(() => validateLabelName('bug && rm -rf /'))
        .toThrow('invalid characters')
    })

    test('should handle path traversal in labels', () => {
      expect(() => validateLabelName('../../../etc/passwd'))
        .toThrow('invalid characters')
    })

    test('should handle null bytes', () => {
      expect(() => validateLabelName('bug\x00injection'))
        .toThrow('invalid characters')
    })

    test('should handle unicode characters', () => {
      expect(() => validateLabelName('bug-🐛-emoji'))
        .toThrow('invalid characters')
    })

    test('should handle CRLF injection', () => {
      expect(() => validateLabelName('bug\r\ninjection'))
        .toThrow('invalid characters')
    })

    test('should handle tab characters', () => {
      expect(() => validateLabelName('bug\tinjection'))
        .toThrow('invalid characters')
    })

    test('should handle backslash', () => {
      expect(() => validateLabelName('bug\\injection'))
        .toThrow('invalid characters')
    })

    test('should handle quotes', () => {
      expect(() => validateLabelName('bug"injection'))
        .toThrow('invalid characters')
      expect(() => validateLabelName("bug'injection"))
        .toThrow('invalid characters')
    })

    test('should handle backticks', () => {
      expect(() => validateLabelName('bug`injection'))
        .toThrow('invalid characters')
    })

    test('should handle dollar signs', () => {
      expect(() => validateLabelName('bug$injection'))
        .toThrow('invalid characters')
    })

    test('should handle curly braces', () => {
      expect(() => validateLabelName('bug{injection}'))
        .toThrow('invalid characters')
    })

    test('should handle square brackets', () => {
      expect(() => validateLabelName('bug[injection]'))
        .toThrow('invalid characters')
    })

    test('should handle parentheses', () => {
      expect(() => validateLabelName('bug(injection)'))
        .toThrow('invalid characters')
    })

    test('should handle exactly 50 characters', () => {
      const label = 'a'.repeat(50)
      expect(validateLabelName(label)).toBe(label)
    })

    test('should handle 51 characters', () => {
      const label = 'a'.repeat(51)
      expect(() => validateLabelName(label))
        .toThrow('too long')
    })

    test('should handle very long strings', () => {
      const label = 'a'.repeat(1000)
      expect(() => validateLabelName(label))
        .toThrow('too long')
    })

    test('should handle empty string after trim', () => {
      expect(validateLabelName('   ')).toBeNull()
    })

    test('should handle whitespace-only', () => {
      expect(validateLabelName('\t\n\r')).toBeNull()
    })

    test('should handle valid labels with spaces', () => {
      expect(validateLabelName('good first issue')).toBe('good first issue')
    })

    test('should handle valid labels with dashes', () => {
      expect(validateLabelName('bug-fix')).toBe('bug-fix')
    })

    test('should handle valid labels with underscores', () => {
      expect(validateLabelName('help_wanted')).toBe('help_wanted')
    })

    test('should handle mixed valid characters', () => {
      expect(validateLabelName('type-Bug Fix_123')).toBe('type-Bug Fix_123')
    })

    test('should trim whitespace', () => {
      expect(validateLabelName('  bug  ')).toBe('bug')
    })

    test('should handle null input', () => {
      expect(validateLabelName(null)).toBeNull()
    })

    test('should handle undefined input', () => {
      expect(validateLabelName(undefined)).toBeNull()
    })

    test('should handle non-string input', () => {
      expect(validateLabelName(123)).toBeNull()
      expect(validateLabelName({})).toBeNull()
      expect(validateLabelName([])).toBeNull()
    })
  })

  describe('validateLabelArray fuzzing', () => {
    test('should handle array with 50 items', () => {
      const labels = Array(50).fill('bug')
      const result = validateLabelArray(labels, 50)
      expect(result.length).toBe(50)
    })

    test('should handle array with 51 items', () => {
      const labels = Array(51).fill('bug')
      const result = validateLabelArray(labels, 50)
      expect(result.length).toBe(50)
    })

    test('should handle array with 1000 items', () => {
      const labels = Array(1000).fill('bug')
      const result = validateLabelArray(labels, 50)
      expect(result.length).toBe(50)
    })

    test('should handle array with mixed valid/invalid labels', () => {
      const labels = ['bug', 'bug"injection', 'help-wanted', '<script>', 'valid']
      const result = validateLabelArray(labels, 50)
      expect(result).toEqual(['bug', 'help-wanted', 'valid'])
    })

    test('should handle array with all invalid labels', () => {
      const labels = ['<script>', 'bug"injection', '../../etc/passwd']
      const result = validateLabelArray(labels, 50)
      // All these labels have invalid characters and should be filtered out
      expect(result.length).toBe(0)
    })

    test('should handle array with empty strings', () => {
      const labels = ['bug', '', '  ', 'help-wanted']
      const result = validateLabelArray(labels, 50)
      expect(result).toEqual(['bug', 'help-wanted'])
    })

    test('should handle array with null values', () => {
      const labels = ['bug', null, undefined, 'help-wanted']
      const result = validateLabelArray(labels, 50)
      expect(result).toEqual(['bug', 'help-wanted'])
    })

    test('should handle non-array input', () => {
      expect(validateLabelArray('not an array')).toEqual([])
      expect(validateLabelArray(null)).toEqual([])
      expect(validateLabelArray(undefined)).toEqual([])
      expect(validateLabelArray(123)).toEqual([])
      expect(validateLabelArray({})).toEqual([])
    })

    test('should handle empty array', () => {
      expect(validateLabelArray([])).toEqual([])
    })

    test('should handle array with duplicate labels', () => {
      const labels = ['bug', 'bug', 'bug', 'help-wanted']
      const result = validateLabelArray(labels, 50)
      expect(result).toEqual(['bug', 'bug', 'bug', 'help-wanted'])
    })

    test('should handle array with very long label names', () => {
      const labels = ['bug', 'a'.repeat(100), 'help-wanted']
      const result = validateLabelArray(labels, 50)
      expect(result).toEqual(['bug', 'help-wanted'])
    })
  })
})
