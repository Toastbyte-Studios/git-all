import { getCloudflareContext } from '@opennextjs/cloudflare';

// Minimal D1 type definitions (subset of @cloudflare/workers-types).
// These are used only for type-checking; the actual runtime types are
// provided by the Cloudflare Workers runtime.

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string }>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: boolean;
    error?: string;
  }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<{ results: T[]; success: boolean }[]>;
}

// Augment the CloudflareEnv global so the `DB` binding is typed.
declare global {
  interface CloudflareEnv {
    DB?: D1Database;
  }
}

/**
 * Returns the D1 database binding when running inside a Cloudflare Worker
 * (i.e. via `wrangler dev` / deployed). Returns `null` in plain `next dev`
 * mode where Cloudflare context is unavailable — callers should treat `null`
 * as "persistence unavailable" and degrade gracefully.
 */
export function getDb(): D1Database | null {
  try {
    const { env } = getCloudflareContext();
    return env.DB ?? null;
  } catch {
    console.warn(
      '[db] D1 binding unavailable — running without Cloudflare context',
    );
    return null;
  }
}
