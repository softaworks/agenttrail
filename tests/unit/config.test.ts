import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addCustomTags,
  addDirectory,
  addPin,
  getCustomTags,
  loadConfig,
  removeCustomTag,
  removeDirectory,
  removePin,
  saveConfig,
  updateDirectory,
} from '../../src/config';
import { cleanupTestEnvironment, createTestEnvironment, type TestEnvironment } from '../helpers/test-env';

describe('config', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await createTestEnvironment();
  });

  afterEach(async () => {
    await cleanupTestEnvironment(env);
    delete process.env.AGENTTRAIL_CONFIG;
  });

  it('loads config from test path', async () => {
    const config = await loadConfig();
    expect(config.directories).toHaveLength(1);
    expect(config.server.port).toBe(9847);
  });

  it('adds and removes directories', async () => {
    await addDirectory({
      path: '/tmp/new',
      label: 'New',
      color: '#fff',
      enabled: true,
    });

    let config = await loadConfig();
    expect(config.directories).toHaveLength(2);

    await expect(
      addDirectory({ path: '/tmp/new', label: 'New', color: '#fff', enabled: true }),
    ).rejects.toThrow();

    await updateDirectory('/tmp/new', { label: 'Updated' });
    config = await loadConfig();
    expect(config.directories.find((d) => d.path === '/tmp/new')?.label).toBe('Updated');

    await removeDirectory('/tmp/new');
    config = await loadConfig();
    expect(config.directories.find((d) => d.path === '/tmp/new')).toBeUndefined();

    await expect(updateDirectory('/tmp/missing', { label: 'Missing' })).rejects.toThrow();
  });

  it('adds and removes pins', async () => {
    await addPin('session-1');
    let config = await loadConfig();
    expect(config.pins).toContain('session-1');

    await removePin('session-1');
    config = await loadConfig();
    expect(config.pins).not.toContain('session-1');
  });

  it('manages custom tags', async () => {
    await addCustomTags('session-1', ['important', 'review']);
    let tags = await getCustomTags('session-1');
    expect(tags).toContain('important');

    await removeCustomTag('session-1', 'important');
    tags = await getCustomTags('session-1');
    expect(tags).not.toContain('important');
  });

  it('falls back to default config on invalid JSON', async () => {
    const badPath = join(env.rootDir, 'bad-config.json');
    await writeFile(badPath, '{invalid json', 'utf-8');
    process.env.AGENTTRAIL_CONFIG = badPath;
    const config = await loadConfig();
    expect(config.directories.length).toBeGreaterThan(0);
  });

  it('removeCustomTag is safe on missing tags', async () => {
    await removeCustomTag('missing-session', 'tag');
    const tags = await getCustomTags('missing-session');
    expect(tags).toEqual([]);
  });

  it('saveConfig writes file and can be reloaded', async () => {
    const config = await loadConfig();
    config.server.port = 9999;
    await saveConfig(config);
    const reloaded = await loadConfig();
    expect(reloaded.server.port).toBe(9999);
  });
});
