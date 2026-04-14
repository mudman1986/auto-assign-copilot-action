#!/usr/bin/env node

describe('vendored json-with-bigint patch', () => {
  const originalParse = JSON.parse

  afterEach(() => {
    JSON.parse = originalParse
  })

  test('parses large integers without regex backtracking fallback', () => {
    const { JSONParse } = require('../vendor/json-with-bigint/json-with-bigint.cjs')

    JSON.parse = (text, reviver) => originalParse(text, (key, value) => reviver(key, value))

    const parsed = JSONParse('{"safe":1,"big":9007199254740993,"negative":-9007199254740993}')

    expect(parsed.safe).toBe(1)
    expect(parsed.big).toBe(9007199254740993n)
    expect(parsed.negative).toBe(-9007199254740993n)
  })

  test('preserves string values that resemble bigint markers', () => {
    const { JSONParse } = require('../vendor/json-with-bigint/json-with-bigint.cjs')

    JSON.parse = (text, reviver) => originalParse(text, (key, value) => reviver(key, value))

    const parsed = JSONParse('{"string":"9007199254740993n","escaped":"quote \\"value\\""}')

    expect(parsed.string).toBe('9007199254740993n')
    expect(parsed.escaped).toBe('quote "value"')
  })
})
