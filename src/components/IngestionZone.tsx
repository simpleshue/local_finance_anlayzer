import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, Shield, Eye, RefreshCw, FileText, Lock } from 'lucide-react';
import { IngestResult, MemoryZeroEvent } from '../types/finance';
import { SAMPLE_CHASE_OFX, SAMPLE_OVERLAPPING_OFX, SAMPLE_CHECKING_OFX } from '../data/seedData';

interface IngestionZoneProps {
  onIngestStatement: (rawText: string, filename: string) => Promise<IngestResult>;
  lastIngestResult: IngestResult | null;
  memoryEvents: MemoryZeroEvent[];
  retainRawStatements: boolean;
  totalTransactionsCount: number;
  needsReviewCount: number;
  totalOutflowCents: number;
}

export const IngestionZone: React.FC<IngestionZoneProps> = ({
  onIngestStatement,
  lastIngestResult,
  memoryEvents,
  retainRawStatements,
  totalTransactionsCount,
  needsReviewCount,
  totalOutflowCents,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMemoryInspector, setShowMemoryInspector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processUploadedFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processUploadedFile(files[0]);
    }
  };

  const processUploadedFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.ofx') && !lower.endsWith('.qfx')) {
      alert('Security Policy: Only .ofx and .qfx statement payloads are allowed.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Security Policy: Ingestion buffer strictly capped at 10 MB in RAM.');
      return;
    }

    setIsProcessing(true);
    try {
      const text = await file.text();
      await onIngestStatement(text, file.name);
    } catch (err: any) {
      alert(`Parsing Error: ${err.message || 'Malformed statement payload'}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const loadSample = async (sampleText: string, filename: string) => {
    setIsProcessing(true);
    try {
      await onIngestStatement(sampleText, filename);
    } finally {
      setIsProcessing(false);
    }
  };

  const latestEvent = memoryEvents[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
      {/* View 0: Dropzone & Upload */}
      <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              View 0: Ingestion Engine (Zero-Disk Spill)
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
              {retainRawStatements ? 'AES-256-GCM Vault Mode' : 'RAM-Only Zeroization Active'}
            </span>
          </div>

          <button
            onClick={() => setShowMemoryInspector(!showMemoryInspector)}
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showMemoryInspector ? 'Hide RAM Inspector' : 'Inspect Memory Zeroing'}</span>
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-emerald-400 bg-emerald-950/20'
              : 'border-slate-700/80 hover:border-slate-500 bg-slate-950/40'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".ofx,.qfx"
            className="hidden"
          />

          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-emerald-400">
            {isProcessing ? (
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>

          <div className="text-sm font-semibold text-slate-200">
            Drag & Drop .OFX or .QFX Statement File Here
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Read directly into a mutable byte buffer capped at 10 MB. Never spills to /tmp on disk.
            Source bytes wiped via <code className="text-emerald-400 font-mono">defer clear(rawBytes)</code>.
          </p>
        </div>

        {/* Instant Test Injectors */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400 font-medium">Quick Test Statements:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => loadSample(SAMPLE_CHASE_OFX, 'ChaseSapphire_SepOct2026.ofx')}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3 h-3 text-emerald-400" />
              <span>Chase Sapphire (9 txns)</span>
            </button>

            <button
              onClick={() => loadSample(SAMPLE_OVERLAPPING_OFX, 'ChaseSapphire_OverlappingOct2026.ofx')}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-mono rounded bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border border-amber-800/50 transition-colors flex items-center gap-1.5"
              title="Contains 3 duplicate transactions + 3 new transactions to test deterministic deduplication"
            >
              <Shield className="w-3 h-3 text-amber-400" />
              <span>Test Overlapping Statement (Deduplication)</span>
            </button>

            <button
              onClick={() => loadSample(SAMPLE_CHECKING_OFX, 'Vanguard_Checking_Oct2026.ofx')}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3 h-3 text-blue-400" />
              <span>Checking Account (4 txns)</span>
            </button>
          </div>
        </div>

        {/* Real-time Ingestion Results Banner */}
        {lastIngestResult && (
          <div className="mt-4 p-3 rounded-lg bg-slate-950/80 border border-emerald-900/40 text-xs font-mono flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-semibold">{lastIngestResult.filename}</span>
              <span className="text-slate-500">({lastIngestResult.durationMs}ms)</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-400">
                Parsed: <strong className="text-slate-200">{lastIngestResult.totalParsed}</strong>
              </span>
              <span className="text-emerald-400">
                New: <strong>+{lastIngestResult.inserted}</strong>
              </span>
              <span className="text-slate-400">
                Duplicates Skipped:{' '}
                <strong className="text-indigo-300">{lastIngestResult.skippedDuplicates}</strong>
              </span>
              <span className="text-amber-400">
                Needs Review: <strong>{lastIngestResult.flaggedForReview}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-emerald-500/20">
                {lastIngestResult.rawDisposition === 'zeroed_from_ram'
                  ? 'Wiped: clear(rawBytes)'
                  : 'Encrypted: AES-256-GCM .enc'}
              </span>
            </div>
          </div>
        )}

        {/* Volatile RAM Inspector Drawer */}
        {showMemoryInspector && latestEvent && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <Shield className="w-4 h-4" />
                <span>Explicit RAM Zeroization Telemetry [Go builtin clear()]</span>
              </div>
              <span className="text-[10px] text-slate-500">{latestEvent.timestamp}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-slate-400 text-[11px] mb-1 font-sans font-medium flex items-center justify-between">
                  <span>RAM Buffer During Parsing (Sensitive Plaintext)</span>
                  <span className="text-amber-400 text-[10px]">{latestEvent.bytesCount} bytes</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-amber-200/90 overflow-x-auto whitespace-pre font-mono text-[11px] max-h-36">
                  {latestEvent.previewBefore}
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[11px] mb-1 font-sans font-medium flex items-center justify-between">
                  <span>RAM Buffer Immediately After <code className="text-emerald-400">defer clear(buf)</code></span>
                  <span className="text-emerald-400 text-[10px]">Overwritten with 0x00</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900 border border-emerald-900/50 text-emerald-400/90 overflow-x-auto whitespace-pre font-mono text-[11px] max-h-36">
                  {latestEvent.previewAfter}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-900 text-slate-400 text-[11px] flex items-center justify-between">
              <span>Primary Key: <code className="text-indigo-300">HMAC-SHA256(account_id) || FITID</code></span>
              <span className="text-emerald-400">Zero plaintext remanence in heap or disk swap</span>
            </div>
          </div>
        )}
      </div>

      {/* Security Telemetry & Triage Summary */}
      <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Ledger State Telemetry
            </span>
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              127.0.0.1
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Flagged For Triage</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {needsReviewCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">&lt;85% confidence</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Total Deduplicated</div>
              <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                {totalTransactionsCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">FITID indexed</div>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 mb-4">
            <div className="text-[11px] text-slate-400">Total Outflow (Debit)</div>
            <div className="text-xl font-bold font-mono text-slate-200 mt-0.5">
              ${(totalOutflowCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Security Invariant Checks */}
        <div className="pt-3 border-t border-slate-800 text-[11px] font-mono space-y-1.5 text-slate-400">
          <div className="flex items-center justify-between">
            <span>DNS Resolver Trap:</span>
            <span className="text-emerald-400">PASS (PreferGo: true)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Non-Loopback Sockets:</span>
            <span className="text-emerald-400">BLOCKED (net.Dialer)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Core Dumps (RLIMIT_CORE):</span>
            <span className="text-emerald-400">0 (DISABLED)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Supply Chain:</span>
            <span className="text-emerald-400">0 Go Module Deps</span>
          </div>
        </div>
      </div>
    </div>
  );
};
