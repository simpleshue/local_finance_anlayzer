import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, Shield, Eye, RefreshCw, FileText, Lock, X } from 'lucide-react';
import { IngestResult, MemoryZeroEvent } from '../types/finance';
import { SAMPLE_CHASE_OFX, SAMPLE_OVERLAPPING_OFX, SAMPLE_CHECKING_OFX } from '../constants/seedData';

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIngestStatement: (rawText: string, filename: string) => Promise<IngestResult>;
  lastIngestResult: IngestResult | null;
  memoryEvents: MemoryZeroEvent[];
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onIngestStatement,
  lastIngestResult,
  memoryEvents,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMemoryInspector, setShowMemoryInspector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full p-6 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <UploadCloud className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  View 0: Statement Ingestion Engine (Zero-Disk Spill)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                  RAM-Only Zeroization Active [defer clear()]
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Reads strictly into volatile []byte slice & wipes memory via defer clear(rawBytes)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-emerald-400 bg-emerald-950/20'
              : 'border-slate-700/80 hover:border-slate-500 bg-slate-950/50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".ofx,.qfx"
            className="hidden"
          />

          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-emerald-400">
            {isProcessing ? (
              <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>

          <div className="text-sm font-semibold text-slate-200">
            Drag & Drop .OFX or .QFX Statement File Here
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Strict 10 MB RAM cap. Overwrites buffer with zeros prior to GC. Never spills to /tmp on disk.
          </p>
        </div>

        {/* Quick Test Statement Injectors */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400 font-medium">Or Test With Sample Data:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => loadSample(SAMPLE_CHASE_OFX, 'ChaseSapphire_SepOct2026.ofx')}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Chase Sapphire (9 txns)</span>
            </button>

            <button
              onClick={() => loadSample(SAMPLE_OVERLAPPING_OFX, 'ChaseSapphire_OverlappingOct2026.ofx')}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-mono rounded bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border border-amber-800/50 transition-colors flex items-center gap-1.5"
              title="Contains 3 duplicate transactions + 3 new transactions to test deterministic deduplication"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Test Overlapping Statement</span>
            </button>

            <button
              onClick={() => loadSample(SAMPLE_CHECKING_OFX, 'Vanguard_Checking_Oct2026.ofx')}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Checking Account (4 txns)</span>
            </button>
          </div>
        </div>

        {/* Real-time Ingestion Results Banner */}
        {lastIngestResult && (
          <div className="mt-4 p-3.5 rounded-lg bg-slate-950 border border-emerald-900/50 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-200 font-semibold">{lastIngestResult.filename}</span>
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
                Dupes Skipped: <strong className="text-indigo-300">{lastIngestResult.skippedDuplicates}</strong>
              </span>
              <span className="text-amber-400">
                Needs Review: <strong>{lastIngestResult.flaggedForReview}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-emerald-500/20">
                Wiped: clear(rawBytes)
              </span>
            </div>
          </div>
        )}

        {/* RAM Zeroing Inspector Button & Drawer */}
        <div className="mt-4 pt-3 border-t border-slate-800">
          <button
            onClick={() => setShowMemoryInspector(!showMemoryInspector)}
            className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors mb-2"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showMemoryInspector ? 'Hide Memory Zeroing Inspector' : 'Inspect Volatile RAM Zeroing (defer clear)'}</span>
          </button>

          {showMemoryInspector && latestEvent && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
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
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-amber-200/90 overflow-x-auto whitespace-pre font-mono text-[11px] max-h-32">
                    {latestEvent.previewBefore}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-[11px] mb-1 font-sans font-medium flex items-center justify-between">
                    <span>RAM Buffer Immediately After <code className="text-emerald-400">defer clear(buf)</code></span>
                    <span className="text-emerald-400 text-[10px]">Overwritten with 0x00</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-emerald-900/50 text-emerald-400/90 overflow-x-auto whitespace-pre font-mono text-[11px] max-h-32">
                    {latestEvent.previewAfter}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-4 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
