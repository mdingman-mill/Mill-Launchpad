import React, { useState, useEffect, useMemo } from 'react';
import { User, Organization, GenerationHistoryItem, TeamMember } from '../types';
import { dataService } from '../services/dataService';
import { FormattedOutput } from './FormattedOutput';
import { copyFormattedOutput } from '../utils/exportFormatting';
import {
  History,
  Filter,
  Calendar,
  Clock,
  Users,
  BookmarkPlus,
  RotateCcw,
  Trash2,
  X,
  Check,
  Copy,
  Cpu,
  User as UserIcon,
  Eye,
  AlertCircle,
} from 'lucide-react';

interface HistoryViewProps {
  user: User;
  organization?: Organization | null;
  onRerun: (toolId: string, inputs: Record<string, string>) => void;
}

type DateRangePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

export const HistoryView: React.FC<HistoryViewProps> = ({
  user,
  organization,
  onRerun,
}) => {
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>(() =>
    dataService.getHistory()
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orgOwnerId, setOrgOwnerId] = useState<string>(organization?.ownerId || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('All');
  const [selectedToolFilter, setSelectedToolFilter] = useState('All');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [specificDate, setSpecificDate] = useState('');

  // Modal & Action feedback
  const [selectedRecord, setSelectedRecord] = useState<GenerationHistoryItem | null>(null);
  const [savedLibraryIds, setSavedLibraryIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tools = useMemo(() => dataService.getTools(), []);

  useEffect(() => {
    let active = true;
    const orgId = user.organizationId || organization?.id;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      dataService.fetchHistory(orgId),
      dataService.fetchTeam(),
    ]).then(([historyRes, teamRes]) => {
      if (!active) return;

      if (historyRes.status === 'fulfilled') {
        setHistoryItems(historyRes.value);
      } else {
        setError('Unable to load generation history. Please refresh and try again.');
      }

      if (teamRes.status === 'fulfilled') {
        setTeamMembers(teamRes.value.members || []);
        if (teamRes.value.organization?.ownerId) {
          setOrgOwnerId(teamRes.value.organization.ownerId);
        }
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user.id, user.organizationId, organization?.id]);

  useEffect(() => {
    if (organization?.ownerId) {
      setOrgOwnerId(organization.ownerId);
    }
  }, [organization?.ownerId]);

  const isTeamOwner =
    user.role === 'super_admin' ||
    user.orgRole === 'owner' ||
    (Boolean(orgOwnerId) && orgOwnerId === user.id);

  const canDeleteRecord = (item: GenerationHistoryItem): boolean => {
    return item.userId === user.id || isTeamOwner;
  };

  const memberFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of teamMembers) {
      map.set(m.id, m.name || m.email || 'Team Member');
    }
    for (const item of historyItems) {
      if (item.userId && !map.has(item.userId)) {
        map.set(item.userId, item.userName || 'Team Member');
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [teamMembers, historyItems]);

  const toolFilterOptions = useMemo(() => {
    const names = new Set<string>(tools.map((t) => t.name));
    historyItems.forEach((h) => {
      if (h.toolName) names.add(h.toolName);
    });
    return ['All', ...Array.from(names)];
  }, [tools, historyItems]);

  const getLocalYyyyMmDd = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const filteredItems = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalYyyyMmDd(now.toISOString());

    return historyItems.filter((item) => {
      if (selectedMemberFilter !== 'All' && item.userId !== selectedMemberFilter) {
        return false;
      }
      if (selectedToolFilter !== 'All' && item.toolName !== selectedToolFilter) {
        return false;
      }

      const itemTime = new Date(item.createdAt).getTime();
      if (datePreset === 'today') {
        if (getLocalYyyyMmDd(item.createdAt) !== todayStr) return false;
      } else if (datePreset === '7d') {
        if (now.getTime() - itemTime > 7 * 24 * 60 * 60 * 1000) return false;
      } else if (datePreset === '30d') {
        if (now.getTime() - itemTime > 30 * 24 * 60 * 60 * 1000) return false;
      } else if (datePreset === 'custom' && specificDate) {
        if (getLocalYyyyMmDd(item.createdAt) !== specificDate) return false;
      }

      return true;
    });
  }, [historyItems, selectedMemberFilter, selectedToolFilter, datePreset, specificDate]);

  const extractTitleFromRecord = (item: GenerationHistoryItem): string => {
    const firstHeadingMatch = item.output.match(/^#\s+(.+)$/m);
    if (firstHeadingMatch?.[1]) {
      return firstHeadingMatch[1].trim().slice(0, 120);
    }
    const orgLabel = organization?.name || user.organizationProfile?.orgName || 'Team';
    return `${orgLabel} ${item.toolName}`.slice(0, 120);
  };

  const handleSaveToLibrary = (item: GenerationHistoryItem) => {
    const toolDef = tools.find((t) => t.id === item.toolId);
    dataService.saveOutput({
      orgId: user.organizationId || organization?.id || item.orgId,
      userId: user.id,
      userName: user.name || user.email,
      toolId: item.toolId,
      toolName: item.toolName,
      title: extractTitleFromRecord(item),
      content: item.output,
      tags: [
        ...(toolDef?.category ? [toolDef.category] : []),
        user.organizationProfile?.type || 'Startup',
      ],
      userInputs: item.inputs || {},
    });

    setSavedLibraryIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setSavedLibraryIds((prev) => ({ ...prev, [item.id]: false }));
    }, 3000);
  };

  const handleDelete = async (item: GenerationHistoryItem) => {
    if (!canDeleteRecord(item)) return;
    if (!window.confirm('Delete this generation record from history?')) return;

    setDeletingId(item.id);
    setError(null);
    try {
      await dataService.deleteHistoryItem(item.id, user.organizationId || organization?.id || item.orgId);
      setHistoryItems((prev) => prev.filter((h) => h.id !== item.id));
      if (selectedRecord?.id === item.id) {
        setSelectedRecord(null);
      }
    } catch {
      setError('Failed to delete history record. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await copyFormattedOutput(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatFieldLabel = (toolId: string, key: string): string => {
    const tool = tools.find((t) => t.id === toolId);
    const field = tool?.fields.find((f) => f.key === key);
    if (field?.label) return field.label;
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  };

  const hasActiveFilters =
    selectedMemberFilter !== 'All' || selectedToolFilter !== 'All' || datePreset !== 'all';

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-heading flex items-center gap-2">
            <History className="w-6 h-6 text-rose-600" />
            <span>Generation History</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Automatic 12-month log of all completed AI generations across your organization. Re-run inputs or save deliverables to the shared library.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          <span className="font-bold text-slate-900">{filteredItems.length}</span> of{' '}
          {historyItems.length} records
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 whitespace-nowrap">Member:</span>
            <select
              value={selectedMemberFilter}
              onChange={(e) => setSelectedMemberFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            >
              <option value="All">All Members</option>
              {memberFilterOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 whitespace-nowrap">Tool:</span>
            <select
              value={selectedToolFilter}
              onChange={(e) => setSelectedToolFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            >
              {toolFilterOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 whitespace-nowrap">Date:</span>
            <select
              value={datePreset}
              onChange={(e) => {
                const next = e.target.value as DateRangePreset;
                setDatePreset(next);
                if (next !== 'custom') setSpecificDate('');
              }}
              className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            >
              <option value="all">Last 12 Months (All)</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Specific Date</option>
            </select>

            {datePreset === 'custom' && (
              <input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSelectedMemberFilter('All');
              setSelectedToolFilter('All');
              setDatePreset('all');
              setSpecificDate('');
            }}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* History List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-rose-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading organization generation history...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <History className="w-12 h-12 text-slate-300 mx-auto stroke-[1.5]" />
          <h3 className="text-sm font-bold text-slate-800">No generation history found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {historyItems.length === 0
              ? 'Successful tool generations are automatically recorded here for 12 months so your team can review, save, or re-run them.'
              : 'No history records match your selected member, tool, or date filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const deletable = canDeleteRecord(item);
            const savedToLib = savedLibraryIds[item.id];
            const headingTitle = extractTitleFromRecord(item);
            const inputEntries = Object.entries(item.inputs || {}).filter(
              ([, v]) => typeof v === 'string' && v.trim().length > 0
            );

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-slate-300 shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div
                  onClick={() => setSelectedRecord(item)}
                  className="flex-1 min-w-0 cursor-pointer space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white">
                      {item.toolName}
                    </span>
                    <span className="text-[11px] text-slate-600 flex items-center gap-1 font-medium">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                      {item.userName || 'Team Member'}
                      {item.userId === user.id ? ' (You)' : ''}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {(item.durationMs / 1000).toFixed(1)}s
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                      <Cpu className="w-3 h-3" />
                      {item.model}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 hover:text-rose-600 transition-colors truncate">
                    {headingTitle}
                  </h3>

                  {inputEntries.length > 0 && (
                    <p className="text-xs text-slate-500 line-clamp-1">
                      <span className="font-semibold text-slate-600">Inputs: </span>
                      {inputEntries
                        .map(([k, v]) => `${formatFieldLabel(item.toolId, k)}: ${v}`)
                        .join(' • ')}
                    </p>
                  )}
                </div>

                {/* Actions on each record */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedRecord(item)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </button>

                  <button
                    onClick={() => handleSaveToLibrary(item)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                      savedToLib
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 text-slate-700 hover:text-emerald-800'
                    }`}
                  >
                    {savedToLib ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Saved!</span>
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Save to Library</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onRerun(item.toolId, item.inputs || {})}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-run</span>
                  </button>

                  {deletable && (
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                      title="Delete record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History Record Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between gap-4 border-b border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-rose-400">
                    {selectedRecord.toolName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    • {selectedRecord.model} • {(selectedRecord.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold font-heading">
                  {extractTitleFromRecord(selectedRecord)}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Generated by <strong className="text-slate-200">{selectedRecord.userName}</strong> on{' '}
                  {new Date(selectedRecord.createdAt).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Submitted Inputs + Formatted Output */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-5">
              {/* Inputs Panel */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Submitted Form Inputs
                </h3>
                {Object.keys(selectedRecord.inputs || {}).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No custom tool inputs were recorded.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(selectedRecord.inputs || {}).map(([key, value]) => (
                      <div key={key} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-[11px] font-bold text-slate-600 mb-1">
                          {formatFieldLabel(selectedRecord.toolId, key)}
                        </div>
                        <div className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                          {value || <span className="text-slate-400 italic">Empty</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Output Panel */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <FormattedOutput content={selectedRecord.output} />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                {canDeleteRecord(selectedRecord) && (
                  <button
                    onClick={() => handleDelete(selectedRecord)}
                    disabled={deletingId === selectedRecord.id}
                    className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1 font-medium disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleCopy(selectedRecord.id, selectedRecord.output)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  {copiedId === selectedRecord.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === selectedRecord.id ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleSaveToLibrary(selectedRecord)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    savedLibraryIds[selectedRecord.id]
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 text-slate-700 hover:text-emerald-800'
                  }`}
                >
                  {savedLibraryIds[selectedRecord.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Saved to Library!</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save to Library</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    onRerun(selectedRecord.toolId, selectedRecord.inputs || {});
                    setSelectedRecord(null);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-run Tool</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
