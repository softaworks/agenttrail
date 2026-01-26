import { describe, expect, it } from 'bun:test';
import {
  determineSessionStatus,
  extractFirstUserMessage,
  generateSessionSummary,
  parseSessionFile,
} from '../../src/parser';

describe('parser', () => {
  it('parses JSONL and skips invalid/summary lines', () => {
    const content = [
      JSON.stringify({ type: 'summary', message: { content: 'skip' } }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: 'Hello' }] },
        timestamp: '2026-01-26T12:00:00.000Z',
      }),
      '{invalid json',
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hi!' }] },
        timestamp: '2026-01-26T12:01:00.000Z',
      }),
    ].join('\n');

    const messages = parseSessionFile(content);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.type).toBe('user');
    expect(messages[1]?.type).toBe('assistant');
  });

  it('cleans system content inside text blocks', () => {
    const content = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'text',
            text: 'Hello <system-reminder>hidden</system-reminder> World',
          },
        ],
      },
    });

    const messages = parseSessionFile(content);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content[0]?.text).toBe('Hello  World');
  });

  it('skips messages that become empty after cleaning', () => {
    const content = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'text',
            text: '<system-reminder>hidden</system-reminder>',
          },
        ],
      },
    });

    const messages = parseSessionFile(content);
    expect(messages).toHaveLength(0);
  });

  it('handles string content and tool_result blocks', () => {
    const content = [
      JSON.stringify({
        type: 'user',
        message: { content: 'Plain string content' },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
          ],
        },
      }),
    ].join('\n');

    const messages = parseSessionFile(content);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content[0]?.text).toBe('Plain string content');
    expect(messages[1]?.content[0]?.type).toBe('tool_result');
  });

  it('extracts first user message and skips slash commands', () => {
    const content = [
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: '/help' }] },
      }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: 'Build feature X' }] },
      }),
    ].join('\n');

    const messages = parseSessionFile(content);
    expect(extractFirstUserMessage(messages)).toBe('Build feature X');
  });

  it('generates session summary from tool usage', () => {
    const content = [
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: 'Update README' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Editing file' },
            {
              type: 'tool_use',
              name: 'Edit',
              id: 'tool-1',
              input: { file_path: '/repo/README.md' },
            },
          ],
        },
      }),
    ].join('\n');

    const messages = parseSessionFile(content);
    const summary = generateSessionSummary(messages);
    expect(summary).toContain('Update README');
    expect(summary).toContain('README.md');
  });

  it('determines session status', () => {
    const messages = parseSessionFile(
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: 'Question' }] },
      }),
    );
    expect(determineSessionStatus(messages)).toBe('working');

    const awaiting = parseSessionFile(
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              id: 'q1',
              input: { prompt: 'Need input' },
            },
          ],
        },
      }),
    );
    expect(determineSessionStatus(awaiting)).toBe('awaiting');

    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(determineSessionStatus(messages, staleTime)).toBe('idle');
  });
});
