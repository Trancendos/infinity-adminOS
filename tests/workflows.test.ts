/**
 * Tests for the GitHub Actions workflows directory state.
 *
 * This file validates the expected state of .github/workflows/ following
 * the removal of the CodeQL Advanced workflow (codeql.yml) in this PR.
 * It acts as a regression guard to document the intentional deletion and
 * prevent accidental re-introduction.
 *
 * Also covers the removal of the legacy Python test suite
 * (tests/workflows/test_codeql_workflow_removal.py) that previously
 * performed the same checks in pytest.
 */

import * as fs from 'fs';
import * as path from 'path';

const WORKFLOWS_DIR = path.resolve(__dirname, '..', '.github', 'workflows');

describe('GitHub Actions workflows directory', () => {
  it('should exist and be a directory', () => {
    expect(fs.existsSync(WORKFLOWS_DIR)).toBe(true);
    expect(fs.statSync(WORKFLOWS_DIR).isDirectory()).toBe(true);
  });

  it('should be readable', () => {
    expect(() => fs.readdirSync(WORKFLOWS_DIR)).not.toThrow();
  });

  it('should resolve to an absolute path', () => {
    expect(path.isAbsolute(WORKFLOWS_DIR)).toBe(true);
  });

  it('should contain at least one file', () => {
    const entries = fs.readdirSync(WORKFLOWS_DIR);
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe('CodeQL workflow deletion', () => {
  it('codeql.yml should not exist after removal', () => {
    const codeqlPath = path.join(WORKFLOWS_DIR, 'codeql.yml');
    expect(fs.existsSync(codeqlPath)).toBe(false);
  });

  it('codeql.yaml (alternate extension) should not exist', () => {
    const codeqlYamlPath = path.join(WORKFLOWS_DIR, 'codeql.yaml');
    expect(fs.existsSync(codeqlYamlPath)).toBe(false);
  });

  it('CodeQL.yml (alternate casing) should not exist', () => {
    const codeqlUpperPath = path.join(WORKFLOWS_DIR, 'CodeQL.yml');
    expect(fs.existsSync(codeqlUpperPath)).toBe(false);
  });

  it('codeql-advanced.yml (alternate name) should not exist', () => {
    const codeqlAdvancedPath = path.join(WORKFLOWS_DIR, 'codeql-advanced.yml');
    expect(fs.existsSync(codeqlAdvancedPath)).toBe(false);
  });

  it('codeql-analysis.yml (another common variant) should not exist', () => {
    const codeqlAnalysisPath = path.join(WORKFLOWS_DIR, 'codeql-analysis.yml');
    expect(fs.existsSync(codeqlAnalysisPath)).toBe(false);
  });

  it('code-scanning.yml (GitHub code scanning variant) should not exist', () => {
    const codeScanningPath = path.join(WORKFLOWS_DIR, 'code-scanning.yml');
    expect(fs.existsSync(codeScanningPath)).toBe(false);
  });

  it('github-code-scanning.yml (prefixed code scanning variant) should not exist', () => {
    const githubCodeScanningPath = path.join(WORKFLOWS_DIR, 'github-code-scanning.yml');
    expect(fs.existsSync(githubCodeScanningPath)).toBe(false);
  });

  it('no file in the workflows directory should be named codeql.yml (case-insensitive)', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR);
    const codeqlFiles = files.filter(
      (f) => f.toLowerCase() === 'codeql.yml' || f.toLowerCase() === 'codeql.yaml'
    );
    expect(codeqlFiles).toHaveLength(0);
  });

  it('should not contain any file whose name starts with "codeql"', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR);
    const codeqlFiles = files.filter((f) => f.toLowerCase().startsWith('codeql'));
    expect(codeqlFiles).toHaveLength(0);
  });

  it('directory listing should contain zero codeql-related files', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR);
    const codeqlRelated = files.filter((f) => f.toLowerCase().includes('codeql'));
    expect(codeqlRelated).toEqual([]);
  });
});

describe('Remaining security-scanning workflows after CodeQL removal', () => {
  /**
   * These workflows were present alongside codeql.yml and must remain to
   * ensure continued security coverage.
   */
  const expectedSecurityWorkflows = [
    'security-audit.yml',
    'cryptex-vulnerability-scan.yml',
    'defender-for-devops.yml',
    'ossar.yml',
    'synopsys-action.yml',
    'mayhem-for-api.yml',
  ];

  it.each(expectedSecurityWorkflows)(
    'security workflow "%s" should still exist',
    (workflowFile) => {
      const workflowPath = path.join(WORKFLOWS_DIR, workflowFile);
      expect(fs.existsSync(workflowPath)).toBe(true);
    }
  );

  it('at least one security-scanning workflow should be present', () => {
    const existing = expectedSecurityWorkflows.filter((w) =>
      fs.existsSync(path.join(WORKFLOWS_DIR, w))
    );
    expect(existing.length).toBeGreaterThanOrEqual(1);
  });

  it('all expected security workflows should be non-empty files', () => {
    for (const workflowFile of expectedSecurityWorkflows) {
      const workflowPath = path.join(WORKFLOWS_DIR, workflowFile);
      if (fs.existsSync(workflowPath)) {
        const stat = fs.statSync(workflowPath);
        expect(stat.size).toBeGreaterThan(0);
      }
    }
  });
});

