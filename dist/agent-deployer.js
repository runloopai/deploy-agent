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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployAgent = deployAgent;
const core = __importStar(require("@actions/core"));
const api_client_1 = __importDefault(require("@runloop/api-client"));
const git_utils_1 = require("./git-utils");
const object_uploader_1 = require("./object-uploader");
const validators_1 = require("./validators");
/**
 * Deploy an agent to Runloop based on the source type.
 */
async function deployAgent(inputs) {
    // Initialize Runloop client
    const client = new api_client_1.default({
        bearerToken: inputs.apiKey,
        baseURL: inputs.apiUrl,
    });
    // Determine agent name (use input or default to repo name)
    const agentName = inputs.agentName || (0, git_utils_1.getDefaultAgentName)();
    core.info(`Agent name: ${agentName}`);
    // Deploy based on source type
    let result;
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
            const exhaustiveCheck = inputs.sourceType;
            throw new Error(`Unsupported source type: ${exhaustiveCheck}`);
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
async function deployGitAgent(client, agentName, inputs) {
    core.info('Deploying Git agent...');
    // Get Git context (auto-detect or use overrides)
    const gitContext = (0, git_utils_1.getGitContext)(inputs.gitRepository, inputs.gitRef);
    (0, git_utils_1.validateGitRepository)(gitContext.repository);
    // Create agent with Git source
    const agent = await client.post('/v1/agents', {
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
async function deployTarAgent(client, agentName, inputs) {
    core.info('Deploying tar agent...');
    if (!inputs.path) {
        throw new Error('path is required for tar agent deployment');
    }
    const tarPath = (0, validators_1.resolvePath)(inputs.path);
    // Upload tar file
    const uploadResult = await (0, object_uploader_1.uploadTarFile)(client, tarPath, inputs.objectTtlDays);
    // Create agent with object source
    const agent = await client.post('/v1/agents', {
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
async function deployFileAgent(client, agentName, inputs) {
    core.info('Deploying file agent...');
    if (!inputs.path) {
        throw new Error('path is required for file agent deployment');
    }
    const filePath = (0, validators_1.resolvePath)(inputs.path);
    // Upload single file
    const uploadResult = await (0, object_uploader_1.uploadSingleFile)(client, filePath, inputs.objectTtlDays);
    // Create agent with object source
    const agent = await client.post('/v1/agents', {
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
