# Deploy Agent to Runloop

A GitHub Action to deploy agents to the [Runloop](https://runloop.ai) platform. Supports multiple source types including Git repositories and file uploads.

## Features

- **Zero-config Git deployments** - Automatically deploys your current repository
- **Release tag support** - Deploys specific versions when releases are published
- **Multiple source types** - Git repositories, tar archives, single files, NPM packages, and PyPI packages
- **Flexible packaging** - Create tar archives however you want in your workflow
- **Setup commands** - Run custom setup commands after agent installation
- **Custom skills** - Attach custom skill definitions (YAML or JSON) to agents
- **Public/private agents** - Control agent visibility
- **TTL support** - Set expiration time for uploaded objects

## Quick Start

### Deploy Current Repository as an Agent

```yaml
- name: Deploy agent
  uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: git
    agent-version: 1.0.0
```

That's it! The action will automatically use your current repository and commit SHA.

## Usage

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | ✅ | | Runloop API key (store in secrets) |
| `source-type` | ✅ | | Agent source type: `git`, `tar`, `file`, `npm`, or `pip` |
| `agent-version` | ✅ | | Agent version (semver string like `2.0.65` or git SHA) |
| `agent-name` | | repo name | Name for the agent (defaults to repository name) |
| `git-repository` | | current repo | Git repository URL (auto-detected) |
| `git-ref` | | current commit/tag | Git ref (branch/tag/commit SHA, auto-detected) |
| `npm-package` | | | NPM package name (required for `npm`, e.g., `@anthropic-ai/claude-code`) |
| `npm-registry-url` | | | NPM registry URL (defaults to public npm registry) |
| `pip-package` | | | PyPI package name (required for `pip`, e.g., `deepagents-cli`) |
| `pip-index-url` | | | PyPI index URL (defaults to public PyPI) |
| `path` | | | Path to tar archive or single file (required for `tar`/`file`) |
| `custom-skill` | | | Custom skill definition in YAML (or JSON) to attach to the agent |
| `setup-commands` | | | Newline-separated setup commands to run after installation |
| `is-public` | | `false` | Whether the agent should be publicly accessible |
| `api-url` | | `https://api.runloop.ai` | Runloop API URL |
| `object-ttl-days` | | | Time-to-live for uploaded objects in days |

### Outputs

| Output | Description |
|--------|-------------|
| `agent-id` | The ID of the created agent (e.g., `agt_xxxx`) |
| `agent-name` | The name of the created agent |
| `object-id` | The ID of the uploaded object (if applicable, e.g., `obj_xxxx`) |

## Examples

💡 **See the [`examples/`](./examples) directory for complete, ready-to-use workflow files!**

### Git Source (Auto-detect)

```yaml
- uses: actions/checkout@v4
- uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: git
    agent-version: 1.0.0
    setup-commands: |
      chmod +x scripts/agent.sh
      npm install
```

### Git Source (On Release)

```yaml
on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: runloopai/deploy-agent@main
        with:
          api-key: ${{ secrets.RUNLOOP_API_KEY }}
          source-type: git
          agent-version: ${{ github.event.release.tag_name }}
          agent-name: my-agent-${{ github.event.release.tag_name }}
```

### Tar Archive (with custom packaging)

📋 **See [`examples/tar-agent.yml`](./examples/tar-agent.yml) for complete workflow examples with tar creation!**

Basic example:

```yaml
# Create your own tar.gz archive first
- name: Create agent archive
  run: |
    tar -czf agent.tar.gz -C ./agent-code .

# Then deploy it
- name: Deploy agent
  uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: tar
    agent-version: 1.0.0
    path: agent.tar.gz
    object-ttl-days: 30
```

You can also use `.tar` format or reference output from a previous step:

```yaml
- name: Build and package
  id: build
  run: |
    # Your custom build process
    make package
    echo "archive-path=dist/my-agent.tar.gz" >> $GITHUB_OUTPUT

- uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: tar
    agent-version: 1.0.0
    path: ${{ steps.build.outputs.archive-path }}
```

### Single File

```yaml
- uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: file
    agent-version: 1.0.0
    path: ./scripts/agent.sh
```

### NPM Package

```yaml
- uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: npm
    agent-version: 1.0.0
    npm-package: "@anthropic-ai/claude-code"
```

### NPM Package with Custom Skill

The `custom-skill` input accepts a YAML (or JSON) definition:

```yaml
- uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: npm
    agent-version: 1.0.0
    npm-package: "@anthropic-ai/claude-code"
    custom-skill: |
      name: my-skill
      description: A custom skill for the agent
      instructions: >-
        Detailed instructions for how the agent
        should use this skill.
```

### PyPI Package

```yaml
- uses: runloopai/deploy-agent@main
  with:
    api-key: ${{ secrets.RUNLOOP_API_KEY }}
    source-type: pip
    agent-version: 1.0.0
    pip-package: deepagents-cli
```

## Authentication

Store your Runloop API key as a GitHub secret:

1. Go to Settings → Secrets and variables → Actions
2. Create a new secret named `RUNLOOP_API_KEY`
3. Paste your Runloop API key
4. Reference it: `api-key: ${{ secrets.RUNLOOP_API_KEY }}`

## Documentation

- 💡 [Example Workflows](./examples)
- 🌐 [Runloop Docs](https://docs.runloop.ai)

## Development

### Setup

```bash
pnpm install
```

### Testing with act

You can test the action locally using [act](https://github.com/nektos/act):

```bash
act -j deploy --secret RUNLOOP_API_KEY=your_api_key
```

### Building

The action uses [@vercel/ncc](https://github.com/vercel/ncc) to bundle all dependencies into a single file.

```bash
pnpm run build        # Bundle with ncc (creates dist/index.js)
pnpm run rebuild      # Clean and build
```

After building, commit the `dist/` folder as it's required for the action to run.

### Code Quality

```bash
pnpm run lint         # Check for lint issues
pnpm run lint:fix     # Auto-fix lint issues
pnpm run format       # Format code with Prettier
pnpm run format:check # Check formatting
pnpm run typecheck    # Run TypeScript type checking
pnpm run check        # Run all checks (format + lint + typecheck)
```

## License

MIT
