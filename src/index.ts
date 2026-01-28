#!/usr/bin/env bun

// AgentTrail - Multi-directory Claude Code session viewer

import { homedir } from 'node:os';
import { join } from 'node:path';
import { getConfigPath, loadConfig } from './config';
import { createServer } from './server';

const DEFAULT_PORT = 9847;

function parseArgs(): { port: number; daemon: boolean; init: boolean } {
  const args = process.argv.slice(2);
  let port = 0; // 0 means use config
  let daemon = false;
  let init = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      const portStr = args[++i];
      const parsed = parseInt(portStr, 10);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
        port = parsed;
      }
    } else if (arg === '--daemon' || arg === '-d') {
      daemon = true;
    } else if (arg === '--init') {
      init = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
AgentTrail - Multi-directory Claude Code session viewer

Usage:
  agenttrail [options]
  bunx agenttrail [options]

Options:
  -p, --port <port>  Port to run server on (default: ${DEFAULT_PORT})
  -d, --daemon       Run in background (daemon mode)
  --init             Initialize config with default directory
  -h, --help         Show this help message
  -v, --version      Show version

Config: ${getConfigPath()}
      `);
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log('AgentTrail v1.0.0');
      process.exit(0);
    }
  }

  return { port, daemon, init };
}

async function main() {
  const { port: cliPort, daemon, init } = parseArgs();

  // Load or initialize config
  const config = await loadConfig();

  if (init) {
    console.log(`Config initialized at: ${getConfigPath()}`);
    console.log(`Default directory: ${join(homedir(), '.claude', 'projects')}`);
    return;
  }

  // Use CLI port if provided, otherwise use config port
  const port = cliPort || config.server.port || DEFAULT_PORT;

  const app = createServer();

  if (daemon) {
    console.log(`Starting AgentTrail daemon on port ${port}...`);
  }

  const url = `http://localhost:${port}`;
  const urlLine = `Running at ${url}`.padEnd(36);

  console.log(`
  ╭─────────────────────────────────────────╮
  │                                         │
  │   AgentTrail                            │
  │   Multi-profile session viewer          │
  │                                         │
  │   ${urlLine}  │
  │                                         │
  │   Profiles: ${config.directories.length.toString().padEnd(27)} │
  │                                         │
  ╰─────────────────────────────────────────╯
  `);

  app.listen(port);
}

main().catch(console.error);
