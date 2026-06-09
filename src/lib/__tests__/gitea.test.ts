import { describe, it, expect } from 'vitest';
import {
  normalizeInstanceUrl,
  getInstanceName,
  DEFAULT_GITEA_INSTANCE_URL,
  GITEA_KNOWN_INSTANCES,
  GITEA_CUSTOM_INSTANCE_VALUE,
} from '../gitea';

describe('constants', () => {
  it('DEFAULT_GITEA_INSTANCE_URL is Codeberg', () => {
    expect(DEFAULT_GITEA_INSTANCE_URL).toBe('https://codeberg.org');
  });

  it('GITEA_KNOWN_INSTANCES contains Codeberg and Gitea.com', () => {
    const urls = GITEA_KNOWN_INSTANCES.map((i) => i.url);
    expect(urls).toContain('https://codeberg.org');
    expect(urls).toContain('https://gitea.com');
  });

  it('GITEA_CUSTOM_INSTANCE_VALUE is __custom__', () => {
    expect(GITEA_CUSTOM_INSTANCE_VALUE).toBe('__custom__');
  });
});

describe('normalizeInstanceUrl', () => {
  it('returns the URL for a valid https URL', () => {
    expect(normalizeInstanceUrl('https://codeberg.org')).toBe(
      'https://codeberg.org',
    );
  });

  it('returns the URL for a valid http URL', () => {
    expect(normalizeInstanceUrl('http://my-gitea.example.com')).toBe(
      'http://my-gitea.example.com',
    );
  });

  it('strips trailing slash', () => {
    expect(normalizeInstanceUrl('https://codeberg.org/')).toBe(
      'https://codeberg.org',
    );
  });

  it('strips query string', () => {
    expect(normalizeInstanceUrl('https://codeberg.org?foo=bar')).toBe(
      'https://codeberg.org',
    );
  });

  it('strips hash fragment', () => {
    expect(normalizeInstanceUrl('https://codeberg.org#section')).toBe(
      'https://codeberg.org',
    );
  });

  it('strips path', () => {
    expect(normalizeInstanceUrl('https://codeberg.org/some/path')).toBe(
      'https://codeberg.org',
    );
  });

  it('returns null for empty string', () => {
    expect(normalizeInstanceUrl('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeInstanceUrl('   ')).toBeNull();
  });

  it('returns null for non-http/https protocol', () => {
    expect(normalizeInstanceUrl('ftp://codeberg.org')).toBeNull();
    expect(normalizeInstanceUrl('git://codeberg.org')).toBeNull();
  });

  it('returns null for an invalid URL string', () => {
    expect(normalizeInstanceUrl('not a url')).toBeNull();
    expect(normalizeInstanceUrl('codeberg.org')).toBeNull(); // no protocol
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(normalizeInstanceUrl('  https://codeberg.org  ')).toBe(
      'https://codeberg.org',
    );
  });
});

describe('getInstanceName', () => {
  it('returns "Gitea / Forgejo" when instanceUrl is undefined', () => {
    expect(getInstanceName(undefined)).toBe('Gitea / Forgejo');
  });

  it('returns "Gitea / Forgejo" when instanceUrl is empty string', () => {
    expect(getInstanceName('')).toBe('Gitea / Forgejo');
  });

  it('returns the known label for Codeberg', () => {
    expect(getInstanceName('https://codeberg.org')).toBe('Codeberg');
  });

  it('returns the known label for Gitea.com', () => {
    expect(getInstanceName('https://gitea.com')).toBe('Gitea.com');
  });

  it('returns the hostname for an unknown instance', () => {
    expect(getInstanceName('https://my-gitea.example.com')).toBe(
      'my-gitea.example.com',
    );
  });

  it('returns hostname for http URL', () => {
    expect(getInstanceName('http://selfhosted.local')).toBe('selfhosted.local');
  });

  it('returns "Gitea / Forgejo" for an unparseable URL', () => {
    expect(getInstanceName('not-a-url')).toBe('Gitea / Forgejo');
  });

  it('all known instances have a label that matches getInstanceName', () => {
    for (const instance of GITEA_KNOWN_INSTANCES) {
      expect(getInstanceName(instance.url)).toBe(instance.label);
    }
  });
});
