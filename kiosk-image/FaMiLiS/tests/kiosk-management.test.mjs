import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
function route(method, path, pool) {
  const start = source.indexOf(`  app.${method}("${path}"`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n  });', start) + 6;
  let handler;
  const middleware = () => {};
  vm.runInNewContext(source.slice(start, end), {
    app: { [method]: (_path, ...handlers) => { handler = handlers.at(-1); } },
    pool, requireAuth: middleware, requireAdmin: middleware, console,
    toIsoOrNull: value => value == null ? null : new Date(value).toISOString(),
  });
  return handler;
}
function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('kiosk binding rejects malformed numbers and handles duplicate bindings', async () => {
  const calls = [];
  const handler = route('patch', '/api/users/:userId/kiosk-number', { query: async (...args) => { calls.push(args); return [{ affectedRows: 1 }]; } });
  for (const value of [undefined, 0, -1, 1.5, '001', 1000000]) {
    const res = response();
    await handler({ params: { userId: 7 }, body: { kioskNumber: value } }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(calls.length, 0);
  for (const value of [1, 2, null]) {
    const res = response();
    await handler({ params: { userId: 7 }, body: { kioskNumber: value } }, res);
    assert.equal(res.code, 200);
    assert.equal(calls.at(-1)[1][0], value);
  }
  const duplicate = route('patch', '/api/users/:userId/kiosk-number', { query: async () => { throw { code: 'ER_DUP_ENTRY' }; } });
  const res = response();
  await duplicate({ params: { userId: 7 }, body: { kioskNumber: 1 } }, res);
  assert.equal(res.code, 409);
});

test('profile and history always query the authenticated owner', async () => {
  const calls = [];
  const handler = route('get', '/api/tester/profile', { query: async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1 ? [[{ username: 'Own account' }]] : [[{ id: 10 }, { id: 9 }]];
  } });
  const res = response();
  await handler({ auth: { id: 7 }, query: { userId: 99 }, body: { userId: 99 } }, res);
  assert.equal(res.code, 200);
  assert.ok(calls.every(call => call.params[0] === 7));
  assert.match(calls[1].sql, /WHERE s.user_id = \?/);
  assert.equal(res.body.history.length, 2);
});

test('merged submission commits ratings and completion together and rolls back failures', async () => {
  for (const fail of [false, true]) {
    const events = [];
    const connection = {
      beginTransaction: async () => events.push('begin'),
      query: async sql => {
        events.push(sql);
        if (sql.includes('SELECT session_id')) return [[{ session_id: 10 }]];
        if (fail && sql.includes('UPDATE sessions')) throw new Error('DB unavailable');
        return [{}];
      },
      commit: async () => events.push('commit'), rollback: async () => events.push('rollback'), release: () => events.push('release'),
    };
    const handler = route('post', '/api/sessions/:sessionId/survey', { getConnection: async () => connection });
    const res = response();
    await handler({ params: { sessionId: '10' }, body: { colorRating: 7, flavorAromaRating: 6, saltSweetRating: 5, textureRating: 8, finalOverallRating: 7 } }, res);
    assert.equal(res.code, fail ? 500 : 200);
    assert.equal(events.includes('commit'), !fail);
    assert.equal(events.includes('rollback'), fail);
    assert.equal(events.at(-1), 'release');
  }
});

test('automatic assignment uses the first free number and preserves existing bindings', async () => {
  for (const existing of [null, 7]) {
    const events = [];
    const connection = {
      beginTransaction: async () => events.push('begin'),
      query: async (sql, params) => {
        if (sql.startsWith('SELECT')) {
          assert.match(sql, /ORDER BY user_id FOR UPDATE/);
          return [[{ user_id: 1, role: 'tester', kiosk_number: 1 }, { user_id: 2, role: 'tester', kiosk_number: 3 }, { user_id: 7, role: 'tester', kiosk_number: existing }]];
        }
        events.push(params);
        return [{}];
      },
      commit: async () => events.push('commit'), rollback: async () => events.push('rollback'), release: () => events.push('release'),
    };
    const handler = route('post', '/api/users/:userId/kiosk-number/auto', { getConnection: async () => connection });
    const res = response();
    await handler({ params: { userId: '7' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.kioskNumber, existing ?? 2);
    assert.equal(events.filter(Array.isArray).length, existing === null ? 1 : 0);
    assert.ok(events.includes('commit'));
    assert.equal(events.at(-1), 'release');
  }
});

test('profile and history presence labels take precedence over stale completed state', () => {
  const monitor = readFileSync(new URL('../src/pages/VideoMonitoring.tsx', import.meta.url), 'utf8');
  const start = monitor.indexOf('function workflowLabel(');
  const end = monitor.indexOf('\nfunction KioskTestInfo', start);
  // Strip only the function's TypeScript annotations for the isolated behavioral check.
  const code = monitor.slice(start, end).replace('kiosk: RemoteKiosk', 'kiosk').replace('): string {', ') {');
  const context = {};
  vm.runInNewContext(code, context);
  assert.equal(context.workflowLabel({ connectionState: 'idle', status: 'completed', workflowStage: 'profile' }), 'Viewing profile');
  assert.equal(context.workflowLabel({ connectionState: 'idle', status: 'completed', workflowStage: 'history' }), 'Viewing test history');
  assert.equal(context.workflowLabel({ connectionState: 'offline', workflowStage: 'profile' }), 'Not logged in');
});
