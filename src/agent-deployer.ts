import * as core from '@actions/core';
import Runloop from '@runloop/api-client';
import { ActionInputs } from './validators';
import { getGitContext, validateGitRepository, getDefaultAgentName } from './git-utils';
import { uploadTarFile, uploadSingleFile } from './object-uploader';
import { resolvePath } from './validators';

// Type definitions for Agent API (since not in SDK yet)
interface GitSource {
  type: 'git';
  git: {
    repository: string;
    ref: string;
    agent_setup: string[];
  };
}

interface ObjectSource {
  type: 'object';
  object: {
    object_id: string;
    agent_setup: string[];
  };
}

type AgentSource = GitSource | ObjectSource;

interface AgentView {
  id: string;
  name: string;
  is_public: boolean;
  source: AgentSource;
}

export interface DeploymentResult {
  agentId: string;
  agentName: string;
  objectId?: string;
}

/**
 * Deploy an agent to Runloop based on the source type.
 */
export async function deployAgent(inputs: ActionInputs): Promise<DeploymentResult> {
  // Initialize Runloop client
  const client = new Runloop({
    bearerToken: inputs.apiKey,
    baseURL: inputs.apiUrl,
  });

  // Determine agent name (use input or default to repo name)
  const agentName = inputs.agentName || getDefaultAgentName();
  core.info(`Agent name: ${agentName}`);

  // Deploy based on source type
  let result: DeploymentResult;

  switch (inputs.sourceType) {
    case 'git':
      result = await deployGitAgent(client, agentName, inputs);
      break;

    case 'tar':
      result = await deployTarAgent(client, agentName, inputs);
      break;

    case 'file':
      result = await deployFileAgent(client, agentName, inputs);
      break;

    default: {
      // Exhaustiveness check - this should never happen
      const exhaustiveCheck: never = inputs.sourceType;
      throw new Error(`Unsupported source type: ${exhaustiveCheck as string}`);
    }
  }

  core.info(`✓ Agent deployed successfully!`);
  core.info(`  Agent ID: ${result.agentId}`);
  core.info(`  Agent Name: ${result.agentName}`);
  if (result.objectId) {
    core.info(`  Object ID: ${result.objectId}`);
  }

  return result;
}

/**
 * Deploy an agent from a Git repository.
 */
async function deployGitAgent(
  client: Runloop,
  agentName: string,
  inputs: ActionInputs
): Promise<DeploymentResult> {
  core.info('Deploying Git agent...');

  // Get Git context (auto-detect or use overrides)
  const gitContext = getGitContext(inputs.gitRepository, inputs.gitRef);
  validateGitRepository(gitContext.repository);

  // Create agent with Git source
  const agent: AgentView = await client.post('/v1/agents', {
    body: {
      name: agentName,
      is_public: inputs.isPublic,
      source: {
        type: 'git',
        git: {
          repository: gitContext.repository,
          ref: gitContext.ref,
          agent_setup: inputs.setupCommands || [],
        },
      },
    },
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
  };
}

/**
 * Deploy an agent from a tar file.
 */
async function deployTarAgent(
  client: Runloop,
  agentName: string,
  inputs: ActionInputs
): Promise<DeploymentResult> {
  core.info('Deploying tar agent...');

  if (!inputs.path) {
    throw new Error('path is required for tar agent deployment');
  }

  const tarPath = resolvePath(inputs.path);

  // Upload tar file
  const uploadResult = await uploadTarFile(client, tarPath, inputs.objectTtlDays);

  // Create agent with object source
  const agent: AgentView = await client.post('/v1/agents', {
    body: {
      name: agentName,
      is_public: inputs.isPublic,
      source: {
        type: 'object',
        object: {
          object_id: uploadResult.objectId,
          agent_setup: inputs.setupCommands || [],
        },
      },
    },
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
    objectId: uploadResult.objectId,
  };
}

/**
 * Deploy an agent from a single file.
 */
async function deployFileAgent(
  client: Runloop,
  agentName: string,
  inputs: ActionInputs
): Promise<DeploymentResult> {
  core.info('Deploying file agent...');

  if (!inputs.path) {
    throw new Error('path is required for file agent deployment');
  }

  const filePath = resolvePath(inputs.path);

  // Upload single file
  const uploadResult = await uploadSingleFile(client, filePath, inputs.objectTtlDays);

  // Create agent with object source
  const agent: AgentView = await client.post('/v1/agents', {
    body: {
      name: agentName,
      is_public: inputs.isPublic,
      source: {
        type: 'object',
        object: {
          object_id: uploadResult.objectId,
          agent_setup: inputs.setupCommands || [],
        },
      },
    },
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
    objectId: uploadResult.objectId,
  };
}
