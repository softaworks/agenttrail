import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  discoverSessions,
  getDirectoryList,
  getProjectList,
  getTagCounts,
  searchSessions,
} from '../../src/sessions';
import { cleanupTestEnvironment, createTestEnvironment, createTestSession, type TestEnvironment } from '../helpers/test-env';
import { simpleSessionMessages, sessionWithTools } from '../fixtures/messages';

describe('sessions', () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await createTestEnvironment();
    await createTestSession(env.sessionsDir, 'project-a', 'session-1', simpleSessionMessages);
    await createTestSession(env.sessionsDir, 'project-a', 'session-2', simpleSessionMessages);
    await createTestSession(env.sessionsDir, 'project-b', 'session-3', sessionWithTools);
  });

  afterEach(async () => {
    await cleanupTestEnvironment(env);
    delete process.env.AGENTTRAIL_CONFIG;
  });

  it('groups sessions into chains by title in same directory', async () => {
    const sessions = await discoverSessions();
    const chained = sessions.filter((s) => s.chainId);
    expect(chained.length).toBeGreaterThan(0);
    const chain = chained[0];
    expect(chain.chainLength).toBeGreaterThan(1);
    expect(chain.chainIndex).toBeDefined();
  });

  it('skips sidechain sessions', async () => {
    await createTestSession(env.sessionsDir, 'project-c', 'sidechain-1', [
      { isSidechain: true, type: 'user', message: { content: [{ type: 'text', text: 'skip' }] } },
    ]);

    const sessions = await discoverSessions();
    expect(sessions.find((s) => s.id === 'sidechain-1')).toBeUndefined();
  });

  it('builds project list and directory list', async () => {
    const projects = await getProjectList();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.some((p) => p.name === 'project-a')).toBe(true);

    const directories = await getDirectoryList();
    expect(directories.length).toBeGreaterThan(0);
    expect(directories[0]?.count).toBeGreaterThan(0);
  });

  it('aggregates tag counts', async () => {
    const tags = await getTagCounts();
    expect(Object.keys(tags).length).toBeGreaterThan(0);
  });

  it('deep search finds content in messages', async () => {
    const results = await searchSessions('Creating file', 'deep');
    expect(results.length).toBeGreaterThan(0);
  });
});
