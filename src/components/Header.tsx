import React from 'react';
import { Shield, ShieldAlert, Lock, Cpu, Database, UploadCloud, Tag } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  needsReviewCount: number;
  totalRecordsCount: number;
  onOpenIngestion: () => void;
  onOpenCategoryManager: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  needsReviewCount,
  totalRecordsCount,
  onOpenIngestion,
  onOpenCategoryManager,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      {/* Top Security Banner */}
      <div className="w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 tracking-tight text-base">
                ZERO-LEAK LOCAL FINANCE ENGINE
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AIR-GAP LOCKED (127.0.0.1 ONLY)
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 font-mono">
              <span>Go Standard Library Only</span>
              <span>•</span>
              <span className="text-emerald-400">defer clear(rawBytes)</span>
              <span>•</span>
              <span>AES-256-GCM Ledger</span>
            </div>
          </div>
        </div>

        {/* Invariant Indicator: Ephemeral RAM Purge */}
        <div className="flex items-center gap-2">
          <div
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium border bg-emerald-950/60 text-emerald-300 border-emerald-700/60 flex items-center gap-2 shadow-sm select-none"
            title="Raw statement buffers in RAM are purged with zeroes immediately after parsing. Zero plaintext files written to disk."
          >
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ephemeral RAM Purge</span>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 flex overflow-x-auto border-t border-slate-800/80 scrollbar-none">
        <nav className="flex items-center space-x-2 py-2">
          {/* Triage Inbox */}
          <button
            onClick={() => onTabChange('triage')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'triage'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Triage Inbox</span>
            {needsReviewCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-amber-500/30 text-amber-200 border border-amber-500/40 font-bold">
                {needsReviewCount}
              </span>
            )}
          </button>

          {/* Encrypted Ledger */}
          <button
            onClick={() => onTabChange('ledger')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'ledger'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>Encrypted Ledger</span>
            <span className="text-slate-500 text-[11px] font-mono">({totalRecordsCount})</span>
          </button>

          {/* RE2 Regex Rules */}
          <button
            onClick={() => onTabChange('rules')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'rules'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>RE2 Regex Rules</span>
          </button>

          {/* Action Buttons: Ingest & Categories between RE2 Rules and Security */}
          <div className="flex items-center gap-2 px-2 border-l border-r border-slate-800 shrink-0">
            <button
              onClick={onOpenIngestion}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              title="Upload or test .OFX / .QFX statement ingestion"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Ingest Statement</span>
            </button>

            <button
              onClick={onOpenCategoryManager}
              className="px-3.5 py-2 rounded-lg text-xs font-medium border bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              title="View, add, rename, or delete categories"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span>Categories</span>
            </button>
          </div>

          {/* Security & Code Auditor */}
          <button
            onClick={() => onTabChange('security')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'security'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Security & Code Auditor</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
