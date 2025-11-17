import * as core from '@actions/core';
import * as github from '@actions/github';

export interface GitContext {
  repository: string;
  ref: string;
}

/**
 * Get Git repository URL and ref for the agent source.
 * Auto-detects from GitHub context with support for release tags.
 */
export function getGitContext(gitRepositoryOverride?: string, gitRefOverride?: string): GitContext {
  const context = github.context;

  // Determine repository URL
  let repository: string;
  if (gitRepositoryOverride) {
    repository = gitRepositoryOverride;
    core.info(`Using explicit git-repository: ${repository}`);
  } else {
    // Auto-detect from current repository
    const repoName = process.env.GITHUB_REPOSITORY || context.repo.owner + '/' + context.repo.repo;
    repository = `https://github.com/${repoName}`;
    core.info(`Auto-detected git-repository: ${repository}`);
  }

  // Determine ref (branch/tag/commit)
  let ref: string;
  if (gitRefOverride) {
    ref = gitRefOverride;
    core.info(`Using explicit git-ref: ${ref}`);
  } else {
    // Auto-detect ref based on event type
    ref = determineGitRef(context);
    core.info(`Auto-detected git-ref: ${ref}`);
  }

  return { repository, ref };
}

function determineGitRef(context: typeof github.context): string {
  const eventName = process.env.GITHUB_EVENT_NAME || context.eventName;
  const sha = process.env.GITHUB_SHA || context.sha;

  core.info(`GitHub event: ${eventName}`);

  // For release events, use the release tag
  if (eventName === 'release') {
    const refName = process.env.GITHUB_REF_NAME || context.ref.replace('refs/tags/', '');
    core.info(`Release event detected, using tag: ${refName}`);
    return refName;
  }

  // For tag push events
  if (eventName === 'push' && context.ref.startsWith('refs/tags/')) {
    const tagName = process.env.GITHUB_REF_NAME || context.ref.replace('refs/tags/', '');
    core.info(`Tag push detected: ${tagName}`);
    return tagName;
  }

  // For pull request events, use the head SHA
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    const pullRequest = context.payload.pull_request as { head?: { sha?: string } } | undefined;
    const prSha = pullRequest?.head?.sha || sha;
    core.info(`Pull request event, using SHA: ${prSha}`);
    return prSha;
  }

  // Default to current commit SHA
  core.info(`Using commit SHA: ${sha}`);
  return sha;
}

/**
 * Get default agent name from repository name.
 * Converts owner/repo to owner-repo format.
 */
export function getDefaultAgentName(): string {
  const repoName = process.env.GITHUB_REPOSITORY;
  if (!repoName) {
    throw new Error('GITHUB_REPOSITORY environment variable is not set');
  }

  // Convert owner/repo to owner-repo
  const agentName = repoName.replace('/', '-');
  core.info(`Default agent name: ${agentName}`);
  return agentName;
}

/**
 * Validate that a Git repository URL is accessible (basic format check).
 */
export function validateGitRepository(repository: string): void {
  // Basic validation - check if it looks like a valid Git URL
  const gitUrlPattern = /^(https?:\/\/|git@)[^\s]+$/;
  if (!gitUrlPattern.test(repository)) {
    throw new Error(`Invalid git repository URL: ${repository}. Must be HTTP(S) or SSH format.`);
  }
}
