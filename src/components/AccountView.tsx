import React, { useState, useEffect } from 'react';
import { Account, AccountStats, UserRecord } from '../types';
import { api } from '../lib/api';
import { Upload, Users, UserX, UserMinus, RefreshCw, Handshake, AlertCircle, HelpCircle, ExternalLink, ShieldCheck, FileArchive } from 'lucide-react';
import { format } from 'date-fns';

interface AccountViewProps {
  account: Account;
  onRefresh: () => void;
  onOpenGuide: () => void;
}

type TabType = 'non-followers' | 'unfollowers' | 'followers' | 'following' | 'mutuals';

export default function AccountView({ account, onRefresh, onOpenGuide }: AccountViewProps) {
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [lists, setLists] = useState<Record<string, UserRecord[]>>({});
  const [activeTab, setActiveTab] = useState<TabType>('non-followers');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.getAccountData(account.id);
      setStats(data.stats);
      setLists(data.lists);
    } catch (err) {
      console.error(err);
      setError('Failed to load account data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [account.id]);

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    setError('');
    try {
      const res = await api.uploadData(account.id, files);
      await fetchData();
      onRefresh(); // Refresh parent to update last_updated timestamp
    } catch (err: any) {
      setError(err.message || 'Error processing files. Ensure you uploaded valid Instagram JSON files or the full .zip archive.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
      if (e.target) e.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const getActiveList = () => {
    switch (activeTab) {
      case 'followers': return lists.followers || [];
      case 'following': return lists.following || [];
      case 'non-followers': return lists.nonFollowers || [];
      case 'unfollowers': return lists.unfollowers || [];
      case 'mutuals': return lists.mutuals || [];
      default: return [];
    }
  };

  const activeList = getActiveList();

  return (
    <div 
      className="space-y-6 h-full flex flex-col min-h-0 relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-2xl z-30 flex items-center justify-center backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-3 text-blue-700 font-bold">
            <Upload className="w-6 h-6 animate-bounce" />
            Drop your Instagram ZIP or JSON files here to import!
          </div>
        </div>
      )}

      {/* Header & Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800">@{account.name}</h2>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-200">
              Active Target
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Last data update: {account.last_updated ? format(new Date(account.last_updated), 'PPpp') : 'No data uploaded yet'}
          </p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <button
            id="account-view-open-guide-btn"
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            Export Guide & Links
          </button>

          <div className="relative">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".json,.zip"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm
                ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
            >
              {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Processing Files...' : '+ Import JSON / ZIP'}
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 border border-red-100 shrink-0">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">{error}</p>
            <p className="text-xs text-red-600 mt-1">
              Tip: In Meta Accounts Center, make sure to set format to <strong>JSON</strong> (not HTML). Check our{' '}
              <button onClick={onOpenGuide} className="underline font-bold text-red-800 hover:text-red-950">
                Interactive Export Guide
              </button> for visual steps.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading profile data...</div>
      ) : stats && (stats.totalFollowers > 0 || stats.totalFollowing > 0 || stats.unfollowers > 0) ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 shrink-0">
            <StatCard label="Followers" value={stats.totalFollowers} icon={Users} color="blue" subtitle="Current follower count" />
            <StatCard label="Following" value={stats.totalFollowing} icon={Users} color="green" subtitle="Accounts followed" />
            <StatCard label="Non-Followers" value={stats.nonFollowers} icon={UserX} color="red" subtitle="Don't follow you back" />
            <StatCard label="Unfollowers" value={stats.unfollowers} icon={UserMinus} color="orange" subtitle="Lost since tracking" />
            <StatCard label="Mutuals" value={stats.mutuals} icon={Handshake} color="purple" subtitle="Following each other" />
          </div>

          {/* Detailed Lists */}
          <div className="bg-white flex-1 rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center text-sm">
                <span className="mr-2">📋</span> Relationship Breakdown
              </h3>
              <div className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-600 font-medium">
                {activeList.length} accounts found
              </div>
            </div>

            <div className="flex overflow-x-auto border-b border-slate-100 hide-scrollbar bg-white shrink-0">
              <Tab id="non-followers" label={`Non-Followers (${stats.nonFollowers})`} active={activeTab} onClick={setActiveTab} />
              <Tab id="unfollowers" label={`Unfollowers (${stats.unfollowers})`} active={activeTab} onClick={setActiveTab} />
              <Tab id="followers" label={`Followers (${stats.totalFollowers})`} active={activeTab} onClick={setActiveTab} />
              <Tab id="following" label={`Following (${stats.totalFollowing})`} active={activeTab} onClick={setActiveTab} />
              <Tab id="mutuals" label={`Mutuals (${stats.mutuals})`} active={activeTab} onClick={setActiveTab} />
            </div>

            <div className="flex-1 overflow-y-auto bg-white min-h-0">
              {activeList.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No accounts found in this category.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activeList.map((user, index) => (
                    <li key={user.username} className={`px-6 py-3.5 flex items-center justify-between transition-colors ${index % 2 !== 0 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-slate-50`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-200 rounded-full flex items-center justify-center text-slate-700 font-bold text-xs shrink-0 uppercase">
                          {user.username.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block leading-tight text-sm">@{user.username}</span>
                          <span className="text-[10px] text-slate-500">
                            {activeTab === 'unfollowers' 
                              ? `Lost on: ${format(new Date(user.last_seen), 'PP')}`
                              : `Recorded: ${format(new Date(user.added_at), 'PP')}`}
                          </span>
                        </div>
                      </div>
                      <a
                        href={`https://instagram.com/${user.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-semibold hover:underline text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors"
                      >
                        View Profile ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 shrink-0">
              <div>Safe & Local Analysis • No Instagram API limits</div>
              <div className="flex space-x-2 font-medium text-slate-600 underline cursor-pointer">
                <span onClick={fetchData}>Refresh Calculations</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Empty State with Actionable Guide Box */
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-xs">
            <FileArchive className="w-8 h-8" />
          </div>

          <div className="max-w-md space-y-1.5">
            <h3 className="text-lg font-bold text-slate-800">No export files imported yet for @{account.name}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              To see who doesn't follow you back or track unfollowers over time, import your official Instagram export archive.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={onOpenGuide}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              View Step-by-Step Export Guide
            </button>
            <label
              htmlFor="file-upload"
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Upload .ZIP or .JSON Files
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 max-w-sm text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>100% GDPR compliant • Never requires your Instagram password</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, subtitle }: { label: string, value: number, icon: any, color: string, subtitle: string }) {
  const isRed = color === 'red';
  const isOrange = color === 'orange';
  const isGreen = color === 'green';
  const isBlue = color === 'blue';

  return (
    <div className={`bg-white p-4 rounded-xl border ${isRed ? 'border-red-200' : 'border-slate-200'} shadow-sm flex flex-col justify-between`}>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <span>{label}</span>
        <Icon className={`w-3.5 h-3.5 ${isRed ? 'text-red-500' : (isGreen ? 'text-green-500' : (isOrange ? 'text-amber-500' : 'text-blue-500'))}`} />
      </div>
      <p className={`text-2xl font-bold mt-2 ${isRed ? 'text-red-600' : (isOrange ? 'text-amber-600' : 'text-slate-800')}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
    </div>
  );
}

function Tab({ id, label, active, onClick }: { id: TabType, label: string, active: TabType, onClick: (id: TabType) => void }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-5 py-3.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer ${
        isActive 
          ? 'border-blue-600 text-blue-700 bg-blue-50/40' 
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
