#!/usr/bin/env node

/**
 * Assign Copilot to GitHub Issues
 *
 * This script handles automatic assignment of GitHub Copilot to issues
 * based on priority labels and various constraints.
 */

/**
 * Check if an issue should be skipped for assignment
 * @param {Object} issue - Issue object from parseIssueData
 * @param {boolean} issue.isAssigned - Whether issue already has assignees
 * @param {boolean} issue.hasSubIssues - Whether issue has any sub-issues (open or closed)
 * @param {boolean} [allowParentIssues=false] - Whether to allow assigning issues with sub-issues (default: false)
 * @param {Array<string>} [skipLabels=[]] - Array of label names to skip (default: empty array)
 * @returns {Object} - {shouldSkip: boolean, reason: string}
 */
function shouldSkipIssue(issue, allowParentIssues = false, skipLabels = []) {
  if (issue.isAssigned) {
    return { shouldSkip: true, reason: "already assigned" };
  }
  if (issue.hasSubIssues && !allowParentIssues) {
    return { shouldSkip: true, reason: "has sub-issues" };
  }
  // Check if issue has any of the skip labels
  if (skipLabels.length > 0 && issue.labels) {
    const issueLabels = issue.labels.map((l) => l.name);
    const matchedLabel = skipLabels.find((skipLabel) =>
      issueLabels.includes(skipLabel),
    );
    if (matchedLabel) {
      return {
        shouldSkip: true,
        reason: `has skip label: ${matchedLabel}`,
      };
    }
  }
  return { shouldSkip: false, reason: null };
}

/**
 * Normalize labels from GraphQL response or flattened structure
 * @param {Object} issue - Issue with potentially different label structures
 * @returns {Array} - Array of label objects with normalized structure
 */
function normalizeIssueLabels(issue) {
  // Handle GraphQL structure: { labels: { nodes: [...] } }
  if (issue.labels && issue.labels.nodes) {
    return issue.labels.nodes;
  }
  // Handle flattened structure: { labels: [...] }
  if (Array.isArray(issue.labels)) {
    return issue.labels;
  }
  // No labels
  return [];
}

/**
 * Check if Copilot should be assigned a new issue
 * @param {Array} assignedIssues - Array of issues currently assigned to Copilot
 * @param {string} mode - Assignment mode ('auto' or 'refactor')
 * @param {boolean} force - Whether to force assignment even if Copilot has work
 * @returns {Object} - {shouldAssign: boolean, reason: string}
 */
function shouldAssignNewIssue(assignedIssues, mode, force) {
  if (assignedIssues.length === 0) {
    return { shouldAssign: true, reason: "Copilot has no assigned issues" };
  }

  if (mode === "refactor") {
    // Check if already working on a refactor issue
    const hasRefactorIssue = assignedIssues.some((issue) => {
      const labels = normalizeIssueLabels(issue);
      return labels.some((label) => label.name === "refactor");
    });
    if (hasRefactorIssue) {
      return {
        shouldAssign: false,
        reason: "Copilot already has a refactor issue assigned",
      };
    }
    // If working on non-refactor issues, skip to avoid disruption
    return {
      shouldAssign: false,
      reason: "Copilot is working on other issues, skipping refactor creation",
    };
  }

  // Auto mode
  if (force) {
    return {
      shouldAssign: true,
      reason: "Force flag is set",
    };
  }

  return {
    shouldAssign: false,
    reason: "Copilot already has assigned issues and force=false",
  };
}

/**
 * Parse issue data from GraphQL response
 * @param {Object} issue - Raw issue object from GraphQL
 * @returns {Object} - Parsed issue with boolean flags
 */
function parseIssueData(issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    body: issue.body || "",
    isAssigned: issue.assignees.nodes.length > 0,
    // Check for ANY sub-issues (open or closed) - parent issues should not be assigned
    hasSubIssues: !!(issue.trackedIssues && issue.trackedIssues.totalCount > 0),
    isSubIssue: !!(
      issue.trackedInIssues && issue.trackedInIssues.totalCount > 0
    ),
    isRefactorIssue: issue.labels.nodes.some((l) => l.name === "refactor"),
    labels: issue.labels.nodes,
  };
}

/**
 * Find the first assignable issue from a list
 * @param {Array} issues - Array of issue objects from GraphQL
 * @param {boolean} allowParentIssues - Whether to allow assigning issues with sub-issues (open or closed)
 * @param {Array<string>} [skipLabels=[]] - Array of label names to skip (default: empty array)
 * @returns {Object|null} - First assignable issue or null
 */
function findAssignableIssue(
  issues,
  allowParentIssues = false,
  skipLabels = [],
) {
  for (const issue of issues) {
    const parsed = parseIssueData(issue);
    const { shouldSkip } = shouldSkipIssue(
      parsed,
      allowParentIssues,
      skipLabels,
    );

    if (!shouldSkip) {
      return parsed;
    }
  }
  return null;
}

/**
 * Check if any of the last N closed issues have the refactor label
 * @param {Array} closedIssues - Array of recently closed issues (sorted by closed_at desc)
 * @param {number} count - Number of recent issues to check (default: 4)
 * @returns {boolean} - True if any of the last N closed issues have refactor label
 */
function hasRecentRefactorIssue(closedIssues, count = 4) {
  if (!closedIssues || closedIssues.length === 0) {
    return false;
  }

  const recentIssues = closedIssues.slice(0, count);
  return recentIssues.some((issue) => {
    const labels = normalizeIssueLabels(issue);
    return labels.some((label) => label.name === "refactor");
  });
}

/**
 * Find an available refactor issue (open, unassigned, with refactor label)
 * @param {Array} issues - Array of issue objects from GraphQL
 * @param {boolean} allowParentIssues - Whether to allow assigning issues with sub-issues
 * @param {Array<string>} skipLabels - Array of label names to skip
 * @returns {Object|null} - First available refactor issue or null
 */
function findAvailableRefactorIssue(
  issues,
  allowParentIssues = false,
  skipLabels = [],
) {
  // Filter to only refactor-labeled issues
  const refactorIssues = issues.filter((issue) => {
    const labels = normalizeIssueLabels(issue);
    return labels.some((label) => label.name === "refactor");
  });

  // Find first assignable refactor issue
  return findAssignableIssue(refactorIssues, allowParentIssues, skipLabels);
}

module.exports = {
  shouldSkipIssue,
  shouldAssignNewIssue,
  parseIssueData,
  findAssignableIssue,
  normalizeIssueLabels,
  hasRecentRefactorIssue,
  findAvailableRefactorIssue,
};
