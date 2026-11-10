import React, { useState } from 'react';
import { User, SavedOutput } from '../types';
import { dataService } from '../services/dataService';
import {
  Bookmark,
  Search,
  Filter,
  Download,
  Trash2,
  Copy,
  Check,
  Calendar,
  FileText,
  Tag,
  ExternalLink,
  Edit2,
  X,
  FileCheck,
} from 'lucide-react';

interface LibraryViewProps {
  user: User;
  onOpenToolWithInputs?: (toolId: string, inputs: Record<string, string>) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ user, onOpenToolWithInputs }) => {
  const [outputs, setOutputs] = useState<SavedOutput[]>(() => dataService.getOutputs(user.id));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedToolFilter, setSelectedToolFilter] = useState('All');
  const [selectedOutput, setSelectedOutput] = useState<SavedOutput | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshOutputs = () => {
    setOutputs(dataService.getOutputs(user.id));
  };

  const toolNames = ['All', ...Array.from(new Set(outputs.map((o) => o.toolName)))];

  const filteredOutputs = outputs.filter((item) => {
    if (selectedToolFilter !== 'All' && item.toolName !== selectedToolFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = item.content.toLowerCase().includes(q);
      const matchTool = item.toolName.toLowerCase().includes(q);
      return matchTitle || matchContent || matchTool;
    }
    return true;
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to remove this saved item from your library?')) {
      dataService.deleteOutput(id);
      refreshOutputs();
      if (selectedOutput?.id === id) setSelectedOutput(null);
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

  const handleExportDocx = (item: SavedOutput) => {
    // Generate standard HTML formatted document that Microsoft Word / Google Docs opens seamlessly as .doc / .docx
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${item.title}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; line-height: 1.6; color: #111; padding: 40px; }
          h1, h2, h3 { color: #0f172a; margin-top: 24px; }
          p { margin-bottom: 12px; }
          blockquote { border-left: 3px solid #e11d48; margin-left: 0; padding-left: 16px; color: #475569; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        </style>
      </head>
      <body>
        <h1>${item.title}</h1>
        <p><em>Generated with Millennium Agency Launchpad (${item.toolName}) on ${new Date(item.createdAt).toLocaleDateString()}</em></p>
        <hr/>
        <div style="white-space: pre-wrap;">${item.content}</div>
        <div class="footer">
          Generated for ${user.organizationProfile?.orgName || 'Client'} by Millennium Agency Launchpad • https://mill.agency
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
            <span>My Marketing Library</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Access, edit, and export your saved brand strategies, pitch scripts, and marketing plans.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-bold text-slate-900">{outputs.length}</span> items saved
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved outputs..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end overflow-x-auto">
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
      </div>

      {/* Outputs Grid */}
      {filteredOutputs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto stroke-[1.5]" />
          <h3 className="text-sm font-bold text-slate-800">No saved items found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            When you generate marketing copy with any tool, click &quot;Save to Library&quot; to archive it here for your team.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOutputs.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                    {item.toolName}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                    <Calendar className="w-3 h-3" />
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 line-clamp-1 mb-2">
                  {item.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-4 leading-relaxed font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {item.content}
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setSelectedOutput(item)}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                >
                  <span>View Full</span>
                  <ExternalLink className="w-3 h-3" />
                </button>

                <div className="flex items-center gap-1">
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

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Detail Modal */}
      {selectedOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between border-b border-slate-800">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-rose-400">
                  {selectedOutput.toolName}
                </span>
                <h2 className="text-lg sm:text-xl font-bold font-heading">{selectedOutput.title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Saved on {new Date(selectedOutput.createdAt).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setSelectedOutput(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {selectedOutput.content}
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => handleDelete(selectedOutput.id)}
                className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(selectedOutput.id, selectedOutput.content)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  {copiedId === selectedOutput.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
