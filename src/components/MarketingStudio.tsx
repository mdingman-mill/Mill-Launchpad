import React, { useState } from 'react';
import { User, ToolDefinition, SavedOutput } from '../types';
import { dataService } from '../services/dataService';
import { billingService } from '../services/billingService';
import { authService } from '../services/authService';
import {
  Sparkles,
  Zap,
  ArrowRight,
  ArrowLeft,
  Lightbulb,
  Building2,
  HeartHandshake,
  Search,
  AlertTriangle,
  Compass,
  Mail,
  TrendingUp,
  FileText,
  Copy,
  Check,
  RotateCcw,
  BookmarkPlus,
  Eye,
  Edit3,
  Download,
  CheckCircle2,
  Layers,
  ChevronDown,
  Filter,
} from 'lucide-react';

interface MarketingStudioProps {
  user: User;
  onUsageUpdated: (newUsage: number) => void;
  onRequireUpgrade: () => void;
  onEditProfile: () => void;
  onSavedToLibrary: (output: SavedOutput) => void;
  onToolCompleted: () => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Strategy: <Compass className="w-4 h-4 text-rose-600" />,
  Content: <Mail className="w-4 h-4 text-blue-600" />,
  Growth: <TrendingUp className="w-4 h-4 text-emerald-600" />,
  Specialized: <Sparkles className="w-4 h-4 text-purple-600" />,
};

