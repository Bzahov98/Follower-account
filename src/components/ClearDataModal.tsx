import React, { useState } from 'react';
import { Account } from '../types';
import { api } from '../lib/api';
import { Trash2, AlertTriangle, X, Check, RefreshCw, ShieldAlert } from 'lucide-react';

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAccount: Account | null;
  accounts: Account[];
  onDataCleared: (clearedScope: 'current' | 'all') => void;
}

export default function ClearDataModal({
  isOpen,
  onClose,
  currentAccount,
  accounts,
  onDataCleared
}: ClearDataModalProps) {
  const [clearScope, setClearScope] = useState<'current' | 'all'>('current');
  const [deleteProfile, setDeleteProfile] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const requiresConfirmation = clearScope === 'all';
  const isConfirmValid = !requiresConfirmation || confirmationInput.trim().toUpperCase() === 'DELETE ALL';

  const handleClear = async () => {
    setError(null);
    setClearing(true);
    try {
      if (clearScope === 'all') {
        await api.clearAllLocalData();
        onDataCleared('all');
      } else if (currentAccount) {
        await api.clearAccountData(currentAccount.id, deleteProfile);
        onDataCleared('current');
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to clear local data');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-red-50 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-red-950">Clear Local Storage Data</h3>
              <p className="text-xs text-red-700">Delete imported contact records and cached reports</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Scope selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Choose What to Clear:
            </label>

            <div className="space-y-2">
              {currentAccount && (
                <label 
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    clearScope === 'current'
                      ? 'bg-blue-50/60 border-blue-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="clearScope"
                    checked={clearScope === 'current'}
                    onChange={() => setClearScope('current')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-slate-900">Current Profile Data Only (@{currentAccount.name})</p>
                    <p className="text-slate-500 mt-0.5">
                      Clears all followers, following history, unfollow logs, and notes for this profile.
                    </p>
                  </div>
                </label>
              )}

              <label 
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  clearScope === 'all'
                    ? 'bg-red-50/60 border-red-300 shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="clearScope"
                  checked={clearScope === 'all'}
                  onChange={() => setClearScope('all')}
                  className="mt-0.5 text-red-600 focus:ring-red-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-red-950">Wipe Entire Local Database ({accounts.length} Profiles)</p>
                  <p className="text-slate-500 mt-0.5">
                    Deletes all accounts, history files, custom tags, and local state from disk.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Current profile options */}
          {clearScope === 'current' && currentAccount && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteProfile}
                  onChange={(e) => setDeleteProfile(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                <span className="font-medium">Also completely remove the @{currentAccount.name} profile from the account list</span>
              </label>
              <p className="text-[11px] text-slate-400 pl-6">
                {deleteProfile 
                  ? 'The profile entry will be removed completely.' 
                  : 'Keeps the empty profile container so you can immediately re-import a clean export.'}
              </p>
            </div>
          )}

          {/* Type confirmation for Wipe All */}
          {clearScope === 'all' && (
            <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-red-900 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>Destructive Action Confirmation</span>
              </div>
              <p className="text-xs text-red-800">
                To confirm permanent deletion of all local archives and history, please type <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-red-200 text-red-900">DELETE ALL</span> below:
              </p>
              <input
                type="text"
                placeholder="DELETE ALL"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={clearing || !isConfirmValid}
            onClick={handleClear}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clearing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>
              {clearing 
                ? 'Clearing Data...' 
                : clearScope === 'all' 
                  ? 'Confirm Wipe All Data' 
                  : `Clear @${currentAccount?.name || 'Profile'} Data`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
