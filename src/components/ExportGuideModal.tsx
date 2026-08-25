import { useState } from 'react';
import { 
  ShieldCheck, 
  ExternalLink, 
  Download, 
  CheckCircle2, 
  Copy, 
  Check, 
  HelpCircle, 
  Sparkles, 
  AlertTriangle, 
  Smartphone, 
  Monitor, 
  FileText, 
  FileArchive, 
  Upload, 
  ChevronRight, 
  ChevronLeft,
  X,
  FileCode,
  Info
} from 'lucide-react';
import { Account } from '../types';
import { api } from '../lib/api';

interface ExportGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAccount?: Account | null;
  accounts?: Account[];
  onDataImported?: () => void;
}

export default function ExportGuideModal({
  isOpen,
  onClose,
  currentAccount,
  accounts = [],
  onDataImported
}: ExportGuideModalProps) {
  const [platform, setPlatform] = useState<'web' | 'mobile'>('web');
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(currentAccount?.id || (accounts[0]?.id || ''));
  
  // Quick Upload / Paste inside Guide
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [pasteType, setPasteType] = useState<'followers' | 'following'>('followers');

  if (!isOpen) return null;

  const directDyiUrl = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';
  const directWebUrl = 'https://www.instagram.com/download/request/';

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const toggleStepCompleted = (stepNum: number) => {
    if (completedSteps.includes(stepNum)) {
      setCompletedSteps(completedSteps.filter(s => s !== stepNum));
    } else {
      setCompletedSteps([...completedSteps, stepNum]);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const targetId = selectedAccountId || currentAccount?.id;
    if (!targetId) {
      setUploadError('Please select or create an account first.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await api.uploadData(targetId, files);
      setUploadSuccess(`Successfully imported ${res.followersParsed} followers and ${res.followingParsed} following!`);
      if (!completedSteps.includes(5)) {
        setCompletedSteps([...completedSteps, 5]);
      }
      if (onDataImported) onDataImported();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse uploaded export.');
    } finally {
      setUploading(false);
    }
  };

  const handleJsonPaste = async () => {
    if (!pastedJson.trim()) return;
    const targetId = selectedAccountId || currentAccount?.id;
    if (!targetId) {
      setUploadError('Please select or create an account first.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await api.pasteJson(targetId, {
        rawJson: pastedJson,
        type: pasteType
      });
      setUploadSuccess(`Imported from pasted JSON: ${res.followersParsed} followers, ${res.followingParsed} following.`);
      setPastedJson('');
      if (!completedSteps.includes(5)) {
        setCompletedSteps([...completedSteps, 5]);
      }
      if (onDataImported) onDataImported();
    } catch (err: any) {
      setUploadError(err.message || 'Invalid JSON format. Check the pasted text.');
    } finally {
      setUploading(false);
    }
  };

  const steps = [
    {
      id: 1,
      title: 'Open Meta Accounts Center',
      tag: 'Direct Access',
      content: {
        web: (
          <div className="space-y-4">
            <p className="text-slate-600 text-sm leading-relaxed">
              Meta provides an official automated data export portal under GDPR & CCPA privacy regulations. Click the direct link below to jump directly to the export request form:
            </p>
            
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    DYI
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-blue-950">Instagram Accounts Center DYI</h4>
                    <p className="text-xs text-blue-700">Official Meta Data Download Page</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <a
                    id="guide-open-portal-btn"
                    href={directDyiUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    Open Download Portal
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => copyUrl(directDyiUrl)}
                    className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                    title="Copy Link"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Alternative direct URL: <a href={directWebUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline font-mono">instagram.com/download/request</a>
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 border border-slate-200">
              <span className="font-semibold text-slate-800">Or navigate manually in Instagram Web:</span> Click your Profile icon $\rightarrow$ <strong>Settings</strong> $\rightarrow$ <strong>Accounts Center</strong> $\rightarrow$ <strong>Your information and permissions</strong> $\rightarrow$ <strong>Download your information</strong>.
            </div>
          </div>
        ),
        mobile: (
          <div className="space-y-4 text-sm text-slate-600">
            <p>On your phone in the <strong>Instagram app (iOS or Android)</strong>:</p>
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>Tap your <strong>Profile picture</strong> at the bottom right.</li>
              <li>Tap the <strong>☰ Menu</strong> (top right) and select <strong>Settings & Privacy</strong>.</li>
              <li>Tap <strong>Accounts Center</strong> (Meta badge at the top).</li>
              <li>Under Account settings, tap <strong>Your information and permissions</strong>.</li>
              <li>Tap <strong>Download your information</strong>.</li>
            </ol>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>You can also open Safari or Chrome on your phone and use the direct link above.</span>
            </div>
          </div>
        )
      }
    },
    {
      id: 2,
      title: 'Select Profile & Scope',
      tag: 'Followers Only',
      content: {
        web: (
          <div className="space-y-3 text-sm text-slate-600">
            <p>On the "Download your information" screen:</p>
            <div className="space-y-2">
              <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-start gap-3 shadow-xs">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">1</span>
                <div>
                  <strong className="text-slate-800 block">Click "Download or transfer information"</strong>
                  <span className="text-xs text-slate-500">Select your Instagram profile checkbox and click Next.</span>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-start gap-3 shadow-xs">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">2</span>
                <div>
                  <strong className="text-slate-800 block">Choose "Some of your information"</strong>
                  <span className="text-xs text-slate-500">Do NOT pick "All available information" (that includes all photos/videos and can take hours).</span>
                </div>
              </div>

              <div className="p-3 bg-white border border-blue-300 bg-blue-50/30 rounded-lg flex items-start gap-3 shadow-xs">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">3</span>
                <div>
                  <strong className="text-blue-900 block">Check "Followers and following"</strong>
                  <span className="text-xs text-slate-600">Scroll down to the Connections category, check the box for <strong>Followers and following</strong>, then click <strong>Next</strong>.</span>
                </div>
              </div>
            </div>
          </div>
        ),
        mobile: (
          <div className="space-y-3 text-sm text-slate-600">
            <p>1. Tap <strong>Download or transfer information</strong>.</p>
            <p>2. Select your account and choose <strong>Some of your information</strong>.</p>
            <p>3. Check <strong>Followers and following</strong> and tap <strong>Next</strong>.</p>
          </div>
        )
      }
    },
    {
      id: 3,
      title: 'Configure Settings (Crucial Step!)',
      tag: 'Format: JSON',
      content: {
        web: (
          <div className="space-y-4 text-sm">
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-xs font-bold uppercase tracking-wider block">Format Must Be JSON</strong>
                <p className="text-xs mt-0.5">Meta defaults to HTML, but InstaArchive requires <strong>JSON</strong> to parse your follower records automatically.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-white border-2 border-blue-500 rounded-xl shadow-xs">
                <span className="text-[11px] font-bold uppercase text-blue-600 tracking-wider block">1. Format</span>
                <span className="text-base font-bold text-slate-800 mt-1 block">JSON</span>
                <span className="text-[11px] text-emerald-600 font-medium">✓ Required</span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">2. Date Range</span>
                <span className="text-base font-bold text-slate-800 mt-1 block">All time</span>
                <span className="text-[11px] text-slate-500">Includes all history</span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">3. Media Quality</span>
                <span className="text-base font-bold text-slate-800 mt-1 block">Medium / Low</span>
                <span className="text-[11px] text-slate-500">Generates in 2 mins</span>
              </div>
            </div>

            <p className="text-slate-600 text-xs">
              Click <strong>"Create files"</strong> (or "Submit request"). Meta will now begin compiling your followers and following data into a lightweight file.
            </p>
          </div>
        ),
        mobile: (
          <div className="space-y-3 text-sm text-slate-600">
            <p>1. Destination: <strong>Download to device</strong></p>
            <p>2. Format: Tap and change from HTML to <strong>JSON</strong></p>
            <p>3. Date range: Select <strong>All time</strong></p>
            <p>4. Tap <strong>Create files</strong></p>
          </div>
        )
      }
    },
    {
      id: 4,
      title: 'Wait for Meta Notification & Download',
      tag: 'Takes 1-5 Mins',
      content: {
        web: (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Because you only requested follower records, Meta usually prepares the download package in <strong>1 to 3 minutes</strong>:
            </p>
            
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>You will receive an email: <em>"Your Meta information file is ready to download"</em>.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Or refresh the <strong>Download your information</strong> page in Accounts Center.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Click the blue <strong>"Download"</strong> button (enter your Instagram password if prompted).</span>
              </li>
            </ul>

            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200">
              You will get a file named like <code className="font-mono text-slate-700 bg-slate-200/60 px-1 py-0.5 rounded">instagram-yourusername-2026-08-24.zip</code>.
            </div>
          </div>
        ),
        mobile: (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Check your email or the Instagram notification tab.</p>
            <p>Tap <strong>Download</strong> and save the zip archive to your Files app or computer.</p>
          </div>
        )
      }
    },
    {
      id: 5,
      title: 'Import Export into InstaArchive',
      tag: 'ZIP or JSON',
      content: {
        web: (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              You can import your data using either of these simple methods:
            </p>

            {/* Target Account Selector */}
            {accounts.length > 0 && (
              <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700">Target Profile:</span>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-800 font-medium focus:ring-1 focus:ring-blue-500"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>@{acc.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Method Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setPasteMode(false)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  !pasteMode ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileArchive className="w-3.5 h-3.5" />
                Upload ZIP or JSON Files
              </button>
              <button
                onClick={() => setPasteMode(true)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  pasteMode ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                Paste Raw JSON
              </button>
            </div>

            {!pasteMode ? (
              <div className="space-y-3">
                <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/30 transition-all rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer text-center group">
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".zip,.json"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    disabled={uploading}
                  />
                  <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform mb-2">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {uploading ? 'Processing Data...' : 'Drop Instagram ZIP or JSON files here'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Accepts the complete downloaded <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.zip</code> or extracted <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">followers_1.json</code> and <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">following.json</code>
                  </p>
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">JSON Type:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="pasteType"
                      checked={pasteType === 'followers'}
                      onChange={() => setPasteType('followers')}
                    />
                    Followers
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="pasteType"
                      checked={pasteType === 'following'}
                      onChange={() => setPasteType('following')}
                    />
                    Following
                  </label>
                </div>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder='Paste the content of followers_1.json or following.json here...'
                  className="w-full h-28 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleJsonPaste}
                  disabled={uploading || !pastedJson.trim()}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Parsing JSON...' : 'Import Pasted JSON'}
                </button>
              </div>
            )}

            {uploadSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        ),
        mobile: (
          <div className="space-y-2 text-sm text-slate-600">
            <p>Upload the downloaded zip archive directly using the button above.</p>
          </div>
        )
      }
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        id="export-guide-dialog"
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-8 max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-full uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> GDPR Compliant • 100% Safe
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Instagram Data Export Guide
            </h2>
            <p className="text-xs text-slate-300 max-w-xl">
              Follow this step-by-step walkthrough to get your official followers and following files directly from Meta without risking bans or sharing passwords.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform & Quick Nav Switcher */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg">
            <button
              onClick={() => setPlatform('web')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                platform === 'web' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Desktop Web
            </button>
            <button
              onClick={() => setPlatform('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                platform === 'mobile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Instagram Mobile App
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={directDyiUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
            >
              Direct Link to Accounts Center
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Interactive Stepper Navigation */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto shrink-0 hide-scrollbar">
          {steps.map((step) => {
            const isCurrent = currentStep === step.id;
            const isCompleted = completedSteps.includes(step.id);
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isCurrent 
                    ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                    : isCompleted
                      ? 'text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50'
                      : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isCompleted 
                    ? 'bg-emerald-600 text-white' 
                    : isCurrent 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-200 text-slate-600'
                }`}>
                  {isCompleted ? <Check className="w-3 h-3" /> : step.id}
                </span>
                <span>{step.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Step {currentStep} of {steps.length}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                {steps[currentStep - 1].tag}
              </span>
            </div>

            <button
              onClick={() => toggleStepCompleted(currentStep)}
              className={`text-xs flex items-center gap-1.5 px-3 py-1 rounded-md border transition-colors ${
                completedSteps.includes(currentStep)
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Check className={`w-3.5 h-3.5 ${completedSteps.includes(currentStep) ? 'text-emerald-600' : 'text-slate-400'}`} />
              {completedSteps.includes(currentStep) ? 'Completed' : 'Mark as done'}
            </button>
          </div>

          <h3 className="text-lg font-bold text-slate-900">
            {steps[currentStep - 1].title}
          </h3>

          {steps[currentStep - 1].content[platform]}
        </div>

        {/* Privacy Assurance Footer Note */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Why this works: Instagram allows official data portability under GDPR (Art. 20) with zero account risk.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            {currentStep < steps.length ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 shadow-xs transition-colors"
              >
                Next Step
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
