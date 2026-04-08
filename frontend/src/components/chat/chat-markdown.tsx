'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { filesApi, sharesApi } from '@/lib/api';
import { ContextMenuPortal, type ContextMenuItem } from '@/components/context-menu';
import { ToolsBadges } from '@/components/tools-badges';
import { ChevronDown, ChevronRight, FileText, FolderOpen, Download, Share2, ExternalLink, Calendar, HardDrive, Tag, Folder } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { getFileIcon, formatBytes, formatDate } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';
import type { RagSource } from '@/types';

/* ─── File list block (rendered from ```filelist code blocks) ─── */
export interface FileListItem {
  id?: string;
  name: string;
  size?: number;
  type?: string | null;
  folder?: string;
  indexed?: boolean;
}

export function FileListBlock({ json }: { json: string }) {
  const router = useRouter();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; file: FileListItem } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { t } = useTranslation('chat');

  let files: FileListItem[] = [];
  try {
    files = JSON.parse(json);
  } catch {
    return <code>{json}</code>;
  }
  if (!Array.isArray(files) || !files.length) {
    return <p className="text-sm text-gray-400">{t('noFiles')}</p>;
  }

  const handleDownload = async (f: FileListItem) => {
    if (!f.id) return;
    try {
      const blob = await filesApi.download(f.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleShare = async (f: FileListItem) => {
    if (!f.id) return;
    try {
      const share = await sharesApi.create(f.id, { expires_in: '7d' });
      await navigator.clipboard.writeText(share.url);
      setToast(t('shareCopied', { name: f.name }));
      setTimeout(() => setToast(null), 2500);
    } catch { /* ignore */ }
  };

  const handleOpenInExplorer = (f: FileListItem) => {
    const folder = f.folder || '/';
    router.push(`/files?path=${encodeURIComponent(folder)}`);
  };

  const getMenuItems = (f: FileListItem): ContextMenuItem[] => [
    { label: t('download'), icon: Download, onClick: () => handleDownload(f), disabled: !f.id },
    { label: t('shareLink'), icon: Share2, onClick: () => handleShare(f), disabled: !f.id },
    { label: t('openInExplorer'), icon: ExternalLink, onClick: () => handleOpenInExplorer(f), separator: true },
  ];

  return (
    <>
      <div className="my-2 border border-gray-600/50 rounded-xl overflow-hidden bg-gray-800/40">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50 bg-gray-800/60">
          <FolderOpen className="w-4 h-4 text-primary-400" />
          <span className="text-xs text-gray-300 font-medium">{t('fileList')} ({files.length})</span>
        </div>
        <div className="divide-y divide-gray-700/30">
          {files.map((f, idx) => {
            const icon = getFileIcon(f.type || null);
            return (
              <div
                key={f.id || idx}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, file: f });
                }}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-700/30 transition-colors cursor-default"
              >
                <span className="text-base flex-shrink-0">{icon}</span>
                <span className="text-sm text-gray-200 truncate flex-1">{f.name}</span>
                {f.indexed && (
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {t('indexed')}
                  </span>
                )}
                {f.size != null && (
                  <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
                    {formatBytes(f.size)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenuPortal
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getMenuItems(ctxMenu.file)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-gray-200 text-sm px-4 py-2 rounded-lg shadow-lg border border-gray-700 z-50 animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </>
  );
}

/* ─── File info card (rendered from ```fileinfo code blocks) ─── */
export interface FileInfoData {
  id?: string;
  name: string;
  size?: number;
  type?: string | null;
  folder?: string;
  indexed?: boolean;
  created_at?: string;
  description?: string;
}

export function FileInfoCard({ json }: { json: string }) {
  const { t } = useTranslation('chat');
  let files: FileInfoData[] = [];
  try {
    const parsed = JSON.parse(json);
    files = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return <code>{json}</code>;
  }
  if (!files.length) return null;

  return (
    <div className="my-2 space-y-2">
      {files.map((f, idx) => {
        const icon = getFileIcon(f.type || null);
        return (
          <div
            key={f.id || idx}
            className="border border-gray-600/50 rounded-xl overflow-hidden bg-gray-800/40"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-800/60 border-b border-gray-700/50">
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-100 truncate">{f.name}</p>
                {f.type && (
                  <p className="text-xs text-gray-500 truncate">{f.type}</p>
                )}
              </div>
              {f.indexed && (
                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  {t('indexed')}
                </span>
              )}
            </div>
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-px bg-gray-700/20">
              {f.size != null && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/30">
                  <HardDrive className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">{t('size')}</span>
                  <span className="text-xs text-gray-200 ml-auto tabular-nums">{formatBytes(f.size)}</span>
                </div>
              )}
              {f.folder && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/30">
                  <Folder className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">{t('path')}</span>
                  <span className="text-xs text-gray-200 ml-auto truncate max-w-[120px]">{f.folder}</span>
                </div>
              )}
              {f.created_at && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/30">
                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">{t('createdAt')}</span>
                  <span className="text-xs text-gray-200 ml-auto">{formatDate(f.created_at)}</span>
                </div>
              )}
              {f.type && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/30">
                  <Tag className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">{t('type')}</span>
                  <span className="text-xs text-gray-200 ml-auto truncate max-w-[120px]">{f.type.split('/').pop()}</span>
                </div>
              )}
            </div>
            {/* Description */}
            {f.description && (
              <div className="px-4 py-2.5 border-t border-gray-700/30">
                <p className="text-xs text-gray-300 leading-relaxed">{f.description}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Inline image block (rendered from ```image code blocks) ─── */
export function ImageBlock({ json }: { json: string }) {
  const { t } = useTranslation('chat');
  let data: { id?: string; name?: string; url?: string; message?: string };
  try {
    data = JSON.parse(json);
  } catch {
    return <code>{json}</code>;
  }

  const fileId = data.id;
  const streamUrl = fileId ? filesApi.getStreamUrl(fileId) : null;

  if (!streamUrl) return null;

  return (
    <div className="my-2">
      <div className="border border-gray-600/50 rounded-xl overflow-hidden bg-gray-800/40">
        <img
          src={streamUrl}
          alt={data.name || 'screenshot'}
          className="w-full max-w-lg rounded-t-xl cursor-pointer"
          onClick={() => window.open(streamUrl, '_blank')}
          loading="lazy"
        />
        {(data.name || data.url) && (
          <div className="px-3 py-2 flex items-center justify-between gap-2 bg-gray-800/60">
            <span className="text-xs text-gray-400 truncate">{data.name || data.url}</span>
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-400 hover:text-primary-300 flex-shrink-0"
            >
              {t('open')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers: detect file-like table and convert to FileListBlock ─── */
const FILE_HEADER_KEYWORDS = ['파일명', '파일이름', '파일 이름', 'filename', 'name', '이름'];
const SIZE_HEADER_KEYWORDS = ['크기', 'size', '용량'];

export function extractTextContent(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractTextContent).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props?.children) return extractTextContent(props.children);
  }
  return '';
}

export function isFileTable(headerCells: string[]): boolean {
  const lower = headerCells.map(h => h.toLowerCase().trim());
  return lower.some(h => FILE_HEADER_KEYWORDS.some(k => h.includes(k)));
}

export function parseFileTableRows(
  headerCells: string[],
  bodyRows: string[][],
): FileListItem[] | null {
  const lower = headerCells.map(h => h.toLowerCase().trim());
  const nameIdx = lower.findIndex(h => FILE_HEADER_KEYWORDS.some(k => h.includes(k)));
  if (nameIdx === -1) return null;
  const sizeIdx = lower.findIndex(h => SIZE_HEADER_KEYWORDS.some(k => h.includes(k)));

  const items: FileListItem[] = [];
  for (const row of bodyRows) {
    const name = row[nameIdx]?.trim();
    if (!name) continue;

    // Guess mime from extension
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', svg: 'image/svg+xml', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      json: 'application/json', txt: 'text/plain', md: 'text/markdown',
      csv: 'text/csv', zip: 'application/zip', mp4: 'video/mp4', mp3: 'audio/mpeg',
    };
    const type = mimeMap[ext] || null;

    // Parse size text like "2,242 바이트" or "3.5 KB"
    let size: number | undefined;
    if (sizeIdx !== -1 && row[sizeIdx]) {
      const sizeText = row[sizeIdx].trim().replace(/,/g, '');
      const num = parseFloat(sizeText);
      if (!isNaN(num)) {
        const upper = sizeText.toUpperCase();
        if (upper.includes('GB')) size = num * 1024 * 1024 * 1024;
        else if (upper.includes('MB')) size = num * 1024 * 1024;
        else if (upper.includes('KB')) size = num * 1024;
        else size = num; // bytes
      }
    }

    items.push({ name, size, type });
  }

  return items.length > 0 ? items : null;
}

/* ─── React element node shape for table walking ─── */
interface ReactElementLike {
  type?: string;
  props?: { node?: { tagName?: string }; children?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

/* ─── Custom ReactMarkdown renderers ─── */
export const markdownComponents = {
  code({ className, children }: { className?: string; children?: React.ReactNode; node?: unknown }) {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';
    const content = String(children ?? '').replace(/\n$/, '');

    if (lang === 'filelist') {
      return <FileListBlock json={content} />;
    }
    if (lang === 'fileinfo') {
      return <FileInfoCard json={content} />;
    }
    if (lang === 'image') {
      if (!content.trim()) return null;
      return <ImageBlock json={content} />;
    }
    if (lang === 'tools') {
      try {
        const tools = JSON.parse(content);
        if (!Array.isArray(tools)) throw 0;
        return <ToolsBadges tools={tools} />;
      } catch {
        return <code>{content}</code>;
      }
    }

    if (lang) {
      return (
        <div className="overflow-x-auto my-2">
          <SyntaxHighlighter
            style={oneDark}
            language={lang}
            PreTag="div"
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              background: 'rgba(17, 24, 39, 0.7)',
            }}
          >
            {content}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <code className="bg-gray-900/60 px-1.5 py-0.5 rounded text-sm text-primary-300">
        {children}
      </code>
    );
  },
  pre({ children }: { children?: React.ReactNode }) {
    return <div className="my-2 overflow-x-auto">{children}</div>;
  },
  p({ children }: { children?: React.ReactNode }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }: { children?: React.ReactNode }) {
    return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
  },
  ol({ children }: { children?: React.ReactNode }) {
    return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
  },
  li({ children }: { children?: React.ReactNode }) {
    return <li className="text-gray-200">{children}</li>;
  },
  h1({ children }: { children?: React.ReactNode }) {
    return <h1 className="text-xl font-bold text-gray-100 mt-4 mb-2">{children}</h1>;
  },
  h2({ children }: { children?: React.ReactNode }) {
    return <h2 className="text-lg font-bold text-gray-100 mt-3 mb-2">{children}</h2>;
  },
  h3({ children }: { children?: React.ReactNode }) {
    return <h3 className="text-base font-semibold text-gray-100 mt-3 mb-1">{children}</h3>;
  },
  blockquote({ children }: { children?: React.ReactNode }) {
    return <blockquote className="border-l-3 border-primary-500 pl-3 my-2 text-gray-300 italic">{children}</blockquote>;
  },
  hr() {
    return <hr className="border-gray-700 my-3" />;
  },
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300 underline underline-offset-2">{children}</a>;
  },
  strong({ children }: { children?: React.ReactNode }) {
    return <strong className="font-semibold text-gray-100">{children}</strong>;
  },
  /* Intercept tables: if file-like, render as FileListBlock */
  table({ children }: { children?: React.ReactNode }) {
    try {
      const kids = Array.isArray(children) ? children : [children];
      const thead = kids.find((c: unknown) => { const el = c as ReactElementLike; return el?.type === 'thead' || el?.props?.node?.tagName === 'thead'; }) as ReactElementLike | undefined;
      const tbody = kids.find((c: unknown) => { const el = c as ReactElementLike; return el?.type === 'tbody' || el?.props?.node?.tagName === 'tbody'; }) as ReactElementLike | undefined;
      if (!thead || !tbody) throw 0;

      // Extract header texts
      const headRow = thead.props?.children;
      const headCells: string[] = [];
      const walkCells = (node: unknown) => {
        if (!node) return;
        const arr = Array.isArray(node) ? node : [node];
        for (const c of arr) {
          const el = c as ReactElementLike;
          if (el?.props?.node?.tagName === 'th' || el?.type === 'th') {
            headCells.push(extractTextContent(el.props?.children));
          } else if (el?.props?.children) {
            walkCells(el.props.children);
          }
        }
      };
      walkCells(headRow);

      if (!isFileTable(headCells)) throw 0;

      // Extract body rows
      const bodyRows: string[][] = [];
      const walkBody = (node: unknown) => {
        if (!node) return;
        const arr = Array.isArray(node) ? node : [node];
        for (const c of arr) {
          const el = c as ReactElementLike;
          if (el?.props?.node?.tagName === 'tr' || el?.type === 'tr') {
            const cells: string[] = [];
            const walkTd = (td: unknown) => {
              if (!td) return;
              const tds = Array.isArray(td) ? td : [td];
              for (const t of tds) {
                const tdEl = t as ReactElementLike;
                if (tdEl?.props?.node?.tagName === 'td' || tdEl?.type === 'td') {
                  cells.push(extractTextContent(tdEl.props?.children));
                } else if (tdEl?.props?.children) {
                  walkTd(tdEl.props.children);
                }
              }
            };
            walkTd(el.props?.children);
            if (cells.length) bodyRows.push(cells);
          } else if (el?.props?.children) {
            walkBody(el.props.children);
          }
        }
      };
      walkBody(tbody.props?.children);

      const items = parseFileTableRows(headCells, bodyRows);
      if (items) {
        return <FileListBlock json={JSON.stringify(items)} />;
      }
    } catch { /* fall through to default table */ }

    // Default styled table
    return (
      <div className="my-2 overflow-x-auto rounded-lg border border-gray-700/50">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }: { children?: React.ReactNode }) {
    return <thead className="bg-gray-800/80 text-gray-300 text-xs uppercase tracking-wider">{children}</thead>;
  },
  th({ children }: { children?: React.ReactNode }) {
    return <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{children}</th>;
  },
  tr({ children }: { children?: React.ReactNode }) {
    return <tr className="hover:bg-gray-700/20 transition-colors">{children}</tr>;
  },
  td({ children }: { children?: React.ReactNode }) {
    return <td className="px-3 py-2 text-gray-200 border-t border-gray-700/30">{children}</td>;
  },
};

/* ─── Source files card (file-explorer style) ─── */
export function SourceFiles({ ragContext }: { ragContext: string }) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  let sources: RagSource[] = [];
  try {
    sources = JSON.parse(ragContext);
  } catch {
    return null;
  }
  if (!sources.length) return null;

  return (
    <div className="mt-3 border border-gray-600/50 rounded-xl overflow-hidden bg-gray-800/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-400 hover:bg-gray-700/40 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <FileText className="w-3.5 h-3.5" />
        <span>{t('sourceFiles')} {sources.length}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700/50">
          {sources.map((src, idx) => {
            const ext = src.file_name?.split('.').pop()?.toLowerCase() || '';
            const mime = ext === 'pdf' ? 'application/pdf'
              : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' ? `image/${ext}`
              : 'text/plain';
            const icon = getFileIcon(mime);

            return (
              <div
                key={src.file_id || idx}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-700/30 transition-colors"
              >
                <span className="text-base flex-shrink-0">{icon}</span>
                <span className="text-sm text-gray-200 truncate flex-1">{src.file_name}</span>
                {src.similarity != null && (
                  <span className="text-[10px] text-gray-500 flex-shrink-0 tabular-nums">
                    {(src.similarity * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
