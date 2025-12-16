import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

export interface ActionInputs {
  apiKey: string;
  sourceType: SourceType;
  agentName?: string;
  agentVersion: string;
  gitRepository?: string;
  gitRef?: string;
  path?: string;
  setupCommands?: string[];
  isPublic: boolean;
  apiUrl: string;
  objectTtlDays?: number;
}

export type SourceType = 'git' | 'tar' | 'file';

export function getInputs(): ActionInputs {
  // Get all inputs
  const sourceType = core.getInput('source-type', { required: true }) as SourceType;
  const setupCommandsRaw = core.getInput('setup-commands');
  const isPublicRaw = core.getInput('is-public') || 'false';
  const objectTtlDaysRaw = core.getInput('object-ttl-days');

  const inputs: ActionInputs = {
    apiKey: core.getInput('api-key', { required: true }),
    sourceType,
    agentName: core.getInput('agent-name') || undefined,
    agentVersion: core.getInput('agent-version', { required: true }),
    gitRepository: core.getInput('git-repository') || undefined,
    gitRef: core.getInput('git-ref') || undefined,
    path: core.getInput('path') || undefined,
    setupCommands: setupCommandsRaw
      ? setupCommandsRaw
          .split('\n')
          .map(cmd => cmd.trim())
          .filter(cmd => cmd.length > 0)
      : undefined,
    isPublic: isPublicRaw === 'true',
    apiUrl: core.getInput('api-url') || 'https://api.runloop.ai',
    objectTtlDays: objectTtlDaysRaw ? parseInt(objectTtlDaysRaw, 10) : undefined,
  };

  return inputs;
}

export function validateInputs(inputs: ActionInputs): void {
  // Validate source type
  const validSourceTypes: SourceType[] = ['git', 'tar', 'file'];
  if (!validSourceTypes.includes(inputs.sourceType)) {
    throw new Error(
      `Invalid source-type: ${inputs.sourceType}. Must be one of: ${validSourceTypes.join(', ')}`
    );
  }

  // Validate source-specific inputs
  switch (inputs.sourceType) {
    case 'tar':
    case 'file':
      if (!inputs.path) {
        throw new Error(`path is required when source-type is "${inputs.sourceType}"`);
      }
      validatePath(inputs.path, inputs.sourceType);
      break;

    case 'git':
      // Git source doesn't require explicit repository (uses current repo by default)
      // Validation happens in git-utils.ts
      break;

    default: {
      // Exhaustiveness check - this should never happen
      const exhaustiveCheck: never = inputs.sourceType;
      throw new Error(`Unsupported source-type: ${exhaustiveCheck as string}`);
    }
  }

  // Validate API key format (should not be empty)
  if (!inputs.apiKey || inputs.apiKey.trim().length === 0) {
    throw new Error('api-key cannot be empty');
  }

  // Validate agentVersion format (semver or SHA)
  validateAgentVersion(inputs.agentVersion);

  // Validate objectTtlDays if provided
  if (inputs.objectTtlDays !== undefined) {
    if (isNaN(inputs.objectTtlDays) || inputs.objectTtlDays <= 0) {
      throw new Error('object-ttl-days must be a positive number');
    }
  }
}

function validatePath(inputPath: string, sourceType: SourceType): void {
  // Resolve path relative to workspace
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) {
    throw new Error('GITHUB_WORKSPACE environment variable is not set');
  }

  const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.join(workspace, inputPath);

  // Check if path exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${inputPath} (resolved to: ${absolutePath})`);
  }

  // Validate based on source type
  const stats = fs.statSync(absolutePath);

  if (sourceType === 'file' || sourceType === 'tar') {
    if (!stats.isFile()) {
      throw new Error(`Path must be a file when source-type is "${sourceType}": ${inputPath}`);
    }
  }
}

export function resolvePath(inputPath: string): string {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) {
    throw new Error('GITHUB_WORKSPACE environment variable is not set');
  }

  return path.isAbsolute(inputPath) ? inputPath : path.join(workspace, inputPath);
}

// Semver pattern: major.minor.patch with optional pre-release and build metadata
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

// Git SHA pattern: 7-40 hex characters (short or full SHA)
const SHA_REGEX = /^[a-f0-9]{7,40}$/i;

function validateAgentVersion(version: string): void {
  if (!version || version.trim().length === 0) {
    throw new Error('agent-version cannot be empty');
  }

  const trimmed = version.trim();

  if (!SEMVER_REGEX.test(trimmed) && !SHA_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid agent-version: "${version}". Must be a semver string (e.g., "2.0.65") or a git SHA (7-40 hex characters).`
    );
  }
}
