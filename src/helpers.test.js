#!/usr/bin/env node

/**
 * Test suite for the auto-assign-copilot action helpers
 */

const helpers = require("../src/helpers.js");

describe("Auto Assign Copilot Helpers", () => {
  describe("shouldSkipIssue", () => {
    test("should skip assigned issues", () => {
      const issue = {
        isAssigned: true,
        hasSubIssues: false,
        labels: [],
      };
      const result = helpers.shouldSkipIssue(issue, false, []);
      expect(result.shouldSkip).toBe(true);
      expect(result.reason).toBe("already assigned");
    });

    test("should skip issues with sub-issues when not allowed", () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: true,
        labels: [],
      };
      const result = helpers.shouldSkipIssue(issue, false, []);
      expect(result.shouldSkip).toBe(true);
      expect(result.reason).toBe("has sub-issues");
    });

    test("should not skip issues with sub-issues when allowed", () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: true,
        labels: [],
      };
      const result = helpers.shouldSkipIssue(issue, true, []);
      expect(result.shouldSkip).toBe(false);
    });

    test("should skip issues with skip labels", () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: false,
        labels: [{ name: "no-ai" }, { name: "bug" }],
      };
      const result = helpers.shouldSkipIssue(issue, false, ["no-ai"]);
      expect(result.shouldSkip).toBe(true);
      expect(result.reason).toBe("has skip label: no-ai");
    });

    test("should not skip assignable issues", () => {
      const issue = {
        isAssigned: false,
        hasSubIssues: false,
        labels: [{ name: "bug" }],
      };
      const result = helpers.shouldSkipIssue(issue, false, ["no-ai"]);
      expect(result.shouldSkip).toBe(false);
    });
  });

  describe("shouldAssignNewIssue", () => {
    test("should assign when no issues are assigned", () => {
      const result = helpers.shouldAssignNewIssue([], "auto", false);
      expect(result.shouldAssign).toBe(true);
      expect(result.reason).toBe("Copilot has no assigned issues");
    });

    test("should not assign in refactor mode if already has refactor issue", () => {
      const assignedIssues = [
        {
          labels: { nodes: [{ name: "refactor" }] },
        },
      ];
      const result = helpers.shouldAssignNewIssue(
        assignedIssues,
        "refactor",
        false,
      );
      expect(result.shouldAssign).toBe(false);
      expect(result.reason).toBe(
        "Copilot already has a refactor issue assigned",
      );
    });

    test("should assign when force is true", () => {
      const assignedIssues = [{ labels: { nodes: [{ name: "bug" }] } }];
      const result = helpers.shouldAssignNewIssue(assignedIssues, "auto", true);
      expect(result.shouldAssign).toBe(true);
      expect(result.reason).toBe("Force flag is set");
    });

    test("should not assign when copilot has issues and force is false", () => {
      const assignedIssues = [{ labels: { nodes: [{ name: "bug" }] } }];
      const result = helpers.shouldAssignNewIssue(
        assignedIssues,
        "auto",
        false,
      );
      expect(result.shouldAssign).toBe(false);
    });
  });

  describe("parseIssueData", () => {
    test("should correctly parse issue data", () => {
      const issue = {
        id: "123",
        number: 42,
        title: "Test Issue",
        url: "https://github.com/test/repo/issues/42",
        body: "Issue description",
        assignees: { nodes: [] },
        labels: { nodes: [{ name: "bug" }] },
        trackedIssues: { totalCount: 0 },
        trackedInIssues: { totalCount: 1 },
      };
      const result = helpers.parseIssueData(issue);
      expect(result.id).toBe("123");
      expect(result.number).toBe(42);
      expect(result.title).toBe("Test Issue");
      expect(result.isAssigned).toBe(false);
      expect(result.hasSubIssues).toBe(false);
      expect(result.isSubIssue).toBe(true);
    });

    test("should detect assigned issues", () => {
      const issue = {
        id: "123",
        number: 42,
        title: "Test Issue",
        url: "https://github.com/test/repo/issues/42",
        body: "",
        assignees: { nodes: [{ login: "user1" }] },
        labels: { nodes: [] },
        trackedIssues: { totalCount: 0 },
        trackedInIssues: { totalCount: 0 },
      };
      const result = helpers.parseIssueData(issue);
      expect(result.isAssigned).toBe(true);
    });

    test("should detect issues with sub-issues", () => {
      const issue = {
        id: "123",
        number: 42,
        title: "Test Issue",
        url: "https://github.com/test/repo/issues/42",
        body: "",
        assignees: { nodes: [] },
        labels: { nodes: [] },
        trackedIssues: { totalCount: 3 },
        trackedInIssues: { totalCount: 0 },
      };
      const result = helpers.parseIssueData(issue);
      expect(result.hasSubIssues).toBe(true);
    });
  });

  describe("findAssignableIssue", () => {
    test("should find first assignable issue", () => {
      const issues = [
        {
          id: "1",
          number: 1,
          title: "Issue 1",
          url: "url1",
          body: "",
          assignees: { nodes: [{ login: "user1" }] },
          labels: { nodes: [] },
          trackedIssues: { totalCount: 0 },
          trackedInIssues: { totalCount: 0 },
        },
        {
          id: "2",
          number: 2,
          title: "Issue 2",
          url: "url2",
          body: "",
          assignees: { nodes: [] },
          labels: { nodes: [] },
          trackedIssues: { totalCount: 0 },
          trackedInIssues: { totalCount: 0 },
        },
      ];
      const result = helpers.findAssignableIssue(issues, false, []);
      expect(result).not.toBeNull();
      expect(result.number).toBe(2);
    });

    test("should return null when no assignable issues", () => {
      const issues = [
        {
          id: "1",
          number: 1,
          title: "Issue 1",
          url: "url1",
          body: "",
          assignees: { nodes: [{ login: "user1" }] },
          labels: { nodes: [] },
          trackedIssues: { totalCount: 0 },
          trackedInIssues: { totalCount: 0 },
        },
      ];
      const result = helpers.findAssignableIssue(issues, false, []);
      expect(result).toBeNull();
    });
  });

  describe("hasRecentRefactorIssue", () => {
    test("should return true when recent issues have refactor label", () => {
      const issues = [
        { labels: { nodes: [{ name: "bug" }] } },
        { labels: { nodes: [{ name: "refactor" }] } },
      ];
      const result = helpers.hasRecentRefactorIssue(issues, 2);
      expect(result).toBe(true);
    });

    test("should return false when no recent issues have refactor label", () => {
      const issues = [
        { labels: { nodes: [{ name: "bug" }] } },
        { labels: { nodes: [{ name: "enhancement" }] } },
      ];
      const result = helpers.hasRecentRefactorIssue(issues, 2);
      expect(result).toBe(false);
    });

    test("should handle empty array", () => {
      const result = helpers.hasRecentRefactorIssue([], 4);
      expect(result).toBe(false);
    });
  });

  describe("normalizeIssueLabels", () => {
    test("should normalize GraphQL structure", () => {
      const issue = {
        labels: { nodes: [{ name: "bug" }] },
      };
      const result = helpers.normalizeIssueLabels(issue);
      expect(result).toEqual([{ name: "bug" }]);
    });

    test("should handle flattened structure", () => {
      const issue = {
        labels: [{ name: "bug" }],
      };
      const result = helpers.normalizeIssueLabels(issue);
      expect(result).toEqual([{ name: "bug" }]);
    });

    test("should handle missing labels", () => {
      const issue = {};
      const result = helpers.normalizeIssueLabels(issue);
      expect(result).toEqual([]);
    });
  });
});
