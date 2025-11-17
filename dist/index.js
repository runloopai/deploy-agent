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
const core = __importStar(require("@actions/core"));
const validators_1 = require("./validators");
const agent_deployer_1 = require("./agent-deployer");
/**
 * Main entry point for the GitHub Action.
 */
async function run() {
    try {
        core.info('🚀 Starting Runloop Agent Deployment');
        core.info('');
        // Get and validate inputs
        core.info('📋 Reading inputs...');
        const inputs = (0, validators_1.getInputs)();
        core.info(`Source Type: ${inputs.sourceType}`);
        core.info(`API URL: ${inputs.apiUrl}`);
        core.info(`Public Agent: ${inputs.isPublic}`);
        if (inputs.agentName) {
            core.info(`Agent Name: ${inputs.agentName}`);
        }
        core.info('');
        // Validate inputs
        core.info('✓ Validating inputs...');
        (0, validators_1.validateInputs)(inputs);
        core.info('✓ Inputs validated');
        core.info('');
        // Deploy agent
        core.info('🔧 Deploying agent...');
        const result = await (0, agent_deployer_1.deployAgent)(inputs);
        core.info('');
        // Set outputs
        core.info('📤 Setting outputs...');
        core.setOutput('agent-id', result.agentId);
        core.setOutput('agent-name', result.agentName);
        if (result.objectId) {
            core.setOutput('object-id', result.objectId);
        }
        core.info('');
        core.info('✅ Deployment completed successfully!');
        core.info('');
        core.info('📊 Results:');
        core.info(`  🆔 Agent ID: ${result.agentId}`);
        core.info(`  📝 Agent Name: ${result.agentName}`);
        if (result.objectId) {
            core.info(`  📦 Object ID: ${result.objectId}`);
        }
        core.info('');
        core.info(`🔗 View your agent at: ${inputs.apiUrl.replace('/v1', '')}/agents/${result.agentId}`);
    }
    catch (error) {
        // Handle errors
        if (error instanceof Error) {
            core.error('❌ Deployment failed');
            core.error('');
            core.error(`Error: ${error.message}`);
            // Add debug information
            if (error.stack) {
                core.debug('Stack trace:');
                core.debug(error.stack);
            }
            // Check for common error types and provide helpful messages
            if (error.message.includes('authentication') || error.message.includes('401')) {
                core.error('');
                core.error('💡 Hint: Check that your api-key is correct and has proper permissions.');
            }
            else if (error.message.includes('not found') || error.message.includes('404')) {
                core.error('');
                core.error('💡 Hint: Check that the resource exists and the API URL is correct.');
            }
            else if (error.message.includes('GITHUB_REPOSITORY')) {
                core.error('');
                core.error('💡 Hint: This action must run in a GitHub Actions workflow context.');
            }
            core.setFailed(error.message);
        }
        else {
            core.setFailed('An unknown error occurred');
        }
    }
}
// Run the action
void run();
