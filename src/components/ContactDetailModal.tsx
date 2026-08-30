import React, { useState, useEffect } from 'react';
import { 
  X, 
  ExternalLink, 
  Clock, 
  Calendar, 
  Tag, 
  FileText, 
  ShieldCheck, 
  UserMinus, 
  UserCheck, 
  UserX, 
  Star, 
  ShieldAlert, 
  History, 
  Save, 
  Plus, 
  Check, 
  Info 
} from 'lucide-react';
import { UserRecord } from '../types';
import { api } from '../lib/api';
import { format } from 'date-fns';

interface ContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserRecord | null;
  accountId: string;
  onUpdate: () => void;
}

export default function ContactDetailModal({
  isOpen,
  onClose,
  user,
  accountId,
  onUpdate
}: ContactDetailModalProps) {
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setNotes(user.notes || '');
      setTags(user.tags || []);
      setSavedSuccess(false);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await api.updateUserNotes(accountId, user.username, notes, tags);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      onUpdate();
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTag.trim().toLowerCase().replace(/^#/, '');
    if (clean && !tags.includes(clean)) {
      const updated = [...tags, clean];
      setTags(updated);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const getStatusBadge = () => {
    if (user.is_blocked) {
      return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-md font-bold text-xs">Blocked Profile</span>;
    }
    if (user.removal_type === 'you_unfollowed' || (user.currently_followed_by_you === false && user.removed_at)) {
      return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-md font-bold text-xs">You Unfollowed / Removed</span>;
    }
    if (user.currently_following && user.currently_followed_by_you) {
      return <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-md font-bold text-xs">Mutual Connection</span>;
    }
    if (user.currently_followed_by_you && !user.currently_following) {
      return <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-bold text-xs">Doesn't Follow You Back</span>;
    }
    if (user.currently_following && !user.currently_followed_by_you) {
      return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md font-bold text-xs">Follows You</span>;
    }
    if (user.removed_at && !user.currently_following) {
      return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-md font-bold text-xs">Unfollowed You</span>;
    }
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md font-bold text-xs">Archived Contact</span>;
  };

  const formatDateSafe = (dateStr?: string | null) => {
    if (!dateStr) return 'Not recorded';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return format(d, 'PPP p');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        id="contact-detail-modal"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-8 max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl uppercase shadow-md shrink-0">
              {user.username.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold text-white tracking-tight">@{user.username}</h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Permanent Local History Record
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://instagram.com/${user.username}`}
              target="_blank"
              rel="noreferrer"
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
              title="Open on Instagram"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-6">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[10px]">Instagram Followed Date</span>
              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{user.followed_at ? formatDateSafe(user.followed_at) : 'Not in export timestamp'}</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[10px]">Imported into App</span>
              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="truncate">{formatDateSafe(user.imported_at || user.added_at)}</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[10px]">Last Seen in Export</span>
              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="truncate">{formatDateSafe(user.last_seen)}</span>
              </div>
            </div>

            {user.removed_at && (
              <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-1 sm:col-span-3">
                <span className="text-red-500 font-semibold uppercase tracking-wider block text-[10px]">Removal / Unfollow Event</span>
                <div className="flex items-center justify-between text-red-900 font-medium">
                  <div className="flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5 text-red-600" />
                    <span>
                      {user.removal_type === 'you_unfollowed' 
                        ? 'You unfollowed / removed this account' 
                        : 'No longer following you (unfollowed or removed)'}
                    </span>
                  </div>
                  <span className="text-xs text-red-700 font-mono">{formatDateSafe(user.removed_at)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Relationship Status Indicators */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 font-medium ${
              user.currently_following 
                ? 'bg-blue-50 border-blue-200 text-blue-800' 
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              {user.currently_following ? '✓ Follows you' : '✕ Does not follow you'}
            </span>

            <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 font-medium ${
              user.currently_followed_by_you 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              {user.currently_followed_by_you ? '✓ You follow this account' : '✕ You do not follow'}
            </span>

            {user.is_close_friend && (
              <span className="px-2.5 py-1 rounded-lg border bg-green-50 border-green-200 text-green-800 flex items-center gap-1 font-medium">
                <Star className="w-3 h-3 text-green-600 fill-green-600" /> Close Friend
              </span>
            )}

            {user.is_restricted && (
              <span className="px-2.5 py-1 rounded-lg border bg-amber-50 border-amber-200 text-amber-800 flex items-center gap-1 font-medium">
                <ShieldAlert className="w-3 h-3 text-amber-600" /> Restricted
              </span>
            )}
          </div>

          {/* Persistent Notes Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                Persistent Contact Notes
              </label>
              <span className="text-[11px] text-slate-400">Kept permanently in your local archive</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add personal notes about this person (e.g. 'Met at conference 2024', 'College friend', 'Client', etc.). These notes remain preserved forever even if you unfollow them."
              className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          {/* Custom Tags Manager */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-600" />
              Contact Tags
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {tags.map(tag => (
                <span key={tag} className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-xs font-medium flex items-center gap-1">
                  #{tag}
                  <button 
                    type="button" 
                    onClick={() => handleRemoveTag(tag)}
                    className="text-purple-400 hover:text-purple-900 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              <form onSubmit={handleAddTag} className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="+ Add tag (e.g. friend, lead)"
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 placeholder:text-slate-400 focus:ring-1 focus:ring-purple-500 w-36"
                />
                <button
                  type="submit"
                  className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>

          {/* Timeline Events Log */}
          {user.events && user.events.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-600" />
                Audit & Event History Log
              </span>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {user.events.map((evt, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{evt.description || evt.type}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{formatDateSafe(evt.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Save Action */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {savedSuccess && (
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <Check className="w-4 h-4" /> Saved changes permanently!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Notes & Tags'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
