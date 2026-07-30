import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the D1 binding. `profiles.ts` talks to D1 in raw SQL,
// so the fake dispatches on the statement text rather than parsing it. Any
// query it doesn't recognise throws loudly — a silent empty result would make a
// visibility or deletion regression look like a passing test.
const store = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  connections: [] as Array<Record<string, unknown>>,
  available: true,
}));

vi.mock('@/lib/db', () => {
  function exec(
    sql: string,
    params: unknown[],
  ): Array<Record<string, unknown>> {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('SELECT * FROM users WHERE handle')) {
      return store.users.filter((u) => u.handle === params[0]);
    }
    if (q.startsWith('SELECT * FROM connections WHERE user_id')) {
      return store.connections.filter((c) => c.user_id === params[0]);
    }
    if (q.startsWith('SELECT handle, is_public FROM users WHERE id')) {
      return store.users
        .filter((u) => u.id === params[0])
        .map((u) => ({ handle: u.handle, is_public: u.is_public }));
    }
    if (q.startsWith('SELECT handle FROM users WHERE id')) {
      return store.users
        .filter((u) => u.id === params[0])
        .map((u) => ({ handle: u.handle }));
    }
    if (q.startsWith('UPDATE users SET is_public')) {
      for (const u of store.users) {
        if (u.id === params[2]) {
          u.is_public = params[0];
          u.updated_at = params[1];
        }
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
    getDb: () =>
      store.available
        ? {
            prepare,
            batch: async (statements: Array<{ __exec: () => unknown }>) =>
              statements.map((s) => {
                s.__exec();
                return { results: [], success: true };
              }),
          }
        : null,
  };
});

const {
  HANDLE_CHANGE_COOLDOWN_MS,
  RESERVED_HANDLES,
  deleteUser,
  generateId,
  getProfileByHandle,
  getProfileSummaryByUserId,
  getPublicProfileByHandle,
  isValidHandleFormat,
  normalizeHandle,
  setVisibility,
  toPublicProfile,
} = await import('../profiles');

function seed({ isPublic }: { isPublic: boolean }) {
  store.available = true;
  store.users = [
    {
      id: '01J0000000000000000000USER',
      handle: 'jane-doe',
      display_name: 'Jane Doe',
      primary_provider: 'github',
      handle_changed_at: 1_717_777_777_000,
      is_public: isPublic ? 1 : 0,
      created_at: 1_717_000_000_000,
      updated_at: 1_717_777_777_000,
    },
  ];
  store.connections = [
    {
      user_id: '01J0000000000000000000USER',
      provider: 'github',
      account_id: '123',
      username: 'janedoe',
      avatar_url: 'https://example.test/avatar.png',
      verified_at: 1_717_777_777_000,
    },
    {
      user_id: '01J0000000000000000000USER',
      provider: 'gitlab',
      account_id: '456',
      username: 'jane.doe',
      avatar_url: null,
      verified_at: 1_717_777_777_000,
    },
  ];
}

beforeEach(() => {
  seed({ isPublic: true });
});

describe('generateId', () => {
  it('returns a 26-character string', () => {
    expect(generateId()).toHaveLength(26);
  });

  it('returns only Crockford base32 characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('returns unique ids on each call', () => {
    const ids = Array.from({ length: 20 }, generateId);
    expect(new Set(ids).size).toBe(20);
  });
});

