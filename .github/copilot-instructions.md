# Copilot Instructions

## Development Workflow

### Linter Configuration

This project uses the following linter configurations:

- **`.github/linters/.super-linter.yml`**: Configuration for Super-Linter CI (excludes `dist/` directory)
- **`package.json`** (`standard` section): Configuration for JavaScript Standard Style with Jest globals

The `dist/` directory is excluded from linting as it contains compiled code.

### Running Super-Linter Locally

Before pushing changes, run super-linter locally to catch linting issues:

```bash
# Pull the latest super-linter image
docker pull github/super-linter:latest

# Run super-linter on the entire codebase
docker run --rm \
  -e RUN_LOCAL=true \
  -e USE_FIND_ALGORITHM=true \
  -v $(pwd):/tmp/lint \
  github/super-linter:latest

# Or run super-linter on specific files (e.g., JavaScript files only)
docker run --rm \
  -e RUN_LOCAL=true \
  -e USE_FIND_ALGORITHM=true \
  -e VALIDATE_JAVASCRIPT_STANDARD=true \
  -v $(pwd):/tmp/lint \
  github/super-linter:latest
```

### JavaScript Standard Style

This project uses [JavaScript Standard Style](https://standardjs.com/) for linting.

Configuration is in the `standard` section of `package.json`.

Auto-fix linting issues:
```bash
npx standard --fix src/*.js
npx standard --fix src/*.test.js
```

Check linting without fixing:
```bash
npx standard
```

### Testing

**This project follows Test-Driven Development (TDD) principles.**

When implementing new features or fixing bugs:
1. **Write tests first** that define the expected behavior
2. **Verify tests fail** with the current implementation
3. **Implement the minimal code** to make tests pass
4. **Refactor** while keeping tests green

Run all tests:
```bash
npm test
```

Run specific test file:
```bash
npm test -- src/release.test.js
```

Run tests in watch mode during development:
```bash
npm test -- --watch
```

### Building

Build the action:
```bash
npm run build
```

### Version References

**Always update version references after making changes.** After implementing any feature or fix:

1. Check the latest tag:
```bash
git tag --sort=-v:refname | head -1
```

2. Update all version references in documentation to match the latest tag:
```bash
# Find all version references
grep -r "mudman1986/auto-assign-copilot-action@v" --include="*.md" --include="*.yml" --include="*.yaml"

# Update them to the latest version (e.g., v1.3.2)
sed -i 's/@v1\.[0-9]\.[0-9]/@v1.3.2/g' README.md
```

3. Verify all references are updated:
```bash
grep "mudman1986/auto-assign-copilot-action@v" README.md | sort -u
```

This ensures users always see examples with the most current version.

### Updating Copilot Instructions

**When to update `.github/copilot-instructions.md`:**
- Adding new development conventions or best practices
- Documenting new build/test/lint commands
- Adding project-specific guidelines that Copilot should follow

**How to update:**

1. Make your changes to `.github/copilot-instructions.md`
2. Test that the instructions are clear and actionable
3. Commit with a descriptive message:
```bash
git add .github/copilot-instructions.md
git commit -m "docs: update copilot instructions for [topic]"
```

**Guidelines for copilot instructions:**
- Keep instructions concise and actionable
- Use code examples where helpful
- Organize related instructions under clear headings
- Focus on project-specific conventions, not general coding practices
- Update instructions when development workflows change

## Code Contribution Guidelines

### Summary and Documentation Files

**Do not add summary files of your work to the codebase.** This includes files like:
- `CLEANUP_SUMMARY.md`
- `CHANGES_SUMMARY.md`
- `WORK_SUMMARY.md`
- Any other summary/report files documenting changes made

**Exceptions:** Only add documentation files if they contain specific instructions or information that users/developers need for ongoing work. Examples of acceptable documentation:
- README updates with new features or usage instructions
- Updated configuration documentation
- New how-to guides or tutorials

**Rationale:** Summary files are transient and become outdated quickly. All change information should be captured in:
- Git commit messages
- Pull request descriptions
- GitHub release notes
- Existing documentation files (README.md, CONTRIBUTING.md, etc.)