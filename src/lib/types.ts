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

export type ViewMode = 'side-by-side' | 'integrated';

export interface UserEntry {
  id: string;
  platform: 'github' | 'gitlab';
  username: string;
}

export interface UserResult {
  entry: UserEntry;
  data: ContributionData | null;
  error: string | null;
}
