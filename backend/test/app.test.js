const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const app = require('../src/app');

test('API health reports unavailable while MongoDB is disconnected', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await response.json(), { status: 'unavailable', database: 'disconnected' });
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('health endpoint rejects unsupported query parameters', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health?unexpected=value`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'Request contains an unsupported query parameter.' });
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('protected work, dashboard, and history APIs reject unauthenticated requests', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    for (const [method, path] of [
      ['GET', '/api/works'],
      ['GET', '/api/dashboard/summary'],
      ['GET', '/api/field-updates'],
      ['POST', '/api/reporting-coverage'],
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
      assert.equal(response.status, 401, `${method} ${path} should require authentication`);
      assert.deepEqual(await response.json(), { message: 'A valid bearer token is required.' });
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('login attempts are limited per client address', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const invalid = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'x'.repeat(129) }),
    });
    assert.equal(invalid.status, 400);

    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 400);
    }
    const limited = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(limited.status, 429);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('public registration attempts have a stricter per-client limit', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 400);
    }
    const limited = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(limited.status, 429);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
