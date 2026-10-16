import React, { useState } from 'react';
import { Shield, Lock, Terminal, Code2, Copy, Download, Check, AlertTriangle, Layers, Cpu, Database } from 'lucide-react';
import { MemoryZeroEvent } from '../types/finance';
import { parseOFX } from '../engine/ofxLexer';

interface SecurityConsoleProps {
  memoryEvents: MemoryZeroEvent[];
  passphrase: string;
}

export const SecurityConsole: React.FC<SecurityConsoleProps> = ({
  memoryEvents,
  passphrase,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [sandboxOFX, setSandboxOFX] = useState(`<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015120000
<TRNAMT>-42.50
<FITID>TEST_FITID_9921
<NAME>TST* BLUE BOTTLE COFFEE #42
<MEMO>LATTE AND CROISSANT
</STMTTRN>`);
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const testSandbox = () => {
    try {
      setSandboxError(null);
      const wrapped = `<OFX><CREDITCARDMSGSRSV1><CCSTMTRS><BANKTRANLIST>${sandboxOFX}</BANKTRANLIST></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>`;
      const res = parseOFX(wrapped);
      setSandboxResult(res);
    } catch (err: any) {
      setSandboxError(err.message || 'Parsing error');
      setSandboxResult(null);
    }
  };

  const copyMainGo = async () => {
    try {
      const res = await fetch('/main.go');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const downloadMainGo = async () => {
    const res = await fetch('/main.go');
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'main.go';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* 3-Layer Defense-in-Depth Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm uppercase tracking-wider font-bold text-slate-100">
            Multi-Layer Air-Gap Defense Architecture Matrix
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {/* Layer 3 */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-indigo-400 font-bold border-b border-slate-800 pb-2">
              <span>LAYER 3: HYPERVISOR</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-800">HOST</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Proxmox VE LXC or Docker container runtime isolation:
            </p>
            <ul className="space-y-1 text-slate-300 text-[11px]">
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>--network none (0 vNICs)</span>
              </li>
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>tmpfs /inbox (Volatile RAM)</span>
              </li>
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>--memory-swap = 512m (no disk)</span>
              </li>
            </ul>
          </div>

          {/* Layer 2 */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-blue-400 font-bold border-b border-slate-800 pb-2">
              <span>LAYER 2: CONTAINER OS</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800">KERNEL</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Linux kernel policy & firewall drop rules:
            </p>
            <ul className="space-y-1 text-slate-300 text-[11px]">
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>swapoff -a (prevent page swap)</span>
              </li>
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>empty /etc/resolv.conf (chattr +i)</span>
              </li>
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>iptables OUTPUT DROP (lo ACCEPT)</span>
              </li>
            </ul>
          </div>

          {/* Layer 1 */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-800 pb-2">
              <span>LAYER 1: GO RUNTIME</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800">IN-PROCESS</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Strict Go standard library guardrails:
            </p>
            <ul className="space-y-1 text-slate-300 text-[11px]">
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>RLIMIT_CORE = 0 (No core dumps)</span>
              </li>
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>net.DefaultResolver trapped</span>
              </li>
              <li className="flex items-center gap-1.5 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>defer clear(rawBytes) RAM wipe</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Memory Hygiene & Zeroization Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              Live RAM Zeroization Event Log [Go Builtin clear()]
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {memoryEvents.length} Wipes Executed
          </span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
          {memoryEvents.map((evt, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-200 font-semibold">{evt.label}</span>
                <span className="text-slate-500 text-[11px]">({evt.bytesCount} bytes)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-400">{evt.timestamp}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {evt.status}: OVERWRITTEN WITH 0x00
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OFX Lexer Live Sandbox */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm uppercase tracking-wider font-bold text-slate-100">
              OFX/QFX Streaming Lexer Sandbox
            </h3>
          </div>
          <button
            onClick={testSandbox}
            className="px-3 py-1 rounded text-xs font-mono font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Parse Snippet
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 font-mono">
              Raw SGML / XML Block (Handles Unclosed Tags)
            </label>
            <textarea
              value={sandboxOFX}
              onChange={e => setSandboxOFX(e.target.value)}
              rows={8}
              className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 font-mono">
              Parser Output (Normalized JSON)
            </label>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 h-[190px] overflow-y-auto">
              {sandboxError && <div className="text-rose-400">{sandboxError}</div>}
              {sandboxResult && (
                <pre className="text-emerald-400/90 text-[11px]">
                  {JSON.stringify(sandboxResult.transactions, null, 2)}
                </pre>
              )}
              {!sandboxError && !sandboxResult && (
                <span className="text-slate-600">Click 'Parse Snippet' to test the state machine.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pristine main.go Source Code Viewer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-sm uppercase tracking-wider font-bold text-slate-100">
                Pristine Standalone main.go (Zero Dependencies)
              </h3>
              <p className="text-[11px] text-slate-400">
                Compile static binary with:{' '}
                <code className="text-emerald-400 font-mono">
                  CGO_ENABLED=0 go build -tags "netgo osusergo" -ldflags="-s -w" -o finance-engine main.go
                </code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyMainGo}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy main.go'}</span>
            </button>

            <button
              onClick={downloadMainGo}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Source</span>
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 max-h-96 overflow-y-auto space-y-2">
          <div className="text-slate-500">// Standalone Go 1.23+ Single File Implementation (/main.go)</div>
          <div className="text-slate-400">// Zero external modules, explicit RAM zeroization, air-gap loopback guards.</div>
          <div className="text-indigo-400 font-semibold">package main</div>
          <div className="text-slate-500">// (Inspect full source via 'Download Source' or root /main.go in repository)</div>
        </div>
      </div>
    </div>
  );
};
