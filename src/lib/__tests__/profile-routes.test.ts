import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The profile routes authorise off `getAuthSession()`, which reads cookies via
// `next/headers`. That has no request scope under Vitest, so it is mocked here
// rather than exercised — these tests are about the routes' authorisation and
// confirmation logic, not about cookie decryption (covered in auth-session.test.ts).
const auth = vi.hoisted(() => ({
  session: null as { userId?: string } | null,
}));

vi.mock('@/lib/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-session')>();
  return { ...actual, getAuthSession: async () => auth.session };
});

const store = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  connections: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => {
  function exec(sql: string, params: unknown[]) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('SELECT handle FROM users WHERE id')) {
      return store.users
        .filter((u) => u.id === params[0])
        .map((u) => ({ handle: u.handle }));
    }
    if (q.startsWith('UPDATE users SET is_public')) {
      for (const u of store.users) {
        if (u.id === params[2]) u.is_public = params[0];
      }
      return [];
    }
    if (q.startsWith('DELETE FROM connections WHERE user_id')) {
      store.connections = store.connections.filter(
        (c) => c.user_id !== params[0],
      );
      return [];
    }
    if (q.startsWith('DELETE FROM users WHERE id')) {
      store.users = store.users.filter((u) => u.id !== params[0]);
      return [];
    }
    throw new Error(`Unhandled SQL in test fake: ${q}`);
  }

  function prepare(sql: string) {
    let params: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        params = values;
        return statement;
      },
      first: async () => exec(sql, params)[0] ?? null,
      all: async () => ({ results: exec(sql, params), success: true }),
      run: async () => {
        exec(sql, params);
        return { success: true };
      },
      __exec: () => exec(sql, params),
    };
    return statement;
  }

  return {
    getDb: () => ({
      prepare,
      batch: async (statements: Array<{ __exec: () => unknown }>) =>
        statements.map((s) => {
          s.__exec();
          return { results: [], success: true };
        }),
    }),
  };
});

const { DELETE } = await import('@/app/api/profile/route');
const { POST: setVisibilityRoute } =
  await import('@/app/api/profile/visibility/route');

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  auth.session = { userId: 'USER1' };
  store.users = [
    {
      id: 'USER1',
      handle: 'jane-doe',
      display_name: 'Jane Doe',
      primary_provider: 'github',
      handle_changed_at: null,
      is_public: 0,
      created_at: 1,
      updated_at: 1,
    },
  ];
  store.connections = [
    {
      user_id: 'USER1',
      provider: 'github',
      account_id: '123',
      username: 'janedoe',
      avatar_url: 'https://example.test/a.png',
      verified_at: 1,
    },
    {
      user_id: 'USER1',
      provider: 'gitlab',
      account_id: '456',
      username: 'janedoe',
      avatar_url: null,
      verified_at: 1,
    },
  ];
});

describe('DELETE /api/profile', () => {
  it('rejects an unauthenticated request', async () => {
    auth.session = null;

    const response = await DELETE(
      jsonRequest('https://gitall.app/api/profile', 'DELETE', {
        handle: 'jane-doe',
      }),
    );

    expect(response.status).toBe(401);
    // Nothing was touched.
    expect(store.users).toHaveLength(1);
    expect(store.connections).toHaveLength(2);
  });

  it('rejects a session without a userId', async () => {
    auth.session = {};

    const response = await DELETE(
      jsonRequest('https://gitall.app/api/profile', 'DELETE', {
        handle: 'jane-doe',
      }),
    );

    expect(response.status).toBe(401);
    expect(store.users).toHaveLength(1);
  });

  it('rejects a confirmation handle that does not match', async () => {
    const response = await DELETE(
      jsonRequest('https://gitall.app/api/profile', 'DELETE', {
        handle: 'someone-else',
      }),
    );

    expect(response.status).toBe(409);
    expect(store.users).toHaveLength(1);
    expect(store.connections).toHaveLength(2);
  });

  it('deletes the user row and every connection row', async () => {
    const response = await DELETE(
      jsonRequest('https://gitall.app/api/profile', 'DELETE', {
        handle: 'jane-doe',
      }),
    );

    expect(response.status).toBe(200);
    expect(store.users).toHaveLength(0);
    expect(store.connections).toHaveLength(0);
  });

  it('expires the session cookie and every per-provider token cookie', async () => {
    const response = await DELETE(
      jsonRequest('https://gitall.app/api/profile', 'DELETE', {
        handle: 'jane-doe',
      }),
    );

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('gitall_session=;');
    expect(setCookie).toContain('gitall_token_github=;');
    expect(setCookie).toContain('gitall_token_gitlab=;');
    expect(setCookie).toContain('gitall_token_bitbucket=;');
    expect(setCookie).toContain('Max-Age=0');
  });
});

describe('POST /api/profile/visibility', () => {
  it('rejects an unauthenticated request', async () => {
    auth.session = null;

    const response = await setVisibilityRoute(
      jsonRequest('https://gitall.app/api/profile/visibility', 'POST', {
        isPublic: true,
      }),
    );

    expect(response.status).toBe(401);
    expect(store.users[0].is_public).toBe(0);
  });

  it('rejects a body without a boolean isPublic', async () => {
    const response = await setVisibilityRoute(
      jsonRequest('https://gitall.app/api/profile/visibility', 'POST', {
        isPublic: 'yes',
      }),
    );

    expect(response.status).toBe(400);
    expect(store.users[0].is_public).toBe(0);
  });

  it('publishes and unpublishes the profile', async () => {
    const publish = await setVisibilityRoute(
      jsonRequest('https://gitall.app/api/profile/visibility', 'POST', {
        isPublic: true,
      }),
    );
    expect(publish.status).toBe(200);
    expect(store.users[0].is_public).toBe(1);

    const unpublish = await setVisibilityRoute(
      jsonRequest('https://gitall.app/api/profile/visibility', 'POST', {
        isPublic: false,
      }),
    );
    expect(unpublish.status).toBe(200);
    expect(store.users[0].is_public).toBe(0);
  });
});
