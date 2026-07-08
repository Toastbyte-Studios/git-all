import type { ConnectionProvider } from '@/lib/types';

export const PROVIDER_ORDER: ConnectionProvider[] = [
  'github',
  'gitlab',
  'bitbucket',
];

export const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

export const PROVIDER_RING: Record<ConnectionProvider, string> = {
  github: 'var(--gh-accent)',
  gitlab: 'var(--gl-accent)',
  bitbucket: 'var(--bb-accent)',
};
