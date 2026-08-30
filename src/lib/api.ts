import { Account, AccountStats, UserRecord } from '../types';

export interface ApiErrorInfo {
  error: string;
  technicalDetails?: string;
  detectedFormat?: string;
  previewSnippet?: string;
  troubleshooting?: string;
}

export class ApiError extends Error {
  technicalDetails?: string;
  detectedFormat?: string;
  previewSnippet?: string;
  troubleshooting?: string;

  constructor(info: ApiErrorInfo | string) {
    if (typeof info === 'string') {
      super(info);
    } else {
      super(info.error || 'An unexpected error occurred');
      this.technicalDetails = info.technicalDetails;
      this.detectedFormat = info.detectedFormat;
      this.previewSnippet = info.previewSnippet;
      this.troubleshooting = info.troubleshooting;
    }
    this.name = 'ApiError';
  }
}

/**
 * Safely handles server responses, extracting structured JSON errors or human-friendly
 * explanations when non-JSON or HTML error pages are returned.
 */
async function handleResponse<T>(res: Response, defaultError: string): Promise<T> {
  const text = await res.text();
  
  if (!res.ok) {
    if (text) {
      try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
          throw new ApiError({
            error: json.error || defaultError,
            technicalDetails: json.technicalDetails,
            detectedFormat: json.detectedFormat,
            previewSnippet: json.previewSnippet,
            troubleshooting: json.troubleshooting
          });
        }
      } catch (parseErr) {
        if (parseErr instanceof ApiError) throw parseErr;
        
        // Response was not JSON (e.g. HTML 500 or 502 page)
        const trimmed = text.trim();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
          throw new ApiError({
            error: `${defaultError} (${res.status} ${res.statusText})`,
            technicalDetails: `Server returned an HTML status page instead of JSON.`,
            troubleshooting: 'Please check your server connection or try uploading smaller file chunks.'
          });
        }
        throw new ApiError({
          error: `${defaultError}: ${trimmed.slice(0, 100)}`,
          technicalDetails: trimmed.slice(0, 200)
        });
      }
    }
    throw new ApiError(`${defaultError} (HTTP ${res.status} ${res.statusText})`);
  }

  // Response was OK (200-299)
  if (!text || !text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    const preview = text.slice(0, 100).replace(/\r?\n/g, ' ');
    throw new ApiError({
      error: `Failed to read server response: Expected valid JSON.`,
      technicalDetails: `Parser error: ${err?.message}. Received: "${preview}..."`,
      troubleshooting: 'The server response was truncated or corrupted.'
    });
  }
}

