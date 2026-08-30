import JSZip from 'jszip';

export interface ParsedItem {
  username: string;
  timestamp?: string;
  href?: string;
}

export interface ParsedExportData {
  detectedUsername?: string;
  followers: ParsedItem[];
  following: ParsedItem[];
  recentlyUnfollowed: ParsedItem[];
  closeFriends: ParsedItem[];
  blocked: ParsedItem[];
  restricted: ParsedItem[];
  pendingRequestsSent: ParsedItem[];
  pendingRequestsReceived: ParsedItem[];
  favorites: ParsedItem[];
}

/**
 * Extracts username from folder or archive name
 * e.g. "instagram-bzahov_98-2026-08-29-Nv8znEtY" -> "bzahov_98"
 */
export function extractUsernameFromExportName(name: string): string | null {
  if (!name) return null;
  
  // Format: instagram-{username}-{YYYY}-{MM}-{DD}-{hash}
  const match = name.match(/instagram-([a-zA-Z0-9._]+)-\d{4}-\d{2}-\d{2}/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  // Format: instagram_{username}_... or instagram-{username}
  const match2 = name.match(/instagram[-_]([a-zA-Z0-9._]+)/i);
  if (match2 && match2[1] && !['data', 'export', 'backup', 'files'].includes(match2[1].toLowerCase())) {
    return match2[1].toLowerCase();
  }

  return null;
}

function parseTimestamp(rawTimestamp: any): string | undefined {
  if (rawTimestamp === undefined || rawTimestamp === null) return undefined;
  if (typeof rawTimestamp === 'number' && rawTimestamp > 0) {
    const ms = rawTimestamp < 100000000000 ? rawTimestamp * 1000 : rawTimestamp;
    try {
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {}
  } else if (typeof rawTimestamp === 'string' && rawTimestamp.trim().length > 0) {
    const num = Number(rawTimestamp);
    if (!isNaN(num) && num > 0) {
      const ms = num < 100000000000 ? num * 1000 : num;
      try {
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {}
    }
    try {
      const d = new Date(rawTimestamp);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {}
  }
  return undefined;
}

/**
 * Parses Instagram JSON export data to extract usernames with timestamps and hrefs.
 * Searches recursively for "string_list_data" and alternative Meta export formats.
 */
export function parseInstagramItems(jsonData: any): ParsedItem[] {
  const itemsMap = new Map<string, ParsedItem>();
  
  function traverse(obj: any) {
    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (obj !== null && typeof obj === 'object') {
      // Standard Instagram export format: string_list_data array with 'value', 'timestamp', 'href'
      if ('string_list_data' in obj && Array.isArray(obj.string_list_data)) {
        obj.string_list_data.forEach((item: any) => {
          if (item && typeof item.value === 'string' && item.value.trim().length > 0) {
            const rawUser = item.value.trim().toLowerCase().replace(/^@/, '');
            const timestampStr = parseTimestamp(item.timestamp || obj.timestamp || obj.created_timestamp);
            if (rawUser && !itemsMap.has(rawUser)) {
              itemsMap.set(rawUser, {
                username: rawUser,
                timestamp: timestampStr,
                href: item.href || `https://instagram.com/${rawUser}`
              });
            }
          }
        });
      }

      // Alternative formats or older versions where title holds username
      if (typeof obj.title === 'string' && obj.title.trim().length > 0) {
        const titleClean = obj.title.trim().toLowerCase().replace(/^@/, '');
        if (!titleClean.includes(' ') && !titleClean.includes('http') && titleClean.length > 0 && !itemsMap.has(titleClean)) {
          const firstString = Array.isArray(obj.string_list_data) ? obj.string_list_data[0] : null;
          const timestampStr = parseTimestamp(firstString?.timestamp || obj.timestamp || obj.created_timestamp);
          itemsMap.set(titleClean, {
            username: titleClean,
            timestamp: timestampStr,
            href: firstString?.href || `https://instagram.com/${titleClean}`
          });
        }
      }

      Object.values(obj).forEach(traverse);
    }
  }
  
  traverse(jsonData);
  return Array.from(itemsMap.values());
}

export function parseInstagramUsernames(jsonData: any): string[] {
  return parseInstagramItems(jsonData).map(i => i.username);
}

/**
 * Categorize a file by its path/name and ingest parsed items into the aggregate export data
 */
export function categorizeAndIngestFile(filePath: string, jsonContent: any, result: ParsedExportData) {
  const lower = filePath.toLowerCase();
  const items = parseInstagramItems(jsonContent);

  if (lower.includes('recently_unfollowed') || lower.includes('unfollowed_profiles')) {
    result.recentlyUnfollowed.push(...items);
  } else if (lower.includes('close_friends')) {
    result.closeFriends.push(...items);
  } else if (lower.includes('blocked_profiles') || lower.includes('blocked')) {
    result.blocked.push(...items);
  } else if (lower.includes('restricted_profiles') || lower.includes('restricted')) {
    result.restricted.push(...items);
  } else if (lower.includes('pending_follow_requests') || lower.includes('recent_follow_requests')) {
    result.pendingRequestsSent.push(...items);
  } else if (lower.includes('follow_requests_you\'ve_received') || lower.includes('received_follow_requests')) {
    result.pendingRequestsReceived.push(...items);
  } else if (lower.includes('profiles_you\'ve_favorited') || lower.includes('favorited')) {
    result.favorites.push(...items);
  } else if (lower.includes('following') && !lower.includes('hashtag')) {
    result.following.push(...items);
  } else if (lower.includes('follower')) {
    result.followers.push(...items);
  } else {
    // Check internal JSON keys if filename is ambiguous
    if (jsonContent?.relationships_following) {
      result.following.push(...items);
    } else if (jsonContent?.relationships_unfollowed_users) {
      result.recentlyUnfollowed.push(...items);
    }
  }

  // Also look for personal information to detect username if not yet found
  if (!result.detectedUsername && (lower.includes('personal_information') || lower.includes('profile_information'))) {
    try {
      const usernameCandidate = jsonContent?.profile_user?.[0]?.string_map_data?.Username?.value ||
                                jsonContent?.username;
      if (typeof usernameCandidate === 'string' && usernameCandidate.trim()) {
        result.detectedUsername = usernameCandidate.trim().toLowerCase();
      }
    } catch {}
  }
}

/**
 * Unzips an Instagram export zip archive and processes all connection files
 */
export async function extractFromZip(buffer: Buffer, originalZipName?: string): Promise<ParsedExportData> {
  const zip = await JSZip.loadAsync(buffer);
  const result: ParsedExportData = {
    detectedUsername: originalZipName ? extractUsernameFromExportName(originalZipName) || undefined : undefined,
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

  for (const [filename, fileObj] of Object.entries(zip.files)) {
    if (fileObj.dir) {
      if (!result.detectedUsername) {
        const u = extractUsernameFromExportName(filename);
        if (u) result.detectedUsername = u;
      }
      continue;
    }

    if (!result.detectedUsername) {
      const u = extractUsernameFromExportName(filename);
      if (u) result.detectedUsername = u;
    }

    if (!filename.endsWith('.json')) continue;
    
    try {
      const text = await fileObj.async('string');
      const json = JSON.parse(text);
      categorizeAndIngestFile(filename, json, result);
    } catch (err) {
      console.warn(`Could not parse JSON from zip entry ${filename}:`, err);
    }
  }

  // Deduplicate each category by username
  const dedupe = (items: ParsedItem[]) => {
    const map = new Map<string, ParsedItem>();
    items.forEach(i => {
      if (!map.has(i.username)) map.set(i.username, i);
    });
    return Array.from(map.values());
  };

  result.followers = dedupe(result.followers);
  result.following = dedupe(result.following);
  result.recentlyUnfollowed = dedupe(result.recentlyUnfollowed);
  result.closeFriends = dedupe(result.closeFriends);
  result.blocked = dedupe(result.blocked);
  result.restricted = dedupe(result.restricted);
  result.pendingRequestsSent = dedupe(result.pendingRequestsSent);
  result.pendingRequestsReceived = dedupe(result.pendingRequestsReceived);
  result.favorites = dedupe(result.favorites);

  return result;
}