describe('normalizeHandle', () => {
  it('lowercases the input', () => {
    expect(normalizeHandle('JaneDoe')).toBe('janedoe');
  });

  it('replaces underscores with hyphens', () => {
    expect(normalizeHandle('jane_doe')).toBe('jane-doe');
  });

  it('strips characters that are not [a-z0-9-]', () => {
    expect(normalizeHandle('jane.doe!')).toBe('janedoe');
  });

  it('trims leading and trailing hyphens', () => {
    expect(normalizeHandle('-jane-')).toBe('jane');
  });

  it('collapses consecutive hyphens', () => {
    expect(normalizeHandle('jane--doe')).toBe('jane-doe');
  });

  it('truncates to 32 characters', () => {
    const long = 'a'.repeat(40);
    const result = normalizeHandle(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(32);
  });

  it('does not leave a trailing hyphen after truncation', () => {
    const result = normalizeHandle(`${'a'.repeat(31)}-b`);
    expect(result).toBe('a'.repeat(31));
  });

  it('returns null when no valid characters remain', () => {
    expect(normalizeHandle('!!!')).toBeNull();
    expect(normalizeHandle('-')).toBeNull();
  });

  it('returns null for a single character after normalisation', () => {
    expect(normalizeHandle('a')).toBeNull();
  });
});

describe('isValidHandleFormat', () => {
  it('accepts a simple lowercase handle', () => {
    expect(isValidHandleFormat('jane-doe')).toBe(true);
  });

  it('accepts numbers', () => {
    expect(isValidHandleFormat('user42')).toBe(true);
  });

  it('rejects uppercase characters', () => {
    expect(isValidHandleFormat('JaneDoe')).toBe(false);
  });

  it('rejects underscores', () => {
    expect(isValidHandleFormat('jane_doe')).toBe(false);
  });

  it('rejects handles shorter than 2 characters', () => {
    expect(isValidHandleFormat('a')).toBe(false);
  });

  it('accepts a 2-character handle', () => {
    expect(isValidHandleFormat('ab')).toBe(true);
  });

  it('rejects handles longer than 32 characters', () => {
    expect(isValidHandleFormat('a'.repeat(33))).toBe(false);
  });

  it('accepts a 32-character handle', () => {
    expect(isValidHandleFormat('a'.repeat(32))).toBe(true);
  });

  it('rejects handles starting with a hyphen', () => {
    expect(isValidHandleFormat('-jane')).toBe(false);
  });

  it('rejects handles ending with a hyphen', () => {
    expect(isValidHandleFormat('jane-')).toBe(false);
  });

  it('rejects consecutive hyphens', () => {
    expect(isValidHandleFormat('jane--doe')).toBe(false);
  });

  it('rejects reserved words (case-insensitive check via normalised input)', () => {
    for (const word of RESERVED_HANDLES) {
      expect(isValidHandleFormat(word)).toBe(false);
    }
  });

  it('accepts handles that merely contain a reserved word as a substring', () => {
    expect(isValidHandleFormat('meuser')).toBe(true);
    expect(isValidHandleFormat('myapi')).toBe(true);
  });
});

describe('HANDLE_CHANGE_COOLDOWN_MS', () => {
  it('is exactly 7 days in milliseconds', () => {
    expect(HANDLE_CHANGE_COOLDOWN_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('RESERVED_HANDLES', () => {
  it('includes expected entries', () => {
    expect(RESERVED_HANDLES.has('me')).toBe(true);
    expect(RESERVED_HANDLES.has('api')).toBe(true);
    expect(RESERVED_HANDLES.has('admin')).toBe(true);
    expect(RESERVED_HANDLES.has('_next')).toBe(true);
  });
});

describe('toPublicProfile', () => {
  it('drops internal identifiers and metadata', async () => {
    const profile = await getProfileByHandle('jane-doe');
    expect(profile).not.toBeNull();

    const projected = toPublicProfile(profile!);

    expect(Object.keys(projected).sort()).toEqual([
      'connections',
      'displayName',
      'handle',
      'primaryProvider',
    ]);
    expect(projected).not.toHaveProperty('id');
    expect(projected).not.toHaveProperty('handleChangedAt');
    expect(projected).not.toHaveProperty('createdAt');
    expect(projected).not.toHaveProperty('updatedAt');
    expect(projected).not.toHaveProperty('isPublic');
  });

  it('drops userId and accountId from every connection', async () => {
    const profile = await getProfileByHandle('jane-doe');
    const projected = toPublicProfile(profile!);

    expect(projected.connections).toHaveLength(2);
    for (const connection of projected.connections) {
      expect(Object.keys(connection).sort()).toEqual([
        'avatarUrl',
        'provider',
        'username',
      ]);
    }
  });

  it('serialises without any trace of the internal ULID', async () => {
    const profile = await getProfileByHandle('jane-doe');
    const serialised = JSON.stringify(toPublicProfile(profile!));

    expect(serialised).not.toContain('01J0000000000000000000USER');
  });
});

describe('getPublicProfileByHandle', () => {
  it('returns the projection for a public profile', async () => {
    const profile = await getPublicProfileByHandle('jane-doe');

    expect(profile).not.toBeNull();
    expect(profile!.handle).toBe('jane-doe');
    expect(profile!.displayName).toBe('Jane Doe');
    expect(profile!.connections).toHaveLength(2);
  });

  it('returns null for a private profile', async () => {
    seed({ isPublic: false });

    await expect(getPublicProfileByHandle('jane-doe')).resolves.toBeNull();
  });

  it('returns null for a handle that does not exist', async () => {
    await expect(getPublicProfileByHandle('nobody')).resolves.toBeNull();
  });

  it('is indistinguishable between private and non-existent', async () => {
    seed({ isPublic: false });

    const priv = await getPublicProfileByHandle('jane-doe');
    const missing = await getPublicProfileByHandle('nobody');

    expect(priv).toEqual(missing);
  });

  it('normalises the handle before looking it up', async () => {
    await expect(getPublicProfileByHandle('Jane_Doe')).resolves.not.toBeNull();
  });
});

describe('setVisibility', () => {
  it('round-trips public → private → public', async () => {
    seed({ isPublic: false });
    const userId = '01J0000000000000000000USER';

    await expect(getPublicProfileByHandle('jane-doe')).resolves.toBeNull();

    await setVisibility(userId, true);
    await expect(getPublicProfileByHandle('jane-doe')).resolves.not.toBeNull();

    await setVisibility(userId, false);
    await expect(getPublicProfileByHandle('jane-doe')).resolves.toBeNull();
  });

  it('is reflected in the owner summary', async () => {
    const userId = '01J0000000000000000000USER';

    await setVisibility(userId, false);
    await expect(getProfileSummaryByUserId(userId)).resolves.toEqual({
      handle: 'jane-doe',
      isPublic: false,
    });

    await setVisibility(userId, true);
    await expect(getProfileSummaryByUserId(userId)).resolves.toEqual({
      handle: 'jane-doe',
      isPublic: true,
    });
  });

  it('returns false when the database is unavailable', async () => {
    store.available = false;

    await expect(
      setVisibility('01J0000000000000000000USER', true),
    ).resolves.toBe(false);
  });
});

describe('deleteUser', () => {
  it('removes the user row and every connection row', async () => {
    await expect(deleteUser('01J0000000000000000000USER')).resolves.toBe(true);

    expect(store.users).toHaveLength(0);
    expect(store.connections).toHaveLength(0);
  });

  it('leaves other users untouched', async () => {
    store.users.push({
      id: '01J0000000000000000000OTHR',
      handle: 'someone-else',
      display_name: null,
      primary_provider: 'github',
      handle_changed_at: null,
      is_public: 1,
      created_at: 1,
      updated_at: 1,
    });
    store.connections.push({
      user_id: '01J0000000000000000000OTHR',
      provider: 'github',
      account_id: '789',
      username: 'someone',
      avatar_url: null,
      verified_at: 1,
    });

    await deleteUser('01J0000000000000000000USER');

    expect(store.users).toHaveLength(1);
    expect(store.users[0].handle).toBe('someone-else');
    expect(store.connections).toHaveLength(1);
  });

  it('makes the profile unresolvable afterwards', async () => {
    await deleteUser('01J0000000000000000000USER');

    await expect(getPublicProfileByHandle('jane-doe')).resolves.toBeNull();
    await expect(getProfileByHandle('jane-doe')).resolves.toBeNull();
  });

  it('returns false when the database is unavailable', async () => {
    store.available = false;

    await expect(deleteUser('01J0000000000000000000USER')).resolves.toBe(false);
  });
});
