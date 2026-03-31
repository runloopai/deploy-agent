import * as core from '@actions/core';
import { RunloopSDK } from '@runloop/api-client';
import { ActionInputs } from './validators';
import { getGitContext, validateGitRepository, getDefaultAgentName } from './git-utils';
import { uploadTarFile, uploadSingleFile } from './object-uploader';
import { resolvePath } from './validators';

export interface DeploymentResult {
  agentId: string;
  agentName: string;
  objectId?: string;
}

interface AgentResponse {
  id: string;
  name: string;
}

/**
 * Deploy an agent to Runloop based on the source type.
 */
export async function deployAgent(inputs: ActionInputs): Promise<DeploymentResult> {
  // Initialize Runloop client
  const client = new RunloopSDK({
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

    case 'npm':
      result = await deployNpmAgent(client, agentName, inputs);
      break;

    case 'pip':
      result = await deployPipAgent(client, agentName, inputs);
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
  client: RunloopSDK,
  agentName: string,
  inputs: ActionInputs
): Promise<DeploymentResult> {
  core.info('Deploying Git agent...');

  // Get Git context (auto-detect or use overrides)
  const gitContext = getGitContext(inputs.gitRepository, inputs.gitRef);
  validateGitRepository(gitContext.repository);

  // Create agent with Git source
  // Using client.api.post because SDK v1.0.0 types are missing 'version' field in AgentCreateParams
  const agent = await client.api.post<unknown, AgentResponse>('/v1/agents', {
    body: {
      name: agentName,
      version: inputs.agentVersion,
      is_public: inputs.isPublic,
      ...(inputs.architecture && { architecture: inputs.architecture }),
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
  client: RunloopSDK,
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
  // Using client.api.post because SDK v1.0.0 types are missing 'version' field in AgentCreateParams
  const agent = await client.api.post<unknown, AgentResponse>('/v1/agents', {
    body: {
      name: agentName,
      version: inputs.agentVersion,
      is_public: inputs.isPublic,
      ...(inputs.architecture && { architecture: inputs.architecture }),
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
  client: RunloopSDK,
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
  // Using client.api.post because SDK v1.0.0 types are missing 'version' field in AgentCreateParams
  const agent = await client.api.post<unknown, AgentResponse>('/v1/agents', {
    body: {
      name: agentName,
      version: inputs.agentVersion,
      is_public: inputs.isPublic,
      ...(inputs.architecture && { architecture: inputs.architecture }),
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
 * Deploy an agent from an NPM package.
 */
async function deployNpmAgent(
  client: RunloopSDK,
  agentName: string,
  inputs: ActionInputs
): Promise<DeploymentResult> {
  core.info('Deploying NPM agent...');

  if (!inputs.npmPackage) {
    throw new Error('npm-package is required for npm agent deployment');
  }

  const npmSource: Record<string, unknown> = {
    package_name: inputs.npmPackage,
  };
  if (inputs.npmRegistryUrl) {
    npmSource.registry_url = inputs.npmRegistryUrl;
  }
  if (inputs.setupCommands && inputs.setupCommands.length > 0) {
    npmSource.agent_setup = inputs.setupCommands;
  }

  const agent = await client.api.post<unknown, AgentResponse>('/v1/agents', {
    body: {
      name: agentName,
      version: inputs.agentVersion,
      is_public: inputs.isPublic,
      ...(inputs.architecture && { architecture: inputs.architecture }),
      source: {
        type: 'npm',
        npm: npmSource,
      },
    },
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
  };
}

/**
 * Deploy an agent from a PyPI package.
 */
async function deployPipAgent(
  client: RunloopSDK,
  agentName: string,
  inputs: ActionInputs
): Promise<DeploymentResult> {
  core.info('Deploying pip agent...');

  if (!inputs.pipPackage) {
    throw new Error('pip-package is required for pip agent deployment');
  }

  const pipSource: Record<string, unknown> = {
    package_name: inputs.pipPackage,
  };
  if (inputs.pipIndexUrl) {
    pipSource.index_url = inputs.pipIndexUrl;
  }
  if (inputs.setupCommands && inputs.setupCommands.length > 0) {
    pipSource.agent_setup = inputs.setupCommands;
  }

  const agent = await client.api.post<unknown, AgentResponse>('/v1/agents', {
    body: {
      name: agentName,
      version: inputs.agentVersion,
      is_public: inputs.isPublic,
      ...(inputs.architecture && { architecture: inputs.architecture }),
      source: {
        type: 'pip',
        pip: pipSource,
      },
    },
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
  };
}
