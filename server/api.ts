import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getAccounts, saveAccounts, getAccountHistory, saveAccountHistory } from './db';
import { 
  parseInstagramUsernames, 
  extractFromZip, 
  extractUsernameFromExportName, 
  categorizeAndIngestFile, 
  ParsedExportData, 
  ParsedItem 
} from './instagram';
import { Account, AccountHistory, UserRecord, HistoryEvent } from '../src/types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Merge new parsed export data into persistent account history.
 * GUARANTEES: Never deletes past data for removed users; accurately records
 * timestamps, removal reasons, and event history.
 */
async function processAndSaveExportData(
  accountId: string, 
  exportData: ParsedExportData, 
  folderOrZipName?: string
) {
  const history = await getAccountHistory(accountId);
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

  const currentFollowersSet = new Set(exportData.followers.map(f => f.username));
  const currentFollowingSet = new Set(exportData.following.map(f => f.username));
  const recentlyUnfollowedSet = new Set(exportData.recentlyUnfollowed.map(f => f.username));

  // 1. Process Followers (People who follow you)
  if (exportData.followers.length > 0) {
    // Check for lost followers (previously followed you, but missing from current export)
    Object.keys(history.followers).forEach(u => {
      const prev = history.followers[u];
      if (prev.currently_following && !currentFollowersSet.has(u)) {
        prev.currently_following = false;
        prev.removed_at = now;
        prev.removal_type = recentlyUnfollowedSet.has(u) ? 'removed_by_you' : 'unfollowed_you';
        if (!prev.events) prev.events = [];
        prev.events.push({
          type: 'lost_follower',
          timestamp: now,
          description: recentlyUnfollowedSet.has(u) ? 'Removed by you' : 'No longer in followers list (unfollowed you)'
        });
      }
    });

    // Ingest current followers
    exportData.followers.forEach(item => {
      const u = item.username;
      const igTimestamp = item.timestamp || null;
      const existing = history.followers[u];
      
      if (!existing) {
        history.followers[u] = {
          username: u,
          followed_at: igTimestamp,
          imported_at: now,
          added_at: igTimestamp || now,
          last_seen: now,
          currently_following: true, // Follows you
          currently_followed_by_you: currentFollowingSet.has(u), // You follow them if also in following export
          notes: history.user_notes?.[u] || '',
          tags: history.user_tags?.[u] || [],
          events: [{
            type: 'became_follower',
            timestamp: igTimestamp || now,
            description: igTimestamp ? `Started following you on Instagram (${new Date(igTimestamp).toLocaleDateString()})` : 'Started following you'
          }]
        };
      } else {
        if (!existing.currently_following) {
          if (!existing.events) existing.events = [];
          existing.events.push({
            type: 'became_follower',
            timestamp: igTimestamp || now,
            description: 'Followed you again'
          });
        }
        if (igTimestamp && !existing.followed_at) {
          existing.followed_at = igTimestamp;
        }
        existing.last_seen = now;
        existing.currently_following = true;
        existing.removed_at = null;
        existing.currently_followed_by_you = currentFollowingSet.has(u);
      }
    });
  }

  // 2. Process Following (People you follow)
  if (exportData.following.length > 0) {
    // Detect accounts you unfollowed
    Object.keys(history.following).forEach(u => {
      const prev = history.following[u];
      if (prev.currently_followed_by_you && !currentFollowingSet.has(u)) {
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

    // Ingest current following
    exportData.following.forEach(item => {
      const u = item.username;
      const igTimestamp = item.timestamp || null;
      const existing = history.following[u];

      if (!existing) {
        history.following[u] = {
          username: u,
          followed_at: igTimestamp,
          imported_at: now,
          added_at: igTimestamp || now,
          last_seen: now,
          currently_following: currentFollowersSet.has(u), // They follow you only if in followers export
          currently_followed_by_you: true, // You follow them
          notes: history.user_notes?.[u] || '',
          tags: history.user_tags?.[u] || [],
          events: [{
            type: 'you_followed',
            timestamp: igTimestamp || now,
            description: igTimestamp ? `You followed on Instagram (${new Date(igTimestamp).toLocaleDateString()})` : 'You followed this profile'
          }]
        };
      } else {
        if (!existing.currently_followed_by_you) {
          if (!existing.events) existing.events = [];
          existing.events.push({
            type: 'you_followed',
            timestamp: igTimestamp || now,
            description: 'You followed this profile again'
          });
        }
        if (igTimestamp && !existing.followed_at) {
          existing.followed_at = igTimestamp;
        }
        existing.last_seen = now;
        existing.currently_following = currentFollowersSet.has(u);
        existing.currently_followed_by_you = true;
        existing.removed_at = null;
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
  const accounts = await getAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (account) {
    account.last_updated = now;
    if (folderOrZipName) {
      account.export_folder_name = folderOrZipName;
    }
    await saveAccounts(accounts);
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
  let accounts = await getAccounts();
  accounts = accounts.filter(a => a.id !== req.params.id);
  await saveAccounts(accounts);
  res.json({ success: true });
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

    // Process all uploaded files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = relativePaths[i] || file.originalname;
      const lowerName = relPath.toLowerCase();

      if (!exportData.detectedUsername) {
        const u = extractUsernameFromExportName(relPath);
        if (u) exportData.detectedUsername = u;
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
        try {
          const jsonContent = JSON.parse(file.buffer.toString('utf-8'));
          categorizeAndIngestFile(relPath, jsonContent, exportData);
        } catch (jsonErr) {
          console.warn(`Could not parse JSON file ${relPath}:`, jsonErr);
        }
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
      return res.status(400).json({
        error: 'No Instagram follower or following data could be found in the provided folder/files. Ensure the folder contains "connections/followers_and_following" with JSON export files (e.g. followers_1.json, following.json).'
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
      return res.status(400).json({ error: 'No files uploaded' });
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = relativePaths[i] || file.originalname;
      const lowerName = relPath.toLowerCase();

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
        try {
          const jsonContent = JSON.parse(file.buffer.toString('utf-8'));
          categorizeAndIngestFile(relPath, jsonContent, exportData);
        } catch (jsonErr) {
          console.warn(`Could not parse JSON file ${relPath}:`, jsonErr);
        }
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
      return res.status(400).json({ 
        error: 'Could not find followers or following usernames in the uploaded files. Make sure you selected format "JSON" when exporting from Instagram, and uploaded the complete export folder, followers_1.json, or following.json.' 
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
      const parsed = JSON.parse(followersJson);
      categorizeAndIngestFile('followers_1.json', parsed, exportData);
    }
    if (followingJson) {
      const parsed = JSON.parse(followingJson);
      categorizeAndIngestFile('following.json', parsed, exportData);
    }
    if (rawJson) {
      const parsed = JSON.parse(rawJson);
      const fakePath = type === 'following' ? 'following.json' : 'followers_1.json';
      categorizeAndIngestFile(fakePath, parsed, exportData);
    }

    if (exportData.followers.length === 0 && exportData.following.length === 0) {
      return res.status(400).json({ error: 'No usernames found in the pasted JSON text.' });
    }

    await processAndSaveExportData(req.params.id, exportData);

    res.json({
      success: true,
      followersParsed: exportData.followers.length,
      followingParsed: exportData.following.length
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Invalid JSON syntax. Please check the pasted text.' });
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
      history.user_tags[username] = tags;
    }

    // Update in all lists if present
    if (history.followers[username]) {
      if (typeof notes === 'string') history.followers[username].notes = notes;
      if (Array.isArray(tags)) history.followers[username].tags = tags;
    }
    if (history.following[username]) {
      if (typeof notes === 'string') history.following[username].notes = notes;
      if (Array.isArray(tags)) history.following[username].tags = tags;
    }
    if (history.unfollowed_by_you?.[username]) {
      if (typeof notes === 'string') history.unfollowed_by_you[username].notes = notes;
      if (Array.isArray(tags)) history.unfollowed_by_you[username].tags = tags;
    }
    if (history.all_known_users?.[username]) {
      if (typeof notes === 'string') history.all_known_users[username].notes = notes;
      if (Array.isArray(tags)) history.all_known_users[username].tags = tags;
    }

    await saveAccountHistory(req.params.id, history);
    res.json({ success: true, notes: history.user_notes[username], tags: history.user_tags[username] });
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

  // Sort lists
  const sortByUsername = (a: UserRecord, b: UserRecord) => a.username.localeCompare(b.username);
  const sortByRecentTime = (a: UserRecord, b: UserRecord) => {
    const timeA = new Date(a.removed_at || a.last_seen || a.added_at).getTime();
    const timeB = new Date(b.removed_at || b.last_seen || b.added_at).getTime();
    return timeB - timeA;
  };

  currentFollowers.sort(sortByUsername);
  currentFollowing.sort(sortByUsername);
  nonFollowers.sort(sortByUsername);
  unfollowers.sort(sortByRecentTime);
  youUnfollowed.sort(sortByRecentTime);
  mutuals.sort(sortByUsername);
  closeFriends.sort(sortByUsername);
  blocked.sort(sortByUsername);
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
      allHistory
    }
  });
});

export default router;

