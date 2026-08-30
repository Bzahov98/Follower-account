import React, { useState, useRef } from 'react';
import { 
  Database, 
  Upload, 
  FileJson, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../lib/api';

interface ImportDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accountId?: string; // Optional: import directly into this account if provided
  accountName?: string;
}

export default function ImportDatabaseModal({
  isOpen,
  onClose,
  onSuccess,
  accountId,
  accountName
}: ImportDatabaseModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    format?: string;
    version?: string;
    exported_at?: string;
    accountsCount: number;
    contactsCount: number;
    accountNames: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;
    setError(null);
    setSuccess(null);

    if (!selectedFile.name.toLowerCase().endsWith('.json')) {
      setError('Please select a valid .json database backup file.');
      return;
    }

    setFile(selectedFile);

    // Read and parse preview
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);

        let accountsCount = 0;
        let contactsCount = 0;
        const accountNames: string[] = [];

        if (parsed.accounts && Array.isArray(parsed.accounts)) {
          accountsCount = parsed.accounts.length;
          parsed.accounts.forEach((acc: any) => {
            if (acc.name) accountNames.push(acc.name);
            contactsCount += Object.keys(acc.contacts || {}).length;
          });
        } else if (parsed.account && typeof parsed.account === 'object') {
          accountsCount = 1;
          if (parsed.account.name) accountNames.push(parsed.account.name);
          contactsCount = Object.keys(parsed.account.contacts || {}).length;
        } else if (parsed.contacts && typeof parsed.contacts === 'object') {
          accountsCount = 1;
          if (parsed.name) accountNames.push(parsed.name);
          contactsCount = Object.keys(parsed.contacts).length;
        } else if (Array.isArray(parsed)) {
          accountsCount = parsed.length;
          parsed.forEach((acc: any) => {
            if (acc.name) accountNames.push(acc.name);
            contactsCount += Object.keys(acc.contacts || {}).length;
          });
        }

        if (contactsCount === 0 && accountsCount === 0) {
          setError('The selected file does not appear to contain a valid contacts database structure.');
          setPreview(null);
          return;
        }

        setPreview({
          format: parsed.format,
          version: parsed.version,
          exported_at: parsed.exported_at,
          accountsCount,
          contactsCount,
          accountNames
        });
      } catch (err: any) {
        setError('Failed to parse JSON file. Ensure it is not corrupted.');
        setPreview(null);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (accountId) {
        const res = await api.importAccountDatabaseFile(accountId, file);
        setSuccess(res.message || 'Database successfully imported!');
      } else {
        const res = await api.importDatabaseFile(file);
        setSuccess(res.message || 'Database successfully imported!');
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to import JSON database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {accountId && accountName ? `Import Database for @${accountName}` : 'Import Local JSON Database'}
              </h3>
              <p className="text-xs text-slate-500">
                Restore accounts and consolidated contact records with 1-click
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging 
                ? 'border-purple-500 bg-purple-50/50' 
                : file 
                  ? 'border-emerald-400 bg-emerald-50/20' 
                  : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            />

            {file && preview ? (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <FileJson className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB • JSON Database File</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-xs text-purple-700 hover:underline font-semibold"
                >
                  Choose different file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">Click or drag & drop JSON database backup</p>
                  <p className="text-xs text-slate-500 mt-0.5">Accepts unified single-record database JSON export files</p>
                </div>
              </div>
            )}
          </div>

          {/* Preview Card */}
          {preview && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Backup Information</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                  Valid Structure
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Accounts</span>
                  <span className="font-bold text-slate-900 text-sm">{preview.accountsCount}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Total Contacts</span>
                  <span className="font-bold text-slate-900 text-sm">{preview.contactsCount}</span>
                </div>
              </div>

              {preview.accountNames.length > 0 && (
                <div className="text-xs">
                  <span className="text-slate-500 block text-[11px] mb-1">Target Account(s):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.accountNames.map((name, i) => (
                      <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-800 font-semibold rounded-md text-[11px]">
                        @{name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.exported_at && (
                <p className="text-[11px] text-slate-400">
                  Exported on {new Date(preview.exported_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Success / Error alerts */}
          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-100 text-xs text-purple-900/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-purple-950">
              <ShieldCheck className="w-4 h-4 text-purple-600" /> Single JSON Database Record Structure
            </div>
            <p className="text-[11px] text-purple-800/80 leading-relaxed">
              Each user (e.g. <code className="font-mono text-purple-900">@example</code>) has a single consolidated object containing their full history, notes, tags, flags, and timestamps.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/50 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!file || !preview || loading}
            onClick={handleImport}
            className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Importing Database...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" /> Confirm & Restore Database
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
