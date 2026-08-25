import React, { useState } from 'react';
import { Account } from '../types';
import { Plus, Trash2, ArrowRight, Clock, ShieldCheck, HelpCircle, ExternalLink, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DashboardProps {
  accounts: Account[];
  onCreate: (name: string) => void;
  onSelect: (account: Account) => void;
  onDelete: (id: string) => void;
  onOpenGuide: () => void;
}

export default function Dashboard({ accounts, onCreate, onSelect, onDelete, onOpenGuide }: DashboardProps) {
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreate(newName.trim());
      setNewName('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Official Export Guide Callout Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-full uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-300" />
              100% Safe • GDPR Article 20 Export
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Need your Instagram Followers Data?
          </h2>
          <p className="text-xs text-blue-100/80 leading-relaxed">
            Avoid untrusted third-party apps that risk your account password or trigger Instagram bot bans. Use Meta's official data export portal with our step-by-step interactive guide.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          <button
            id="dashboard-open-guide-btn"
            onClick={onOpenGuide}
            className="px-4 py-2.5 bg-white text-blue-950 hover:bg-blue-50 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            Open Interactive Export Guide
          </button>
          <a
            href="https://accountscenter.instagram.com/info_and_permissions/dyi/"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2.5 bg-blue-800/80 hover:bg-blue-700/80 text-white text-xs font-medium rounded-xl border border-blue-400/30 transition-all flex items-center gap-1"
          >
            Accounts Center <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4 text-slate-700">Track New Account</h2>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Instagram Username (e.g. johndoe)"
            className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full p-3 transition-shadow"
            required
          />
          <button
            type="submit"
            className="text-white bg-slate-900 hover:bg-slate-800 focus:ring-4 focus:ring-slate-300 font-medium rounded-lg text-sm px-5 py-3 flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </form>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-700">Your Tracked Accounts</h2>
          <button
            onClick={onOpenGuide}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:underline cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" /> How to get data files?
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
            <p className="text-slate-500 text-sm">No accounts tracked yet. Add one above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 shrink-0">
            {accounts.map(account => (
              <div 
                key={account.id} 
                className="group bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer relative"
                onClick={() => onSelect(account)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(account.id);
                  }}
                  className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <h3 className="font-semibold text-lg text-slate-800 truncate pr-6">@{account.name}</h3>
                <div className="mt-3 flex items-center text-xs text-slate-500 gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {account.last_updated 
                    ? `Updated ${formatDistanceToNow(new Date(account.last_updated))} ago` 
                    : 'No data uploaded yet'}
                </div>
                <div className="mt-4 flex items-center text-sm text-blue-600 font-medium group-hover:text-blue-700">
                  View Stats <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
