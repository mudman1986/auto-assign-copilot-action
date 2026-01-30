#!/usr/bin/env node

/**
 * Input validation utilities for security hardening
 * Addresses vulnerabilities: V01 (Integer Overflow), V02 (GraphQL Injection), V06 (Label Arrays)
 */

const core = require('@actions/core')

/**
 * Validate and parse a positive integer with bounds checking
 * Prevents integer overflow and negative values
 * @param {string} value - The value to parse
 * @param {string} defaultValue - Default value if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - Validated integer
 * @throws {Error} - If value is invalid or out of bounds
 */
function validatePositiveInteger (value, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = parseInt(value || defaultValue, 10)

  if (isNaN(parsed)) {
    throw new Error(`Invalid integer: ${value}. Must be a valid number.`)
  }

  if (parsed < min || parsed > max) {
    throw new Error(`Integer out of range: ${parsed}. Must be between ${min} and ${max}.`)
  }

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Integer not safe: ${parsed}. Value too large.`)
  }

  return parsed
}

/**
 * Validate a label name for safe use in GraphQL queries
 * Prevents GraphQL injection attacks
 * @param {string} label - The label name to validate
 * @returns {string|null} - Validated label name or null if empty
 * @throws {Error} - If label contains invalid characters or is too long
 */
function validateLabelName (label) {
  if (!label || typeof label !== 'string') {
    return null
  }

  const trimmed = label.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.length > 50) {
    throw new Error(`Label too long: ${trimmed.length} characters. Maximum is 50.`)
  }

  if (!/^[a-zA-Z0-9\-_ ]+$/.test(trimmed)) {
    throw new Error(`Label contains invalid characters: "${trimmed}". Only alphanumeric, dash, underscore, and space allowed.`)
  }

  return trimmed
}

/**
 * Validate and limit an array of label names
 * Prevents DoS through excessive labels
 * @param {Array<string>} labels - Array of label names
 * @param {number} maxLabels - Maximum number of labels allowed
 * @returns {Array<string>} - Validated and limited array of labels
 */
function validateLabelArray (labels, maxLabels = 50) {
  if (!Array.isArray(labels)) {
    return []
  }

  const validatedLabels = labels.reduce((acc, label) => {
    try {
      const validated = validateLabelName(label)
      if (validated) {
        acc.push(validated)
      }
    } catch (error) {
      core.warning(`Skipping invalid label: ${error.message}`)
    }
    return acc
  }, [])

  if (validatedLabels.length > maxLabels) {
    core.warning(`Too many labels (${validatedLabels.length}). Limiting to ${maxLabels}.`)
    return validatedLabels.slice(0, maxLabels)
  }

  return validatedLabels
}

module.exports = {
  validatePositiveInteger,
  validateLabelName,
  validateLabelArray
}
