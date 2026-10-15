export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type Contribution = {
  date: string;
  count: number;
  level: ContributionLevel;
};

export type GitLabEvent = {
  id: number | string;
  created_at: string;
  action_name?: string;
  push_data?: {
    commit_count?: number;
    ref_count?: number;
  };
};
