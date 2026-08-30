import { Account, AccountStats, UserRecord } from '../types';

export const api = {
  getAccounts: async (): Promise<Account[]> => {
    const res = await fetch('/api/accounts');
    if (!res.ok) throw new Error('Failed to fetch accounts');
    return res.json();
  },
  
  createAccount: async (name: string): Promise<Account> => {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to create account');
    return res.json();
  },
  
  deleteAccount: async (id: string): Promise<void> => {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete account');
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
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return res.json();
  },

  uploadData: async (
    id: string, 
    files: FileList | File[], 
    folderName?: string,
    filePaths?: string[]
  ): Promise<{ followersParsed: number, followingParsed: number, recentlyUnfollowedParsed?: number }> => {
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
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return res.json();
  },

  pasteJson: async (id: string, payload: { followersJson?: string; followingJson?: string; rawJson?: string; type?: 'followers' | 'following' }): Promise<{ followersParsed: number, followingParsed: number }> => {
    const res = await fetch(`/api/accounts/${id}/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Pasting JSON failed' }));
      throw new Error(error.error || 'Pasting JSON failed');
    }
    return res.json();
  },
  
  getAccountData: async (id: string): Promise<{ stats: AccountStats, lists: Record<string, UserRecord[]> }> => {
    const res = await fetch(`/api/accounts/${id}/data`);
    if (!res.ok) throw new Error('Failed to fetch account data');
    return res.json();
  },

  updateUserNotes: async (accountId: string, username: string, notes?: string, tags?: string[]): Promise<any> => {
    const res = await fetch(`/api/accounts/${accountId}/contacts/${encodeURIComponent(username)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, tags })
    });
    if (!res.ok) throw new Error('Failed to update contact notes');
    return res.json();
  },

  manualRemoveContact: async (accountId: string, username: string, action?: 'remove' | 'unmark'): Promise<{ success: boolean; manuallyRemoved: boolean; tags: string[] }> => {
    const res = await fetch(`/api/accounts/${accountId}/contacts/${encodeURIComponent(username)}/manual-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (!res.ok) throw new Error('Failed to toggle manual removal');
    return res.json();
  },

  manualMissingContact: async (accountId: string, username: string, action?: 'missing' | 'unmark'): Promise<{ success: boolean; manuallyMissing: boolean; tags: string[] }> => {
    const res = await fetch(`/api/accounts/${accountId}/contacts/${encodeURIComponent(username)}/manual-missing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (!res.ok) throw new Error('Failed to toggle manual missing status');
    return res.json();
  },

  clearAccountData: async (accountId: string, deleteProfile: boolean = false): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/accounts/${accountId}/clear-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteProfile })
    });
    if (!res.ok) throw new Error('Failed to clear account data');
    return res.json();
  },

  clearAllLocalData: async (): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('/api/clear-all-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to clear all local data');
    return res.json();
  }
};

