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
  x86_64Path?: string;
  arm64Path?: string;
  npmPackage?: string;
  npmRegistryUrl?: string;
  pipPackage?: string;
  pipIndexUrl?: string;
  setupCommands?: string[];
  isPublic: boolean;
  apiUrl: string;
  objectTtlDays?: number;
}

export type SourceType = 'git' | 'tar' | 'file' | 'npm' | 'pip';

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
    x86_64Path: core.getInput('x86-64-path') || undefined,
    arm64Path: core.getInput('arm64-path') || undefined,
    npmPackage: core.getInput('npm-package') || undefined,
    npmRegistryUrl: core.getInput('npm-registry-url') || undefined,
    pipPackage: core.getInput('pip-package') || undefined,
    pipIndexUrl: core.getInput('pip-index-url') || undefined,
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
  const validSourceTypes: SourceType[] = ['git', 'tar', 'file', 'npm', 'pip'];
  if (!validSourceTypes.includes(inputs.sourceType)) {
    throw new Error(
      `Invalid source-type: ${inputs.sourceType}. Must be one of: ${validSourceTypes.join(', ')}`
    );
  }

  // Validate source-specific inputs
  switch (inputs.sourceType) {
    case 'tar':
      // For tar, at least one of path, x86-64-path, or arm64-path must be provided
      if (!inputs.path && !inputs.x86_64Path && !inputs.arm64Path) {
        throw new Error(
          'At least one of path, x86-64-path, or arm64-path is required when source-type is "tar"'
        );
      }
      if (inputs.path) {
        validatePath(inputs.path, inputs.sourceType);
      }
      if (inputs.x86_64Path) {
        validatePath(inputs.x86_64Path, inputs.sourceType);
      }
      if (inputs.arm64Path) {
        validatePath(inputs.arm64Path, inputs.sourceType);
      }
      break;

    case 'file':
      if (!inputs.path && !inputs.x86_64Path && !inputs.arm64Path) {
        throw new Error(
          'At least one of path, x86-64-path, or arm64-path is required when source-type is "file"'
        );
      }
      if (inputs.path) {
        validatePath(inputs.path, inputs.sourceType);
      }
      if (inputs.x86_64Path) {
        validatePath(inputs.x86_64Path, inputs.sourceType);
      }
      if (inputs.arm64Path) {
        validatePath(inputs.arm64Path, inputs.sourceType);
      }
      break;

    case 'git':
      // Git source doesn't require explicit repository (uses current repo by default)
      // Validation happens in git-utils.ts
      break;

    case 'npm':
      if (!inputs.npmPackage) {
        throw new Error('npm-package is required when source-type is "npm"');
      }
      break;

    case 'pip':
      if (!inputs.pipPackage) {
        throw new Error('pip-package is required when source-type is "pip"');
      }
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
  if (sourceType !== 'file' && sourceType !== 'tar') {
    throw new Error(`validatePath is undefined when source-type is "${sourceType}": ${inputPath}`);
  }

  const absolutePath = resolvePath(inputPath);

  // Check if path exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${inputPath} (resolved to: ${absolutePath})`);
  }

  // Validate based on source type
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) {
    throw new Error(`Path must be a file when source-type is "${sourceType}": ${inputPath}`);
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