describe('Total workflow count after CodeQL removal', () => {
  it('should have at least 30 remaining workflow files', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    // Before deletion there were 35 workflows; after removing codeql.yml there are 34.
    // Assert a lower-bound to guard against mass-deletion regressions.
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it('should not have more workflow files than before the deletion (35)', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    // The count was 35 before deletion; after removal it must be at most 34 (≤ 34).
    expect(files.length).toBeLessThanOrEqual(34);
  });

  it('should have exactly 34 workflow files after codeql.yml removal', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    expect(files.length).toBe(34);
  });
});

describe('Core CI and deployment workflows remain intact', () => {
  const expectedSurvivingWorkflows = [
    'ci.yml',
    'test.yml',
    'ci-python.yml',
    'ci-typescript.yml',
    'security-audit.yml',
    'ci-compliance.yml',
    'tiga-gate-validation.yml',
    'ecosystem-ci.yml',
    'deploy.yml',
    'production.yml',
  ];

  it.each(expectedSurvivingWorkflows)(
    'workflow "%s" should still be present',
    (workflowFile) => {
      const workflowPath = path.join(WORKFLOWS_DIR, workflowFile);
      expect(fs.existsSync(workflowPath)).toBe(true);
    }
  );

  it('no other workflow was accidentally deleted alongside codeql.yml', () => {
    const missing = expectedSurvivingWorkflows.filter(
      (w) => !fs.existsSync(path.join(WORKFLOWS_DIR, w))
    );
    expect(missing).toEqual([]);
  });
});

describe('Workflow file integrity', () => {
  it('all workflow files should have the .yml extension', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter(
      (f) => f.endsWith('.yml') || f.endsWith('.yaml')
    );
    const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
    // Confirm all are .yml (not .yaml) for consistency
    expect(yamlFiles).toHaveLength(0);
  });

  it('all workflow files should be non-empty', () => {
    const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));
    for (const file of files) {
      const filePath = path.join(WORKFLOWS_DIR, file);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('each entry in the workflows directory should be a regular file', () => {
    const entries = fs.readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      expect(entry.isFile()).toBe(true);
    }
  });
});

describe('Boundary and negative cases', () => {
  it('should return false for a path composed from partial CodeQL name', () => {
    const partialPath = path.join(WORKFLOWS_DIR, 'code');
    expect(fs.existsSync(partialPath)).toBe(false);
  });

  it('should return false for a path with extra suffix on the deleted filename', () => {
    const extraSuffixPath = path.join(WORKFLOWS_DIR, 'codeql.yml.bak');
    expect(fs.existsSync(extraSuffixPath)).toBe(false);
  });

  it('should return false for an absolute path reconstructed from the original filename', () => {
    // Re-construct the exact path that existed before the PR to confirm removal.
    const deletedFilePath = path.resolve(
      __dirname,
      '..',
      '.github',
      'workflows',
      'codeql.yml'
    );
    expect(fs.existsSync(deletedFilePath)).toBe(false);
  });

  it('should return false for a hidden dot-file variant of codeql.yml', () => {
    const hiddenPath = path.join(WORKFLOWS_DIR, '.codeql.yml');
    expect(fs.existsSync(hiddenPath)).toBe(false);
  });

  it('should return false for a backup/temp copy of codeql.yml', () => {
    const backupPath = path.join(WORKFLOWS_DIR, 'codeql.yml~');
    expect(fs.existsSync(backupPath)).toBe(false);
  });

  it('should return false for an empty-string filename within workflows dir', () => {
    // path.join with '' resolves to the directory itself — verify that's a directory not a file
    const dirPath = path.join(WORKFLOWS_DIR, '');
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
  });
});

describe('Legacy Python test suite removal', () => {
  /**
   * The PR also deletes the Python test directory and its contents:
   *   tests/workflows/test_codeql_workflow_removal.py
   *   tests/workflows/__pycache__/test_codeql_workflow_removal.cpython-311-pytest-9.0.2.pyc
   * These tests confirm that removal was intentional and complete.
   */
  const TESTS_DIR = path.resolve(__dirname);
  const LEGACY_PYTHON_TEST_DIR = path.join(TESTS_DIR, 'workflows');
  const LEGACY_PYTHON_TEST_FILE = path.join(
    LEGACY_PYTHON_TEST_DIR,
    'test_codeql_workflow_removal.py'
  );

  it('legacy Python test file should not exist after PR deletion', () => {
    expect(fs.existsSync(LEGACY_PYTHON_TEST_FILE)).toBe(false);
  });

  it('tests/workflows/ sub-directory should have been removed', () => {
    expect(fs.existsSync(LEGACY_PYTHON_TEST_DIR)).toBe(false);
  });

  it('no Python test file referencing codeql should remain in tests/', () => {
    const entries = fs.readdirSync(TESTS_DIR, { withFileTypes: true });
    const pythonTestFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.py') && e.name.includes('codeql'))
      .map((e) => e.name);
    expect(pythonTestFiles).toEqual([]);
  });

  it('legacy __pycache__ directory for the deleted Python test should not exist', () => {
    const pycachePath = path.join(LEGACY_PYTHON_TEST_DIR, '__pycache__');
    expect(fs.existsSync(pycachePath)).toBe(false);
  });
});