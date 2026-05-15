export const DEFAULT_GITEA_INSTANCE_URL = 'https://codeberg.org';

export const GITEA_KNOWN_INSTANCES = [
  { label: 'Codeberg', url: 'https://codeberg.org' },
  { label: 'Gitea.com', url: 'https://gitea.com' },
] as const;

export const GITEA_CUSTOM_INSTANCE_VALUE = '__custom__';

export function normalizeInstanceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getInstanceName(instanceUrl: string | undefined) {
  if (!instanceUrl) return 'Gitea / Forgejo';

  const known = GITEA_KNOWN_INSTANCES.find(
    (instance) => instance.url === instanceUrl,
  );
  if (known) return known.label;

  try {
    return new URL(instanceUrl).hostname;
  } catch {
    return 'Gitea / Forgejo';
  }
}
