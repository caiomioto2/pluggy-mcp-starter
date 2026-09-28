import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPluggyError } from '../dist/pluggy-errors.js';
import { refreshItem } from '../dist/refresh.js';

test('toPluggyError - extracts codeDescription over code when available', async () => {
  const mockResponse = {
    status: 400,
    json: async () => ({
      code: 400,
      codeDescription: 'ITEM_ALREADY_UPDATING',
      message: 'Item is already updating'
    })
  };

  const error = await toPluggyError(mockResponse, 'refresh');

  assert.equal(error.status, 400);
  assert.equal(error.code, 'ITEM_ALREADY_UPDATING');
  assert.equal(error.message, 'Item is already updating');
});

test('codeDescription reaches refresh result without enabling another retry', async () => {
  const error = await toPluggyError({
    status: 400,
    json: async () => ({code: 400, codeDescription: 'ITEM_ALREADY_UPDATING'})
  }, 'refresh');
  const itemId = 'test-item';
  let calls = 0;
  const result = await refreshItem({
    itemId,
    allowedItemIds: [itemId],
    invalidateCache: () => {},
    request: async () => { calls += 1; throw error; }
  });

  assert.equal(result.reason, 'ITEM_ALREADY_UPDATING');
  assert.equal(result.http_status, 400);
  assert.equal(result.retryable, false);
  assert.equal(result.refresh_requested, false);
  assert.equal(calls, 1);
});

test('toPluggyError - falls back to string code if codeDescription is not a string', async () => {
  const mockResponse = {
    status: 401,
    json: async () => ({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid API key'
    })
  };

  const error = await toPluggyError(mockResponse, 'login');

  assert.equal(error.status, 401);
  assert.equal(error.code, 'INVALID_CREDENTIALS');
  assert.equal(error.message, 'Invalid API key');
});

test('toPluggyError - does not expose arbitrary text if no message field', async () => {
  const mockResponse = {
    status: 500,
    json: async () => ({
      code: 'SERVER_ERROR',
      otherField: 'some text'
    })
  };

  const error = await toPluggyError(mockResponse, 'fetch');

  assert.equal(error.status, 500);
  assert.equal(error.code, 'SERVER_ERROR');
  assert.equal(error.message, "A Pluggy recusou a operação 'fetch'.");
});
