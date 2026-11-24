import React, { useState, useEffect, useMemo } from 'react';
import { User, Organization, SavedOutput, TeamMember, TeamSummary } from '../types';
import { dataService } from '../services/dataService';
import { FormattedOutput } from './FormattedOutput';
import { copyFormattedOutput, renderMarkdownToHtml } from '../utils/exportFormatting';
import {
  Bookmark,
  Search,
  Filter,
  Download,
  Trash2,
  Copy,
  CopyPlus,
  Check,
  Calendar,
  FileText,
  ExternalLink,
  Edit2,
  X,
  User as UserIcon,
  Save,
  Eye,
  Users,
  FolderInput,
  ArrowRight,
} from 'lucide-react';

interface LibraryViewProps {
  user: User;
  organization?: Organization | null;
  onOpenToolWithInputs?: (toolId: string, inputs: Record<string, string>) => void;
  onNavigateToTools?: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  user,
  organization,
  onOpenToolWithInputs,
  onNavigateToTools,
}) => {
  const [outputs, setOutputs] = useState<SavedOutput[]>(() => dataService.getOutputs(user.id));
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [userTeams, setUserTeams] = useState<TeamSummary[]>(() => dataService.getCachedTeams());
  const [orgOwnerId, setOrgOwnerId] = useState<string>(organization?.ownerId || '');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');
  const [titleSearch, setTitleSearch] = useState('');
  const [selectedToolFilter, setSelectedToolFilter] = useState('All');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('All');
  const [selectedOutput, setSelectedOutput] = useState<SavedOutput | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copySuccessBanner, setCopySuccessBanner] = useState<string | null>(null);
  const [copyTeamMenuItemId, setCopyTeamMenuItemId] = useState<string | null>(null);
  const [modalCopyTeamOpen, setModalCopyTeamOpen] = useState(false);
  const [copyingToTeamId, setCopyingToTeamId] = useState<string | null>(null);
  const [copyErrorBanner, setCopyErrorBanner] = useState<string | null>(null);

  const activeOrgId = organization?.id || user.organizationId || `org_${user.id}`;
  const otherTeams = useMemo(
    () => userTeams.filter((t) => t.id !== activeOrgId),
    [userTeams, activeOrgId]
  );

  useEffect(() => {
    let active = true;
    setSelectedOutput(null);
    setIsEditing(false);
    setCopyTeamMenuItemId(null);
    setModalCopyTeamOpen(false);

    dataService
      .fetchOutputs(user.organizationId || organization?.id)
      .then((list) => {
        if (active) setOutputs(list);
      })
      .catch(() => {});

    dataService
      .fetchTeam()
      .then((team) => {
        if (!active) return;
        setTeamMembers(team.members || []);
        if (team.organization?.ownerId) {
          setOrgOwnerId(team.organization.ownerId);
        }
      })
      .catch(() => {});

    dataService
      .fetchTeams()
      .then((res) => {
        if (!active) return;
        setUserTeams(res.teams || []);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user.id, user.organizationId, organization?.id]);

  useEffect(() => {
    if (organization?.ownerId) {
      setOrgOwnerId(organization.ownerId);
    }
  }, [organization?.ownerId]);

  const refreshOutputs = () => {
    setOutputs([...dataService.getOutputs(user.id)]);
  };

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set(user.id, user.name || user.email || 'You');
    for (const m of teamMembers) {
      map.set(m.id, m.name || m.email || 'Team Member');
    }
    for (const item of outputs) {
      if (item.userId && item.userName && !map.has(item.userId)) {
        map.set(item.userId, item.userName);
      }
    }
    return map;
  }, [user.id, user.name, user.email, teamMembers, outputs]);

  const getAuthorName = (item: SavedOutput): string => {
    return item.userName || memberNameMap.get(item.userId) || 'Team Member';
  };

  const isTeamOwner =
    user.role === 'super_admin' ||
    user.orgRole === 'owner' ||
    (Boolean(orgOwnerId) && orgOwnerId === user.id);

  const canEditOrDelete = (item: SavedOutput): boolean => {
    return item.userId === user.id || isTeamOwner;
  };

  const toolNames = useMemo(
    () => ['All', ...Array.from(new Set(outputs.map((o) => o.toolName).filter(Boolean)))],
    [outputs]
  );

  const memberFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of teamMembers) {
      map.set(m.id, m.name || m.email || 'Team Member');
    }
    for (const item of outputs) {
      if (item.userId && !map.has(item.userId)) {
        map.set(item.userId, item.userName || 'Team Member');
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [teamMembers, outputs]);

  const filteredOutputs = useMemo(() => {
    return outputs.filter((item) => {
      if (scopeFilter === 'mine' && item.userId !== user.id) {
        return false;
      }
      if (selectedToolFilter !== 'All' && item.toolName !== selectedToolFilter) {
        return false;
      }
      if (selectedMemberFilter !== 'All' && item.userId !== selectedMemberFilter) {
        return false;
      }
      if (titleSearch.trim()) {
        const q = titleSearch.trim().toLowerCase();
        return item.title.toLowerCase().includes(q);
      }
      return true;
    });
  }, [outputs, scopeFilter, selectedToolFilter, selectedMemberFilter, titleSearch, user.id]);

  const hasActiveFilters =
    scopeFilter !== 'all' ||
    titleSearch.trim().length > 0 ||
    selectedToolFilter !== 'All' ||
    selectedMemberFilter !== 'All';

  const resetFilters = () => {
    setScopeFilter('all');
    setTitleSearch('');
    setSelectedToolFilter('All');
    setSelectedMemberFilter('All');
  };

  const handleOpenModal = (item: SavedOutput, startEditing = false) => {
    setSelectedOutput(item);
    setEditTitle(item.title);
    setEditContent(item.content);
    setIsEditing(startEditing && canEditOrDelete(item));
    setModalCopyTeamOpen(false);
    setCopyTeamMenuItemId(null);
  };

  const handleCloseModal = () => {
    setSelectedOutput(null);
    setIsEditing(false);
    setModalCopyTeamOpen(false);
  };

  const handleSaveEdit = () => {
    if (!selectedOutput || !canEditOrDelete(selectedOutput)) return;
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;

    const updated = dataService.updateOutput(
      selectedOutput.id,
      {
        title: trimmedTitle,
        content: editContent,
      },
      { id: user.id, name: user.name || user.email }
    );
    if (updated) {
      setSelectedOutput(updated);
      refreshOutputs();
    }
    setIsEditing(false);
  };

  const handleSaveCopy = (item: SavedOutput) => {
    const copied = dataService.copyOutput(item, user);
    refreshOutputs();
    setCopyErrorBanner(null);
    setCopySuccessBanner(`Saved your editable copy: "${copied.title}"`);
    setTimeout(() => setCopySuccessBanner(null), 3500);
    if (selectedOutput?.id === item.id) {
      setSelectedOutput(copied);
      setEditTitle(copied.title);
      setEditContent(copied.content);
      setIsEditing(false);
    }
  };

  const handleCopyToOtherTeam = async (item: SavedOutput, targetTeam: TeamSummary) => {
    if (copyingToTeamId) return;
    try {
      setCopyingToTeamId(targetTeam.id);
      setCopyErrorBanner(null);
      await dataService.copyOutputToTeam(item, targetTeam.id, user);
      setCopyTeamMenuItemId(null);
      setModalCopyTeamOpen(false);
      setCopySuccessBanner(`Copied "${item.title}" to team "${targetTeam.name}".`);
      setTimeout(() => setCopySuccessBanner(null), 3500);
    } catch (err: any) {
      setCopyErrorBanner(err?.message || `Failed to copy "${item.title}" to ${targetTeam.name}.`);
    } finally {
      setCopyingToTeamId(null);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await copyFormattedOutput(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (item: SavedOutput) => {
    if (!canEditOrDelete(item)) return;
    if (window.confirm('Are you sure you want to remove this saved item from the team library?')) {
      dataService.deleteOutput(item.id);
      refreshOutputs();
      if (selectedOutput?.id === item.id) {
        handleCloseModal();
      }
    }
  };

  const handleExportText = (item: SavedOutput) => {
    const blob = new Blob([item.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (unsafe: string) =>
    unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const handleExportDocx = (item: SavedOutput) => {
    const safeTitle = escapeHtml(item.title);
    const safeTool = escapeHtml(item.toolName);
    const safeOrg = escapeHtml(organization?.name || user.organizationProfile?.orgName || 'Client');
    const formattedBodyHtml = renderMarkdownToHtml(item.content);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${safeTitle}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; line-height: 1.6; color: #111; padding: 40px; }
          h1 { font-size: 22pt; font-weight: bold; color: #0f172a; margin-top: 24px; margin-bottom: 10px; }
          h2 { font-size: 16pt; font-weight: bold; color: #0f172a; margin-top: 22px; margin-bottom: 8px; }
          h3 { font-size: 13pt; font-weight: bold; color: #0f172a; margin-top: 16px; margin-bottom: 6px; }
          p { margin-top: 0; margin-bottom: 12px; }
          ul, ol { margin-top: 8px; margin-bottom: 12px; padding-left: 24px; }
          li { margin-bottom: 4px; }
          blockquote { border-left: 3px solid #e11d48; margin: 14px 0; padding-left: 16px; color: #475569; font-style: italic; }
          hr { border: none; border-top: 1px solid #cbd5e1; margin: 18px 0; }
          table { width: 100%; border-collapse: collapse; margin: 14px 0; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
          th { background-color: #f8fafc; font-weight: bold; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        </style>
      </head>
      <body>
        <h1>${safeTitle}</h1>
        <p><em>Generated with Millennium Agency Launchpad (${safeTool}) on ${new Date(item.createdAt).toLocaleDateString()}</em></p>
        <hr/>
        <div>${formattedBodyHtml}</div>
        <div class="footer">
          Generated for ${safeOrg} by Millennium Agency Launchpad • https://mill.agency
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-heading flex items-center gap-2">
            <Bookmark className="w-6 h-6 text-rose-600" />
            <span>Team Marketing Library</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Shared library for{' '}
            <strong className="text-slate-800">
              {organization?.name || user.organizationProfile?.orgName || 'your organization'}
            </strong>
            . Browse saved deliverables from your team, edit items, or save your own copy.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-bold text-slate-900">{filteredOutputs.length}</span>
          <span>of {outputs.length} shared items</span>
        </div>
      </div>

      {copySuccessBanner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{copySuccessBanner}</span>
        </div>
      )}

      {copyErrorBanner && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-semibold flex items-center justify-between gap-2">
          <span>{copyErrorBanner}</span>
          <button onClick={() => setCopyErrorBanner(null)} className="text-rose-900 font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Filters and Title Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Scope + Title Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold shrink-0">
            <button
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                scopeFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setScopeFilter('mine')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                scopeFilter === 'mine' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mine
            </button>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={titleSearch}
              onChange={(e) => setTitleSearch(e.target.value)}
              placeholder="Search by title..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {/* Tool + Member Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 whitespace-nowrap">Tool:</span>
            <select
              value={selectedToolFilter}
              onChange={(e) => setSelectedToolFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            >
              {toolNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 whitespace-nowrap">Member:</span>
            <select
              value={selectedMemberFilter}
              onChange={(e) => setSelectedMemberFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            >
              <option value="All">All Members</option>
              {memberFilterOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 cursor-pointer whitespace-nowrap"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Outputs Grid */}
      {filteredOutputs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto stroke-[1.5]" />
          <h3 className="text-sm font-bold text-slate-800">No saved items found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {outputs.length === 0
              ? 'When your team generates marketing copy with any tool, click "Save to Library" to share it here.'
              : 'No saved deliverables match your current filters. Try clearing your search or filter selections.'}
          </p>
          {outputs.length === 0 && onNavigateToTools ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={onNavigateToTools}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <span>Open Marketing Tools</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            hasActiveFilters && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  <span>Reset Filters</span>
                </button>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOutputs.map((item) => {
            const authorName = getAuthorName(item);
            const modifiable = canEditOrDelete(item);
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 truncate">
                      {item.toolName}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono shrink-0">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1 mb-1">
                    {item.title}
                  </h3>

                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mb-2.5">
                    <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">
                      Saved by <strong className="text-slate-700">{authorName}</strong>
                      {item.userId === user.id ? ' (You)' : ''}
                    </span>
                  </p>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-28 overflow-hidden">
                    <FormattedOutput
                      content={item.content}
                      className="text-xs [&_h1]:text-xs [&_h1]:mt-0 [&_h1]:mb-1 [&_h2]:text-xs [&_h2]:mt-1 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:mt-1 [&_h3]:mb-0.5 [&_p]:my-1 [&_hr]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_blockquote]:my-1.5"
                    />
                  </div>
                </div>

                {/* Action Toolbar */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenModal(item, false)}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                  >
                    <span>View Full</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>

                  <div className="flex items-center gap-1 relative">
                    <button
                      onClick={() => handleSaveCopy(item)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                      title="Save a copy to edit your own version"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                    </button>

                    {otherTeams.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setCopyTeamMenuItemId(copyTeamMenuItemId === item.id ? null : item.id)
                          }
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Copy to another team"
                        >
                          <FolderInput className="w-3.5 h-3.5" />
                        </button>

                        {copyTeamMenuItemId === item.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setCopyTeamMenuItemId(null)}
                            />
                            <div className="absolute right-0 bottom-full mb-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-40 p-1.5 text-xs">
                              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Copy to another team
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-0.5">
                                {otherTeams.map((targetTeam) => (
                                  <button
                                    key={targetTeam.id}
                                    type="button"
                                    disabled={Boolean(copyingToTeamId)}
                                    onClick={() => handleCopyToOtherTeam(item, targetTeam)}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-800 font-medium flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50"
                                  >
                                    <span className="truncate">{targetTeam.name}</span>
                                    {targetTeam.isPersonal && (
                                      <span className="text-[9px] uppercase font-bold text-slate-400 shrink-0">
                                        Personal
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {modifiable && (
                      <button
                        onClick={() => handleOpenModal(item, true)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        title="Edit item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleCopy(item.id, item.content)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                      title="Copy content"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => handleExportDocx(item)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                      title="Export as Word (.docx)"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {modifiable && (
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Detail / Edit Modal */}
      {selectedOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between gap-4 border-b border-slate-800">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-bold text-rose-400">
                  {selectedOutput.toolName}
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={300}
                    className="mt-1 w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-base sm:text-lg font-bold font-heading focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="Deliverable title"
                  />
                ) : (
                  <h2 className="text-lg sm:text-xl font-bold font-heading">{selectedOutput.title}</h2>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Saved by <strong className="text-slate-200">{getAuthorName(selectedOutput)}</strong> on{' '}
                  {new Date(selectedOutput.createdAt).toLocaleString()}
                  {selectedOutput.updatedByName && selectedOutput.updatedAt !== selectedOutput.createdAt
                    ? ` • Edited by ${selectedOutput.updatedByName}`
                    : ''}
                </p>
              </div>

              <button
                onClick={handleCloseModal}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Editing raw Markdown</span>
                    <span>Changes update the shared team deliverable</span>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={16}
                    className="w-full p-4 rounded-2xl border border-slate-300 bg-white text-xs sm:text-sm font-mono text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-200">
                  <FormattedOutput content={selectedOutput.content} />
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {canEditOrDelete(selectedOutput) && (
                  <button
                    onClick={() => handleDelete(selectedOutput)}
                    className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}

                {selectedOutput.userInputs &&
                  Object.keys(selectedOutput.userInputs).length > 0 &&
                  onOpenToolWithInputs && (
                    <button
                      onClick={() => {
                        onOpenToolWithInputs(selectedOutput.toolId, selectedOutput.userInputs || {});
                        handleCloseModal();
                      }}
                      className="text-xs text-slate-600 hover:text-slate-900 font-semibold"
                    >
                      Re-open in Tool
                    </button>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => {
                        setEditTitle(selectedOutput.title);
                        setEditContent(selectedOutput.content);
                        setIsEditing(false);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editTitle.trim()}
                      className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleSaveCopy(selectedOutput)}
                      className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 flex items-center gap-1.5"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                      <span>Save a copy</span>
                    </button>

                    {otherTeams.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setModalCopyTeamOpen(!modalCopyTeamOpen)}
                          className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-800 flex items-center gap-1.5 cursor-pointer"
                        >
                          <FolderInput className="w-3.5 h-3.5" />
                          <span>Copy to another team</span>
                        </button>

                        {modalCopyTeamOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => setModalCopyTeamOpen(false)}
                            />
                            <div className="absolute right-0 bottom-full mb-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 z-40 p-1.5 text-xs">
                              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Select destination team
                              </div>
                              <div className="max-h-52 overflow-y-auto space-y-0.5">
                                {otherTeams.map((targetTeam) => (
                                  <button
                                    key={targetTeam.id}
                                    type="button"
                                    disabled={Boolean(copyingToTeamId)}
                                    onClick={() => handleCopyToOtherTeam(selectedOutput, targetTeam)}
                                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-slate-800 font-medium flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50"
                                  >
                                    <span className="truncate">{targetTeam.name}</span>
                                    {targetTeam.isPersonal && (
                                      <span className="text-[9px] uppercase font-bold text-slate-400 shrink-0">
                                        Personal
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {canEditOrDelete(selectedOutput) && (
                      <button
                        onClick={() => {
                          setEditTitle(selectedOutput.title);
                          setEditContent(selectedOutput.content);
                          setIsEditing(true);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleCopy(selectedOutput.id, selectedOutput.content)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      {copiedId === selectedOutput.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === selectedOutput.id ? 'Copied' : 'Copy'}</span>
                    </button>

                    <button
                      onClick={() => handleExportText(selectedOutput)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Export .txt</span>
                    </button>

                    <button
                      onClick={() => handleExportDocx(selectedOutput)}
                      className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export .docx</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
