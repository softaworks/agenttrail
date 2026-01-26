import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createServer } from '../../src/server';
import { cleanupTestEnvironment, createTestEnvironment, type TestEnvironment } from '../helpers/test-env';

describe('config API', () => {
  const app = createServer();
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await createTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment(env);
    delete process.env.AGENTTRAIL_CONFIG;
  });

  it('GET /api/config returns config and path', async () => {
    const res = await app.handle(new Request('http://localhost/api/config'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config).toBeDefined();
    expect(data.configPath).toBeDefined();
  });

  it('PUT /api/config validates schema', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: true }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.handle(new Request('http://localhost/api/does-not-exist'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