export const MarketingStudio: React.FC<MarketingStudioProps> = ({
  user,
  onUsageUpdated,
  onRequireUpgrade,
  onEditProfile,
  onSavedToLibrary,
  onToolCompleted,
}) => {
  const tools = dataService.getTools();
  const userOrgType = user.organizationProfile?.type || 'Startup';

  // Navigation state: either viewing all tool cards ('catalog') or working inside a tool ('workspace')
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllSpecialized, setShowAllSpecialized] = useState(false);

  // Active Tool Workspace state
  const activeTool = tools.find((t) => t.id === activeToolId) || null;
  const [toolInputs, setToolInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<string>('');
  const [outputTitle, setOutputTitle] = useState<string>('');
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [isEditingOutput, setIsEditingOutput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [mobileTab, setMobileTab] = useState<'inputs' | 'deliverable'>('inputs');

  const plan = billingService.getPlanById(user.planId);
  const maxLimit = (plan?.generationLimit || 50) + (user.bonusGenerations || 0);
  const currentUsage = user.generationsUsedThisMonth || 0;
  const usagePercentage = Math.min(Math.round((currentUsage / maxLimit) * 100), 100);
  const isNearLimit = currentUsage >= maxLimit * 0.8 && currentUsage < maxLimit;
  const isLimitReached = currentUsage >= maxLimit;

  // Select tool and prepare workspace
  const handleSelectTool = (tool: ToolDefinition) => {
    setActiveToolId(tool.id);
    const initial: Record<string, string> = {};
    tool.fields.forEach((f) => {
      initial[f.key] = f.defaultValue || '';
    });
    setToolInputs(initial);
    setOutput('');
    setOutputTitle(`${user.organizationProfile?.orgName || 'Org'} ${tool.name}`);
    setModelUsed(null);
    setError(null);
    setMobileTab('inputs');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInputChange = (key: string, value: string) => {
    setToolInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    if (!activeTool) return;

    if (isLimitReached) {
      onRequireUpgrade();
      return;
    }

    setLoading(true);
    setError(null);
    setSavedSuccess(false);
    setOutput('');
    setModelUsed('gemini-3.1-flash-lite');
    setMobileTab('deliverable');
    setOutputTitle(`${user.organizationProfile?.orgName || 'Org'} ${activeTool.name}`);

    try {
      const idToken = await authService.getIdToken();
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          toolId: activeTool.id,
          toolName: activeTool.name,
          organizationProfile: user.organizationProfile,
          userInputs: toolInputs,
        }),
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Generation failed (HTTP ${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response is unavailable. Please try again.');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const trimmed = event.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.reset) {
              accumulatedText = '';
              setOutput('');
            }
            if (parsed.chunk) {
              accumulatedText += parsed.chunk;
              setOutput(accumulatedText);
            }
            if (parsed.done) {
              if (parsed.text) accumulatedText = parsed.text;
              setOutput(accumulatedText);
              setModelUsed(parsed.modelUsed || 'gemini-3.1-flash-lite');
            }
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }

      if (!accumulatedText.trim()) {
        throw new Error('No content was returned. Please try again.');
      }

      const newUsage = dataService.incrementUsage(user.id);
      onUsageUpdated(newUsage);
      dataService.logAction('TOOL_GENERATION', `Generated output with ${activeTool.name}`, user.id);
      onToolCompleted();
    } catch (err: any) {
      setError(err?.message || 'Error communicating with generation engine.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToLibrary = () => {
    if (!output.trim() || !activeTool) return;

    const saved = dataService.saveOutput({
      userId: user.id,
      toolId: activeTool.id,
      toolName: activeTool.name,
      title: outputTitle.trim() || `${activeTool.name} Output`,
      content: output,
      tags: [activeTool.category, user.organizationProfile?.type || 'Startup'],
      userInputs: toolInputs,
    });

    setSavedSuccess(true);
    onSavedToLibrary(saved);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportText = () => {
    if (!output || !activeTool) return;
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${outputTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = () => {
    if (!output || !activeTool) return;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${outputTitle}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; line-height: 1.6; color: #0f172a; padding: 40px; }
          h1, h2, h3 { color: #0f172a; margin-top: 24px; }
          blockquote { border-left: 3px solid #e11d48; padding-left: 16px; margin-left: 0; color: #475569; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        </style>
      </head>
      <body>
        <h1>${outputTitle}</h1>
        <p><em>Generated with Millennium Agency Launchpad (${activeTool.name}) for ${user.organizationProfile?.orgName}</em></p>
        <hr/>
        <div style="white-space: pre-wrap;">${output}</div>
        <div class="footer">
          Generated for ${user.organizationProfile?.orgName || 'Client'} by Millennium Agency • https://mill.agency
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${outputTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter tools for the catalog view
  const filteredTools = tools.filter((tool) => {
    if (tool.forOrgType && !showAllSpecialized && tool.forOrgType !== userOrgType) {
      return false;
    }
    if (selectedCategory !== 'All' && tool.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = tool.name.toLowerCase().includes(q);
      const matchDesc = tool.description.toLowerCase().includes(q);
      const matchWhy = tool.whyThisMatters.toLowerCase().includes(q);
      return matchName || matchDesc || matchWhy;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* =====================================================================
       * VIEW 1: IN-PAGE STUDIO WORKSPACE (WHEN A TOOL IS SELECTED)
       * ===================================================================== */}
      {activeTool ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Breadcrumb & Quick Tool Switcher Strip */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveToolId(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors"
                title="Return to full tool catalog"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Tools</span>
              </button>

              <span className="text-slate-300" aria-hidden="true">/</span>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {CATEGORY_ICONS[activeTool.category]}
                  <span>{activeTool.name}</span>
                </span>
                {activeTool.forOrgType && (
                  <span className="text-[10px] font-semibold text-slate-500">
                    · {activeTool.forOrgType} Only
                  </span>
                )}
              </div>
            </div>

            {/* Quick Switch Dropdown between tools */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden sm:inline">Switch Tool:</span>
                <select
                  value={activeTool.id}
                  onChange={(e) => {
                    const next = tools.find((t) => t.id === e.target.value);
                    if (next) handleSelectTool(next);
                  }}
                  className="py-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {tools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Usage Quota Pill */}
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 font-mono pl-3 border-l border-slate-200">
                <Zap className="w-3.5 h-3.5 text-rose-600" />
                <span>{currentUsage}/{maxLimit} used</span>
              </div>
            </div>
          </div>

          {/* Usage Limit Warning Bar */}
          {isLimitReached && (
            <div className="p-3.5 bg-rose-50 text-rose-900 border border-rose-200 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>You have reached your 100% monthly generation limit ({currentUsage}/{maxLimit}). Upgrade to generate more.</span>
              </div>
              <button
                onClick={onRequireUpgrade}
                className="px-3.5 py-1.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors"
              >
                Upgrade Plan
              </button>
            </div>
          )}

          {isNearLimit && (
            <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>You have used {currentUsage} of {maxLimit} generations (over 80%).</span>
              </div>
              <button
                onClick={onRequireUpgrade}
                className="font-bold text-amber-900 underline hover:text-amber-950"
              >
                View Plans
              </button>
            </div>
          )}

          {/* Mobile Tab Switcher (Inputs vs Deliverable) */}
          <div className="md:hidden flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl text-xs font-bold">
            <button
              onClick={() => setMobileTab('inputs')}
              className={`flex-1 py-2 text-center rounded-lg transition-colors ${
                mobileTab === 'inputs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              1. Parameters & Profile
            </button>
            <button
              onClick={() => setMobileTab('deliverable')}
              className={`flex-1 py-2 text-center rounded-lg transition-colors ${
                mobileTab === 'deliverable' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              2. Marketing Deliverable {output ? '✓' : ''}
            </button>
          </div>

          {/* Two-Panel Workspace Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* ===================================================================
             * LEFT PANEL: Tool Inputs & Saved Profile Summary (5 cols)
             * =================================================================== */}
            <div
              className={`md:col-span-5 space-y-5 ${
                mobileTab === 'inputs' ? 'block' : 'hidden md:block'
              }`}
            >
              {/* Tool Header Box */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      {activeTool.category} Suite
                    </span>
                    <h2 className="text-xl font-extrabold text-slate-900 font-heading">
                      {activeTool.name}
                    </h2>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    {CATEGORY_ICONS[activeTool.category]}
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {activeTool.description}
                </p>

                {/* "Why This Matters" Agency Tip */}
                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/70 text-xs text-amber-950 flex items-start gap-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold text-amber-950">Why this matters:</strong>{' '}
                    <span className="text-amber-900">{activeTool.whyThisMatters}</span>
                  </div>
                </div>
              </div>

              {/* Organization Profile Context Card */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px]">
                    Active Brand Context
                  </span>
                  <button
                    onClick={onEditProfile}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 underline"
                  >
                    Edit Profile
                  </button>
                </div>

                <div className="space-y-1.5 text-slate-600 text-[11px]">
                  <p>
                    <strong className="text-slate-800">Org:</strong>{' '}
                    {user.organizationProfile?.orgName} ({user.organizationProfile?.type})
                  </p>
                  <p>
                    <strong className="text-slate-800">Mission:</strong>{' '}
                    {user.organizationProfile?.whatTheyDo}
                  </p>
                  <p>
                    <strong className="text-slate-800">Audience:</strong>{' '}
                    {user.organizationProfile?.targetAudience}
                  </p>
                  <p>
                    <strong className="text-slate-800">Tone:</strong>{' '}
                    {user.organizationProfile?.brandTone?.join(' & ') || 'Professional'}
                  </p>
                </div>
              </div>

              {/* Tool Input Form */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Tool Parameters
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {activeTool.fields.length} inputs
                  </span>
                </div>

                <div className="space-y-3.5">
                  {activeTool.fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        {field.label}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={toolInputs[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50"
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={toolInputs[field.key] || field.options?.[0] || ''}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                          className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium text-slate-800"
                        >
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={toolInputs[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      )}
                      {field.helperText && (
                        <p className="text-[10px] text-slate-400">{field.helperText}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={loading || isLimitReached}
                  className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs tracking-wide transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Generating with Gemini AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-rose-400" />
                      <span>Generate {activeTool.name}</span>
                    </>
                  )}
                </button>

                {error && (
                  <div className="p-3 bg-rose-50 text-rose-800 text-xs rounded-xl border border-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ===================================================================
             * RIGHT PANEL: The Marketing Deliverable Canvas (7 cols)
             * =================================================================== */}
            <div
              className={`md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col min-h-[620px] overflow-hidden ${
                mobileTab === 'deliverable' ? 'block' : 'hidden md:flex'
              }`}
            >
              {/* Output Canvas Toolbar */}
              <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={outputTitle}
                    onChange={(e) => setOutputTitle(e.target.value)}
                    placeholder="Document Title..."
                    className="w-full text-xs font-bold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-rose-500 rounded px-1.5 py-0.5"
                  />
                  {loading ? (
                    <div className="text-[10px] text-rose-600 px-1 mt-0.5 flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block"></span>
                      <span>Streaming live from Gemini (gemini-3.1-flash-lite)...</span>
                    </div>
                  ) : modelUsed ? (
                    <div className="text-[10px] text-slate-500 px-1 mt-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                      <span>Live generated by Google Gemini ({modelUsed})</span>
                    </div>
                  ) : null}
                </div>

                {output && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsEditingOutput(!isEditingOutput)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                      title={isEditingOutput ? 'Switch to Formatted Preview' : 'Edit Markdown Text Directly'}
                    >
                      {isEditingOutput ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                      <span>{isEditingOutput ? 'Preview' : 'Edit'}</span>
                    </button>

                    <button
                      onClick={handleCopy}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>

                    <button
                      onClick={handleSaveToLibrary}
                      disabled={loading}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        loading
                          ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400'
                          : savedSuccess
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      }`}
                      title="Save to My Library"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>{savedSuccess ? 'Saved to Library' : 'Save'}</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200 mx-1" aria-hidden="true" />

                    <button
                      onClick={handleExportDocx}
                      disabled={loading}
                      className={`p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors ${
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title="Export formatted Word document (.docx)"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Output Content Canvas */}
              <div className="flex-1 p-6 overflow-y-auto">
                {output ? (
                  isEditingOutput ? (
                    <textarea
                      rows={22}
                      value={output}
                      onChange={(e) => setOutput(e.target.value)}
                      className="w-full h-full p-4 font-mono text-xs text-slate-900 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  ) : (
                    <div className="prose prose-xs sm:prose-sm max-w-none text-slate-900 whitespace-pre-wrap leading-relaxed font-sans">
                      {output}
                      {loading && (
                        <span
                          className="inline-block w-1.5 h-4 ml-0.5 bg-rose-500 animate-pulse align-middle"
                          aria-label="Streaming text..."
                        />
                      )}
                    </div>
                  )
                ) : loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 text-slate-500 space-y-3">
                    <div className="flex items-center gap-2 text-rose-600 font-semibold text-xs tracking-wide">
                      <Sparkles className="w-4 h-4 animate-spin text-rose-500" />
                      <span>Connecting to Gemini Stream...</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Drafting your {activeTool.name}...
                    </h4>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Text will stream directly here as it is generated in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 text-slate-400 space-y-3">
                    <FileText className="w-12 h-12 text-slate-300 stroke-[1.5]" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-700">Ready to Generate</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        Configure the parameters on the left and click &quot;Generate {activeTool.name}&quot; to create your bespoke deliverable.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Output Footer */}
              {output && (
                <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                  <span>Replace bracketed [placeholders] with real dates and numbers before publishing.</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleExportText}
                      className="text-slate-600 hover:text-slate-900 font-medium underline"
                    >
                      Download .txt
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={loading || isLimitReached}
                      className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-bold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Regenerate</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* =====================================================================
         * VIEW 2: TOOLS CATALOG OVERVIEW (WHEN BROWSING ALL 8 TOOLS)
         * ===================================================================== */
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Welcome Banner */}
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-10 shadow-xl border border-slate-800">
            <div className="relative z-10 max-w-2xl">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-widest block mb-2">
                Millennium Agency Marketing Suite
              </span>

              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-heading">
                Marketing Tools for {user.organizationProfile?.orgName || 'Your Organization'}
              </h1>

              <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
                Choose a tool below to open your in-page workspace. Every asset is generated live by Gemini AI using your target audience, goals, and brand voice.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <button
                  onClick={onEditProfile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors border border-white/10"
                >
                  <Building2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Voice: {user.organizationProfile?.brandTone?.join(' & ') || 'Professional'}</span>
                  <span className="text-rose-300 underline ml-1 font-semibold">Edit</span>
                </button>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span>
                  Audience: <strong className="text-white">{user.organizationProfile?.targetAudience}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Usage Meter Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1 max-w-lg">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-800">
                  <Zap className="w-4 h-4 text-rose-600" />
                  <span>Monthly Generation Quota</span>
                </span>
                <span className="font-mono text-slate-600">
                  {currentUsage} of {maxLimit} used ({usagePercentage}%)
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isLimitReached ? 'bg-rose-600' : isNearLimit ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Plan: <strong className="text-slate-700">{plan?.name}</strong></span>
                <span>Resets on: {user.billingResetDate}</span>
              </div>
            </div>

            <button
              onClick={onRequireUpgrade}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              {user.planId === 'free' ? 'Upgrade to Pro' : 'Manage Subscription'}
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Category Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {['All', 'Strategy', 'Content', 'Growth', 'Specialized'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search input */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search marketing tools..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <button
                onClick={() => setShowAllSpecialized(!showAllSpecialized)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                  showAllSpecialized
                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {showAllSpecialized ? 'All Tools' : `${userOrgType} View`}
              </button>
            </div>
          </div>

          {/* The 8 Marketing Tools Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTools.map((tool) => (
              <div
                key={tool.id}
                onClick={() => handleSelectTool(tool)}
                className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-slate-400/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                      {CATEGORY_ICONS[tool.category]}
                      <span>{tool.category}</span>
                    </div>

                    {tool.forOrgType && (
                      <span className="text-[10px] font-semibold text-slate-500">
                        {tool.forOrgType} Only
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-rose-600 transition-colors font-heading">
                    {tool.name}
                  </h3>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {tool.description}
                  </p>

                  {/* Why this matters */}
                  <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-950 flex items-start gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-amber-950">Why this matters:</strong>{' '}
                      <span>{tool.whyThisMatters}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {tool.fields.length} guided inputs
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 group-hover:text-rose-600 transition-colors">
                    <span>Open in Studio</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
