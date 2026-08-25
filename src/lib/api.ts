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
  
  uploadData: async (id: string, files: FileList | File[]): Promise<{ followersParsed: number, followingParsed: number }> => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
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
  }
};
