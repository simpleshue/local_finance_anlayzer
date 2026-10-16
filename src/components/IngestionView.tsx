import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Eye,
  RefreshCw,
  FileText,
  Lock,
  Clipboard,
  Trash2,
  Code2,
} from 'lucide-react';
import { IngestResult, MemoryZeroEvent } from '../types/finance';
import { SAMPLE_CHASE_OFX, SAMPLE_OVERLAPPING_OFX, SAMPLE_CHECKING_OFX } from '../constants/seedData';

interface IngestionViewProps {
  onIngestStatement: (rawText: string, filename: string) => Promise<IngestResult>;
  lastIngestResult: IngestResult | null;
  memoryEvents: MemoryZeroEvent[];
}

export const IngestionView: React.FC<IngestionViewProps> = ({
  onIngestStatement,
  lastIngestResult,
  memoryEvents,
}) => {
  const [activeMode, setActiveMode] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMemoryInspector, setShowMemoryInspector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis of pasted text
  const trimmedPasted = pastedText.trim();
  const estimatedTxnCount = (trimmedPasted.match(/<STMTTRN>/gi) || []).length;
  const hasOfxHeader = /OFXHEADER|<OFX>|<STMTTRN>|<CCSTMTRS>|<BANKTRANLIST>/i.test(trimmedPasted);
  const pastedBytesCount = new TextEncoder().encode(trimmedPasted).length;
  const isOver10MB = pastedBytesCount > 10 * 1024 * 1024;

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

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setPastedText(text);
        }
      } else {
        alert('Clipboard access is restricted by your browser. Please press Ctrl+V / Cmd+V directly in the text box.');
      }
    } catch {
      alert('Could not read clipboard automatically. Please press Ctrl+V / Cmd+V directly inside the text box.');
    }
  };

  const handleIngestPastedText = async () => {
    let text = pastedText.trim();
    if (!text) {
      alert('Please paste your OFX or QFX statement text first.');
      return;
    }

    if (isOver10MB) {
      alert('Security Policy: Ingestion buffer strictly capped at 10 MB in RAM.');
      return;
    }

    // Auto-wrap bare <STMTTRN> blocks if outer tags omitted
    if (text.includes('<STMTTRN>') && !text.toUpperCase().includes('<OFX>')) {
      text = `<OFX><CREDITCARDMSGSRSV1><CCSTMTRS><BANKTRANLIST>${text}</BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>`;
    }

    setIsProcessing(true);
    try {
      await onIngestStatement(text, 'clipboard_statement.ofx');
      setPastedText('');
    } catch (err: any) {
      alert(`Parsing Error: ${err.message || 'Malformed statement text'}`);
    } finally {
      setIsProcessing(false);
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <UploadCloud className="w-5 h-5" />
            </span>
            <h2 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              Statement Ingestion Engine (Zero-Disk Spill)
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
              RAM-Only Zeroization [defer clear()]
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl font-mono">
            OFX & QFX are plain human-readable SGML/XML text files. Ingest via drag & drop file upload or copy-paste text directly from your clipboard.
          </p>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 max-w-md">
        <button
          onClick={() => setActiveMode('upload')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all ${
            activeMode === 'upload'
              ? 'bg-emerald-600 text-slate-950 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload File (.ofx / .qfx)</span>
        </button>

        <button
          onClick={() => setActiveMode('paste')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all ${
            activeMode === 'paste'
              ? 'bg-emerald-600 text-slate-950 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Clipboard className="w-3.5 h-3.5" />
          <span>Paste Raw Text (Clipboard)</span>
        </button>
      </div>

      {/* Mode 1: Drag & Drop File Upload */}
      {activeMode === 'upload' && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
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

          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-emerald-400">
            {isProcessing ? (
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            ) : (
              <UploadCloud className="w-8 h-8" />
            )}
          </div>

          <div className="text-base font-semibold text-slate-200">
            Drag & Drop .OFX or .QFX Statement File Here
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Strict 10 MB RAM cap. Overwrites buffer with zeros prior to GC. Never spills to /tmp on disk.
          </p>
        </div>
      )}

      {/* Mode 2: Direct Copy & Paste Text Input */}
      {activeMode === 'paste' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span>Paste Raw Statement Text (OFX / QFX SGML or XML)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                title="Paste text from system clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-indigo-400" />
                <span>Paste from Clipboard</span>
              </button>
              {trimmedPasted && (
                <button
                  type="button"
                  onClick={() => setPastedText('')}
                  className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors flex items-center gap-1"
                  title="Clear text"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder={`Paste your OFX / QFX text here. Example:\n\nOFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX>\n<CREDITCARDMSGSRSV1>\n<CCSTMTRS>\n<BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261014\n<TRNAMT>-142.80\n<FITID>CHASE01\n<NAME>TRADER JOE'S\n</STMTTRN>\n</BANKTRANLIST>\n</CCSTMTRS>\n</CREDITCARDMSGSRSV1>\n</OFX>`}
              rows={12}
              className="w-full p-4 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-y"
            />
          </div>

          {/* Live Parsing Inspection Info Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">
                Size: <strong className={isOver10MB ? 'text-rose-400' : 'text-slate-200'}>
                  {(pastedBytesCount / 1024).toFixed(1)} KB
                </strong> / 10 MB cap
              </span>
              {trimmedPasted && (
                <span className="flex items-center gap-1.5">
                  {hasOfxHeader ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Valid OFX/QFX structure detected</span>
                      {estimatedTxnCount > 0 && (
                        <span className="text-slate-400">({estimatedTxnCount} transactions found)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Warning: Expected tags like &lt;OFX&gt; or &lt;STMTTRN&gt;</span>
                    </span>
                  )}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleIngestPastedText}
              disabled={isProcessing || !trimmedPasted || isOver10MB}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing In RAM...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Ingest Pasted Statement</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Quick Test Statement Injectors */}
      <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-400 font-medium">Or Test Ingestion With Sample Statements:</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadSample(SAMPLE_CHASE_OFX, 'ChaseSapphire_SepOct2026.ofx')}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chase Sapphire (9 txns)</span>
          </button>

          <button
            onClick={() => loadSample(SAMPLE_OVERLAPPING_OFX, 'ChaseSapphire_OverlappingOct2026.ofx')}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-mono rounded bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border border-amber-800/50 transition-colors flex items-center gap-1.5 shadow-sm"
            title="Contains 3 duplicate transactions + 3 new transactions to test deterministic deduplication"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Overlapping Statement</span>
          </button>

          <button
            onClick={() => loadSample(SAMPLE_CHECKING_OFX, 'Vanguard_Checking_Oct2026.ofx')}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Checking Account (4 txns)</span>
          </button>
        </div>
      </div>

      {/* Real-time Ingestion Results Banner */}
      {lastIngestResult && (
        <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/50 text-xs font-mono flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-200 font-semibold">{lastIngestResult.filename}</span>
            <span className="text-slate-500">({lastIngestResult.durationMs}ms)</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
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
            <span className="px-2.5 py-1 rounded bg-slate-800 text-emerald-300 border border-emerald-500/20 font-semibold">
              Wiped: clear(rawBytes)
            </span>
          </div>
        </div>
      )}

      {/* RAM Zeroing Inspector Button & Drawer */}
      <div className="pt-2 border-t border-slate-800">
        <button
          onClick={() => setShowMemoryInspector(!showMemoryInspector)}
          className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors mb-2"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{showMemoryInspector ? 'Hide Memory Zeroing Inspector' : 'Inspect Volatile RAM Zeroing (defer clear)'}</span>
        </button>

        {showMemoryInspector && latestEvent && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
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
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-amber-200/90 overflow-x-auto whitespace-pre font-mono text-[11px] max-h-36">
                  {latestEvent.previewBefore}
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[11px] mb-1 font-sans font-medium flex items-center justify-between">
                  <span>RAM Buffer Immediately After <code className="text-emerald-400">defer clear(buf)</code></span>
                  <span className="text-emerald-400 text-[10px]">Overwritten with 0x00</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-emerald-900/50 text-emerald-400/90 overflow-x-auto whitespace-pre font-mono text-[11px] max-h-36">
                  {latestEvent.previewAfter}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
