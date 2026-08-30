export interface HistoryEvent {
  type: 
    | 'became_follower' 
    | 'lost_follower' 
    | 'you_followed' 
    | 'you_unfollowed' 
    | 'added_close_friend' 
    | 'removed_close_friend' 
    | 'blocked' 
    | 'restricted'
    | 'note_added';
  timestamp: string;
  description?: string;
}

export interface Account {
  id: string;
  name: string;
  created_at: string;
  last_updated: string | null;
  export_folder_name?: string | null;
}

export interface UserRecord {
  username: string;
  followed_at?: string | null; // Exact timestamp from Instagram export JSON (when follow action occurred on Instagram)
  imported_at?: string; // Timestamp when this record was first imported into the app
  added_at: string; // Legacy fallback timestamp
  last_seen: string; // Timestamp of latest export where account appeared
  currently_following: boolean; // TRUE = This account follows you; FALSE = Does NOT follow you
  currently_followed_by_you?: boolean; // TRUE = You follow this account; FALSE = You do NOT follow
  removed_at?: string | null; // When relationship ended
  removal_type?: 'unfollowed_you' | 'you_unfollowed' | 'removed_by_you' | 'blocked' | 'unknown';
  is_close_friend?: boolean;
  is_blocked?: boolean;
  is_restricted?: boolean;
  is_favorite?: boolean;
  has_pending_request_sent?: boolean;
  has_pending_request_received?: boolean;
  notes?: string;
  tags?: string[];
  events?: HistoryEvent[];
}

export interface AccountHistory {
  followers: Record<string, UserRecord>;
  following: Record<string, UserRecord>;
  unfollowed_by_you?: Record<string, UserRecord>; // users you removed or unfollowed
  close_friends?: Record<string, UserRecord>;
  blocked?: Record<string, UserRecord>;
  restricted?: Record<string, UserRecord>;
  pending_sent?: Record<string, UserRecord>;
  pending_received?: Record<string, UserRecord>;
  favorites?: Record<string, UserRecord>;
  all_known_users?: Record<string, UserRecord>; // master permanent retention directory
  user_notes?: Record<string, string>; // username -> notes
  user_tags?: Record<string, string[]>; // username -> tags
}

export interface AccountStats {
  totalFollowers: number;
  totalFollowing: number;
  nonFollowers: number;
  unfollowers: number; // they unfollowed you
  youUnfollowed: number; // you unfollowed or removed them
  mutuals: number;
  closeFriends: number;
  blockedCount: number;
  restrictedCount: number;
  missingCount?: number;
  totalHistoricalContacts: number;
}

/**
 * Single consolidated record for a contact (e.g. @example).
 * Contains all relationship flags, timestamps, notes, tags, and history events in a single object.
 */
export interface UnifiedContactRecord {
  username: string;
  follows_you: boolean;
  you_follow: boolean;
  is_mutual: boolean;
  is_close_friend: boolean;
  is_blocked: boolean;
  is_restricted: boolean;
  is_favorite: boolean;
  is_missing: boolean;
  is_manually_removed: boolean;
  has_pending_request_sent: boolean;
  has_pending_request_received: boolean;
  removal_type: 'unfollowed_you' | 'you_unfollowed' | 'removed_by_you' | 'blocked' | 'unknown' | null;
  followed_at: string | null;
  imported_at: string | null;
  removed_at: string | null;
  last_seen: string;
  notes: string;
  tags: string[];
  events: HistoryEvent[];
}

export interface UnifiedAccountBackup {
  id: string;
  name: string;
  created_at: string;
  last_updated: string | null;
  export_folder_name?: string | null;
  stats?: AccountStats;
  contacts: Record<string, UnifiedContactRecord>;
}

export interface UnifiedDatabaseBackup {
  format: 'instagram_tracker_database';
  version: '1.0';
  exported_at: string;
  accounts: UnifiedAccountBackup[];
}

