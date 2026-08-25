import JSZip from 'jszip';

/**
 * Parses Instagram JSON export data to extract usernames robustly.
 * Handles different export formats across different Instagram/Meta versions.
 */
export function parseInstagramUsernames(jsonData: any): string[] {
  const usernames = new Set<string>();
  
  function traverse(obj: any) {
    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (obj !== null && typeof obj === 'object') {
      // Standard Instagram export format: string_list_data array with 'value'
      if ('string_list_data' in obj && Array.isArray(obj.string_list_data)) {
        obj.string_list_data.forEach((item: any) => {
          if (item && typeof item.value === 'string' && item.value.trim().length > 0) {
            usernames.add(item.value.trim().toLowerCase());
          }
        });
      }
      // Alternative formats or older versions where title holds username
      if (typeof obj.title === 'string' && obj.title.trim().length > 0 && Array.isArray(obj.string_list_data) && obj.string_list_data.length > 0) {
        if (!obj.title.includes(' ') && !obj.title.includes('http') && !obj.title.includes('@')) {
          usernames.add(obj.title.trim().toLowerCase());
        }
      }
      // Direct array of strings or relationships_following / relationships_followers
      Object.values(obj).forEach(traverse);
    }
  }
  
  traverse(jsonData);
  return Array.from(usernames);
}

/**
 * Unzips an Instagram export zip archive and extracts followers and following usernames
 */
export async function extractFromZip(buffer: Buffer): Promise<{ followers: string[], following: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const followers: string[] = [];
  const following: string[] = [];

  for (const [filename, fileObj] of Object.entries(zip.files)) {
    if (fileObj.dir || !filename.endsWith('.json')) continue;
    
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('follower') || lowerName.includes('following')) {
      try {
        const text = await fileObj.async('string');
        const json = JSON.parse(text);
        const usernames = parseInstagramUsernames(json);
        
        if (lowerName.includes('following')) {
          following.push(...usernames);
        } else if (lowerName.includes('follower')) {
          followers.push(...usernames);
        }
      } catch (err) {
        console.warn(`Could not parse JSON from zip entry ${filename}:`, err);
      }
    }
  }

  return {
    followers: Array.from(new Set(followers)),
    following: Array.from(new Set(following))
  };
}

