export interface Account {
  id: string;
  name: string;
  created_at: string;
  last_updated: string | null;
}

export interface UserRecord {
  username: string;
  added_at: string;
  last_seen: string;
  currently_following: boolean;
}

export interface AccountHistory {
  followers: Record<string, UserRecord>;
  following: Record<string, UserRecord>;
}

export interface AccountStats {
  totalFollowers: number;
  totalFollowing: number;
  nonFollowers: number;
  unfollowers: number;
  mutuals: number;
}
