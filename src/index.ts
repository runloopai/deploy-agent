import * as core from '@actions/core';
import { getInputs, validateInputs } from './validators';
import { deployAgent } from './agent-deployer';

/**
 * Main entry point for the GitHub Action.
 */
async function run(): Promise<void> {
  try {
    core.info('🚀 Starting Runloop Agent Deployment');
    core.info('');

    // Get and validate inputs
    core.info('📋 Reading inputs...');
    const inputs = getInputs();

    core.info(`Source Type: ${inputs.sourceType}`);
    core.info(`API URL: ${inputs.apiUrl}`);
    core.info(`Public Agent: ${inputs.isPublic}`);
    if (inputs.agentName) {
      core.info(`Agent Name: ${inputs.agentName}`);
    }
    core.info('');

    // Validate inputs
    core.info('✓ Validating inputs...');
    validateInputs(inputs);
    core.info('✓ Inputs validated');
    core.info('');

    // Deploy agent
    core.info('🔧 Deploying agent...');
    const result = await deployAgent(inputs);
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
    core.info(
      `🔗 View your agent at: ${inputs.apiUrl.replace('/v1', '')}/agents/${result.agentId}`
    );
  } catch (error) {
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
      } else if (error.message.includes('not found') || error.message.includes('404')) {
        core.error('');
        core.error('💡 Hint: Check that the resource exists and the API URL is correct.');
      } else if (error.message.includes('GITHUB_REPOSITORY')) {
        core.error('');
        core.error('💡 Hint: This action must run in a GitHub Actions workflow context.');
      }

      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

// Run the action
void run();
