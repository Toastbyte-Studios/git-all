import { describe, it, expect } from 'vitest';
import {
  ADJECTIVES,
  NOUNS,
  generatePlaceholderName,
  generatePlaceholderNames,
} from '../placeholder-names';

describe('word lists', () => {
  it('ADJECTIVES has 70 entries', () => {
    expect(ADJECTIVES.length).toBe(70);
  });

  it('NOUNS has 70 entries', () => {
    expect(NOUNS.length).toBe(70);
  });

  it('ADJECTIVES has no duplicates', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
  });

  it('NOUNS has no duplicates', () => {
    expect(new Set(NOUNS).size).toBe(NOUNS.length);
  });

  it('ADJECTIVES are all lowercase strings', () => {
    for (const adj of ADJECTIVES) {
      expect(adj).toBe(adj.toLowerCase());
      expect(adj.length).toBeGreaterThan(0);
    }
  });

  it('NOUNS are all lowercase strings', () => {
    for (const noun of NOUNS) {
      expect(noun).toBe(noun.toLowerCase());
      expect(noun.length).toBeGreaterThan(0);
    }
  });
});

describe('generatePlaceholderName', () => {
  it('returns a string in adj-noun format', () => {
    const name = generatePlaceholderName();
    const parts = name.split('-');
    expect(parts.length).toBe(2);
    expect(ADJECTIVES).toContain(parts[0]);
    expect(NOUNS).toContain(parts[1]);
  });

  it('returns different values across multiple calls (probabilistic)', () => {
    const names = new Set(
      Array.from({ length: 20 }, () => generatePlaceholderName()),
    );
    // With 4900 combinations, getting 20 unique out of 20 tries is overwhelmingly likely
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('generatePlaceholderNames', () => {
  it('returns the requested count of names', () => {
    expect(generatePlaceholderNames(1).length).toBe(1);
    expect(generatePlaceholderNames(4).length).toBe(4);
    expect(generatePlaceholderNames(10).length).toBe(10);
  });

  it('returns an empty array for count 0', () => {
    expect(generatePlaceholderNames(0)).toEqual([]);
  });

  it('returns unique names', () => {
    const names = generatePlaceholderNames(10);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each name is in adj-noun format or indexed fallback format', () => {
    const names = generatePlaceholderNames(5);
    for (const name of names) {
      const isAdjectiveNoun = /^[a-z]+-[a-z]+$/.test(name);
      const isFallback = /^user-\d+$/.test(name);
      expect(isAdjectiveNoun || isFallback).toBe(true);
    }
  });

  it('returns valid names when requesting many unique combinations', () => {
    // 70 * 70 = 4900 possible combinations
    // Requesting close to max should still work (uses fallback if needed)
    const names = generatePlaceholderNames(100);
    expect(names.length).toBe(100);
    expect(new Set(names).size).toBe(100);
  });

  it('falls back to indexed names when unique combinations are exhausted', () => {
    // Request more than all possible unique combinations
    const tooMany = ADJECTIVES.length * NOUNS.length + 5;
    const names = generatePlaceholderNames(tooMany);
    expect(names.length).toBe(tooMany);
    // The last few should be fallback indexed names
    const lastFive = names.slice(-5);
    for (const name of lastFive) {
      expect(name).toMatch(/^user-\d+$/);
    }
  });
});
