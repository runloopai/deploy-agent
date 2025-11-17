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
exports.getInputs = getInputs;
exports.validateInputs = validateInputs;
exports.resolvePath = resolvePath;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function getInputs() {
    // Get all inputs
    const sourceType = core.getInput('source-type', { required: true });
    const setupCommandsRaw = core.getInput('setup-commands');
    const isPublicRaw = core.getInput('is-public') || 'false';
    const objectTtlDaysRaw = core.getInput('object-ttl-days');
    const inputs = {
        apiKey: core.getInput('api-key', { required: true }),
        sourceType,
        agentName: core.getInput('agent-name') || undefined,
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
function validateInputs(inputs) {
    // Validate source type
    const validSourceTypes = ['git', 'tar', 'file'];
    if (!validSourceTypes.includes(inputs.sourceType)) {
        throw new Error(`Invalid source-type: ${inputs.sourceType}. Must be one of: ${validSourceTypes.join(', ')}`);
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
            const exhaustiveCheck = inputs.sourceType;
            throw new Error(`Unsupported source-type: ${exhaustiveCheck}`);
        }
    }
    // Validate API key format (should not be empty)
    if (!inputs.apiKey || inputs.apiKey.trim().length === 0) {
        throw new Error('api-key cannot be empty');
    }
    // Validate objectTtlDays if provided
    if (inputs.objectTtlDays !== undefined) {
        if (isNaN(inputs.objectTtlDays) || inputs.objectTtlDays <= 0) {
            throw new Error('object-ttl-days must be a positive number');
        }
    }
}
function validatePath(inputPath, sourceType) {
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
function resolvePath(inputPath) {
    const workspace = process.env.GITHUB_WORKSPACE;
    if (!workspace) {
        throw new Error('GITHUB_WORKSPACE environment variable is not set');
    }
    return path.isAbsolute(inputPath) ? inputPath : path.join(workspace, inputPath);
}
