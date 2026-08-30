import JSZip from 'jszip';
import { analyzeAndParseJson } from './jsonDiagnostics';

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
      let usernameCandidate: string | null = null;
      const timestampRaw = obj.timestamp || obj.created_timestamp;

      if (typeof obj.title === 'string' && obj.title.trim().length > 0) {
        const titleClean = obj.title.trim().toLowerCase().replace(/^@/, '');
        if (!titleClean.includes(' ') && !titleClean.includes('http') && titleClean.length > 0) {
          usernameCandidate = titleClean;
        }
      }

      if ('string_list_data' in obj && Array.isArray(obj.string_list_data)) {
        obj.string_list_data.forEach((item: any) => {
          if (!item) return;
          const val = typeof item.value === 'string' && item.value.trim().length > 0
            ? item.value.trim().toLowerCase().replace(/^@/, '')
            : null;
          const href = typeof item.href === 'string' ? item.href : undefined;
          const itemTimestamp = item.timestamp;

          let u = val;
          if (!u && href) {
            const match = href.match(/instagram\.com\/(?:_u\/)?([a-zA-Z0-9._]+)/i);
            if (match && match[1]) {
              u = match[1].toLowerCase();
            }
          }
          if (!u && usernameCandidate) {
            u = usernameCandidate;
          }

          if (u) {
            const finalTimestamp = parseTimestamp(itemTimestamp || timestampRaw);
            if (!itemsMap.has(u)) {
              itemsMap.set(u, {
                username: u,
                timestamp: finalTimestamp,
                href: href || `https://instagram.com/${u}`
              });
            } else if (finalTimestamp && !itemsMap.get(u)?.timestamp) {
              const existing = itemsMap.get(u)!;
              existing.timestamp = finalTimestamp;
            }
          }
        });
      } else if (usernameCandidate) {
        if (!itemsMap.has(usernameCandidate)) {
          itemsMap.set(usernameCandidate, {
            username: usernameCandidate,
            timestamp: parseTimestamp(timestampRaw),
            href: `https://instagram.com/${usernameCandidate}`
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
 * Unzips an Instagram export zip archive and processes all connection files.
 * Provides deep diagnostics if Meta exported in HTML format or if JSON files are malformed.
 */
export async function extractFromZip(buffer: Buffer, originalZipName?: string): Promise<ParsedExportData> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (zipErr: any) {
    throw new Error(`Failed to open ZIP archive "${originalZipName || 'uploaded.zip'}": The file may be damaged or not a valid ZIP file.`);
  }

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

  const detectedHtmlFiles: string[] = [];
  const parseErrors: string[] = [];
  let totalJsonFilesFound = 0;

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

    const lowerName = filename.toLowerCase();

    // Check if user exported in HTML format instead of JSON
    if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
      if (lowerName.includes('follower') || lowerName.includes('following') || lowerName.includes('connections') || lowerName.includes('profile')) {
        detectedHtmlFiles.push(filename);
      }
      continue;
    }

    if (!lowerName.endsWith('.json')) continue;
    
    totalJsonFilesFound++;
    try {
      const text = await fileObj.async('string');
      const diag = analyzeAndParseJson(text, filename);
      if (!diag.success) {
        parseErrors.push(diag.error || `Invalid JSON in ${filename}`);
        continue;
      }
      categorizeAndIngestFile(filename, diag.data, result);
    } catch (err: any) {
      parseErrors.push(`Failed reading ${filename}: ${err.message}`);
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

  // If no connections found, provide clear and actionable diagnostic feedback
  const totalExtracted = result.followers.length + result.following.length + result.recentlyUnfollowed.length;
  if (totalExtracted === 0) {
    if (detectedHtmlFiles.length > 0 && totalJsonFilesFound === 0) {
      const sampleFiles = detectedHtmlFiles.slice(0, 3).join(', ');
      throw new Error(
        `HTML export detected! The ZIP archive contains HTML files (${sampleFiles}) instead of JSON files. ` +
        `In Meta Accounts Center, the format was set to HTML. You must request a new export from Meta with format set to "JSON".`
      );
    }
    if (parseErrors.length > 0) {
      throw new Error(`Encountered JSON parse errors in ZIP archive: ${parseErrors.slice(0, 2).join('; ')}`);
    }
  }

  return result;
}


