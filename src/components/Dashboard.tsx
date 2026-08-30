import React, { useState, useRef } from 'react';
import { Account } from '../types';
import { 
  Plus, 
  Trash2, 
  ArrowRight, 
  Clock, 
  ShieldCheck, 
  HelpCircle, 
  ExternalLink, 
  FolderUp, 
  Upload, 
  Sparkles, 
  Archive,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../lib/api';

interface DashboardProps {
  accounts: Account[];
  onCreate: (name: string) => void;
  onSelect: (account: Account) => void;
  onDelete: (id: string) => void;
  onOpenGuide: () => void;
  onRefreshList: () => void;
}

export default function Dashboard({ 
  accounts, 
  onCreate, 
  onSelect, 
  onDelete, 
  onOpenGuide,
  onRefreshList
}: DashboardProps) {
  const [newName, setNewName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFolder, setUploadingFolder] = useState(false);
  const [folderUploadError, setFolderUploadError] = useState<string | null>(null);
  const [folderUploadSuccess, setFolderUploadSuccess] = useState<string | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreate(newName.trim().replace(/^@/, ''));
      setNewName('');
    }
  };

  const handleFolderUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingFolder(true);
    setFolderUploadError(null);
    setFolderUploadSuccess(null);

    try {
      const filesArray = Array.from(fileList);
      const paths: string[] = filesArray.map(f => (f as any).webkitRelativePath || f.name);
      const rootFolder = paths[0]?.split('/')[0] || '';
      
      const res = await api.uploadFolder(filesArray, rootFolder, paths);
      setFolderUploadSuccess(`Successfully processed folder! Account @${res.account.name} is ready with retained contacts.`);
      onRefreshList();
      onSelect(res.account);
    } catch (err: any) {
      setFolderUploadError(err.message || 'Failed to process folder. Ensure it contains Instagram JSON export files.');
    } finally {
      setUploadingFolder(false);
    }
  };

  const handleZipUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingFolder(true);
    setFolderUploadError(null);
    setFolderUploadSuccess(null);

    try {
      const filesArray = Array.from(fileList);
      const res = await api.uploadFolder(filesArray);
      setFolderUploadSuccess(`Successfully imported archive for @${res.account.name}!`);
      onRefreshList();
      onSelect(res.account);
    } catch (err: any) {
      setFolderUploadError(err.message || 'Failed to parse ZIP archive.');
    } finally {
      setUploadingFolder(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray: File[] = Array.from(e.dataTransfer.files);
      const isZip = filesArray.some((f: File) => f.name.toLowerCase().endsWith('.zip'));
      if (isZip) {
        await handleZipUpload(e.dataTransfer.files);
      } else {
        await handleFolderUpload(e.dataTransfer.files);
      }
    }
  };

  return (
    <div 
      className="space-y-6 relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={folderInputRef}
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        // @ts-ignore
        directory=""
        multiple
        onChange={(e) => handleFolderUpload(e.target.files)}
        disabled={uploadingFolder}
      />
      <input
        type="file"
        ref={zipInputRef}
        className="hidden"
        accept=".zip"
        onChange={(e) => handleZipUpload(e.target.files)}
        disabled={uploadingFolder}
      />

      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-2xl z-30 flex items-center justify-center backdrop-blur-xs">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-3 text-blue-700 font-bold">
            <Upload className="w-6 h-6 animate-bounce" />
            Drop your Instagram exported folder or ZIP here to auto-import!
          </div>
        </div>
      )}

      {/* Official Export Guide Callout Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-full uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-300" />
              100% Safe • GDPR Export • Persistent Contact Retention
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Official Instagram Export Ingestion
          </h2>
          <p className="text-xs text-blue-100/80 leading-relaxed">
            Upload whole exported folders directly (e.g. <code className="font-mono text-blue-200 bg-blue-950/60 px-1 py-0.5 rounded">instagram-username-date</code>). Unfollowed and removed contacts are safely preserved in your private archive forever.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 shrink-0">
          <button
            id="dashboard-open-guide-btn"
            onClick={onOpenGuide}
            className="px-4 py-2.5 bg-white text-blue-950 hover:bg-blue-50 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            Interactive Export Guide
          </button>
          <a
            href="https://accountscenter.instagram.com/info_and_permissions/dyi/"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2.5 bg-blue-800/80 hover:bg-blue-700/80 text-white text-xs font-medium rounded-xl border border-blue-400/30 transition-all flex items-center gap-1"
          >
            Meta Accounts Center <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Notifications */}
      {folderUploadSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{folderUploadSuccess}</span>
          </div>
          <button onClick={() => setFolderUploadSuccess(null)} className="font-bold text-emerald-700 hover:text-emerald-900">×</button>
        </div>
      )}

      {folderUploadError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{folderUploadError}</span>
        </div>
      )}

      {/* Quick Add & Direct Folder Ingestion Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Manual Account Add */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
          <h2 className="text-sm font-bold mb-3 text-slate-800 flex items-center gap-2">
            <span>➕</span> Track Account Manually
          </h2>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Instagram Username (e.g. johndoe)"
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full p-3 transition-shadow"
              required
            />
            <button
              type="submit"
              className="text-white bg-slate-900 hover:bg-slate-800 focus:ring-4 focus:ring-slate-300 font-semibold rounded-xl text-xs px-5 py-3 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Target
            </button>
          </form>
        </div>

        {/* Ingest Whole Exported Folder Box */}
        <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/50 p-5 rounded-2xl border border-indigo-100 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">Instant Setup</span>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">Import Whole Instagram Export</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Select your unzipped folder or ZIP file. Accounts and contacts are auto-configured.
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              id="dashboard-upload-folder-btn"
              onClick={() => folderInputRef.current?.click()}
              disabled={uploadingFolder}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {uploadingFolder ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
              {uploadingFolder ? 'Ingesting...' : 'Upload Folder'}
            </button>

            <button
              id="dashboard-upload-zip-btn"
              onClick={() => zipInputRef.current?.click()}
              disabled={uploadingFolder}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              title="Upload .zip archive"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              .ZIP
            </button>
          </div>
        </div>
      </div>

      {/* Account List Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Your Tracked Accounts</h2>
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
              {accounts.length}
            </span>
          </div>

          <button
            onClick={onOpenGuide}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" /> How to get data from Meta?
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-slate-200 border-dashed space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <Archive className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-800 font-bold text-sm">No accounts tracked yet</p>
              <p className="text-slate-500 text-xs max-w-sm mx-auto">
                Add an account username above or click "Upload Folder" with your Instagram export to begin.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => (
              <div 
                key={account.id} 
                className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 hover:shadow-md transition-all cursor-pointer relative flex flex-col justify-between"
                onClick={() => onSelect(account)}
              >
                <div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(account.id);
                    }}
                    className="absolute top-4 right-4 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded-lg"
                    title="Delete account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center uppercase shadow-xs">
                      {account.name.charAt(0)}
                    </div>
                    <div className="min-w-0 pr-6">
                      <h3 className="font-bold text-base text-slate-900 truncate">@{account.name}</h3>
                      <div className="flex items-center text-[11px] text-slate-400 gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {account.last_updated 
                          ? `Updated ${formatDistanceToNow(new Date(account.last_updated))} ago` 
                          : 'No export data yet'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">Private Local Retention</span>
                  <span className="text-blue-600 font-bold group-hover:text-blue-700 flex items-center gap-1">
                    Open Insights <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
