import React, { useEffect, useState } from 'react';
import { Copy, Check, Download, ShieldCheck, FileCode2, Settings } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { AuditLogEntry, SocietySettings } from '../types/society.ts';

interface GasFile {
  name: string;
  content: string;
}

export const AuditAndGasView: React.FC = () => {
  const [subTab, setSubTab] = useState<'audit' | 'gas' | 'settings'>('audit');
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [gasFiles, setGasFiles] = useState<GasFile[]>([]);
  const [selectedGasFile, setSelectedGasFile] = useState<GasFile | null>(null);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const [settings, setSettings] = useState<SocietySettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ auditLog: AuditLogEntry[] }>('/api/audit'),
      apiFetch<{ files: GasFile[] }>('/api/gas-files'),
      apiFetch<{ settings: SocietySettings }>('/api/settings'),
    ]).then(([audRes, gasRes, setRes]) => {
      setAuditLog(audRes.auditLog);
      setGasFiles(gasRes.files);
      if (gasRes.files.length > 0) setSelectedGasFile(gasRes.files[0]);
      setSettings(setRes.settings);
    });
  }, []);

  const handleCopy = async (file: GasFile) => {
    await navigator.clipboard.writeText(file.content);
    setCopiedName(file.name);
    setTimeout(() => setCopiedName(null), 2000);
  };

  const handleDownloadFile = (file: GasFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setSettingsSavedMsg(null);
    try {
      const res = await apiFetch<{ settings: SocietySettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      setSettingsSavedMsg('Association profile and contact settings updated.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Audit Trail, Settings &amp; Google Apps Script Code
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable administrative history, association configuration, and exportable Google Apps Script project files.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EDE9E0] rounded-lg self-start">
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              subTab === 'audit' ? 'bg-white text-[#234D3C] shadow-sm' : 'text-slate-600'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Audit Log</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('gas')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              subTab === 'gas' ? 'bg-white text-[#234D3C] shadow-sm' : 'text-slate-600'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>Google Apps Script ({gasFiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              subTab === 'settings' ? 'bg-white text-[#234D3C] shadow-sm' : 'text-slate-600'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Association Info</span>
          </button>
        </div>
      </div>

      {subTab === 'audit' && (
        <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Timestamp</th>
                  <th className="text-left font-semibold px-4 py-3">Actor</th>
                  <th className="text-left font-semibold px-4 py-3">Action</th>
                  <th className="text-left font-semibold px-4 py-3">Entity</th>
                  <th className="text-left font-semibold px-4 py-3">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLog.map((item) => (
                  <tr key={item.auditId} className="hover:bg-[#F8F6F1]/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#26332E]">{item.actorName}</div>
                      <div className="text-xs text-slate-500">{item.actorRole}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#234D3C] whitespace-nowrap">
                      {item.action}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {item.entityType} · {item.entityId}
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-xs">{item.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'gas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-[#E2DDD3] rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500 px-2 pb-2 border-b border-slate-100">
              SmartSocietyWebsite/ Files
            </div>
            {gasFiles.map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setSelectedGasFile(file)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  selectedGasFile?.name === file.name
                    ? 'bg-[#EBF1EC] text-[#234D3C] font-semibold'
                    : 'text-slate-700 hover:bg-[#F8F6F1]'
                }`}
              >
                {file.name}
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 bg-white border border-[#E2DDD3] rounded-xl overflow-hidden flex flex-col">
            {selectedGasFile && (
              <>
                <div className="px-5 py-3.5 border-b border-[#E2DDD3] flex items-center justify-between gap-4">
                  <span className="font-mono text-sm font-semibold text-[#26332E]">
                    {selectedGasFile.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedGasFile)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#D8D1C5] rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
                    >
                      {copiedName === selectedGasFile.name ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadFile(selectedGasFile)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#234D3C] rounded-lg hover:bg-[#1B3D2F] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
                <pre className="p-5 text-xs font-mono text-slate-800 bg-[#F8F6F1] overflow-x-auto max-h-[540px] leading-relaxed">
                  {selectedGasFile.content}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {subTab === 'settings' && settings && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-[#E2DDD3] rounded-xl p-6 max-w-2xl space-y-4"
        >
          <h2 className="text-base font-display font-semibold text-[#26332E]">
            Association Contact &amp; Bank Details
          </h2>
          {settingsSavedMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              {settingsSavedMsg}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Association Name
            </label>
            <input
              type="text"
              value={settings.societyName}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, societyName: e.target.value } : s))
              }
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              value={settings.address}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, address: e.target.value } : s))
              }
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={settings.contactEmail}
                onChange={(e) =>
                  setSettings((s) => (s ? { ...s, contactEmail: e.target.value } : s))
                }
                className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={settings.contactPhone}
                onChange={(e) =>
                  setSettings((s) => (s ? { ...s, contactPhone: e.target.value } : s))
                }
                className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Bank Account Details
            </label>
            <input
              type="text"
              value={settings.bankDetails}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, bankDetails: e.target.value } : s))
              }
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-lg cursor-pointer"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      )}
    </div>
  );
};
