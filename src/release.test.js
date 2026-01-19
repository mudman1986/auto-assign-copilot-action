/**
 * Tests for release configuration
 * These tests validate the semantic-release configuration and conventional commits
 */

const fs = require('fs');
const path = require('path');

describe('Release Configuration', () => {
  describe('semantic-release configuration', () => {
    test('should have .releaserc.json file', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    test('should have valid semantic-release configuration', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      expect(config.branches).toEqual(['main']);
      expect(config.plugins).toBeDefined();
      expect(Array.isArray(config.plugins)).toBe(true);
    });

    test('should have commit-analyzer plugin configured', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const commitAnalyzer = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer'
      );
      
      expect(commitAnalyzer).toBeDefined();
      expect(commitAnalyzer[1].preset).toBe('conventionalcommits');
      expect(commitAnalyzer[1].releaseRules).toBeDefined();
    });

    test('should have release-notes-generator plugin configured', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const notesGenerator = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/release-notes-generator'
      );
      
      expect(notesGenerator).toBeDefined();
      expect(notesGenerator[1].preset).toBe('conventionalcommits');
    });

    test('should have changelog plugin configured', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const changelog = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/changelog'
      );
      
      expect(changelog).toBeDefined();
      expect(changelog[1].changelogFile).toBe('CHANGELOG.md');
    });

    test('should have npm plugin configured with npmPublish disabled', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const npm = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/npm'
      );
      
      expect(npm).toBeDefined();
      expect(npm[1].npmPublish).toBe(false);
    });

    test('should have git plugin configured', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const git = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/git'
      );
      
      expect(git).toBeDefined();
      expect(git[1].assets).toContain('CHANGELOG.md');
      expect(git[1].assets).toContain('package.json');
    });

    test('should have github plugin configured', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      expect(config.plugins).toContain('@semantic-release/github');
    });
  });

  describe('conventional commits release rules', () => {
    test('should release minor version for feat commits', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const commitAnalyzer = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer'
      );
      
      const featRule = commitAnalyzer[1].releaseRules.find(r => r.type === 'feat');
      expect(featRule.release).toBe('minor');
    });

    test('should release patch version for fix commits', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const commitAnalyzer = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer'
      );
      
      const fixRule = commitAnalyzer[1].releaseRules.find(r => r.type === 'fix');
      expect(fixRule.release).toBe('patch');
    });

    test('should not release for chore commits', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const commitAnalyzer = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer'
      );
      
      const choreRule = commitAnalyzer[1].releaseRules.find(r => r.type === 'chore');
      expect(choreRule.release).toBe(false);
    });

    test('should release patch version for refactor commits', () => {
      const configPath = path.join(__dirname, '..', '.releaserc.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const commitAnalyzer = config.plugins.find(p => 
        Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer'
      );
      
      const refactorRule = commitAnalyzer[1].releaseRules.find(r => r.type === 'refactor');
      expect(refactorRule.release).toBe('patch');
    });
  });

  describe('package.json', () => {
    test('should have semantic-release dependencies', () => {
      const packagePath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      expect(packageJson.devDependencies['semantic-release']).toBeDefined();
      expect(packageJson.devDependencies['@semantic-release/changelog']).toBeDefined();
      expect(packageJson.devDependencies['@semantic-release/git']).toBeDefined();
    });
  });
});
