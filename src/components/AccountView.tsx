import React, { useState, useEffect, useRef } from 'react';
import { Account, AccountStats, UserRecord } from '../types';
import { api, ApiError, ApiErrorInfo } from '../lib/api';
import { 
  Upload, 
  Users, 
  UserX, 
  UserMinus, 
  RefreshCw, 
  Handshake, 
  AlertCircle, 
  HelpCircle, 
  ExternalLink, 
  ShieldCheck, 
  FileArchive, 
  FolderUp, 
  Search, 
  Tag, 
  FileText, 
  UserCheck, 
  Archive, 
  Clock, 
  ArrowUpDown, 
  Filter, 
  Check, 
  Trash2,
  FileQuestion,
  Database,
  Download,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import ContactDetailModal from './ContactDetailModal';
import ImportDatabaseModal from './ImportDatabaseModal';

interface AccountViewProps {
  account: Account;
  onRefresh: () => void;
  onOpenGuide: () => void;
  onOpenClearData?: () => void;
}

type TabType = 
  | 'non-followers' 
  | 'unfollowers' 
  | 'you-unfollowed' 
  | 'missing'
  | 'all-contacts' 
  | 'followers' 
  | 'following' 
  | 'mutuals';

export default function AccountView({ account, onRefresh, onOpenGuide, onOpenClearData }: AccountViewProps) {
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [lists, setLists] = useState<Record<string, UserRecord[]>>({});
  const [activeTab, setActiveTab] = useState<TabType>('non-followers');
  const [uploading, setUploading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ApiErrorInfo | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [allUniqueTags, setAllUniqueTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'followed_at' | 'username'>('username');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterRemoved, setFilterRemoved] = useState<'all' | 'removed' | 'not_removed'>('all');
  const [filterSeen, setFilterSeen] = useState<'all' | 'seen' | 'not_seen'>('all');
  
  const [selectedContact, setSelectedContact] = useState<UserRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isImportDbOpen, setIsImportDbOpen] = useState(false);
  const [actionLoadingUser, setActionLoadingUser] = useState<string | null>(null);
  const [statsFolded, setStatsFolded] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setStructuredError = (err: any, fallbackMessage: string = 'An error occurred') => {
    if (err instanceof ApiError) {
      setErrorInfo({
        error: err.message,
        technicalDetails: err.technicalDetails,
        detectedFormat: err.detectedFormat,
        previewSnippet: err.previewSnippet,
        troubleshooting: err.troubleshooting
      });
    } else if (typeof err === 'object' && err !== null && 'error' in err) {
      setErrorInfo({
        error: err.error || fallbackMessage,
        technicalDetails: err.technicalDetails,
        detectedFormat: err.detectedFormat,
        previewSnippet: err.previewSnippet,
        troubleshooting: err.troubleshooting
      });
    } else {
      setErrorInfo({
        error: typeof err === 'string' ? err : (err?.message || fallbackMessage)
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.getAccountData(account.id);
      setStats(data.stats);
      setLists(data.lists);
      setAllUniqueTags(data.allTags);
    } catch (err) {
      console.error(err);
      setStructuredError(err, 'Failed to load account data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [account.id]);

  // Recursively read all files from a dropped directory entry
  const extractFilesFromDataTransfer = async (items: DataTransferItemList): Promise<{ files: File[]; paths: string[]; rootFolderName: string }> => {
    const files: File[] = [];
    const paths: string[] = [];
    let rootFolderName = '';

    async function traverseEntry(entry: any, currentPath = '') {
      if (!entry) return;
      if (!rootFolderName && entry.name) {
        rootFolderName = entry.name;
      }
      if (entry.isFile) {
        const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
        files.push(file);
        paths.push(currentPath ? `${currentPath}/${file.name}` : file.name);
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readEntries = async (): Promise<void> => {
          const entries: any[] = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
          if (entries && entries.length > 0) {
            for (const child of entries) {
              await traverseEntry(child, currentPath ? `${currentPath}/${entry.name}` : entry.name);
            }
            await readEntries();
          }
        };
        await readEntries();
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : (item as any).getAsEntry?.();
      if (entry) {
        await traverseEntry(entry, '');
      } else {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
          paths.push(file.name);
        }
      }
    }

    return { files, paths, rootFolderName };
  };

  const processFolderUpload = async (files: File[], paths: string[], folderName?: string) => {
    if (files.length === 0) return;
    setUploading(true);
    setErrorInfo(null);
    setSuccessMsg('');

    try {
      await api.uploadFolder(files, folderName, paths, account.id);
      setSuccessMsg(`Folder "${folderName || 'Instagram Export'}" ingested! All records and history synchronized.`);
      await fetchData();
      onRefresh();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setStructuredError(err, 'Error processing folder. Make sure it is an official Instagram export folder.');
    } finally {
      setUploading(false);
    }
  };

  const processFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setErrorInfo(null);
    setSuccessMsg('');

    try {
      const filesArray = Array.from(fileList);
      const paths: string[] = filesArray.map(f => (f as any).webkitRelativePath || f.name);
      const isFolderOrMultiple = paths.some(p => p.includes('/'));
      
      if (isFolderOrMultiple) {
        const rootFolder = paths[0]?.split('/')[0] || '';
        await api.uploadFolder(filesArray, rootFolder, paths, account.id);
      } else {
        await api.uploadData(account.id, filesArray, undefined, paths);
      }

      setSuccessMsg(`Data imported successfully! Analyzed relationships & history.`);
      await fetchData();
      onRefresh();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setStructuredError(err, 'Error processing files. Ensure you uploaded valid Instagram JSON files or .zip archive.');
    } finally {
      setUploading(false);
    }
  };

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const { files, paths, rootFolderName } = await extractFilesFromDataTransfer(e.dataTransfer.items);
      if (files.length > 0) {
        await processFolderUpload(files, paths, rootFolderName);
        return;
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const openContactModal = (user: UserRecord) => {
    setSelectedContact(user);
    setIsDetailOpen(true);
  };

  const handleToggleManualRemove = async (e: React.MouseEvent, user: UserRecord) => {
    e.stopPropagation();
    const isCurrentlyManuallyRemoved = (user.tags || []).includes('manually_removed') || user.removal_type === 'you_unfollowed';
    const action = isCurrentlyManuallyRemoved ? 'unmark' : 'remove';

    setActionLoadingUser(user.username);
    try {
      await api.manualRemoveContact(account.id, user.username, action);
      await fetchData();
      onRefresh();
    } catch (err: any) {
      console.error(err);
      setStructuredError(err, 'Failed to update contact status');
    } finally {
      setActionLoadingUser(null);
    }
  };

  const handleToggleMissing = async (e: React.MouseEvent, user: UserRecord) => {
    e.stopPropagation();
    const isCurrentlyMissing = (user.tags || []).includes('manually_missing');
    const action = isCurrentlyMissing ? 'unmark' : 'missing';

    setActionLoadingUser(user.username);
    try {
      await api.manualMissingContact(account.id, user.username, action);
      await fetchData();
      onRefresh();
    } catch (err: any) {
      console.error(err);
      setStructuredError(err, 'Failed to update contact missing status');
    } finally {
      setActionLoadingUser(null);
    }
  };

  const handleToggleSeen = async (e: React.MouseEvent, user: UserRecord) => {
    e.stopPropagation();
    const currentTags = user.tags || [];
    const isSeen = currentTags.includes('seen');
    const newTags = isSeen ? currentTags.filter(t => t !== 'seen') : [...currentTags, 'seen'];

    setActionLoadingUser(user.username);
    try {
      await api.updateUserNotes(account.id, user.username, user.notes || '', newTags);
      await fetchData();
      onRefresh();
    } catch (err: any) {
      console.error(err);
      setStructuredError(err, 'Failed to update seen status');
    } finally {
      setActionLoadingUser(null);
    }
  };

  const getActiveList = (): UserRecord[] => {
    switch (activeTab) {
      case 'followers': return lists.followers || [];
      case 'following': return lists.following || [];
      case 'non-followers': return lists.nonFollowers || [];
      case 'unfollowers': return lists.unfollowers || [];
      case 'you-unfollowed': return lists.youUnfollowed || [];
      case 'missing': return lists.missing || [];
      case 'all-contacts': return lists.allContacts || [];
      case 'mutuals': return lists.mutuals || [];
      default: return [];
    }
  };

  const rawActiveList = getActiveList();

  // Apply Search, Tag, Removed, Seen Filter & Sort
  const filteredList = rawActiveList.filter(user => {
    const cleanSearch = searchQuery.trim().toLowerCase();
    const searchNoHash = cleanSearch.replace(/^#/, '');
    const matchesSearch = cleanSearch === '' || 
      user.username.toLowerCase().includes(cleanSearch) ||
      (user.notes && user.notes.toLowerCase().includes(cleanSearch)) ||
      (user.tags && user.tags.some(t => t.toLowerCase().includes(searchNoHash)));
    
    const matchesTag = selectedTagFilter === 'all' ||
      (user.tags && user.tags.includes(selectedTagFilter));
    
    const isManuallyRemoved = (user.tags || []).includes('manually_removed') || user.removal_type === 'you_unfollowed';
    const matchesRemoved = filterRemoved === 'all' || 
                           (filterRemoved === 'removed' ? isManuallyRemoved : !isManuallyRemoved);
    
    const isSeen = (user.tags || []).includes('seen');
    const matchesSeen = filterSeen === 'all' || 
                        (filterSeen === 'seen' ? isSeen : !isSeen);

    return matchesSearch && matchesTag && matchesRemoved && matchesSeen;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'followed_at') {
      const aDate = a.followed_at ? new Date(a.followed_at).getTime() : 0;
      const bDate = b.followed_at ? new Date(b.followed_at).getTime() : 0;
      comparison = aDate - bDate;
    } else {
      comparison = a.username.localeCompare(b.username);
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <div 
      className="space-y-6 h-full flex flex-col min-h-0 relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept=".json,.zip"
        onChange={handleFileChange}
        disabled={uploading}
      />
      <input
        type="file"
        ref={folderInputRef}
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        // @ts-ignore
        directory=""
        multiple
        onChange={handleFolderChange}
        disabled={uploading}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-2xl z-30 flex items-center justify-center backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-3 text-blue-700 font-bold">
            <Upload className="w-6 h-6 animate-bounce" />
            Drop entire Instagram folder (or ZIP/JSON) to import & retain contacts!
          </div>
        </div>
      )}

      {/* Header & Upload Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-slate-900">@{account.name}</h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              Active Archive
            </span>
            <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Data Retained Locally
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Last export processed: {account.last_updated ? format(new Date(account.last_updated), 'PPpp') : 'No export uploaded yet'}
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Export Unified Database for this Account */}
          <a
            id="account-view-export-database-btn"
            href={api.getAccountExportDatabaseUrl(account.id)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-colors shadow-xs cursor-pointer"
            title="Export this account and all contacts into a single JSON database file"
          >
            <Download className="w-3.5 h-3.5 text-purple-600" />
            Export JSON Database
          </a>

          {/* Import Unified Database for this Account */}
          <button
            id="account-view-import-database-btn"
            onClick={() => setIsImportDbOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-xs cursor-pointer"
            title="Import a JSON database backup directly into this account"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            Import Database
          </button>

          <button
            id="account-view-open-guide-btn"
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors shadow-xs cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            Export Guide
          </button>

          {/* Clear Local Data Button */}
          {onOpenClearData && (
            <button
              id="account-view-clear-data-btn"
              onClick={onOpenClearData}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 transition-colors shadow-xs cursor-pointer"
              title="Clear or reset local contact records and history"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
              Clear Data
            </button>
          )}

          {/* Upload Whole Folder Button */}
          <button
            id="btn-upload-whole-folder"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Upload whole extracted Instagram folder (e.g. instagram-username-YYYY-MM-DD)"
          >
            <FolderUp className="w-4 h-4 text-slate-600" />
            Upload Folder
          </button>

          {/* Upload ZIP / Files Button */}
          <button
            id="btn-upload-files"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer
              ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Processing Data...' : '+ Import Meta ZIP/JSON'}
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl flex items-center justify-between border border-emerald-200 shrink-0 text-xs font-medium">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-900 font-bold">×</button>
        </div>
      )}

      {/* Error Notification */}
      {errorInfo && (
        <div className="bg-red-50 text-red-900 p-4 rounded-xl flex items-start gap-3 border border-red-200 shrink-0">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="font-bold text-red-800 text-sm">{errorInfo.error}</p>
              <button 
                onClick={() => setErrorInfo(null)} 
                className="text-red-500 hover:text-red-800 font-bold px-1.5 text-base leading-none cursor-pointer"
                title="Dismiss"
              >
                ×
              </button>
            </div>

            {errorInfo.technicalDetails && (
              <p className="text-red-700 bg-red-100/70 p-2 rounded-lg border border-red-200 font-mono text-[11px] break-all whitespace-pre-wrap">
                {errorInfo.technicalDetails}
              </p>
            )}

            {errorInfo.previewSnippet && (
              <div className="mt-1">
                <p className="text-[11px] font-semibold text-red-800">File content preview received:</p>
                <pre className="text-[10px] bg-red-100/90 text-red-950 p-2 rounded-lg font-mono overflow-x-auto max-h-24 mt-0.5 border border-red-200 whitespace-pre-wrap break-all">
                  {errorInfo.previewSnippet}
                </pre>
              </div>
            )}

            <div className="text-[11px] text-red-700 pt-0.5 flex items-center flex-wrap gap-1">
              <span>{errorInfo.troubleshooting || 'In Meta Accounts Center, make sure format was set to JSON (not HTML).'}</span>
              <button 
                onClick={onOpenGuide} 
                className="underline font-bold text-red-900 hover:text-black cursor-pointer inline-flex items-center gap-0.5"
              >
                View Export Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading archive data & contacts...</div>
      ) : stats && (stats.totalFollowers > 0 || stats.totalFollowing > 0 || stats.unfollowers > 0 || stats.youUnfollowed > 0) ? (
        <>
          {/* Stats Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                Overview Statistics
              </span>
              <button
                onClick={() => setStatsFolded(!statsFolded)}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {statsFolded ? 'Expand Statistics (+)' : 'Fold Statistics (—)'}
              </button>
            </div>
            
            {!statsFolded && (
              <div className="flex flex-row items-center gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                <StatCard 
                  label="Followers" 
                  value={stats.totalFollowers} 
                  icon={Users} 
                  color="blue" 
                  subtitle="Follows you" 
                  onClick={() => setActiveTab('followers')}
                  active={activeTab === 'followers'}
                />
                <StatCard 
                  label="Following" 
                  value={stats.totalFollowing} 
                  icon={Users} 
                  color="green" 
                  subtitle="You follow" 
                  onClick={() => setActiveTab('following')}
                  active={activeTab === 'following'}
                />
                <StatCard 
                  label="Mutuals" 
                  value={stats.mutuals} 
                  icon={Users} 
                  color="blue" 
                  subtitle="Mutual friends" 
                  onClick={() => setActiveTab('mutuals')}
                  active={activeTab === 'mutuals'}
                />
                <StatCard 
                  label="Non-Followers" 
                  value={stats.nonFollowers} 
                  icon={UserX} 
                  color="red" 
                  subtitle="Don't follow back" 
                  onClick={() => setActiveTab('non-followers')}
                  active={activeTab === 'non-followers'}
                />
                <StatCard 
                  label="Unfollowers" 
                  value={stats.unfollowers} 
                  icon={UserMinus} 
                  color="orange" 
                  subtitle="Lost followers" 
                  onClick={() => setActiveTab('unfollowers')}
                  active={activeTab === 'unfollowers'}
                />
                <StatCard 
                  label="You Removed" 
                  value={stats.youUnfollowed || (lists.youUnfollowed || []).length} 
                  icon={UserX} 
                  color="amber" 
                  subtitle="Kept in archive" 
                  onClick={() => setActiveTab('you-unfollowed')}
                  active={activeTab === 'you-unfollowed'}
                />
                <StatCard 
                  label="Missing" 
                  value={stats.missingCount || (lists.missing || []).length} 
                  icon={FileQuestion} 
                  color="purple" 
                  subtitle="Marked missing" 
                  onClick={() => setActiveTab('missing')}
                  active={activeTab === 'missing'}
                />
                <StatCard 
                  label="All Contacts" 
                  value={stats.allKnownContacts || (lists.allContacts || []).length} 
                  icon={Archive} 
                  color="purple" 
                  subtitle="Master directory" 
                  onClick={() => setActiveTab('all-contacts')}
                  active={activeTab === 'all-contacts'}
                />
              </div>
            )}
          </div>

          {/* Detailed Relationship & History Directory */}
          <div className="bg-white flex-1 rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0">
            {/* Header with Search and Filter */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value="username">Sort: Username</option>
                  <option value="followed_at">Sort: Follow Date</option>
                </select>
                
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                  title="Toggle Sort Order"
                >
                   {sortOrder === 'asc' ? '↑' : '↓'}
                </button>

                {allUniqueTags.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedTagFilter}
                      onChange={(e) => setSelectedTagFilter(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
                    >
                      <option value="all">Tags: All ({allUniqueTags.length})</option>
                      {allUniqueTags.map(t => (
                        <option key={t} value={t}>#{t}</option>
                      ))}
                    </select>

                    {selectedTagFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedTagFilter('all')}
                        className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Reset tag filter to All"
                      >
                        <span>#{selectedTagFilter}</span>
                        <span className="font-bold">×</span>
                      </button>
                    )}
                  </div>
                )}

                <select value={filterRemoved} onChange={(e) => setFilterRemoved(e.target.value as any)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700">
                  <option value="all">Removed: All</option>
                  <option value="removed">Removed: Only</option>
                  <option value="not_removed">Removed: None</option>
                </select>

                <select value={filterSeen} onChange={(e) => setFilterSeen(e.target.value as any)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700">
                  <option value="all">Seen: All</option>
                  <option value="seen">Seen: Only</option>
                  <option value="not_seen">Seen: None</option>
                </select>
              </div>

              <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                <span>Showing <strong>{filteredList.length}</strong> of {rawActiveList.length} contacts</span>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[10px] font-bold">
                  ✓ Persistent Retention Active
                </span>
              </div>
            </div>

            {/* Category Navigation Tabs */}
            <div className="flex overflow-x-auto border-b border-slate-100 hide-scrollbar bg-white shrink-0">
              <Tab 
                id="followers" 
                label={`Followers (${stats.totalFollowers})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="following" 
                label={`Following (${stats.totalFollowing})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="mutuals" 
                label={`Mutuals (${stats.mutuals})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="non-followers" 
                label={`Don't Follow Back (${stats.nonFollowers})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="unfollowers" 
                label={`Unfollowers (${stats.unfollowers})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="you-unfollowed" 
                label={`You Unfollowed / Removed (${stats.youUnfollowed || (lists.youUnfollowed || []).length})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="missing" 
                label={`Missing (${stats.missingCount || (lists.missing || []).length})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
              <Tab 
                id="all-contacts" 
                label={`All History Archive (${stats.allKnownContacts || (lists.allContacts || []).length})`} 
                active={activeTab} 
                onClick={setActiveTab} 
              />
            </div>

            {/* Contact List Records */}
            <div className="flex-1 overflow-y-auto bg-white min-h-0">
              {filteredList.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  {searchQuery ? 'No accounts matched your search criteria.' : 'No records in this category.'}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredList.map((user, index) => {
                    const hasNotes = Boolean(user.notes && user.notes.trim());
                    const hasTags = Boolean(user.tags && user.tags.length > 0);
                    const isRemoved = Boolean(user.removed_at);

                    return (
                      <li 
                        key={user.username} 
                        onClick={() => openContactModal(user)}
                        className={`px-6 py-3.5 flex items-center justify-between transition-colors cursor-pointer hover:bg-blue-50/40 ${
                          index % 2 !== 0 ? 'bg-slate-50/30' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 uppercase border ${
                            isRemoved 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {user.username.charAt(0)}
                          </div>
                          
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 block leading-tight text-xs truncate">
                                @{user.username}
                              </span>

                              {(user.tags?.includes('manually_removed') || user.removal_type === 'you_unfollowed') && (
                                <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                                  <UserMinus className="w-2.5 h-2.5 text-amber-700" />
                                  You Removed
                                </span>
                              )}

                              {user.currently_following && (
                                <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                  Follower
                                </span>
                              )}

                              {user.currently_followed_by_you && (
                                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                  Following
                                </span>
                              )}

                              {hasNotes && (
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1" title={user.notes}>
                                  <FileText className="w-2.5 h-2.5 text-blue-600" />
                                  Note
                                </span>
                              )}

                              {hasTags && user.tags?.map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTagFilter(prev => prev === t ? 'all' : t);
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                    selectedTagFilter === t
                                      ? 'bg-purple-600 text-white border-purple-700 font-bold shadow-xs'
                                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                                  }`}
                                  title={selectedTagFilter === t ? `Clear filter #${t}` : `Filter by tag #${t}`}
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>

                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 truncate">
                              {user.removed_at ? (
                                <span className="text-amber-700 font-medium">
                                  Removed: {format(new Date(user.removed_at), 'PP')}
                                </span>
                              ) : user.followed_at ? (
                                <span>Followed: {format(new Date(user.followed_at), 'PP')}</span>
                              ) : (
                                <span>Imported: {user.imported_at || user.added_at ? format(new Date(user.imported_at || user.added_at), 'PP') : 'Unknown'}</span>
                              )}
                              {user.notes && (
                                <span className="text-slate-500 italic truncate max-w-xs">"{user.notes}"</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={actionLoadingUser === user.username}
                            onClick={(e) => handleToggleManualRemove(e, user)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors border flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                              user.tags?.includes('manually_removed') || user.removal_type === 'you_unfollowed'
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-slate-50 hover:bg-red-50 text-slate-700 hover:text-red-700 border-slate-200 hover:border-red-200'
                            }`}
                            title={
                              user.tags?.includes('manually_removed') || user.removal_type === 'you_unfollowed'
                                ? 'Click to restore account / reverse remove'
                                : 'Mark that you manually unfollowed / removed this account (#manually_removed)'
                            }
                          >
                            {user.tags?.includes('manually_removed') || user.removal_type === 'you_unfollowed' ? (
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <UserMinus className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {user.tags?.includes('manually_removed') || user.removal_type === 'you_unfollowed'
                                ? 'Restore Account'
                                : 'Mark Removed'}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingUser === user.username}
                            onClick={(e) => handleToggleMissing(e, user)}
                            className={`p-1.5 rounded-lg transition-colors border cursor-pointer disabled:opacity-50 ${
                              user.tags?.includes('manually_missing')
                                ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-300'
                                : 'bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border-slate-200 hover:border-purple-200'
                            }`}
                            title={
                              user.tags?.includes('manually_missing')
                                ? 'Marked as Missing (#manually_missing) - Click to unmark'
                                : 'Mark as Missing (#manually_missing)'
                            }
                          >
                            <FileQuestion className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingUser === user.username}
                            onClick={(e) => handleToggleSeen(e, user)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                              user.tags?.includes('seen')
                                ? 'bg-sky-100 hover:bg-sky-200 text-sky-900 border-sky-300'
                                : 'bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-700 border-slate-200 hover:border-sky-200'
                            }`}
                            title={
                              user.tags?.includes('seen')
                                ? 'Marked as Seen - Click to unmark'
                                : 'Mark as Seen (Moves to bottom of Don\'t Follow Back list)'
                            }
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{user.tags?.includes('seen') ? 'Seen ✓' : 'Mark Seen'}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openContactModal(user);
                            }}
                            className="text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer"
                          >
                            Details
                          </button>
                          
                          <a
                            href={`https://instagram.com/${user.username}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 font-semibold hover:underline text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-100 transition-colors"
                          >
                            Profile ↗
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-slate-400 shrink-0">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>All removed and existing contacts are stored locally in your private archive.</span>
              </div>
              <div className="flex space-x-3 font-medium text-slate-600">
                <button onClick={fetchData} className="hover:underline cursor-pointer">
                  Sync & Recalculate
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-xs">
            <FileArchive className="w-8 h-8" />
          </div>

          <div className="max-w-md space-y-1.5">
            <h3 className="text-lg font-bold text-slate-900">No export files imported yet for @{account.name}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Import your official Meta Instagram export folder (e.g. <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">instagram-{account.name}-...</code>) or ZIP archive to track followers, unfollowers, and retain contacts history permanently.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => folderInputRef.current?.click()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <FolderUp className="w-4 h-4" />
              Upload Whole Exported Folder
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Upload .ZIP or .JSON
            </button>

            <button
              onClick={onOpenGuide}
              className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-blue-600" />
              Export Guide & Links
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 max-w-sm text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>100% GDPR compliant • Permanent data retention even after removal</span>
          </div>
        </div>
      )}

      {/* Contact Details & History Modal */}
      <ContactDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedContact(null);
        }}
        user={selectedContact}
        accountId={account.id}
        onUpdate={fetchData}
        allTags={allUniqueTags}
      />

      {/* Database Import Modal */}
      <ImportDatabaseModal
        isOpen={isImportDbOpen}
        onClose={() => setIsImportDbOpen(false)}
        accountId={account.id}
        accountName={account.name}
        onSuccess={() => {
          fetchData();
          onRefresh();
          setSuccessMsg('Account database successfully updated from JSON backup!');
        }}
      />
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  color, 
  subtitle,
  onClick,
  active
}: { 
  label: string; 
  value: number; 
  icon: any; 
  color: string; 
  subtitle: string;
  onClick: () => void;
  active: boolean;
}) {
  const isRed = color === 'red';
  const isOrange = color === 'orange';
  const isAmber = color === 'amber';
  const isGreen = color === 'green';
  const isPurple = color === 'purple';

  return (
    <div 
      onClick={onClick}
      className={`bg-white p-3.5 rounded-xl border transition-all cursor-pointer shadow-xs flex flex-col justify-between min-w-[170px] sm:min-w-[190px] shrink-0 ${
        active 
          ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20' 
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <span>{label}</span>
        <Icon className={`w-3.5 h-3.5 ${
          isRed ? 'text-red-500' : (isGreen ? 'text-emerald-500' : (isOrange ? 'text-orange-500' : (isAmber ? 'text-amber-500' : (isPurple ? 'text-purple-500' : 'text-blue-500'))))
        }`} />
      </div>
      <p className={`text-xl font-bold mt-1.5 ${
        isRed ? 'text-red-600' : (isOrange ? 'text-orange-600' : (isAmber ? 'text-amber-600' : 'text-slate-900'))
      }`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
    </div>
  );
}

function Tab({ 
  id, 
  label, 
  active, 
  onClick 
}: { 
  id: TabType; 
  label: string; 
  active: TabType; 
  onClick: (id: TabType) => void;
}) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer ${
        isActive 
          ? 'border-blue-600 text-blue-700 bg-blue-50/40' 
          : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
