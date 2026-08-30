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
import ClearDataModal from './components/ClearDataModal';
import { Loader2, Instagram, ShieldCheck, HelpCircle, ExternalLink, BookOpen, Trash2 } from 'lucide-react';

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isClearDataOpen, setIsClearDataOpen] = useState(false);

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
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tracked Accounts ({accounts.length})</span>
              {currentAccount && (
                <button
                  onClick={() => setCurrentAccount(null)}
                  className="text-[10px] text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  Dashboard
                </button>
              )}
            </div>

            {accounts.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
                No accounts tracked
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => setCurrentAccount(acc)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors text-left cursor-pointer ${
                      currentAccount?.id === acc.id
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-bold text-[10px] ${
                        currentAccount?.id === acc.id ? 'bg-white text-blue-600' : 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white'
                      }`}>
                        {acc.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">@{acc.name}</span>
                    </div>
                    {acc.stats && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${
                        currentAccount?.id === acc.id ? 'bg-blue-700 text-blue-100 font-mono' : 'bg-slate-200/70 text-slate-600 font-mono'
                      }`}>
                        {acc.stats.totalFollowers}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Access Export Guide Button */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">Tools & Docs</div>
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

            <button
              id="sidebar-clear-data-btn"
              onClick={() => setIsClearDataOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-700 rounded-xl border border-slate-200 hover:border-red-200 transition-all text-xs font-medium text-left cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
              <div>
                <span className="font-semibold block">Clear Local Data</span>
                <span className="text-[10px] text-slate-400">Reset storage / logs</span>
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


        <section className="flex-1 overflow-y-auto p-8 flex flex-col min-h-0">
          {!currentAccount ? (
            <Dashboard 
              accounts={accounts} 
              onCreate={handleCreate} 
              onSelect={setCurrentAccount} 
              onDelete={handleDelete}
              onOpenGuide={() => setIsGuideOpen(true)}
              onRefreshList={loadAccounts}
              onOpenClearData={() => setIsClearDataOpen(true)}
            />
          ) : (
            <AccountView 
              account={currentAccount} 
              onRefresh={loadAccounts}
              onOpenGuide={() => setIsGuideOpen(true)}
              onOpenClearData={() => setIsClearDataOpen(true)}
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

      {/* Clear Local Storage Data Modal */}
      <ClearDataModal
        isOpen={isClearDataOpen}
        onClose={() => setIsClearDataOpen(false)}
        currentAccount={currentAccount}
        accounts={accounts}
        onDataCleared={(scope) => {
          if (scope === 'all') {
            setCurrentAccount(null);
          }
          loadAccounts();
        }}
      />
    </div>
  );
}
