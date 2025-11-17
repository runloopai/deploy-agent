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
exports.createTarGzFromDirectory = createTarGzFromDirectory;
exports.createTarGzFromFile = createTarGzFromFile;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tar = __importStar(require("tar-stream"));
const zlib_1 = require("zlib");
const ignore_1 = __importDefault(require("ignore"));
/**
 * Create a tar.gz archive from a directory, respecting .gitignore files.
 * Returns a Buffer containing the compressed archive.
 */
async function createTarGzFromDirectory(directoryPath) {
    core.info(`Creating tar.gz archive from directory: ${directoryPath}`);
    // Load .gitignore rules
    const ignoreFilter = loadGitignoreRules(directoryPath);
    // Create tar and gzip streams
    const pack = tar.pack();
    const gzip = (0, zlib_1.createGzip)();
    const chunks = [];
    // Collect compressed data
    gzip.on('data', (chunk) => {
        chunks.push(chunk);
    });
    // Pipe tar through gzip
    pack.pipe(gzip);
    // Add files to archive
    await addDirectoryToTar(pack, directoryPath, directoryPath, ignoreFilter);
    // Finalize the archive
    pack.finalize();
    // Wait for compression to complete
    await new Promise((resolve, reject) => {
        gzip.on('end', resolve);
        gzip.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);
    core.info(`Created tar.gz archive (${buffer.length} bytes)`);
    return buffer;
}
/**
 * Recursively add directory contents to tar archive.
 */
async function addDirectoryToTar(pack, basePath, currentPath, ignoreFilter) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        // Check if this path should be ignored
        if (shouldIgnore(relativePath, entry.isDirectory(), ignoreFilter)) {
            core.debug(`Ignoring: ${relativePath}`);
            continue;
        }
        if (entry.isDirectory()) {
            // Recursively add directory contents
            await addDirectoryToTar(pack, basePath, fullPath, ignoreFilter);
        }
        else if (entry.isFile()) {
            // Add file to archive
            const stats = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath);
            // Preserve file permissions
            const mode = stats.mode & 0o777;
            pack.entry({
                name: relativePath,
                size: content.length,
                mode: mode,
                mtime: stats.mtime,
            }, content);
            core.debug(`Added: ${relativePath} (${content.length} bytes, mode: ${mode.toString(8)})`);
        }
    }
}
/**
 * Load .gitignore rules from the directory and its parents.
 */
function loadGitignoreRules(directoryPath) {
    const ig = (0, ignore_1.default)();
    // Always ignore .git directory
    ig.add('.git');
    // Look for .gitignore in the directory
    const gitignorePath = path.join(directoryPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        ig.add(gitignoreContent);
        core.info(`Loaded .gitignore from: ${gitignorePath}`);
        // Log the patterns being used
        const patterns = gitignoreContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        if (patterns.length > 0) {
            core.debug(`Ignore patterns: ${patterns.join(', ')}`);
        }
    }
    else {
        core.info('No .gitignore found, including all files except .git');
    }
    return ig;
}
/**
 * Check if a path should be ignored based on .gitignore rules.
 */
function shouldIgnore(relativePath, isDirectory, ignoreFilter) {
    // Always ignore .git directory
    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
        return true;
    }
    // Check against ignore filter
    // For directories, append '/' to match gitignore semantics
    const pathToCheck = isDirectory ? relativePath + '/' : relativePath;
    return ignoreFilter.ignores(pathToCheck);
}
/**
 * Create a tar.gz archive containing a single file.
 * Used when uploading individual files.
 */
async function createTarGzFromFile(filePath, filename) {
    const actualFilename = filename || path.basename(filePath);
    core.info(`Creating tar.gz archive from file: ${filePath} (as ${actualFilename})`);
    const pack = tar.pack();
    const gzip = (0, zlib_1.createGzip)();
    const chunks = [];
    gzip.on('data', (chunk) => {
        chunks.push(chunk);
    });
    pack.pipe(gzip);
    // Read file and add to archive
    const content = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    const mode = stats.mode & 0o777;
    pack.entry({
        name: actualFilename,
        size: content.length,
        mode: mode,
        mtime: stats.mtime,
    }, content);
    pack.finalize();
    await new Promise((resolve, reject) => {
        gzip.on('end', resolve);
        gzip.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);
    core.info(`Created tar.gz archive (${buffer.length} bytes)`);
    return buffer;
}
