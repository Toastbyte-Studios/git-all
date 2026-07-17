import { describe, expect, it } from 'vitest';
import {
  HANDLE_CHANGE_COOLDOWN_MS,
  RESERVED_HANDLES,
  generateId,
  isValidHandleFormat,
  normalizeHandle,
} from '../profiles';

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
