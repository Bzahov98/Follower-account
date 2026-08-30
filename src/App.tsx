/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Account } from './types';
import { api } from './lib/api';
import Dashboard from './components/Dashboard';
import AccountView from './components/AccountView';
import ExportGuideModal from './components/ExportGuideModal';
import { Loader2, Instagram, ShieldCheck, HelpCircle, ExternalLink, BookOpen } from 'lucide-react';

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
      if (currentAccount) {
        const updated = data.find(a => a.id === currentAccount.id);
        if (updated) setCurrentAccount(updated);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (name: string) => {
    await api.createAccount(name);
    await loadAccounts();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this account and all its history?')) {
      await api.deleteAccount(id);
      if (currentAccount?.id === id) setCurrentAccount(null);
      await loadAccounts();
    }
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] text-slate-400">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans text-slate-800 bg-[#f8fafc]">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              IA
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              InstaArchive<span className="text-blue-600 font-semibold text-xs ml-1">v1.1</span>
            </h1>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 font-mono uppercase tracking-widest flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            GDPR Safe Architecture
          </p>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Active Profile</div>
            {currentAccount ? (
              <button 
                onClick={() => setCurrentAccount(null)}
                className="w-full flex items-center space-x-3 p-3 bg-blue-50/50 border border-blue-200 rounded-xl hover:bg-blue-100/60 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0 flex items-center justify-center text-white font-bold text-xs">
                  {currentAccount.name.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 truncate">@{currentAccount.name}</p>
                  <p className="text-[10px] text-blue-600 font-medium group-hover:underline">← Switch Profile</p>
                </div>
              </button>
            ) : (
              <div className="p-3 text-xs text-slate-400 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
                No profile selected
              </div>
            )}
          </div>

          {/* Quick Access Export Guide Button */}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Documentation</div>
            <button
              id="sidebar-export-guide-btn"
              onClick={() => setIsGuideOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 hover:border-blue-200 transition-all text-xs font-medium text-left cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <span className="font-bold block text-slate-800">Export Guide</span>
                <span className="text-[10px] text-slate-400">Step-by-step Meta export</span>
              </div>
            </button>
          </div>

          <div>
            <a
              href="https://accountscenter.instagram.com/info_and_permissions/dyi/"
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 text-slate-500 hover:text-slate-900 text-xs rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Instagram className="w-3.5 h-3.5 text-pink-600" />
                Meta Accounts Center
              </span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        
        <div className="mt-auto p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>PRIVACY: LOCAL-ONLY</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title="100% Offline / Local Parsing"></span>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">{currentAccount ? `Profile: @${currentAccount.name}` : 'Project Dashboard'}</h2>
            {currentAccount && (
              <>
                <div className="h-4 w-[1px] bg-slate-300"></div>
                <span className="text-xs text-slate-500 font-mono">data/account_{currentAccount.id}_history.json</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              id="header-open-guide-btn"
              onClick={() => setIsGuideOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              How to Export Data
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-8 flex flex-col min-h-0">
          {!currentAccount ? (
            <Dashboard 
              accounts={accounts} 
              onCreate={handleCreate} 
              onSelect={setCurrentAccount} 
              onDelete={handleDelete}
              onOpenGuide={() => setIsGuideOpen(true)}
              onRefreshList={loadAccounts}
            />
          ) : (
            <AccountView 
              account={currentAccount} 
              onRefresh={loadAccounts}
              onOpenGuide={() => setIsGuideOpen(true)}
            />
          )}
        </section>
      </main>

      {/* Interactive Step-by-Step Export Guide Modal */}
      <ExportGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        currentAccount={currentAccount}
        accounts={accounts}
        onDataImported={loadAccounts}
      />
    </div>
  );
}
