import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getAccounts, saveAccounts, getAccountHistory, saveAccountHistory } from './db';
import { parseInstagramUsernames, extractFromZip } from './instagram';
import { Account, AccountHistory, UserRecord } from '../src/types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to update account history with new followers/following
async function updateAccountData(accountId: string, uploadedFollowers: string[], uploadedFollowing: string[]) {
  const history = await getAccountHistory(accountId);
  const now = new Date().toISOString();

  // If followers were provided in this upload, refresh current followers
  if (uploadedFollowers.length > 0) {
    Object.keys(history.followers).forEach(u => history.followers[u].currently_following = false);
    uploadedFollowers.forEach(username => {
      if (!history.followers[username]) {
        history.followers[username] = { username, added_at: now, last_seen: now, currently_following: true };
      } else {
        history.followers[username].last_seen = now;
        history.followers[username].currently_following = true;
      }
    });
  }

  // If following were provided in this upload, refresh current following
  if (uploadedFollowing.length > 0) {
    Object.keys(history.following).forEach(u => history.following[u].currently_following = false);
    uploadedFollowing.forEach(username => {
      if (!history.following[username]) {
        history.following[username] = { username, added_at: now, last_seen: now, currently_following: true };
      } else {
        history.following[username].last_seen = now;
        history.following[username].currently_following = true;
      }
    });
  }

  await saveAccountHistory(accountId, history);

  // Update account last_updated
  const accounts = await getAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (account) {
    account.last_updated = now;
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
  
  const cleanName = name.replace(/^@/, '').trim();
  const accounts = await getAccounts();
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

// Upload files (JSON or ZIP)
router.post('/accounts/:id/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    let uploadedFollowers: string[] = [];
    let uploadedFollowing: string[] = [];

    for (const file of files) {
      const fileName = file.originalname.toLowerCase();
      
      // If user uploaded the full Instagram zip file
      if (fileName.endsWith('.zip')) {
        const zipResult = await extractFromZip(file.buffer);
        uploadedFollowers.push(...zipResult.followers);
        uploadedFollowing.push(...zipResult.following);
      } else {
        // Assume JSON file
        try {
          const content = JSON.parse(file.buffer.toString('utf-8'));
          const usernames = parseInstagramUsernames(content);
          
          if (fileName.includes('following')) {
            uploadedFollowing.push(...usernames);
          } else if (fileName.includes('follower')) {
            uploadedFollowers.push(...usernames);
          } else {
            // Check content structures if filename is generic
            if (content.relationships_following || (Array.isArray(content) && fileName.includes('follow'))) {
              uploadedFollowing.push(...usernames);
            } else {
              uploadedFollowers.push(...usernames);
            }
          }
        } catch (jsonErr) {
          console.warn(`Could not parse ${file.originalname} as JSON:`, jsonErr);
        }
      }
    }

    // Deduplicate
    uploadedFollowers = Array.from(new Set(uploadedFollowers));
    uploadedFollowing = Array.from(new Set(uploadedFollowing));

    if (uploadedFollowers.length === 0 && uploadedFollowing.length === 0) {
      return res.status(400).json({ 
        error: 'Could not find followers or following usernames in the uploaded files. Make sure you selected format "JSON" (not HTML) when exporting from Instagram, and uploaded followers_1.json, following.json, or the complete .zip file.' 
      });
    }

    await updateAccountData(req.params.id, uploadedFollowers, uploadedFollowing);

    res.json({ 
      success: true, 
      followersParsed: uploadedFollowers.length, 
      followingParsed: uploadedFollowing.length 
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
    let uploadedFollowers: string[] = [];
    let uploadedFollowing: string[] = [];

    if (followersJson) {
      const parsed = JSON.parse(followersJson);
      uploadedFollowers.push(...parseInstagramUsernames(parsed));
    }
    if (followingJson) {
      const parsed = JSON.parse(followingJson);
      uploadedFollowing.push(...parseInstagramUsernames(parsed));
    }
    if (rawJson) {
      const parsed = JSON.parse(rawJson);
      const usernames = parseInstagramUsernames(parsed);
      if (type === 'following') {
        uploadedFollowing.push(...usernames);
      } else {
        uploadedFollowers.push(...usernames);
      }
    }

    uploadedFollowers = Array.from(new Set(uploadedFollowers));
    uploadedFollowing = Array.from(new Set(uploadedFollowing));

    if (uploadedFollowers.length === 0 && uploadedFollowing.length === 0) {
      return res.status(400).json({ error: 'No usernames found in the pasted JSON text.' });
    }

    await updateAccountData(req.params.id, uploadedFollowers, uploadedFollowing);

    res.json({
      success: true,
      followersParsed: uploadedFollowers.length,
      followingParsed: uploadedFollowing.length
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Invalid JSON syntax. Please check the pasted text.' });
  }
});

// Get stats & lists
router.get('/accounts/:id/data', async (req, res) => {
  const history = await getAccountHistory(req.params.id);
  
  // Compute lists
  const currentFollowers = Object.values(history.followers).filter(u => u.currently_following);
  const currentFollowing = Object.values(history.following).filter(u => u.currently_following);
  
  const currentFollowersSet = new Set(currentFollowers.map(u => u.username));
  const currentFollowingSet = new Set(currentFollowing.map(u => u.username));
  
  const nonFollowers = currentFollowing.filter(u => !currentFollowersSet.has(u.username));
  const unfollowers = Object.values(history.followers).filter(u => !u.currently_following);
  const mutuals = currentFollowing.filter(u => currentFollowersSet.has(u.username));

  // Sort lists alphabetically by username for better UI experience
  const sortByUsername = (a: UserRecord, b: UserRecord) => a.username.localeCompare(b.username);

  currentFollowers.sort(sortByUsername);
  currentFollowing.sort(sortByUsername);
  nonFollowers.sort(sortByUsername);
  unfollowers.sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()); // Sort unfollowers by most recent
  mutuals.sort(sortByUsername);

  const stats = {
    totalFollowers: currentFollowers.length,
    totalFollowing: currentFollowing.length,
    nonFollowers: nonFollowers.length,
    unfollowers: unfollowers.length,
    mutuals: mutuals.length
  };

  res.json({
    stats,
    lists: {
      followers: currentFollowers,
      following: currentFollowing,
      nonFollowers,
      unfollowers,
      mutuals
    }
  });
});

export default router;
