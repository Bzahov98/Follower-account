import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getAccounts, saveAccounts, getAccountHistory, saveAccountHistory, deleteAccountHistory, clearAllLocalData } from './db';
import { 
  parseInstagramUsernames, 
  extractFromZip, 
  extractUsernameFromExportName, 
  categorizeAndIngestFile, 
  ParsedExportData, 
  ParsedItem 
} from './instagram';
import { analyzeAndParseJson } from './jsonDiagnostics';
import { Account, AccountHistory, UserRecord, HistoryEvent, UnifiedContactRecord, UnifiedAccountBackup, UnifiedDatabaseBackup } from '../src/types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Safely parses any date string, ISO string, milliseconds, or Unix epoch seconds into numeric epoch ms.
 * Returns null if invalid or missing.
 */
export function parseDateTimestamp(val: any): number | null {
  if (!val) return null;
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    return val < 1e11 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      return num < 1e11 ? num * 1000 : num;
    }
  }
  return null;
}

/**
 * Compares two dates and returns the earliest valid ISO timestamp string.
 * Used for earliest known follow date (followed_at) and initial discovery (imported_at).
 */
export function earliestIsoTimestamp(d1?: string | number | null, d2?: string | number | null): string | null {
  const t1 = parseDateTimestamp(d1);
  const t2 = parseDateTimestamp(d2);
  if (t1 && t2) return new Date(Math.min(t1, t2)).toISOString();
  if (t1) return new Date(t1).toISOString();
  if (t2) return new Date(t2).toISOString();
  return null;
}

/**
 * Compares two dates and returns the most recent (latest) valid ISO timestamp string.
 * Used for updating last_seen and active status milestones.
 */
export function latestIsoTimestamp(d1?: string | number | null, d2?: string | number | null): string | null {
  const t1 = parseDateTimestamp(d1);
  const t2 = parseDateTimestamp(d2);
  if (t1 && t2) return new Date(Math.max(t1, t2)).toISOString();
  if (t1) return new Date(t1).toISOString();
  if (t2) return new Date(t2).toISOString();
  return null;
}

/**
 * Checks whether candidate timestamp is strictly newer or equal to a base timestamp.
 * If base timestamp is missing, candidate is treated as newer (returns true).
 */
export function isTimestampNewer(candidate?: string | number | null, base?: string | number | null): boolean {
  const tCandidate = parseDateTimestamp(candidate);
  const tBase = parseDateTimestamp(base);
  if (!tBase) return true;
  if (!tCandidate) return false;
  return tCandidate >= tBase;
}

/**
 * Combines timeline history events from multiple backups or exports without duplicates.
 * Deduplicates by matching type, approximate timestamp (day level), and description signature.
 * Returns sorted chronologically.
 */
