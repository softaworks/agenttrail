// Configuration management for AgentTrail

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type DirectoryType = 'claude' | 'codex';

export interface DirectoryConfig {
  path: string;
  label: string;
  color: string;
  enabled: boolean;
  type?: DirectoryType;
}

export interface AgentTrailConfig {
  directories: DirectoryConfig[];
  pins: string[];
  customTags: Record<string, string[]>;
  server: {
    port: number;
  };
}

const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'agenttrail', 'config.json');
const DEFAULT_CLAUDE_DIR = join(homedir(), '.claude', 'projects');

const DEFAULT_CONFIG: AgentTrailConfig = {
  directories: [
    {
      path: DEFAULT_CLAUDE_DIR,
      label: 'Default',
      color: '#7c3aed',
      enabled: true,
      type: 'claude',
    },
  ],
  pins: [],
  customTags: {},
  server: {
    port: 9847,
  },
};

let cachedConfig: AgentTrailConfig | null = null;

export function getConfigPath(): string {
  return process.env.AGENTTRAIL_CONFIG || DEFAULT_CONFIG_PATH;
}

export async function loadConfig(): Promise<AgentTrailConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    await initConfig();
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as AgentTrailConfig;

    // Merge with defaults to ensure all fields exist
    cachedConfig = {
      directories: (config.directories || DEFAULT_CONFIG.directories).map((dir) => ({
        ...dir,
        type: dir.type === 'codex' ? 'codex' : 'claude',
      })),
      pins: config.pins || DEFAULT_CONFIG.pins,
      customTags: config.customTags || DEFAULT_CONFIG.customTags,
      server: {
        port: config.server?.port || DEFAULT_CONFIG.server.port,
      },
    };

    return cachedConfig;
  } catch (error) {
    console.error('Error loading config, using defaults:', error);
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export async function saveConfig(config: AgentTrailConfig): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  cachedConfig = config;
}

export async function initConfig(): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  if (!existsSync(configPath)) {
    await saveConfig(DEFAULT_CONFIG);
  }
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

// Pin management
export async function addPin(sessionId: string): Promise<void> {
  const config = await loadConfig();

  if (!config.pins.includes(sessionId)) {
    config.pins.push(sessionId);
    await saveConfig(config);
  }
}

export async function removePin(sessionId: string): Promise<void> {
  const config = await loadConfig();

  config.pins = config.pins.filter((id) => id !== sessionId);
  await saveConfig(config);
}

export async function isPinned(sessionId: string): Promise<boolean> {
  const config = await loadConfig();
  return config.pins.includes(sessionId);
}

// Custom tag management
export async function addCustomTags(sessionId: string, tags: string[]): Promise<void> {
  const config = await loadConfig();

  const existingTags = config.customTags[sessionId] || [];
  const newTags = [...new Set([...existingTags, ...tags])];

  config.customTags[sessionId] = newTags;
  await saveConfig(config);
}

export async function removeCustomTag(sessionId: string, tag: string): Promise<void> {
  const config = await loadConfig();

  if (config.customTags[sessionId]) {
    config.customTags[sessionId] = config.customTags[sessionId].filter((t) => t !== tag);

    if (config.customTags[sessionId].length === 0) {
      delete config.customTags[sessionId];
    }

    await saveConfig(config);
  }
}

export async function getCustomTags(sessionId: string): Promise<string[]> {
  const config = await loadConfig();
  return config.customTags[sessionId] || [];
}

// Synchronous helpers for use with already-loaded config
export function getCustomTagsSync(config: AgentTrailConfig, sessionId: string): string[] {
  return config.customTags[sessionId] || [];
}

export function isPinnedSync(config: AgentTrailConfig, sessionId: string): boolean {
  return config.pins.includes(sessionId);
}

// Profile management (stored as directories in config for backward compat)
export async function addDirectory(dir: DirectoryConfig): Promise<void> {
  const config = await loadConfig();

  // Check if directory already exists
  const exists = config.directories.some((d) => d.path === dir.path);
  if (exists) {
    throw new Error(`Profile already configured: ${dir.path}`);
  }

  config.directories.push({
    ...dir,
    type: dir.type === 'codex' ? 'codex' : 'claude',
  });
  await saveConfig(config);
}

export async function updateDirectory(
  path: string,
  updates: Partial<DirectoryConfig>,
): Promise<void> {
  const config = await loadConfig();

  const index = config.directories.findIndex((d) => d.path === path);
  if (index === -1) {
    throw new Error(`Profile not found: ${path}`);
  }

  const normalizedUpdates: Partial<DirectoryConfig> = updates.type
    ? { ...updates, type: updates.type === 'codex' ? 'codex' : 'claude' }
    : updates;
  config.directories[index] = { ...config.directories[index], ...normalizedUpdates };
  await saveConfig(config);
}

export async function removeDirectory(path: string): Promise<void> {
  const config = await loadConfig();

  config.directories = config.directories.filter((d) => d.path !== path);
  await saveConfig(config);
}

export async function getEnabledDirectories(): Promise<DirectoryConfig[]> {
  const config = await loadConfig();
  return config.directories.filter((d) => d.enabled);
}
