"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitContext = getGitContext;
exports.getDefaultAgentName = getDefaultAgentName;
exports.validateGitRepository = validateGitRepository;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
/**
 * Get Git repository URL and ref for the agent source.
 * Auto-detects from GitHub context with support for release tags.
 */
function getGitContext(gitRepositoryOverride, gitRefOverride) {
    const context = github.context;
    // Determine repository URL
    let repository;
    if (gitRepositoryOverride) {
        repository = gitRepositoryOverride;
        core.info(`Using explicit git-repository: ${repository}`);
    }
    else {
        // Auto-detect from current repository
        const repoName = process.env.GITHUB_REPOSITORY || context.repo.owner + '/' + context.repo.repo;
        repository = `https://github.com/${repoName}`;
        core.info(`Auto-detected git-repository: ${repository}`);
    }
    // Determine ref (branch/tag/commit)
    let ref;
    if (gitRefOverride) {
        ref = gitRefOverride;
        core.info(`Using explicit git-ref: ${ref}`);
    }
    else {
        // Auto-detect ref based on event type
        ref = determineGitRef(context);
        core.info(`Auto-detected git-ref: ${ref}`);
    }
    return { repository, ref };
}
function determineGitRef(context) {
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
        const pullRequest = context.payload.pull_request;
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
function getDefaultAgentName() {
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
function validateGitRepository(repository) {
    // Basic validation - check if it looks like a valid Git URL
    const gitUrlPattern = /^(https?:\/\/|git@)[^\s]+$/;
    if (!gitUrlPattern.test(repository)) {
        throw new Error(`Invalid git repository URL: ${repository}. Must be HTTP(S) or SSH format.`);
    }
}