export const api = {
  getAccounts: async (): Promise<Account[]> => {
    const res = await fetch('/api/accounts');
    return handleResponse<Account[]>(res, 'Failed to fetch accounts');
  },
  
  createAccount: async (name: string): Promise<Account> => {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return handleResponse<Account>(res, 'Failed to create account');
  },
  
  deleteAccount: async (id: string): Promise<void> => {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    await handleResponse<{ success: boolean }>(res, 'Failed to delete account');
  },
  
  uploadFolder: async (
    files: File[], 
    folderName?: string, 
    filePaths?: string[], 
    accountId?: string
  ): Promise<{ success: boolean; account: Account; statsSummary: any }> => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    if (folderName) formData.append('folderName', folderName);
    if (accountId) formData.append('accountId', accountId);
    if (filePaths && filePaths.length > 0) {
      formData.append('filePaths', JSON.stringify(filePaths));
    }
    
    const res = await fetch('/api/accounts/upload-folder', {
      method: 'POST',
      body: formData
    });
    
    return handleResponse<{ success: boolean; account: Account; statsSummary: any }>(res, 'Folder upload failed');
  },

  uploadData: async (
    id: string, 
    files: FileList | File[], 
    folderName?: string,
    filePaths?: string[]
  ): Promise<{ followersParsed: number; followingParsed: number; recentlyUnfollowedParsed?: number }> => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    if (folderName) formData.append('folderName', folderName);
    if (filePaths && filePaths.length > 0) {
      formData.append('filePaths', JSON.stringify(filePaths));
    }
    
    const res = await fetch(`/api/accounts/${id}/upload`, {
      method: 'POST',
      body: formData
    });
    
    return handleResponse<{ followersParsed: number; followingParsed: number; recentlyUnfollowedParsed?: number }>(res, 'Upload failed');
  },

  pasteJson: async (id: string, payload: { followersJson?: string; followingJson?: string; rawJson?: string; type?: 'followers' | 'following' }): Promise<{ followersParsed: number; followingParsed: number }> => {
    const res = await fetch(`/api/accounts/${id}/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    return handleResponse<{ followersParsed: number; followingParsed: number }>(res, 'Pasting JSON failed');
  },
  
  getAccountData: async (id: string): Promise<{ stats: AccountStats; lists: Record<string, UserRecord[]>; allTags: string[] }> => {
    const res = await fetch(`/api/accounts/${id}/data`);
    return handleResponse<{ stats: AccountStats; lists: Record<string, UserRecord[]>; allTags: string[] }>(res, 'Failed to fetch account data');
  },

  updateUserNotes: async (accountId: string, username: string, notes?: string, tags?: string[]): Promise<any> => {
    const cleanNotes = typeof notes === 'string' ? notes : '';
    const cleanTags = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
    const res = await fetch(`/api/accounts/${accountId}/contacts/${encodeURIComponent(username)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: cleanNotes, tags: cleanTags })
    });
    return handleResponse<any>(res, 'Failed to update contact notes');
  },

  manualRemoveContact: async (accountId: string, username: string, action?: 'remove' | 'unmark'): Promise<{ success: boolean; manuallyRemoved: boolean; tags: string[] }> => {
    const res = await fetch(`/api/accounts/${accountId}/contacts/${encodeURIComponent(username)}/manual-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action === 'unmark' ? 'unmark' : 'remove' })
    });
    return handleResponse<{ success: boolean; manuallyRemoved: boolean; tags: string[] }>(res, 'Failed to toggle manual removal');
  },

  manualMissingContact: async (accountId: string, username: string, action?: 'missing' | 'unmark'): Promise<{ success: boolean; manuallyMissing: boolean; tags: string[] }> => {
    const res = await fetch(`/api/accounts/${accountId}/contacts/${encodeURIComponent(username)}/manual-missing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action === 'unmark' ? 'unmark' : 'missing' })
    });
    return handleResponse<{ success: boolean; manuallyMissing: boolean; tags: string[] }>(res, 'Failed to toggle manual missing status');
  },

  clearAccountData: async (accountId: string, deleteProfile: boolean = false): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/accounts/${accountId}/clear-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteProfile: Boolean(deleteProfile) })
    });
    return handleResponse<{ success: boolean }>(res, 'Failed to clear account data');
  },

  clearAllLocalData: async (): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('/api/clear-all-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return handleResponse<{ success: boolean; message: string }>(res, 'Failed to clear all local data');
  },

  // Export full unified JSON database across all accounts
  exportDatabaseUrl: '/api/database/export',

  // Export single account unified JSON database
  getAccountExportDatabaseUrl: (accountId: string) => `/api/accounts/${accountId}/export-database`,

  // Import unified JSON database backup file
  importDatabaseFile: async (file: File): Promise<{ success: boolean; message: string; importedAccounts?: any[]; totalContactsImported?: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/database/import', {
      method: 'POST',
      body: formData
    });
    return handleResponse<{ success: boolean; message: string; importedAccounts?: any[]; totalContactsImported?: number }>(res, 'Database import failed');
  },

  // Import unified JSON database directly into specific account
  importAccountDatabaseFile: async (accountId: string, file: File): Promise<{ success: boolean; message: string; account?: any; contactsCount?: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/accounts/${accountId}/import-database`, {
      method: 'POST',
      body: formData
    });
    return handleResponse<{ success: boolean; message: string; account?: any; contactsCount?: number }>(res, 'Account database import failed');
  }
};
