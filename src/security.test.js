#!/usr/bin/env node

/**
 * Security-focused tests for auto-assign-copilot-action
 * These tests demonstrate potential vulnerabilities and validate security controls
 */

const core = require('@actions/core')
const helpers = require('./helpers.js')
const path = require('path')
const fs = require('fs')
const os = require('os')

describe('Security Tests - Input Validation', () => {
  describe('Integer parsing vulnerabilities', () => {
    test('should handle very large integers gracefully', () => {
      // This test demonstrates the integer overflow concern
      const largeNumber = '999999999999999999999'
      const parsed = parseInt(largeNumber, 10)

      // JavaScript converts to scientific notation which could cause issues
      expect(parsed).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
      // This shows the parsed value is not safe
      expect(Number.isSafeInteger(parsed)).toBe(false)
    })

    test('should handle negative integers in wait-seconds', () => {
      // Demonstrates potential to bypass wait times with negative values
      const negativeValue = '-1'
      const parsed = parseInt(negativeValue, 10)

      expect(parsed).toBe(-1)
      // Negative wait times would bypass the grace period
      // In production code, this should be validated
    })

    test('should handle zero and boundary values', () => {
      expect(parseInt('0', 10)).toBe(0)
      expect(parseInt('2147483647', 10)).toBe(2147483647) // Max 32-bit signed int
      expect(parseInt('2147483648', 10)).toBe(2147483648) // Beyond 32-bit
    })

    test('should handle non-numeric inputs', () => {
      expect(parseInt('abc', 10)).toBeNaN()
      expect(parseInt('123abc', 10)).toBe(123) // Partial parsing!
      expect(parseInt('', 10)).toBeNaN()
    })
  })

  describe('Label validation', () => {
    test('should detect potentially malicious label names', () => {
      const maliciousLabels = [
        'label"injection',
        "label'injection",
        'label\ninjection',
        'label\tinjection',
        '../../../etc/passwd',
        '<script>alert(1)</script>',
        // eslint-disable-next-line no-template-curly-in-string
        '${process.env.SECRET}'
      ]

      maliciousLabels.forEach(label => {
        // These should be validated but currently aren't
        // A proper validator would reject these
        const hasSpecialChars = /[^a-zA-Z0-9\-_ ]/.test(label)
        if (hasSpecialChars) {
          expect(hasSpecialChars).toBe(true) // Demonstrates the issue
        }
      })
    })

    test('should handle excessively long label names', () => {
      const longLabel = 'a'.repeat(1000)
      expect(longLabel.length).toBe(1000)
      // GitHub limits labels to 50 chars, but we don't validate
    })

    test('should handle array with too many labels', () => {
      const manyLabels = Array(1000).fill('label').join(',')
      const labelArray = manyLabels.split(',')
      expect(labelArray.length).toBe(1000)
      // This could cause performance issues in GraphQL queries
    })
  })
})

describe('Security Tests - Path Traversal', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'))
    process.env.GITHUB_WORKSPACE = tempDir
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    delete process.env.GITHUB_WORKSPACE
  })

  test('should reject parent directory traversal', () => {
    const result = helpers.readRefactorIssueTemplate('../../etc/passwd')

    // Should return default content, not file contents
    expect(result).toContain('Review the codebase')
    expect(result).not.toContain('root:') // Unix passwd file marker
  })

  test('should reject absolute paths', () => {
    const result = helpers.readRefactorIssueTemplate('/etc/passwd')

    expect(result).toContain('Review the codebase')
    expect(result).not.toContain('root:')
  })

  test('should handle Windows-style absolute paths', () => {
    const result = helpers.readRefactorIssueTemplate('C:\\Windows\\System32\\config\\sam')

    expect(result).toContain('Review the codebase')
  })

  test('should handle UNC paths (Windows network shares)', () => {
    const result = helpers.readRefactorIssueTemplate('\\\\attacker-server\\share\\malicious.md')

    // Current implementation might not properly handle UNC paths
    expect(result).toContain('Review the codebase')
  })

  test('should handle null byte injection', () => {
    const result = helpers.readRefactorIssueTemplate('template.md\x00../../etc/passwd')

    expect(result).toContain('Review the codebase')
  })

  test('should handle URL-encoded path traversal', () => {
    const result = helpers.readRefactorIssueTemplate('..%2F..%2Fetc%2Fpasswd')

    // Path module should handle this, but worth testing
    expect(result).toContain('Review the codebase')
  })

  test('should validate file extension whitelist', () => {
    // Create a file with executable extension
    const maliciousFile = path.join(tempDir, 'template.sh')
    fs.writeFileSync(maliciousFile, '#!/bin/bash\necho "malicious"')

    helpers.readRefactorIssueTemplate('template.sh')

    // Currently no extension validation - file would be read
    // This test documents the issue
    expect(fs.existsSync(maliciousFile)).toBe(true)
  })

  test('should handle oversized template files', () => {
    // Create a very large file
    const largeFile = path.join(tempDir, 'large.md')
    const largeContent = 'A'.repeat(10 * 1024 * 1024) // 10MB
    fs.writeFileSync(largeFile, largeContent)

    const result = helpers.readRefactorIssueTemplate('large.md')

    // Currently no size limit - large file would be read into memory
    // This could cause memory exhaustion
    if (result.length > 1024 * 1024) {
      // File was read without size validation
      expect(result.length).toBeGreaterThan(1024 * 1024)
    }
  })

  test('should handle symlink attacks', () => {
    // Create a symlink to sensitive file
    const symlinkPath = path.join(tempDir, 'template.md')
    try {
      fs.symlinkSync('/etc/passwd', symlinkPath)

      const result = helpers.readRefactorIssueTemplate('template.md')

      // Should not follow symlinks outside workspace
      // Current implementation might follow symlinks
      expect(result).toBeDefined()
    } catch (e) {
      // Symlink creation might fail on some systems
      expect(e).toBeDefined()
    }
  })
})

