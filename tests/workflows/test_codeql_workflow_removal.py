"""
Tests for the removal of .github/workflows/codeql.yml.

This PR deletes the CodeQL Advanced workflow. These tests verify:
  1. The codeql.yml file has been removed from the repository.
  2. Alternative security-scanning workflows remain in place so that
     security coverage is not lost.
  3. No codeql-related workflow file has been (accidentally) re-added.
"""

import os
from pathlib import Path

import pytest

# Resolve the repository root from this file's location:
#   tests/workflows/test_codeql_workflow_removal.py  →  ../../
REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _workflow_path(filename: str) -> Path:
    return WORKFLOWS_DIR / filename


# ---------------------------------------------------------------------------
# Tests — codeql.yml has been deleted
# ---------------------------------------------------------------------------

class TestCodeQLWorkflowRemoved:
    """Verify that the CodeQL workflow file no longer exists."""

    def test_codeql_yml_does_not_exist(self):
        """The deleted file must not be present in .github/workflows/."""
        assert not _workflow_path("codeql.yml").exists(), (
            "codeql.yml was deleted in this PR but still exists on disk."
        )

    def test_codeql_yml_not_in_directory_listing(self):
        """Directory listing of .github/workflows must not include codeql.yml."""
        workflow_files = {f.name for f in WORKFLOWS_DIR.iterdir() if f.is_file()}
        assert "codeql.yml" not in workflow_files, (
            "codeql.yml appears in the .github/workflows directory listing."
        )

    def test_no_codeql_workflow_variants_present(self):
        """No file whose name contains 'codeql' should exist in the workflows dir."""
        codeql_files = [
            f.name
            for f in WORKFLOWS_DIR.iterdir()
            if f.is_file() and "codeql" in f.name.lower()
        ]
        assert codeql_files == [], (
            f"Unexpected CodeQL workflow file(s) found: {codeql_files}"
        )

    def test_workflows_directory_is_accessible(self):
        """Sanity check: the .github/workflows directory must exist and be readable."""
        assert WORKFLOWS_DIR.is_dir(), (
            f"Workflows directory not found at {WORKFLOWS_DIR}"
        )
        assert os.access(WORKFLOWS_DIR, os.R_OK), (
            "Workflows directory is not readable."
        )


# ---------------------------------------------------------------------------
# Tests — security coverage is maintained by alternative workflows
# ---------------------------------------------------------------------------

EXPECTED_SECURITY_WORKFLOWS = [
    "security-audit.yml",
    "ossar.yml",
    "cryptex-vulnerability-scan.yml",
    "defender-for-devops.yml",
    "synopsys-action.yml",
]


class TestSecurityCoverageAfterRemoval:
    """
    Verify that the removal of the CodeQL workflow does not leave the
    repository without security-scanning coverage.
    """

    @pytest.mark.parametrize("workflow_file", EXPECTED_SECURITY_WORKFLOWS)
    def test_security_workflow_exists(self, workflow_file: str):
        """Each alternative security-scanning workflow must still be present."""
        assert _workflow_path(workflow_file).exists(), (
            f"Expected security workflow '{workflow_file}' not found in "
            f"{WORKFLOWS_DIR}. Removing codeql.yml must not eliminate all "
            "security scanning."
        )

    def test_at_least_one_security_workflow_present(self):
        """At least one security-scanning workflow must exist after the deletion."""
        existing = [w for w in EXPECTED_SECURITY_WORKFLOWS if _workflow_path(w).exists()]
        assert len(existing) >= 1, (
            "No alternative security-scanning workflow was found. The removal "
            "of codeql.yml leaves the repository without automated security scanning."
        )

    def test_ci_workflow_present(self):
        """The main CI workflow (ci.yml) must still be present."""
        assert _workflow_path("ci.yml").exists(), (
            "Main CI workflow ci.yml is missing."
        )

    def test_total_workflow_count_is_reasonable(self):
        """
        Regression guard: the repository should still contain a meaningful
        number of workflows. Detects accidental mass deletion.
        """
        workflow_files = list(WORKFLOWS_DIR.glob("*.yml"))
        assert len(workflow_files) >= 10, (
            f"Suspiciously few workflow files found ({len(workflow_files)}). "
            "Expected at least 10 after codeql.yml removal."
        )

    def test_no_other_workflow_was_accidentally_deleted(self):
        """
        Boundary / regression: the remaining workflows known to exist before
        this PR should still be present. Guards against inadvertent side-effects.
        """
        expected_surviving_workflows = [
            "ci.yml",
            "test.yml",
            "ci-python.yml",
            "ci-typescript.yml",
            "security-audit.yml",
            "ci-compliance.yml",
            "tiga-gate-validation.yml",
            "ecosystem-ci.yml",
        ]
        missing = [
            w for w in expected_surviving_workflows
            if not _workflow_path(w).exists()
        ]
        assert missing == [], (
            f"Workflow(s) unexpectedly missing after the PR: {missing}"
        )