import React from 'react';
import { Shield, Database, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { MemoryZeroEvent } from '../types/finance';

interface TelemetrySidebarProps {
  totalTransactionsCount: number;
  needsReviewCount: number;
  totalOutflowCents: number;
  totalInflowCents: number;
  memoryEvents: MemoryZeroEvent[];
}

export const TelemetrySidebar: React.FC<TelemetrySidebarProps> = ({
  totalTransactionsCount,
  needsReviewCount,
  totalOutflowCents,
  totalInflowCents,
  memoryEvents,
}) => {
  const latestEvent = memoryEvents[0];

  return (
    <div className="space-y-4">
      {/* Primary Telemetry Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-100">
              Ledger State Telemetry
            </h3>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            127.0.0.1
          </span>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400">Flagged For Triage</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
              {needsReviewCount}
            </div>
            <div className="text-[9px] text-slate-500">&lt;85% confidence</div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400">Total Deduplicated</div>
            <div className="text-xl font-bold font-mono text-slate-100 mt-0.5">
              {totalTransactionsCount}
            </div>
            <div className="text-[9px] text-slate-500">FITID indexed</div>
          </div>
        </div>

        {/* Outflow & Inflow */}
        <div className="space-y-1.5 pt-1">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              <span>Total Outflow:</span>
            </span>
            <span className="font-mono font-bold text-slate-100">
              ${(totalOutflowCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span>Total Inflow:</span>
            </span>
            <span className="font-mono font-bold text-emerald-400">
              +${(totalInflowCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Invariant Checklist */}
        <div className="pt-3 border-t border-slate-800 text-[10px] font-mono space-y-1.5 text-slate-400">
          <div className="text-[11px] font-sans font-semibold text-slate-300 pb-1">
            Air-Gap Invariants
          </div>
          <div className="flex items-center justify-between">
            <span>DNS Resolver:</span>
            <span className="text-emerald-400">TRAPPED (0 DNS)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Network Sockets:</span>
            <span className="text-emerald-400">127.0.0.1 ONLY</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Core Dumps:</span>
            <span className="text-emerald-400">RLIMIT_CORE = 0</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Go Module Deps:</span>
            <span className="text-emerald-400">0 (Std Lib Only)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Post-Ingest Policy:</span>
            <span className="text-emerald-400 font-semibold">
              Ephemeral RAM Purge
            </span>
          </div>
        </div>

        {/* Recent RAM Zeroization Activity */}
        {latestEvent && (
          <div className="p-2.5 rounded-lg bg-slate-950 border border-emerald-900/40 text-[10px] font-mono text-slate-400 space-y-1">
            <div className="flex items-center justify-between text-emerald-400 font-semibold">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                <span>defer clear(rawBytes)</span>
              </span>
              <span>{latestEvent.status}</span>
            </div>
            <div className="truncate text-slate-500">
              {latestEvent.label} ({latestEvent.bytesCount} B)
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