export function mergeHistoryEvents(eventsA: HistoryEvent[] = [], eventsB: HistoryEvent[] = []): HistoryEvent[] {
  const seen = new Set<string>();
  const merged: HistoryEvent[] = [];

  for (const ev of [...eventsA, ...eventsB]) {
    if (!ev || !ev.type) continue;
    const timeKey = ev.timestamp ? new Date(ev.timestamp).toISOString().split('T')[0] : 'unknown';
    const sig = `${ev.type}_${timeKey}_${(ev.description || '').trim().toLowerCase()}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      merged.push({
        type: ev.type,
        timestamp: ev.timestamp || new Date().toISOString(),
        description: ev.description || ''
      });
    }
  }

  merged.sort((a, b) => {
    const tA = parseDateTimestamp(a.timestamp) || 0;
    const tB = parseDateTimestamp(b.timestamp) || 0;
    return tA - tB;
  });

  return merged;
}

/**
 * Merge new parsed export data into persistent account history.
 * GUARANTEES:
 * 1. Accurately compares incoming timestamps against existing state to prevent breaking existing data.
 * 2. If older historical data is uploaded, it backfills earliest followed_at dates without wiping active followers.
 * 3. If fresh/newer data is uploaded, it updates active follower statuses and records transitions.
 */
async function processAndSaveExportData(
  accountId: string, 
  exportData: ParsedExportData, 
  folderOrZipName?: string
) {
  const history = await getAccountHistory(accountId);
  const accounts = await getAccounts();
  const existingAccount = accounts.find(a => a.id === accountId);
  const now = new Date().toISOString();

  if (!history.followers) history.followers = {};
  if (!history.following) history.following = {};
  if (!history.unfollowed_by_you) history.unfollowed_by_you = {};
  if (!history.close_friends) history.close_friends = {};
  if (!history.blocked) history.blocked = {};
  if (!history.restricted) history.restricted = {};
  if (!history.pending_sent) history.pending_sent = {};
  if (!history.pending_received) history.pending_received = {};
  if (!history.favorites) history.favorites = {};
  if (!history.all_known_users) history.all_known_users = {};
  if (!history.user_notes) history.user_notes = {};
  if (!history.user_tags) history.user_tags = {};

  // Detect whether this export is an older historical archive or a fresh/current snapshot
  const exportTimestamps = [
    ...exportData.followers.map(f => parseDateTimestamp(f.timestamp)),
    ...exportData.following.map(f => parseDateTimestamp(f.timestamp)),
    ...exportData.recentlyUnfollowed.map(f => parseDateTimestamp(f.timestamp))
  ].filter((t): t is number => t !== null && t > 0);

  const maxExportTimestamp = exportTimestamps.length > 0 ? Math.max(...exportTimestamps) : null;
  const existingAccountTimestamp = parseDateTimestamp(existingAccount?.last_updated);

  // If export has timestamps and is significantly older (e.g. > 2 days older than account's last updated state),
  // treat it as an older historical backfill archive.
  const isHistoricalArchive = maxExportTimestamp && existingAccountTimestamp && (existingAccountTimestamp - maxExportTimestamp > 2 * 86400000);

  const currentFollowersSet = new Set(exportData.followers.map(f => f.username.toLowerCase()));
  const currentFollowingSet = new Set(exportData.following.map(f => f.username.toLowerCase()));
  const recentlyUnfollowedSet = new Set(exportData.recentlyUnfollowed.map(f => f.username.toLowerCase()));

  // 1. Process Followers (People who follow you)
  if (exportData.followers.length > 0) {
    // Check for lost followers ONLY if this is a fresh current export (not an older archive)
    if (!isHistoricalArchive) {
      Object.keys(history.followers).forEach(u => {
        const prev = history.followers[u];
        if (prev.currently_following && !currentFollowersSet.has(u.toLowerCase())) {
          prev.currently_following = false;
          prev.removed_at = now;
          prev.removal_type = recentlyUnfollowedSet.has(u.toLowerCase()) ? 'removed_by_you' : 'unfollowed_you';
          if (!prev.events) prev.events = [];
          prev.events.push({
            type: 'lost_follower',
            timestamp: now,
            description: recentlyUnfollowedSet.has(u.toLowerCase()) ? 'Removed by you' : 'No longer in followers list (unfollowed you)'
          });
        }
      });
    }

    // Ingest incoming followers
    exportData.followers.forEach(item => {
      const u = item.username.toLowerCase();
      const igTimestamp = item.timestamp ? new Date(item.timestamp).toISOString() : null;
      const existing = history.followers[u] || history.all_known_users?.[u];
      
      const followedAt = earliestIsoTimestamp(existing?.followed_at, igTimestamp);
      const importedAt = earliestIsoTimestamp(existing?.imported_at, now);
      const lastSeen = latestIsoTimestamp(existing?.last_seen, igTimestamp || now) || now;

      if (!existing) {
        history.followers[u] = {
          username: u,
          followed_at: followedAt,
          imported_at: importedAt || now,
          added_at: followedAt || importedAt || now,
          last_seen: lastSeen,
          currently_following: true, // Follows you
          currently_followed_by_you: currentFollowingSet.has(u),
          notes: history.user_notes?.[u] || '',
          tags: history.user_tags?.[u] || [],
          events: [{
            type: 'became_follower',
            timestamp: igTimestamp || now,
            description: igTimestamp ? `Started following you on Instagram (${new Date(igTimestamp).toLocaleDateString()})` : 'Started following you'
          }]
        };
      } else {
        const wasFollowing = Boolean(existing.currently_following);
        if (!wasFollowing && !isHistoricalArchive) {
          if (!existing.events) existing.events = [];
          existing.events.push({
            type: 'became_follower',
            timestamp: igTimestamp || now,
            description: 'Followed you again'
          });
        }
        
        existing.followed_at = followedAt;
        existing.imported_at = importedAt || existing.imported_at;
        existing.last_seen = lastSeen;
        
        // If not historical archive, update active status to true
        if (!isHistoricalArchive || !existing.removed_at) {
          existing.currently_following = true;
          existing.removed_at = null;
        }
        if (currentFollowingSet.has(u)) {
          existing.currently_followed_by_you = true;
        }
        history.followers[u] = existing;
      }
    });
  }

  // 2. Process Following (People you follow)
  if (exportData.following.length > 0) {
    // Detect accounts you unfollowed ONLY on fresh exports
    if (!isHistoricalArchive) {
      Object.keys(history.following).forEach(u => {
        const prev = history.following[u];
        if (prev.currently_followed_by_you && !currentFollowingSet.has(u.toLowerCase())) {
          prev.currently_followed_by_you = false;
          prev.removed_at = now;
          prev.removal_type = 'you_unfollowed';
          if (!prev.events) prev.events = [];
          prev.events.push({
            type: 'you_unfollowed',
            timestamp: now,
            description: 'You unfollowed this profile'
          });
          // Preserve in unfollowed_by_you permanent archive
          history.unfollowed_by_you[u] = { ...prev };
        }
      });
    }

    // Ingest current following
    exportData.following.forEach(item => {
      const u = item.username.toLowerCase();
      const igTimestamp = item.timestamp ? new Date(item.timestamp).toISOString() : null;
      const existing = history.following[u] || history.all_known_users?.[u];

      // If user was previously manually removed, reconcile tag
      if (history.user_tags?.[u]?.includes('manually_removed')) {
        history.user_tags[u] = history.user_tags[u].filter(t => t !== 'manually_removed');
        if (history.unfollowed_by_you?.[u]?.tags) {
          history.unfollowed_by_you[u].tags = history.user_tags[u];
        }
      }

      const followedAt = earliestIsoTimestamp(existing?.followed_at, igTimestamp);
      const importedAt = earliestIsoTimestamp(existing?.imported_at, now);
      const lastSeen = latestIsoTimestamp(existing?.last_seen, igTimestamp || now) || now;

      if (!existing) {
        history.following[u] = {
          username: u,
          followed_at: followedAt,
          imported_at: importedAt || now,
          added_at: followedAt || importedAt || now,
          last_seen: lastSeen,
          currently_following: currentFollowersSet.has(u),
          currently_followed_by_you: true,
          notes: history.user_notes?.[u] || '',
          tags: history.user_tags?.[u] || [],
          events: [{
            type: 'you_followed',
            timestamp: igTimestamp || now,
            description: igTimestamp ? `You followed on Instagram (${new Date(igTimestamp).toLocaleDateString()})` : 'You followed this profile'
          }]
        };
      } else {
        if (!existing.currently_followed_by_you && !isHistoricalArchive) {
          if (!existing.events) existing.events = [];
          existing.events.push({
            type: 'you_followed',
            timestamp: igTimestamp || now,
            description: 'You followed this profile again'
          });
        }
        existing.followed_at = followedAt;
        existing.imported_at = importedAt || existing.imported_at;
        existing.last_seen = lastSeen;
        if (!isHistoricalArchive || !existing.removed_at) {
          existing.currently_followed_by_you = true;
          existing.removed_at = null;
        }
        if (currentFollowersSet.has(u)) {
          existing.currently_following = true;
        }
        history.following[u] = existing;
      }
    });
  }

  // 3. Process Recently Unfollowed (explicitly tracked by Instagram)
  exportData.recentlyUnfollowed.forEach(item => {
    const u = item.username;
    const igTimestamp = item.timestamp || now;
    const existing = history.following[u] || history.followers[u];
    
    const record: UserRecord = {
      username: u,
      followed_at: existing?.followed_at || null,
      imported_at: existing?.imported_at || now,
      added_at: existing?.added_at || igTimestamp,
      last_seen: igTimestamp,
      currently_following: false,
      currently_followed_by_you: false,
      removed_at: igTimestamp,
      removal_type: 'you_unfollowed',
      notes: history.user_notes?.[u] || '',
      tags: history.user_tags?.[u] || [],
      events: [{
        type: 'you_unfollowed',
        timestamp: igTimestamp,
        description: 'Unfollowed / Removed from following'
      }]
    };
    history.unfollowed_by_you[u] = record;
    if (history.following[u]) {
      history.following[u].currently_following = false;
      history.following[u].currently_followed_by_you = false;
      history.following[u].removed_at = igTimestamp;
      history.following[u].removal_type = 'you_unfollowed';
    }
  });

  // 4. Process Close Friends
  exportData.closeFriends.forEach(item => {
    const u = item.username;
    const igTimestamp = item.timestamp || null;
    history.close_friends[u] = {
      username: u,
      followed_at: igTimestamp,
      imported_at: now,
      added_at: igTimestamp || now,
      last_seen: now,
      currently_following: currentFollowersSet.has(u),
      currently_followed_by_you: currentFollowingSet.has(u),
      is_close_friend: true
    };
    if (history.followers[u]) history.followers[u].is_close_friend = true;
    if (history.following[u]) history.following[u].is_close_friend = true;
  });

  // 5. Process Blocked Profiles
  exportData.blocked.forEach(item => {
    const u = item.username;
    const igTimestamp = item.timestamp || null;
    history.blocked[u] = {
      username: u,
      followed_at: igTimestamp,
      imported_at: now,
      added_at: igTimestamp || now,
      last_seen: now,
      currently_following: false,
      currently_followed_by_you: false,
      is_blocked: true,
      removal_type: 'blocked'
    };
    if (history.followers[u]) history.followers[u].is_blocked = true;
    if (history.following[u]) history.following[u].is_blocked = true;
  });

  // 6. Process Restricted Profiles
  exportData.restricted.forEach(item => {
    const u = item.username;
    const igTimestamp = item.timestamp || null;
    history.restricted[u] = {
      username: u,
      followed_at: igTimestamp,
      imported_at: now,
      added_at: igTimestamp || now,
      last_seen: now,
      currently_following: currentFollowersSet.has(u),
      currently_followed_by_you: currentFollowingSet.has(u),
      is_restricted: true
    };
  });

  // 7. Process Pending Requests
  exportData.pendingRequestsSent.forEach(item => {
    const u = item.username;
    history.pending_sent[u] = {
      username: u,
      followed_at: item.timestamp || null,
      imported_at: now,
      added_at: item.timestamp || now,
      last_seen: now,
      currently_following: false,
      currently_followed_by_you: false,
      has_pending_request_sent: true
    };
  });

  exportData.pendingRequestsReceived.forEach(item => {
    const u = item.username;
    history.pending_received[u] = {
      username: u,
      followed_at: item.timestamp || null,
      imported_at: now,
      added_at: item.timestamp || now,
      last_seen: now,
      currently_following: false,
      currently_followed_by_you: false,
      has_pending_request_received: true
    };
  });

  // 8. Update Master Directory of All Known Historical Contacts
  const allUsernames = new Set([
    ...Object.keys(history.followers),
    ...Object.keys(history.following),
    ...Object.keys(history.unfollowed_by_you),
    ...Object.keys(history.close_friends),
    ...Object.keys(history.blocked),
    ...Object.keys(history.restricted),
    ...Object.keys(history.pending_sent),
    ...Object.keys(history.pending_received),
    ...Object.keys(history.all_known_users)
  ]);

  allUsernames.forEach(u => {
    const fol = history.followers[u];
    const fing = history.following[u];
    const unf = history.unfollowed_by_you[u];
    const isBlk = !!history.blocked[u] || fol?.is_blocked || fing?.is_blocked;
    const isCls = !!history.close_friends[u] || fol?.is_close_friend || fing?.is_close_friend;
    const isRes = !!history.restricted[u] || fol?.is_restricted || fing?.is_restricted;

    const isFol = Boolean(fol && fol.currently_following);
    const isFing = Boolean(fing && fing.currently_followed_by_you);

    const followedAt = fol?.followed_at || fing?.followed_at || history.all_known_users[u]?.followed_at || null;
    const importedAt = fol?.imported_at || fing?.imported_at || unf?.imported_at || history.all_known_users[u]?.imported_at || now;
    const lastSeen = fol?.last_seen || fing?.last_seen || unf?.last_seen || history.all_known_users[u]?.last_seen || now;

    history.all_known_users[u] = {
      username: u,
      followed_at: followedAt,
      imported_at: importedAt,
      added_at: followedAt || importedAt,
      last_seen: lastSeen,
      currently_following: isFol,
      currently_followed_by_you: isFing,
      removed_at: fol?.removed_at || fing?.removed_at || unf?.removed_at || null,
      removal_type: unf ? 'you_unfollowed' : (fol?.removal_type || fing?.removal_type),
      is_close_friend: isCls,
      is_blocked: isBlk,
      is_restricted: isRes,
      has_pending_request_sent: !!history.pending_sent[u],
      has_pending_request_received: !!history.pending_received[u],
      notes: history.user_notes[u] || fol?.notes || fing?.notes || '',
      tags: history.user_tags[u] || fol?.tags || fing?.tags || [],
      events: fol?.events || fing?.events || unf?.events || []
    };
  });

  await saveAccountHistory(accountId, history);

  // Update account metadata
  const currentAccounts = await getAccounts();
  const account = currentAccounts.find(a => a.id === accountId);
  if (account) {
    account.last_updated = now;
    if (folderOrZipName) {
      account.export_folder_name = folderOrZipName;
    }
    await saveAccounts(currentAccounts);
  }
}

// Get all accounts
router.get('/accounts', async (req, res) => {
  const accounts = await getAccounts();
  res.json(accounts);
});

// Create account
router.post('/accounts', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  const cleanName = name.replace(/^@/, '').trim().toLowerCase();
  const accounts = await getAccounts();
  
  // Check if exists
  const existing = accounts.find(a => a.name.toLowerCase() === cleanName);
  if (existing) {
    return res.json(existing);
  }

  const newAccount: Account = {
    id: uuidv4(),
    name: cleanName,
    created_at: new Date().toISOString(),
    last_updated: null
  };
  
  accounts.push(newAccount);
  await saveAccounts(accounts);
  res.json(newAccount);
});

// Delete account
router.delete('/accounts/:id', async (req, res) => {
  try {
    let accounts = await getAccounts();
    accounts = accounts.filter(a => a.id !== req.params.id);
    await saveAccounts(accounts);
    await deleteAccountHistory(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear an account's history/data while keeping or resetting the profile
router.post('/accounts/:id/clear-data', async (req, res) => {
  try {
    const { deleteProfile } = req.body;
    let accounts = await getAccounts();
    
    if (deleteProfile) {
      accounts = accounts.filter(a => a.id !== req.params.id);
      await saveAccounts(accounts);
      await deleteAccountHistory(req.params.id);
    } else {
      const account = accounts.find(a => a.id === req.params.id);
      if (account) {
        account.last_updated = null;
        account.export_folder_name = undefined;
        await saveAccounts(accounts);
      }
      await saveAccountHistory(req.params.id, {
        followers: {},
        following: {},
        unfollowed_by_you: {},
        all_known_users: {},
        user_notes: {},
        user_tags: {}
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear ALL local application data (all accounts, contacts, and logs)
router.post('/clear-all-data', async (req, res) => {
  try {
    await clearAllLocalData();
    res.json({ success: true, message: 'All local data has been successfully cleared.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Builds a single consolidated JSON database record for an account and all its contacts.
 * Each contact @example has exactly ONE comprehensive {} object containing all flags,
 * timestamps, notes, tags, and timeline events.
 */
export async function buildUnifiedAccountBackup(accountId: string): Promise<UnifiedAccountBackup | null> {
  const accounts = await getAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return null;

  const history = await getAccountHistory(accountId);
  const contacts: Record<string, UnifiedContactRecord> = {};

  const currentFollowersSet = new Set(
    Object.values(history.followers || {})
      .filter(u => u.currently_following !== false && !u.removed_at)
      .map(u => u.username.toLowerCase())
  );

  const currentFollowingSet = new Set(
    Object.values(history.following || {})
      .filter(u => {
        if (u.removed_at && (u.removal_type === 'you_unfollowed' || u.currently_followed_by_you === false)) return false;
        if (history.unfollowed_by_you?.[u.username]) return false;
        return true;
      })
      .map(u => u.username.toLowerCase())
  );

  // Collect all known contact usernames across all sets
  const allUsernames = new Set<string>([
    ...Object.keys(history.all_known_users || {}),
    ...Object.keys(history.followers || {}),
    ...Object.keys(history.following || {}),
    ...Object.keys(history.unfollowed_by_you || {}),
    ...Object.keys(history.close_friends || {}),
    ...Object.keys(history.blocked || {}),
    ...Object.keys(history.restricted || {}),
    ...Object.keys(history.pending_sent || {}),
    ...Object.keys(history.pending_received || {}),
    ...Object.keys(history.favorites || {}),
    ...Object.keys(history.user_notes || {}),
    ...Object.keys(history.user_tags || {})
  ]);

  for (const u of allUsernames) {
    const raw = history.all_known_users?.[u] || 
                history.followers?.[u] || 
                history.following?.[u] || 
                history.unfollowed_by_you?.[u] || {
                  username: u,
                  added_at: new Date().toISOString(),
                  last_seen: new Date().toISOString(),
                  currently_following: false
                };

    const fol = history.followers?.[u];
    const fing = history.following?.[u];
    const unf = history.unfollowed_by_you?.[u];
    const cf = history.close_friends?.[u];
    const blk = history.blocked?.[u];
    const rst = history.restricted?.[u];
    const ps = history.pending_sent?.[u];
    const pr = history.pending_received?.[u];
    const fav = history.favorites?.[u];

    const followsYou = currentFollowersSet.has(u);
    const youFollow = currentFollowingSet.has(u);
    const isMutual = followsYou && youFollow;
    const isCloseFriend = Boolean(cf || raw.is_close_friend);
    const isBlocked = Boolean(blk || raw.is_blocked);
    const isRestricted = Boolean(rst || raw.is_restricted);
    const isFavorite = Boolean(fav || raw.is_favorite);
    
    const tags = Array.from(new Set([
      ...(history.user_tags?.[u] || []),
      ...(raw.tags || []),
      ...(fol?.tags || []),
      ...(fing?.tags || [])
    ]));

    const isMissing = tags.includes('manually_missing');
    const isManuallyRemoved = tags.includes('manually_removed') || Boolean(unf);
    const hasPendingSent = Boolean(ps || raw.has_pending_request_sent);
    const hasPendingReceived = Boolean(pr || raw.has_pending_request_received);

    const removalType = raw.removal_type || fol?.removal_type || fing?.removal_type || unf?.removal_type || null;
    const followedAt = raw.followed_at || fing?.followed_at || fol?.followed_at || null;
    const importedAt = raw.imported_at || fol?.imported_at || fing?.imported_at || unf?.imported_at || raw.added_at || raw.last_seen || null;
    const removedAt = raw.removed_at || fol?.removed_at || fing?.removed_at || unf?.removed_at || null;
    const lastSeen = raw.last_seen || fol?.last_seen || fing?.last_seen || new Date().toISOString();
    const notes = history.user_notes?.[u] || raw.notes || '';
    const events = raw.events || fol?.events || fing?.events || [];

    // Single unified contact object
    contacts[u] = {
      username: u,
      follows_you: followsYou,
      you_follow: youFollow,
      is_mutual: isMutual,
      is_close_friend: isCloseFriend,
      is_blocked: isBlocked,
      is_restricted: isRestricted,
      is_favorite: isFavorite,
      is_missing: isMissing,
      is_manually_removed: isManuallyRemoved,
      has_pending_request_sent: hasPendingSent,
      has_pending_request_received: hasPendingReceived,
      removal_type: removalType,
      followed_at: followedAt,
      imported_at: importedAt,
      removed_at: removedAt,
      last_seen: lastSeen,
      notes,
      tags,
      events
    };
  }

  // Build a comprehensive, deduplicated tags map for all contacts
  const unifiedTags: Record<string, string[]> = { ...(history.user_tags || {}) };
  for (const [u, record] of Object.entries(contacts)) {
    if (record.tags && record.tags.length > 0) {
      const existingTags = unifiedTags[u] || [];
      const combined = Array.from(new Set([...existingTags, ...record.tags]));
      unifiedTags[u] = combined;
    }
  }

  return {
    id: account.id,
    name: account.name,
    created_at: account.created_at,
    last_updated: account.last_updated,
    export_folder_name: account.export_folder_name,
    tags: unifiedTags,
    contacts
  };
}

/**
 * Restores an account and its full contact history from a single unified backup JSON.
 * COMPARISON & SAFETY GUARANTEES:
 * 1. Timestamp Comparison:
 *    - followed_at: keeps the earliest verified follow date across backups.
 *    - imported_at: keeps the earliest initial import date.
 *    - last_seen: updates to the most recent observation date.
 * 2. Newer vs Older Ingestion:
 *    - If incoming backup/contact is newer: updates current active follower/following status and removal flags.
 *    - If incoming backup/contact is older: enriches history, backfills missing contacts, merges timeline events,
 *      and preserves earlier followed_at dates without wiping newer active relationships!
 * 3. Notes & Tags:
 *    - Never wipes existing notes when importing blank data; merges distinct notes.
 *    - Unifies and deduplicates all custom tags.
 */
export async function importUnifiedAccountBackup(backup: UnifiedAccountBackup, targetAccountId?: string): Promise<Account> {
  const accounts = await getAccounts();
  let account = targetAccountId ? accounts.find(a => a.id === targetAccountId) : undefined;
  
  if (!account && backup.name) {
    account = accounts.find(a => a.name.toLowerCase() === backup.name.toLowerCase());
  }

  const isNewAccount = !account;
  const now = new Date().toISOString();

  if (!account) {
    account = {
      id: backup.id || uuidv4(),
      name: backup.name || 'imported_account',
      created_at: backup.created_at || now,
      last_updated: backup.last_updated || now,
      export_folder_name: backup.export_folder_name || 'unified_database_backup'
    };
    accounts.push(account);
  } else {
    // Preserve earliest created_at, update last_updated to the latest timestamp
    account.created_at = earliestIsoTimestamp(account.created_at, backup.created_at) || account.created_at;
    account.last_updated = latestIsoTimestamp(account.last_updated, backup.last_updated || now) || now;
    if (backup.export_folder_name) {
      account.export_folder_name = backup.export_folder_name;
    }
  }

  await saveAccounts(accounts);

  // Load existing account history (if any) to perform intelligent merging
  const existingHistory = isNewAccount ? null : await getAccountHistory(account.id);
  
  const history: AccountHistory = {
    followers: existingHistory?.followers ? { ...existingHistory.followers } : {},
    following: existingHistory?.following ? { ...existingHistory.following } : {},
    unfollowed_by_you: existingHistory?.unfollowed_by_you ? { ...existingHistory.unfollowed_by_you } : {},
    close_friends: existingHistory?.close_friends ? { ...existingHistory.close_friends } : {},
    blocked: existingHistory?.blocked ? { ...existingHistory.blocked } : {},
    restricted: existingHistory?.restricted ? { ...existingHistory.restricted } : {},
    pending_sent: existingHistory?.pending_sent ? { ...existingHistory.pending_sent } : {},
    pending_received: existingHistory?.pending_received ? { ...existingHistory.pending_received } : {},
    favorites: existingHistory?.favorites ? { ...existingHistory.favorites } : {},
    all_known_users: existingHistory?.all_known_users ? { ...existingHistory.all_known_users } : {},
    user_notes: existingHistory?.user_notes ? { ...existingHistory.user_notes } : {},
    user_tags: existingHistory?.user_tags ? { ...existingHistory.user_tags } : {}
  };

  const contacts = backup.contacts || {};
  for (const [usernameKey, contact] of Object.entries(contacts)) {
    const username = (contact.username || usernameKey).toLowerCase().trim();
    if (!username) continue;

    // Find any existing contact record across history collections
    const existing = history.all_known_users?.[username] || 
                     history.followers?.[username] || 
                     history.following?.[username] || 
                     history.unfollowed_by_you?.[username];

    // Compare timestamps
    const followedAt = earliestIsoTimestamp(existing?.followed_at, contact.followed_at);
    const importedAt = earliestIsoTimestamp(existing?.imported_at, contact.imported_at || contact.followed_at || now);
    const lastSeen = latestIsoTimestamp(existing?.last_seen, contact.last_seen || backup.last_updated || now) || now;

    // Check if incoming contact record is newer than the existing record
    const isContactNewer = !existing || isTimestampNewer(
      contact.last_seen || backup.last_updated, 
      existing.last_seen || existingHistory?.followers?.[username]?.last_seen
    );

    // Merge tags from contact and backup.tags
    const backupTagsForUser = (backup.tags && typeof backup.tags === 'object') ? (backup.tags[username] || backup.tags[usernameKey] || []) : [];
    const incomingTags = Array.isArray(contact.tags) ? [...contact.tags] : [];
    if (Array.isArray(backupTagsForUser)) {
      backupTagsForUser.forEach(t => {
        if (typeof t === 'string' && !incomingTags.includes(t)) {
          incomingTags.push(t);
        }
      });
    }
    if (contact.is_missing && !incomingTags.includes('manually_missing')) {
      incomingTags.push('manually_missing');
    }
    if (contact.is_manually_removed && !incomingTags.includes('manually_removed')) {
      incomingTags.push('manually_removed');
    }
    const mergedTags = Array.from(new Set([
      ...(history.user_tags?.[username] || []),
      ...(existing?.tags || []),
      ...incomingTags
    ]));

    // Merge notes (never overwrite existing notes with blank)
    const existingNote = (history.user_notes?.[username] || existing?.notes || '').trim();
    const incomingNote = (contact.notes || '').trim();
    let mergedNotes = existingNote;
    if (!existingNote && incomingNote) {
      mergedNotes = incomingNote;
    } else if (existingNote && incomingNote && existingNote !== incomingNote) {
      mergedNotes = isContactNewer 
        ? `${incomingNote}\n[Previous Note]: ${existingNote}`
        : `${existingNote}\n[Imported Note]: ${incomingNote}`;
    }

    if (mergedNotes) {
      history.user_notes[username] = mergedNotes;
    }
    if (mergedTags.length > 0) {
      history.user_tags[username] = mergedTags;
    }

    // Merge timeline events deduplicated and chronologically sorted
    const mergedEvents = mergeHistoryEvents(existing?.events || [], contact.events || []);

    // Determine active flags based on whether incoming data is newer
    let followsYou = isContactNewer 
      ? Boolean(contact.follows_you) 
      : Boolean(existing?.currently_following ?? contact.follows_you);

    let youFollow = isContactNewer 
      ? Boolean(contact.you_follow) 
      : Boolean(existing?.currently_followed_by_you ?? contact.you_follow);

    let isCloseFriend = isContactNewer ? Boolean(contact.is_close_friend) : Boolean(existing?.is_close_friend || contact.is_close_friend);
    let isBlocked = isContactNewer ? Boolean(contact.is_blocked) : Boolean(existing?.is_blocked || contact.is_blocked);
    let isRestricted = isContactNewer ? Boolean(contact.is_restricted) : Boolean(existing?.is_restricted || contact.is_restricted);
    let isFavorite = isContactNewer ? Boolean(contact.is_favorite) : Boolean(existing?.is_favorite || contact.is_favorite);
    let hasPendingSent = isContactNewer ? Boolean(contact.has_pending_request_sent) : Boolean(existing?.has_pending_request_sent || contact.has_pending_request_sent);
    let hasPendingReceived = isContactNewer ? Boolean(contact.has_pending_request_received) : Boolean(existing?.has_pending_request_received || contact.has_pending_request_received);

    let removalType = isContactNewer ? (contact.removal_type || null) : (existing?.removal_type || contact.removal_type || null);
    let removedAt = isContactNewer ? (contact.removed_at || null) : (existing?.removed_at || contact.removed_at || null);

    // If user is currently following in the newer state, clear removal flags
    if (followsYou || youFollow) {
      if (isContactNewer && !contact.removed_at) {
        removalType = null;
        removedAt = null;
      }
    }

    const userRecord: UserRecord = {
      username,
      followed_at: followedAt,
      imported_at: importedAt || now,
      added_at: followedAt || importedAt || now,
      last_seen: lastSeen,
      currently_following: followsYou,
      currently_followed_by_you: youFollow,
      removed_at: removedAt,
      removal_type: removalType || undefined,
      is_close_friend: isCloseFriend,
      is_blocked: isBlocked,
      is_restricted: isRestricted,
      is_favorite: isFavorite,
      has_pending_request_sent: hasPendingSent,
      has_pending_request_received: hasPendingReceived,
      notes: mergedNotes,
      tags: mergedTags,
      events: mergedEvents
    };

    history.all_known_users[username] = userRecord;

    // Synchronize into specific sub-collections
    if (followsYou) {
      history.followers[username] = { ...userRecord, currently_following: true };
    } else if (removalType === 'unfollowed_you' || (removedAt && !mergedTags.includes('manually_removed'))) {
      history.followers[username] = { ...userRecord, currently_following: false };
    }

    if (youFollow) {
      history.following[username] = { ...userRecord, currently_followed_by_you: true };
    }

    if (mergedTags.includes('manually_removed') || removalType === 'you_unfollowed' || removalType === 'removed_by_you') {
      history.unfollowed_by_you[username] = { ...userRecord, currently_followed_by_you: false };
    }

    if (isCloseFriend) {
      history.close_friends[username] = userRecord;
    } else {
      delete history.close_friends[username];
    }

    if (isBlocked) {
      history.blocked[username] = userRecord;
    } else {
      delete history.blocked[username];
    }

    if (isRestricted) {
      history.restricted[username] = userRecord;
    } else {
      delete history.restricted[username];
    }

    if (hasPendingSent) {
      history.pending_sent[username] = userRecord;
    } else {
      delete history.pending_sent[username];
    }

    if (hasPendingReceived) {
      history.pending_received[username] = userRecord;
    } else {
      delete history.pending_received[username];
    }

    if (isFavorite) {
      history.favorites[username] = userRecord;
    } else {
      delete history.favorites[username];
    }
  }

  // Refresh and deduplicate all known tags registry
  const allKnownTagsSet = new Set(history.all_known_tags || []);
  Object.values(history.user_tags || {}).forEach(tagList => {
    if (Array.isArray(tagList)) {
      tagList.forEach(t => {
        if (typeof t === 'string' && t.trim()) allKnownTagsSet.add(t.trim().toLowerCase());
      });
    }
  });
  history.all_known_tags = Array.from(allKnownTagsSet);

  await saveAccountHistory(account.id, history);
  return account;
}

// Export entire local JSON database across ALL accounts (Human-readable formatted JSON)
router.get('/database/export', async (req, res) => {
  try {
    const accounts = await getAccounts();
    const accountBackups: UnifiedAccountBackup[] = [];

    for (const acc of accounts) {
      const backup = await buildUnifiedAccountBackup(acc.id);
      if (backup) {
        accountBackups.push(backup);
      }
    }

    const payload: UnifiedDatabaseBackup = {
      format: 'instagram_tracker_database',
      version: '1.0',
      exported_at: new Date().toISOString(),
      accounts: accountBackups
    };

    // Beautiful 2-space formatted human readable JSON
    const formattedJson = JSON.stringify(payload, null, 2);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="instagram_tracker_database_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(formattedJson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export single account database in unified single-record format (Human-readable formatted JSON)
router.get('/accounts/:id/export-database', async (req, res) => {
  try {
    const backup = await buildUnifiedAccountBackup(req.params.id);
    if (!backup) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const payload = {
      format: 'instagram_tracker_database',
      version: '1.0',
      exported_at: new Date().toISOString(),
      account: backup
    };

    // Beautiful 2-space formatted human readable JSON
    const formattedJson = JSON.stringify(payload, null, 2);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="instagram_${backup.name}_database_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(formattedJson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Import unified JSON database backup (all accounts or single account)
router.post('/database/import', upload.single('file'), async (req, res) => {
  try {
    let payload: any = null;

    if (req.file) {
      const diag = analyzeAndParseJson(req.file.buffer, req.file.originalname);
      if (!diag.success) {
        return res.status(400).json({
          error: diag.error,
          technicalDetails: diag.technicalDetails,
          detectedFormat: diag.detectedFormat,
          previewSnippet: diag.previewSnippet,
          troubleshooting: diag.troubleshooting
        });
      }
      payload = diag.data;
    } else if (req.body && (req.body.database || req.body.accounts || req.body.account || req.body.contacts)) {
      payload = req.body.database || req.body;
    } else {
      return res.status(400).json({ error: 'No database JSON content provided.' });
    }

    const importedAccounts: Account[] = [];
    let totalContactsImported = 0;

    if (payload.accounts && Array.isArray(payload.accounts)) {
      for (const accBackup of payload.accounts) {
        const acc = await importUnifiedAccountBackup(accBackup);
        importedAccounts.push(acc);
        totalContactsImported += Object.keys(accBackup.contacts || {}).length;
      }
    } else if (payload.account && typeof payload.account === 'object') {
      const acc = await importUnifiedAccountBackup(payload.account);
      importedAccounts.push(acc);
      totalContactsImported += Object.keys(payload.account.contacts || {}).length;
    } else if (payload.contacts && typeof payload.contacts === 'object') {
      const acc = await importUnifiedAccountBackup(payload as UnifiedAccountBackup);
      importedAccounts.push(acc);
      totalContactsImported += Object.keys(payload.contacts || {}).length;
    } else if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item && item.contacts) {
          const acc = await importUnifiedAccountBackup(item as UnifiedAccountBackup);
          importedAccounts.push(acc);
          totalContactsImported += Object.keys(item.contacts || {}).length;
        }
      }
    } else {
      return res.status(400).json({
        error: 'Unrecognized database backup structure.',
        technicalDetails: 'Expected a JSON object with "accounts" or "contacts" mapping.',
        troubleshooting: 'Ensure you selected a backup generated by this application or an Instagram database export.'
      });
    }

    res.json({
      success: true,
      message: `Successfully imported ${importedAccounts.length} account(s) and ${totalContactsImported} contact records.`,
      importedAccounts,
      totalContactsImported
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Import unified database JSON directly into a specific account
router.post('/accounts/:id/import-database', upload.single('file'), async (req, res) => {
  try {
    let payload: any = null;

    if (req.file) {
      const diag = analyzeAndParseJson(req.file.buffer, req.file.originalname);
      if (!diag.success) {
        return res.status(400).json({
          error: diag.error,
          technicalDetails: diag.technicalDetails,
          detectedFormat: diag.detectedFormat,
          previewSnippet: diag.previewSnippet,
          troubleshooting: diag.troubleshooting
        });
      }
      payload = diag.data;
    } else if (req.body) {
      payload = req.body.database || req.body.account || req.body;
    }

    if (!payload) {
      return res.status(400).json({ error: 'No database JSON content provided.' });
    }

    const backupAccount = payload.account || (payload.contacts ? payload : payload.accounts?.[0]);
    if (!backupAccount || !backupAccount.contacts) {
      return res.status(400).json({
        error: 'No contact records found in provided JSON.',
        technicalDetails: 'The JSON file was parsed successfully but does not contain a "contacts" dictionary.',
        troubleshooting: 'Make sure you selected a valid account database backup file.'
      });
    }

    const updatedAccount = await importUnifiedAccountBackup(backupAccount, req.params.id);
    const contactsCount = Object.keys(backupAccount.contacts || {}).length;

    res.json({
      success: true,
      message: `Successfully imported ${contactsCount} contact records into @${updatedAccount.name}.`,
      account: updatedAccount,
      contactsCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload an entire exported folder or multiple files directly
router.post('/accounts/upload-folder', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided in upload.' });
    }

    let targetAccountId = (req.body.accountId as string) || '';
    const folderName = (req.body.folderName as string) || '';
    const relativePaths: string[] = [];

    // Extract path headers if sent by frontend
    if (req.body.filePaths) {
      try {
        const parsedPaths = JSON.parse(req.body.filePaths);
        if (Array.isArray(parsedPaths)) {
          relativePaths.push(...parsedPaths);
        }
      } catch {}
    }

    const exportData: ParsedExportData = {
      detectedUsername: extractUsernameFromExportName(folderName) || undefined,
      followers: [],
      following: [],
      recentlyUnfollowed: [],
      closeFriends: [],
      blocked: [],
      restricted: [],
      pendingRequestsSent: [],
      pendingRequestsReceived: [],
      favorites: []
    };

    const detectedHtmlFiles: string[] = [];
    const parseDiagnostics: Array<{ filename: string; error: string; preview?: string; troubleshooting?: string }> = [];

    // Process all uploaded files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = relativePaths[i] || file.originalname;
      const lowerName = relPath.toLowerCase();

      if (!exportData.detectedUsername) {
        const u = extractUsernameFromExportName(relPath);
        if (u) exportData.detectedUsername = u;
      }

      // Check for HTML export files
      if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
        if (lowerName.includes('follower') || lowerName.includes('following') || lowerName.includes('connections')) {
          detectedHtmlFiles.push(relPath);
        }
        continue;
      }

      if (lowerName.endsWith('.zip')) {
        const zipData = await extractFromZip(file.buffer, relPath);
        if (zipData.detectedUsername && !exportData.detectedUsername) {
          exportData.detectedUsername = zipData.detectedUsername;
        }
        exportData.followers.push(...zipData.followers);
        exportData.following.push(...zipData.following);
        exportData.recentlyUnfollowed.push(...zipData.recentlyUnfollowed);
        exportData.closeFriends.push(...zipData.closeFriends);
        exportData.blocked.push(...zipData.blocked);
        exportData.restricted.push(...zipData.restricted);
        exportData.pendingRequestsSent.push(...zipData.pendingRequestsSent);
        exportData.pendingRequestsReceived.push(...zipData.pendingRequestsReceived);
        exportData.favorites.push(...zipData.favorites);
      } else if (lowerName.endsWith('.json')) {
        const diag = analyzeAndParseJson(file.buffer, relPath);
        if (!diag.success) {
          parseDiagnostics.push({
            filename: relPath,
            error: diag.error || 'Failed to parse JSON',
            preview: diag.previewSnippet,
            troubleshooting: diag.troubleshooting
          });
          continue;
        }

        const jsonContent = diag.data;
        
        // Auto-detect unified single-record database JSON backup file
        if (jsonContent && (jsonContent.format === 'instagram_tracker_database' || jsonContent.contacts || (jsonContent.account && jsonContent.account.contacts) || (Array.isArray(jsonContent.accounts)))) {
          if (jsonContent.accounts && Array.isArray(jsonContent.accounts)) {
            for (const accB of jsonContent.accounts) {
              await importUnifiedAccountBackup(accB);
            }
            const accs = await getAccounts();
            return res.json({
              success: true,
              isDatabaseBackup: true,
              message: `Imported ${jsonContent.accounts.length} account(s) from unified JSON database.`,
              account: accs[0]
            });
          } else if (jsonContent.account || jsonContent.contacts) {
            const accB = jsonContent.account || jsonContent;
            const imported = await importUnifiedAccountBackup(accB, targetAccountId || undefined);
            return res.json({
              success: true,
              isDatabaseBackup: true,
              message: `Imported account @${imported.name} from unified JSON database.`,
              account: imported
            });
          }
        }

        categorizeAndIngestFile(relPath, jsonContent, exportData);
      }
    }

    // Deduplicate parsed items
    const dedupe = (items: ParsedItem[]) => {
      const map = new Map<string, ParsedItem>();
      items.forEach(item => {
        if (!map.has(item.username)) map.set(item.username, item);
      });
      return Array.from(map.values());
    };

    exportData.followers = dedupe(exportData.followers);
    exportData.following = dedupe(exportData.following);
    exportData.recentlyUnfollowed = dedupe(exportData.recentlyUnfollowed);
    exportData.closeFriends = dedupe(exportData.closeFriends);
    exportData.blocked = dedupe(exportData.blocked);
    exportData.restricted = dedupe(exportData.restricted);
    exportData.pendingRequestsSent = dedupe(exportData.pendingRequestsSent);
    exportData.pendingRequestsReceived = dedupe(exportData.pendingRequestsReceived);
    exportData.favorites = dedupe(exportData.favorites);

    if (exportData.followers.length === 0 && exportData.following.length === 0 && exportData.recentlyUnfollowed.length === 0) {
      if (detectedHtmlFiles.length > 0) {
        return res.status(400).json({
          error: 'HTML export files detected instead of JSON!',
          technicalDetails: `Found HTML files: ${detectedHtmlFiles.slice(0, 3).join(', ')}. Meta exported your Instagram data in HTML format.`,
          previewSnippet: 'HTML export files cannot be analyzed as JSON structures.',
          troubleshooting: 'In Meta Accounts Center, make sure to set format to "JSON" (not HTML). Then download and upload the new JSON files.'
        });
      }

      if (parseDiagnostics.length > 0) {
        const first = parseDiagnostics[0];
        return res.status(400).json({
          error: first.error,
          technicalDetails: `Failed parsing file "${first.filename}".`,
          previewSnippet: first.preview,
          troubleshooting: first.troubleshooting || 'Check your export files.'
        });
      }

      return res.status(400).json({
        error: 'No Instagram follower or following data could be found in the uploaded files.',
        technicalDetails: 'Expected files like "followers_1.json", "following.json", or a folder containing "connections/followers_and_following".',
        troubleshooting: 'Make sure you selected the full Instagram export folder or ZIP archive containing JSON files.'
      });
    }

    // Determine target account
    const accounts = await getAccounts();
    let account = accounts.find(a => a.id === targetAccountId);

    if (!account && exportData.detectedUsername) {
      // Find by detected username
      account = accounts.find(a => a.name.toLowerCase() === exportData.detectedUsername?.toLowerCase());
      if (!account) {
        // Auto-create account for this Instagram profile
        account = {
          id: uuidv4(),
          name: exportData.detectedUsername,
          created_at: new Date().toISOString(),
          last_updated: null,
          export_folder_name: folderName || undefined
        };
        accounts.push(account);
        await saveAccounts(accounts);
      }
    } else if (!account && accounts.length > 0) {
      // Use active / first account if none specified
      account = accounts[0];
    } else if (!account) {
      // Fallback name
      account = {
        id: uuidv4(),
        name: 'instagram_profile',
        created_at: new Date().toISOString(),
        last_updated: null,
        export_folder_name: folderName || undefined
      };
      accounts.push(account);
      await saveAccounts(accounts);
    }

    await processAndSaveExportData(account.id, exportData, folderName || undefined);

    res.json({
      success: true,
      account,
      statsSummary: {
        followersParsed: exportData.followers.length,
        followingParsed: exportData.following.length,
        recentlyUnfollowedParsed: exportData.recentlyUnfollowed.length,
        closeFriendsParsed: exportData.closeFriends.length,
        blockedParsed: exportData.blocked.length,
        detectedUsername: exportData.detectedUsername
      }
    });
  } catch (error: any) {
    console.error('Folder upload processing error:', error);
    res.status(500).json({ error: error.message || 'Failed to process folder.' });
  }
});

// Upload files for a specific account
router.post('/accounts/:id/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const folderName = (req.body.folderName as string) || '';
    const relativePaths: string[] = [];

    if (req.body.filePaths) {
      try {
        const parsed = JSON.parse(req.body.filePaths);
        if (Array.isArray(parsed)) relativePaths.push(...parsed);
      } catch {}
    }

    const exportData: ParsedExportData = {
      followers: [],
      following: [],
      recentlyUnfollowed: [],
      closeFriends: [],
      blocked: [],
      restricted: [],
      pendingRequestsSent: [],
      pendingRequestsReceived: [],
      favorites: []
    };

    const detectedHtmlFiles: string[] = [];
    const parseDiagnostics: Array<{ filename: string; error: string; preview?: string; troubleshooting?: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = relativePaths[i] || file.originalname;
      const lowerName = relPath.toLowerCase();

      if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
        if (lowerName.includes('follower') || lowerName.includes('following') || lowerName.includes('connections')) {
          detectedHtmlFiles.push(relPath);
        }
        continue;
      }

      if (lowerName.endsWith('.zip')) {
        const zipData = await extractFromZip(file.buffer, relPath);
        exportData.followers.push(...zipData.followers);
        exportData.following.push(...zipData.following);
        exportData.recentlyUnfollowed.push(...zipData.recentlyUnfollowed);
        exportData.closeFriends.push(...zipData.closeFriends);
        exportData.blocked.push(...zipData.blocked);
        exportData.restricted.push(...zipData.restricted);
        exportData.pendingRequestsSent.push(...zipData.pendingRequestsSent);
        exportData.pendingRequestsReceived.push(...zipData.pendingRequestsReceived);
        exportData.favorites.push(...zipData.favorites);
      } else if (lowerName.endsWith('.json')) {
        const diag = analyzeAndParseJson(file.buffer, relPath);
        if (!diag.success) {
          parseDiagnostics.push({
            filename: relPath,
            error: diag.error || 'Failed to parse JSON',
            preview: diag.previewSnippet,
            troubleshooting: diag.troubleshooting
          });
          continue;
        }
        categorizeAndIngestFile(relPath, diag.data, exportData);
      }
    }

    // Deduplicate
    const dedupe = (items: ParsedItem[]) => {
      const map = new Map<string, ParsedItem>();
      items.forEach(item => {
        if (!map.has(item.username)) map.set(item.username, item);
      });
      return Array.from(map.values());
    };

    exportData.followers = dedupe(exportData.followers);
    exportData.following = dedupe(exportData.following);
    exportData.recentlyUnfollowed = dedupe(exportData.recentlyUnfollowed);
    exportData.closeFriends = dedupe(exportData.closeFriends);
    exportData.blocked = dedupe(exportData.blocked);
    exportData.restricted = dedupe(exportData.restricted);
    exportData.pendingRequestsSent = dedupe(exportData.pendingRequestsSent);
    exportData.pendingRequestsReceived = dedupe(exportData.pendingRequestsReceived);
    exportData.favorites = dedupe(exportData.favorites);

    if (exportData.followers.length === 0 && exportData.following.length === 0 && exportData.recentlyUnfollowed.length === 0) {
      if (detectedHtmlFiles.length > 0) {
        return res.status(400).json({
          error: 'HTML export files detected instead of JSON!',
          technicalDetails: `Found HTML files: ${detectedHtmlFiles.slice(0, 3).join(', ')}. Meta exported your data in HTML format.`,
          previewSnippet: 'HTML files cannot be read as JSON.',
          troubleshooting: 'In Meta Accounts Center, make sure to set format to "JSON". Then request and download the new export.'
        });
      }

      if (parseDiagnostics.length > 0) {
        const first = parseDiagnostics[0];
        return res.status(400).json({
          error: first.error,
          technicalDetails: `Failed parsing file "${first.filename}".`,
          previewSnippet: first.preview,
          troubleshooting: first.troubleshooting || 'Check that your files are valid JSON.'
        });
      }

      return res.status(400).json({ 
        error: 'Could not find followers or following usernames in the uploaded files.',
        technicalDetails: 'The uploaded files did not match expected Instagram JSON keys (e.g. followers_1.json, following.json).',
        troubleshooting: 'Make sure you selected format "JSON" when exporting from Instagram, and uploaded the complete export folder, followers_1.json, or following.json.' 
      });
    }

    await processAndSaveExportData(req.params.id, exportData, folderName || undefined);

    res.json({ 
      success: true, 
      followersParsed: exportData.followers.length, 
      followingParsed: exportData.following.length,
      recentlyUnfollowedParsed: exportData.recentlyUnfollowed.length,
      closeFriendsParsed: exportData.closeFriends.length
    });
  } catch (error: any) {
    console.error('Upload processing error:', error);
    res.status(500).json({ error: error.message || 'Failed to process uploaded files.' });
  }
});

// Paste raw JSON directly
router.post('/accounts/:id/paste', async (req, res) => {
  try {
    const { followersJson, followingJson, rawJson, type } = req.body;
    const exportData: ParsedExportData = {
      followers: [],
      following: [],
      recentlyUnfollowed: [],
      closeFriends: [],
      blocked: [],
      restricted: [],
      pendingRequestsSent: [],
      pendingRequestsReceived: [],
      favorites: []
    };

    if (followersJson) {
      const diag = analyzeAndParseJson(followersJson, 'Followers JSON');
      if (!diag.success) {
        return res.status(400).json({
          error: diag.error,
          technicalDetails: diag.technicalDetails,
          previewSnippet: diag.previewSnippet,
          troubleshooting: diag.troubleshooting
        });
      }
      categorizeAndIngestFile('followers_1.json', diag.data, exportData);
    }

    if (followingJson) {
      const diag = analyzeAndParseJson(followingJson, 'Following JSON');
      if (!diag.success) {
        return res.status(400).json({
          error: diag.error,
          technicalDetails: diag.technicalDetails,
          previewSnippet: diag.previewSnippet,
          troubleshooting: diag.troubleshooting
        });
      }
      categorizeAndIngestFile('following.json', diag.data, exportData);
    }

    if (rawJson) {
      const diag = analyzeAndParseJson(rawJson, 'Pasted JSON');
      if (!diag.success) {
        return res.status(400).json({
          error: diag.error,
          technicalDetails: diag.technicalDetails,
          previewSnippet: diag.previewSnippet,
          troubleshooting: diag.troubleshooting
        });
      }
      const fakePath = type === 'following' ? 'following.json' : 'followers_1.json';
      categorizeAndIngestFile(fakePath, diag.data, exportData);
    }

    if (exportData.followers.length === 0 && exportData.following.length === 0) {
      return res.status(400).json({
        error: 'No usernames found in the pasted JSON text.',
        technicalDetails: 'The JSON was valid syntax but did not contain Instagram relationships or username structures.',
        troubleshooting: 'Copy and paste the exact contents of followers_1.json or following.json from your Meta export.'
      });
    }

    await processAndSaveExportData(req.params.id, exportData);

    res.json({
      success: true,
      followersParsed: exportData.followers.length,
      followingParsed: exportData.following.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error processing pasted JSON text.' });
  }
});

// Update user notes or tags permanently
router.post('/accounts/:id/contacts/:username/notes', async (req, res) => {
  try {
    const { notes, tags } = req.body;
    const username = req.params.username.toLowerCase();
    const history = await getAccountHistory(req.params.id);

    if (!history.user_notes) history.user_notes = {};
    if (!history.user_tags) history.user_tags = {};

    if (typeof notes === 'string') {
      history.user_notes[username] = notes;
    }
    if (Array.isArray(tags)) {
      const cleanTags = tags
        .filter(t => typeof t === 'string')
        .map(t => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean);

      history.user_tags[username] = [...cleanTags];
      // Update global tags registry
      if (!history.all_known_tags) history.all_known_tags = [];
      cleanTags.forEach(tag => {
        if (!history.all_known_tags!.includes(tag)) {
          history.all_known_tags!.push(tag);
        }
      });

      // Update in all lists if present
      if (history.followers[username]) {
        history.followers[username].tags = [...cleanTags];
      }
      if (history.following[username]) {
        history.following[username].tags = [...cleanTags];
      }
      if (history.unfollowed_by_you?.[username]) {
        history.unfollowed_by_you[username].tags = [...cleanTags];
      }
      if (history.all_known_users?.[username]) {
        history.all_known_users[username].tags = [...cleanTags];
      }
    }

    if (typeof notes === 'string') {
      if (history.followers[username]) history.followers[username].notes = notes;
      if (history.following[username]) history.following[username].notes = notes;
      if (history.unfollowed_by_you?.[username]) history.unfollowed_by_you[username].notes = notes;
      if (history.all_known_users?.[username]) history.all_known_users[username].notes = notes;
    }

    await saveAccountHistory(req.params.id, history);
    res.json({ success: true, notes: history.user_notes[username] || '', tags: history.user_tags[username] || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark contact as manually removed / unfollowed
router.post('/accounts/:id/contacts/:username/manual-remove', async (req, res) => {
  try {
    const { action } = req.body; // 'remove' or 'unmark'
    const username = req.params.username.toLowerCase();
    const history = await getAccountHistory(req.params.id);
    const now = new Date().toISOString();

    if (!history.unfollowed_by_you) history.unfollowed_by_you = {};
    if (!history.user_tags) history.user_tags = {};
    if (!history.user_notes) history.user_notes = {};

    const existingTags = history.user_tags[username] || [];
    const isCurrentlyMarked = existingTags.includes('manually_removed') || (history.unfollowed_by_you[username] && history.unfollowed_by_you[username].removal_type === 'you_unfollowed');

    if (action === 'unmark' || (action === undefined && isCurrentlyMarked)) {
      // Unmark manual removal: fully restore account
      history.user_tags[username] = existingTags.filter(t => t !== 'manually_removed');
      delete history.unfollowed_by_you[username];

      if (history.following[username]) {
        history.following[username].currently_followed_by_you = true;
        history.following[username].removed_at = null;
        history.following[username].removal_type = undefined;
        history.following[username].tags = history.user_tags[username];
        if (!history.following[username].events) history.following[username].events = [];
        history.following[username].events!.push({
          type: 'you_followed',
          timestamp: now,
          description: 'Restored / Remove reversed by you'
        });
      } else {
        const existingRec = history.all_known_users?.[username] || {
          username,
          added_at: now,
          imported_at: now,
          last_seen: now,
          currently_following: false
        };
        history.following[username] = {
          ...existingRec,
          currently_followed_by_you: true,
          removed_at: null,
          removal_type: undefined,
          tags: history.user_tags[username],
          events: [
            ...((existingRec as UserRecord).events || []),
            {
              type: 'you_followed',
              timestamp: now,
              description: 'Restored / Remove reversed by you'
            }
          ]
        };
      }

      if (history.all_known_users[username]) {
        history.all_known_users[username].currently_followed_by_you = true;
        history.all_known_users[username].removed_at = null;
        history.all_known_users[username].removal_type = undefined;
        history.all_known_users[username].tags = history.user_tags[username];
      }
    } else {
      // Mark as manually removed
      if (!existingTags.includes('manually_removed')) {
        history.user_tags[username] = [...existingTags, 'manually_removed'];
      }

      const existingRecord = history.following[username] || history.followers[username] || history.all_known_users[username] || {
        username,
        added_at: now,
        imported_at: now,
        last_seen: now,
        currently_following: false
      };

      const removalRecord: UserRecord = {
        ...existingRecord,
        username,
        currently_followed_by_you: false,
        removed_at: now,
        removal_type: 'you_unfollowed',
        notes: history.user_notes[username] || existingRecord.notes || '',
        tags: history.user_tags[username]
      };

      if (!removalRecord.events) removalRecord.events = [];
      removalRecord.events.push({
        type: 'you_unfollowed',
        timestamp: now,
        description: 'Manually marked as removed / unfollowed by you (#manually_removed)'
      });

      // Save into unfollowed_by_you
      history.unfollowed_by_you[username] = removalRecord;

      // Update following record if present
      if (history.following[username]) {
        history.following[username].currently_followed_by_you = false;
        history.following[username].removed_at = now;
        history.following[username].removal_type = 'you_unfollowed';
        history.following[username].tags = history.user_tags[username];
        if (!history.following[username].events) history.following[username].events = [];
        history.following[username].events!.push({
          type: 'you_unfollowed',
          timestamp: now,
          description: 'Manually marked as removed by you (#manually_removed)'
        });
      }

      // Update master directory
      if (history.all_known_users[username]) {
        history.all_known_users[username].currently_followed_by_you = false;
        history.all_known_users[username].removed_at = now;
        history.all_known_users[username].removal_type = 'you_unfollowed';
        history.all_known_users[username].tags = history.user_tags[username];
      } else {
        history.all_known_users[username] = removalRecord;
      }
    }

    await saveAccountHistory(req.params.id, history);
    res.json({ 
      success: true, 
      manuallyRemoved: action !== 'unmark' && (action === 'remove' || !isCurrentlyMarked),
      tags: history.user_tags[username] 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark contact as manually missing
router.post('/accounts/:id/contacts/:username/manual-missing', async (req, res) => {
  try {
    const { action } = req.body; // 'missing' or 'unmark'
    const username = req.params.username.toLowerCase();
    const history = await getAccountHistory(req.params.id);

    if (!history.user_tags) history.user_tags = {};

    const existingTags = history.user_tags[username] || [];
    const isCurrentlyMarked = existingTags.includes('manually_missing');

    if (action === 'unmark' || (action === undefined && isCurrentlyMarked)) {
      history.user_tags[username] = existingTags.filter(t => t !== 'manually_missing');
    } else {
      if (!existingTags.includes('manually_missing')) {
        history.user_tags[username] = [...existingTags, 'manually_missing'];
      }
    }

    if (history.all_known_users[username]) {
      history.all_known_users[username].tags = history.user_tags[username];
    }
    if (history.followers[username]) {
      history.followers[username].tags = history.user_tags[username];
    }
    if (history.following[username]) {
      history.following[username].tags = history.user_tags[username];
    }

    await saveAccountHistory(req.params.id, history);
    res.json({ 
      success: true, 
      manuallyMissing: action !== 'unmark' && (action === 'missing' || !isCurrentlyMarked),
      tags: history.user_tags[username] 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get stats & lists
router.get('/accounts/:id/data', async (req, res) => {
  const history = await getAccountHistory(req.params.id);
  
  // Set of followers who currently follow you
  const currentFollowersEntries = Object.values(history.followers || {}).filter(u => u.currently_following !== false && !u.removed_at);
  const currentFollowersSet = new Set(currentFollowersEntries.map(u => u.username));

  // Set of accounts you currently follow (in following list and not removed by you)
  const currentFollowingEntries = Object.values(history.following || {}).filter(u => {
    if (u.removed_at && (u.removal_type === 'you_unfollowed' || u.currently_followed_by_you === false)) return false;
    if (history.unfollowed_by_you?.[u.username]) return false;
    return true;
  });
  const currentFollowingSet = new Set(currentFollowingEntries.map(u => u.username));

  // Master normalizer function for consistent records
  const normalizeRecord = (raw: UserRecord): UserRecord => {
    const u = raw.username;
    const isFollower = currentFollowersSet.has(u);
    const isFollowing = currentFollowingSet.has(u);
    const fol = history.followers?.[u];
    const fing = history.following?.[u];
    const unf = history.unfollowed_by_you?.[u];
    const master = history.all_known_users?.[u];

    const followedAt = raw.followed_at || fing?.followed_at || fol?.followed_at || master?.followed_at || null;
    const importedAt = raw.imported_at || master?.imported_at || fol?.imported_at || fing?.imported_at || unf?.imported_at || raw.added_at || raw.last_seen;

    return {
      ...raw,
      followed_at: followedAt,
      imported_at: importedAt,
      added_at: followedAt || importedAt,
      currently_following: isFollower,
      currently_followed_by_you: isFollowing,
      notes: history.user_notes?.[u] || raw.notes || '',
      tags: history.user_tags?.[u] || raw.tags || []
    };
  };

  // Build categorized lists
  const currentFollowers = currentFollowersEntries.map(normalizeRecord);
  const currentFollowing = currentFollowingEntries.map(normalizeRecord);
  
  // Non-followers (You follow them, but they don't follow you back)
  const nonFollowers = currentFollowing.filter(u => !currentFollowersSet.has(u.username));
  
  // Unfollowers (They previously followed you, but stopped or were removed)
  const unfollowers = Object.values(history.followers || {})
    .filter(u => u.currently_following === false || u.removed_at)
    .map(normalizeRecord);
  
  // You Unfollowed / Removed (Accounts you unfollowed or removed from following)
  const youUnfollowed = Object.values(history.unfollowed_by_you || {}).map(normalizeRecord);
  
  // Mutuals
  const mutuals = currentFollowing.filter(u => currentFollowersSet.has(u.username));

  // Close friends, blocked, restricted
  const closeFriends = Object.values(history.close_friends || {}).map(normalizeRecord);
  const blocked = Object.values(history.blocked || {}).map(normalizeRecord);
  const restricted = Object.values(history.restricted || {}).map(normalizeRecord);
  const pendingSent = Object.values(history.pending_sent || {}).map(normalizeRecord);
  const pendingReceived = Object.values(history.pending_received || {}).map(normalizeRecord);
  const allHistory = Object.values(history.all_known_users || {}).map(normalizeRecord);
  const missing = allHistory.filter(u => u.tags?.includes('manually_missing'));

  // Sort lists
  const sortByUsername = (a: UserRecord, b: UserRecord) => a.username.localeCompare(b.username);
  const sortByRecentTime = (a: UserRecord, b: UserRecord) => {
    const timeA = new Date(a.removed_at || a.last_seen || a.added_at).getTime();
    const timeB = new Date(b.removed_at || b.last_seen || b.added_at).getTime();
    return timeB - timeA;
  };

  currentFollowers.sort(sortByUsername);
  currentFollowing.sort(sortByUsername);
  nonFollowers.sort((a, b) => {
    const aSeen = (a.tags || []).includes('seen') ? 1 : 0;
    const bSeen = (b.tags || []).includes('seen') ? 1 : 0;
    if (aSeen !== bSeen) return aSeen - bSeen; // unseen (0) before seen (1)
    return a.username.localeCompare(b.username);
  });
  unfollowers.sort(sortByRecentTime);
  youUnfollowed.sort(sortByRecentTime);
  mutuals.sort(sortByUsername);
  closeFriends.sort(sortByUsername);
  blocked.sort(sortByUsername);
  missing.sort(sortByRecentTime);
  allHistory.sort(sortByRecentTime);

  const stats = {
    totalFollowers: currentFollowers.length,
    totalFollowing: currentFollowing.length,
    nonFollowers: nonFollowers.length,
    unfollowers: unfollowers.length,
    youUnfollowed: youUnfollowed.length,
    mutuals: mutuals.length,
    closeFriends: closeFriends.length,
    blockedCount: blocked.length,
    restrictedCount: restricted.length,
    missingCount: missing.length,
    totalHistoricalContacts: allHistory.length
  };

  res.json({
    stats,
    lists: {
      followers: currentFollowers,
      following: currentFollowing,
      nonFollowers,
      unfollowers,
      youUnfollowed,
      mutuals,
      closeFriends,
      blocked,
      restricted,
      pendingSent,
      pendingReceived,
      missing,
      allHistory
    },
    allTags: history.all_known_tags || []
  });
});

export default router;

