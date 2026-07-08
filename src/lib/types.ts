export interface CalendarDay {
  date: string;
  count: number;
  level: number;
}

export interface ContributionData {
  platform: string;
  username: string;
  totalContributions: number;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  calendar: CalendarDay[];
}

export type ConnectionProvider = 'github' | 'gitlab' | 'bitbucket';

export interface Connection {
  provider: ConnectionProvider;
  accountId: string;
  username: string;
  avatarUrl: string;
  /** Not persisted in the session cookie; loaded from a separate per-provider token cookie. */
  accessToken?: string;
  verifiedAt: number;
}

export type Platform = 'github' | 'gitlab' | 'bitbucket' | 'gitea';

export type ViewMode = 'side-by-side' | 'integrated';

export interface UserEntry {
  id: string;
  platform: Platform;
  username: string;
  instanceUrl?: string;
}

export interface UserResult {
  entry: UserEntry;
  data: ContributionData | null;
  error: string | null;
}