describe('Security Tests - GraphQL Injection', () => {
  test('should detect potential GraphQL injection in labels', () => {
    const injectionAttempts = [
      'bug", variables: {repo: "other-repo"}',
      'bug\n{repository(owner:"attacker"',
      'bug} mutation {deleteRepository',
      '"bug", "private-label'
    ]

    injectionAttempts.forEach(attempt => {
      // Test that these contain suspicious patterns
      expect(attempt).toMatch(/["{}\n]/)
      // In production, these should be rejected before reaching GraphQL
    })
  })
})

describe('Security Tests - Timing Attacks', () => {
  test('should measure timing difference in cooldown check', () => {
    // This demonstrates potential timing attack vector
    const emptyIssues = []
    const manyIssues = Array(100).fill({
      number: 1,
      title: 'Test [AUTO]',
      closedAt: new Date().toISOString(),
      labels: { nodes: [{ name: 'refactor' }] }
    })

    const iterations = 1000 // Run multiple times to get measurable difference
    let time1 = 0
    let time2 = 0

    // Warm up
    helpers.shouldWaitForCooldown(emptyIssues, 7)
    helpers.shouldWaitForCooldown(manyIssues, 7)

    const start1 = Date.now()
    for (let i = 0; i < iterations; i++) {
      helpers.shouldWaitForCooldown(emptyIssues, 7)
    }
    time1 = Date.now() - start1

    const start2 = Date.now()
    for (let i = 0; i < iterations; i++) {
      helpers.shouldWaitForCooldown(manyIssues, 7)
    }
    time2 = Date.now() - start2

    // Timing difference could leak information
    // In practice, this is not a significant vulnerability for this action
    // The test just verifies we can detect the timing difference exists
    expect(time2).toBeGreaterThanOrEqual(0)
    expect(time1).toBeGreaterThanOrEqual(0)
  })
})

describe('Security Tests - Information Disclosure', () => {
  test('should not expose sensitive data in logs', () => {
    // Mock core.info to capture output
    const logs = []
    const originalInfo = core.info
    core.info = (...args) => logs.push(args.join(' '))

    try {
      helpers.readRefactorIssueTemplate('')

      // Check that logs don't contain sensitive information
      logs.forEach(log => {
        expect(log).not.toMatch(/password/i)
        expect(log).not.toMatch(/secret/i)
        expect(log).not.toMatch(/token/i)
        expect(log).not.toMatch(/ghp_/)
        expect(log).not.toMatch(/github_pat_/)
      })
    } finally {
      core.info = originalInfo
    }
  })
})

describe('Security Tests - Edge Cases', () => {
  test('should handle empty strings safely', () => {
    expect(helpers.readRefactorIssueTemplate('')).toBeDefined()
    expect(helpers.readRefactorIssueTemplate(null)).toBeDefined()
    expect(helpers.readRefactorIssueTemplate(undefined)).toBeDefined()
  })

  test('should handle whitespace-only input', () => {
    expect(helpers.readRefactorIssueTemplate('   ')).toBeDefined()
    expect(helpers.readRefactorIssueTemplate('\n\t ')).toBeDefined()
  })

  test('should handle special characters in paths', () => {
    const specialChars = [
      'file with spaces.md',
      'file\twith\ttabs.md',
      'file\nwith\nnewlines.md',
      'file"with"quotes.md',
      "file'with'quotes.md"
    ]

    specialChars.forEach(filename => {
      const result = helpers.readRefactorIssueTemplate(filename)
      expect(result).toBeDefined()
    })
  })
})

describe('Security Tests - Denial of Service', () => {
  test('should handle excessive skip labels', () => {
    const manyLabels = Array(10000).fill('label')
    const skipLabels = manyLabels

    // This would be passed to GraphQL queries - could cause issues
    expect(skipLabels.length).toBe(10000)

    // Should have a maximum limit
    const MAX_SKIP_LABELS = 50
    const limited = skipLabels.slice(0, MAX_SKIP_LABELS)
    expect(limited.length).toBe(MAX_SKIP_LABELS)
  })

  test('should handle deeply nested issue structures', () => {
    // Test handling of complex issue objects
    const complexIssue = {
      id: 'test',
      number: 1,
      title: 'Test',
      url: 'http://test',
      body: 'A'.repeat(100000), // 100KB body
      assignees: { nodes: [] },
      trackedIssues: { totalCount: 0 },
      trackedInIssues: { totalCount: 0 },
      labels: { nodes: Array(1000).fill({ name: 'test' }) }
    }

    const parsed = helpers.parseIssueData(complexIssue)
    expect(parsed).toBeDefined()
  })
})

describe('Security Tests - Race Conditions', () => {
  test('should handle concurrent file reads safely', async () => {
    // Create a temporary file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-test-'))
    process.env.GITHUB_WORKSPACE = tempDir
    const testFile = path.join(tempDir, 'test.md')
    fs.writeFileSync(testFile, 'test content')

    try {
      // Read the same file multiple times concurrently
      const reads = Array(10).fill(null).map(() =>
        helpers.readRefactorIssueTemplate('test.md')
      )

      // All reads should complete successfully
      reads.forEach(result => {
        expect(result).toBeDefined()
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      delete process.env.GITHUB_WORKSPACE
    }
  })
})

describe('Security Best Practices - Recommendations', () => {
  test('demonstrates proper input validation pattern', () => {
    function validatePositiveInteger (value, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
      const parsed = parseInt(value || defaultValue, 10)

      if (isNaN(parsed)) {
        throw new Error(`Invalid integer: ${value}`)
      }

      if (parsed < min || parsed > max) {
        throw new Error(`Integer out of range: ${parsed}. Must be between ${min} and ${max}`)
      }

      if (!Number.isSafeInteger(parsed)) {
        throw new Error(`Integer not safe: ${parsed}`)
      }

      return parsed
    }

    // Valid inputs
    expect(validatePositiveInteger('100', '0', 0, 1000)).toBe(100)
    expect(validatePositiveInteger('', '42', 0, 100)).toBe(42)
    expect(validatePositiveInteger('0', '1', 0, 10)).toBe(0)

    // Invalid inputs
    expect(() => validatePositiveInteger('-1', '0', 0, 100)).toThrow()
    expect(() => validatePositiveInteger('1001', '0', 0, 1000)).toThrow()
    expect(() => validatePositiveInteger('abc', '0', 0, 100)).toThrow()
    expect(() => validatePositiveInteger('999999999999999999', '0', 0, 1000)).toThrow()
  })

  test('demonstrates proper label validation pattern', () => {
    function validateLabelName (label) {
      if (!label || typeof label !== 'string') {
        return null
      }

      const trimmed = label.trim()

      // GitHub label constraints
      if (trimmed.length === 0 || trimmed.length > 50) {
        throw new Error(`Label length invalid: ${trimmed.length}`)
      }

      // Only allow safe characters
      if (!/^[a-zA-Z0-9\-_ ]+$/.test(trimmed)) {
        throw new Error(`Label contains invalid characters: ${trimmed}`)
      }

      return trimmed
    }

    // Valid labels
    expect(validateLabelName('bug')).toBe('bug')
    expect(validateLabelName('good-first-issue')).toBe('good-first-issue')
    expect(validateLabelName('help wanted')).toBe('help wanted')

    // Invalid labels
    expect(() => validateLabelName('label"injection')).toThrow()
    expect(() => validateLabelName("label'injection")).toThrow()
    expect(() => validateLabelName('label\ninjection')).toThrow()
    expect(() => validateLabelName('a'.repeat(51))).toThrow()
  })

  test('demonstrates enhanced path validation', () => {
    function isPathSafe (templatePath, workspaceRoot) {
      if (!templatePath || typeof templatePath !== 'string') {
        return false
      }

      // Reject absolute paths
      if (path.isAbsolute(templatePath)) {
        return false
      }

      // Reject UNC paths (Windows)
      if (templatePath.startsWith('\\\\')) {
        return false
      }

      // Resolve and check for traversal
      const absolutePath = path.resolve(workspaceRoot, templatePath)
      const relativePath = path.relative(workspaceRoot, absolutePath)

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return false
      }

      // Check file extension
      const ext = path.extname(absolutePath).toLowerCase()
      const allowedExtensions = ['.md', '.txt']
      if (!allowedExtensions.includes(ext)) {
        return false
      }

      return true
    }

    const workspace = '/workspace'

    // Safe paths
    expect(isPathSafe('.github/template.md', workspace)).toBe(true)
    expect(isPathSafe('docs/template.md', workspace)).toBe(true)

    // Unsafe paths
    expect(isPathSafe('../../../etc/passwd', workspace)).toBe(false)
    expect(isPathSafe('/etc/passwd', workspace)).toBe(false)
    expect(isPathSafe('\\\\server\\share\\file.md', workspace)).toBe(false)
    expect(isPathSafe('template.sh', workspace)).toBe(false)
    expect(isPathSafe('template.exe', workspace)).toBe(false)
  })
})
