'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useAiProcessingStore } from '@/lib/store';
import { chatApi, filesApi, sharesApi, indexingApi, getFreshToken } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { ChatHeader } from '@/components/chat-header';
import { ContextMenuPortal, type ContextMenuItem } from '@/components/context-menu';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { Send, Bot, User, FileText, ChevronDown, ChevronRight, FolderOpen, Download, Share2, ExternalLink, Calendar, HardDrive, Tag, Folder, X, Clock, Zap, Wrench, ShieldCheck, AlertTriangle, Loader2, Plus, MessageSquare, List, Trash2 as Trash2Icon } from 'lucide-react';
import { MartaniLogo } from '@/components/martani-logo';
import { ToolsBadges } from '@/components/tools-badges';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { getFileIcon, formatBytes, formatDate } from '@/lib/utils';
import { pageActionToolbarRowClass } from '@/lib/page-toolbar';
import { useTranslation } from '@/hooks/use-translation';
import { MessageErrorBoundary } from '@/components/message-error-boundary';
import type { ChatMessage, RagSource, AgentType } from '@/types';

/* ─── File list block (rendered from ```filelist code blocks) ─── */
interface FileListItem {
  id?: string;
  name: string;
  size?: number;
  type?: string | null;
  folder?: string;
  indexed?: boolean;
}

function FileListBlock({ json }: { json: string }) {
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
interface FileInfoData {
  id?: string;
  name: string;
  size?: number;
  type?: string | null;
  folder?: string;
  indexed?: boolean;
  created_at?: string;
  description?: string;
}

function FileInfoCard({ json }: { json: string }) {
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
function ImageBlock({ json }: { json: string }) {
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

function extractTextContent(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractTextContent).join('');
  if (node?.props?.children) return extractTextContent(node.props.children);
  return '';
}

function isFileTable(headerCells: string[]): boolean {
  const lower = headerCells.map(h => h.toLowerCase().trim());
  return lower.some(h => FILE_HEADER_KEYWORDS.some(k => h.includes(k)));
}

function parseFileTableRows(
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

/* ─── Custom ReactMarkdown renderers ─── */
const markdownComponents = {
  code({ className, children, node, ...props }: any) {
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
  pre({ children }: any) {
    return <div className="my-2 overflow-x-auto">{children}</div>;
  },
  p({ children }: any) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }: any) {
    return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
  },
  li({ children }: any) {
    return <li className="text-gray-200">{children}</li>;
  },
  h1({ children }: any) {
    return <h1 className="text-xl font-bold text-gray-100 mt-4 mb-2">{children}</h1>;
  },
  h2({ children }: any) {
    return <h2 className="text-lg font-bold text-gray-100 mt-3 mb-2">{children}</h2>;
  },
  h3({ children }: any) {
    return <h3 className="text-base font-semibold text-gray-100 mt-3 mb-1">{children}</h3>;
  },
  blockquote({ children }: any) {
    return <blockquote className="border-l-3 border-primary-500 pl-3 my-2 text-gray-300 italic">{children}</blockquote>;
  },
  hr() {
    return <hr className="border-gray-700 my-3" />;
  },
  a({ href, children }: any) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300 underline underline-offset-2">{children}</a>;
  },
  strong({ children }: any) {
    return <strong className="font-semibold text-gray-100">{children}</strong>;
  },
  /* Intercept tables: if file-like, render as FileListBlock */
  table({ children }: any) {
    try {
      const kids = Array.isArray(children) ? children : [children];
      const thead = kids.find((c: any) => c?.type === 'thead' || c?.props?.node?.tagName === 'thead');
      const tbody = kids.find((c: any) => c?.type === 'tbody' || c?.props?.node?.tagName === 'tbody');
      if (!thead || !tbody) throw 0;

      // Extract header texts
      const headRow = thead.props?.children;
      const headCells: string[] = [];
      const walkCells = (node: any) => {
        if (!node) return;
        const arr = Array.isArray(node) ? node : [node];
        for (const c of arr) {
          if (c?.props?.node?.tagName === 'th' || c?.type === 'th') {
            headCells.push(extractTextContent(c.props?.children));
          } else if (c?.props?.children) {
            walkCells(c.props.children);
          }
        }
      };
      walkCells(headRow);

      if (!isFileTable(headCells)) throw 0;

      // Extract body rows
      const bodyRows: string[][] = [];
      const walkBody = (node: any) => {
        if (!node) return;
        const arr = Array.isArray(node) ? node : [node];
        for (const c of arr) {
          if (c?.props?.node?.tagName === 'tr' || c?.type === 'tr') {
            const cells: string[] = [];
            const walkTd = (td: any) => {
              if (!td) return;
              const tds = Array.isArray(td) ? td : [td];
              for (const t of tds) {
                if (t?.props?.node?.tagName === 'td' || t?.type === 'td') {
                  cells.push(extractTextContent(t.props?.children));
                } else if (t?.props?.children) {
                  walkTd(t.props.children);
                }
              }
            };
            walkTd(c.props?.children);
            if (cells.length) bodyRows.push(cells);
          } else if (c?.props?.children) {
            walkBody(c.props.children);
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
  thead({ children }: any) {
    return <thead className="bg-gray-800/80 text-gray-300 text-xs uppercase tracking-wider">{children}</thead>;
  },
  th({ children }: any) {
    return <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{children}</th>;
  },
  tr({ children }: any) {
    return <tr className="hover:bg-gray-700/20 transition-colors">{children}</tr>;
  },
  td({ children }: any) {
    return <td className="px-3 py-2 text-gray-200 border-t border-gray-700/30">{children}</td>;
  },
};

/* ─── WebSocket URL helper ─── */
function getWsUrl(sessionId: string, token: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const base = apiUrl ? apiUrl.replace(/^http/, 'ws') : '';
  return `${base}/api/v1/ws/chat/${sessionId}?token=${encodeURIComponent(token)}`;
}

/* ─── Source files card (file-explorer style) ─── */
function SourceFiles({ ragContext }: { ragContext: string }) {
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

function ChatTwinkle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const GAP = 20;
    const MAX_DOTS = 12;
    const DOT_LIFETIME = [1500, 3500];

    interface Dot { x: number; y: number; born: number; life: number; maxR: number }
    let dots: Dot[] = [];

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const spawnDot = () => {
      const cols = Math.floor(canvas.width / GAP);
      const rows = Math.floor(canvas.height / GAP);
      if (cols < 1 || rows < 1) return;
      dots.push({ x: Math.floor(Math.random() * cols) * GAP, y: Math.floor(Math.random() * rows) * GAP, born: performance.now(), life: DOT_LIFETIME[0] + Math.random() * (DOT_LIFETIME[1] - DOT_LIFETIME[0]), maxR: 1.5 + Math.random() * 1.5 });
    };
    for (let i = 0; i < 6; i++) spawnDot();
    const spawnInterval = setInterval(() => { if (dots.length < MAX_DOTS) spawnDot(); }, 400);

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dots = dots.filter((d) => now - d.born < d.life);
      for (const d of dots) {
        const t = (now - d.born) / d.life;
        const alpha = t < 0.3 ? t / 0.3 : (1 - t) / 0.7;
        const r = d.maxR * (0.6 + 0.4 * Math.sin(t * Math.PI));
        ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fillStyle = `rgba(251, 146, 60, ${alpha * 0.8})`; ctx.fill();
        ctx.beginPath(); ctx.arc(d.x, d.y, r * 3, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 3);
        grad.addColorStop(0, `rgba(251, 146, 60, ${alpha * 0.25})`); grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = grad; ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(animId); clearInterval(spawnInterval); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[1]" style={{ width: '100%', height: '100%' }} />;
}

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t } = useTranslation(['chat', 'tools']);
  const { confirm, ConfirmDialog: EmptyConfirmDialog } = useConfirmDialog();

  const selectedSession = searchParams.get('session');
  const agentParam = searchParams.get('agent') as AgentType | null;
  const initialMessage = searchParams.get('q');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [progressTools, setProgressTools] = useState<string[]>([]);
  const [progressTexts, setProgressTexts] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [inputRequest, setInputRequest] = useState<{ prompt: string } | null>(null);
  const [inputResponse, setInputResponse] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendingRef = useRef(false);
  const initialMessageSent = useRef(false);
  const aiProcessing = useAiProcessingStore((s) => s.isProcessing);
  const activeProcessingSession = useAiProcessingStore((s) => s.activeSessionId);
  const setAiProcessing = useAiProcessingStore((s) => s.setProcessing);
  const clearAiProcessing = useAiProcessingStore((s) => s.clearProcessing);
  const reconnectAttempted = useRef(false);

  // File attachment from "AI에게 전달"
  const [attachedFile, setAttachedFile] = useState<{
    id: string; name: string; path: string; type: string; size: number;
  } | null>(null);
  const attachProcessed = useRef(false);

  // Empty state: new chat with category selection + history
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showEmptyHistory, setShowEmptyHistory] = useState(false);
  const [emptyStarting, setEmptyStarting] = useState(false);
  const [emptyLoadingId, setEmptyLoadingId] = useState<string | null>(null);

  const { data: emptyCategories } = useQuery({
    queryKey: ['index-categories'],
    queryFn: indexingApi.listCategories,
    enabled: showNewChatModal,
  });

  const { data: emptyAllSessions } = useQuery({
    queryKey: ['chat-sessions-history', 'file-manager'],
    queryFn: () => chatApi.listSessions(),
    enabled: showEmptyHistory,
  });

  const emptySavedSessions = emptyAllSessions?.filter(
    (s) => s.agent_type === 'file-manager' && ((s.message_count ?? 0) > 0 || (s.file_size ?? 0) > 0)
  )?.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) || [];

  const handleEmptyLoadSession = useCallback(async (sessionId: string) => {
    setEmptyLoadingId(sessionId);
    try {
      await chatApi.loadSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat-session'] });
      router.replace(`/chat?session=${sessionId}`, { scroll: false });
      setShowEmptyHistory(false);
    } catch { /* ignore */ } finally {
      setEmptyLoadingId(null);
    }
  }, [queryClient, router]);

  const handleEmptyDeleteSession = useCallback(async (sessionId: string) => {
    if (!(await confirm('이 대화를 삭제하시겠습니까?'))) return;
    try {
      await chatApi.deleteSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions-history'] });
    } catch { /* ignore */ }
  }, [queryClient, confirm]);

  const handleEmptyNewChat = useCallback(async (categoryId?: string) => {
    setShowNewChatModal(false);
    setEmptyStarting(true);
    try {
      const session = await chatApi.getAgentSession('file-manager');
      if (categoryId) {
        // Create a new session with this category
        const newSession = await chatApi.createSession({ agent_type: 'file-manager', category_id: categoryId });
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['agent-unread'] });
        router.replace(`/chat?session=${newSession.id}`, { scroll: false });
      } else {
        queryClient.invalidateQueries({ queryKey: ['agent-unread'] });
        router.replace(`/chat?session=${session.id}`, { scroll: false });
      }
    } catch {
      setEmptyStarting(false);
    }
  }, [queryClient, router]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Read file attachment from URL params (from "AI에게 전달")
  useEffect(() => {
    if (attachProcessed.current) return;
    const aId = searchParams.get('attach_id');
    const aName = searchParams.get('attach_name');
    const aPath = searchParams.get('attach_path');
    if (aId && aName && aPath) {
      attachProcessed.current = true;
      setAttachedFile({
        id: aId,
        name: aName,
        path: aPath,
        type: searchParams.get('attach_type') || '',
        size: Number(searchParams.get('attach_size') || 0),
      });
    }
  }, [searchParams]);

  // Handle ?agent= parameter: load or create agent session, then redirect to ?session=
  useEffect(() => {
    if (!agentParam || !isAuthenticated) return;

    let cancelled = false;
    setAgentLoading(true);

    chatApi.getAgentSession(agentParam).then((session) => {
      if (cancelled) return;
      chatApi.markAgentRead(agentParam);
      queryClient.invalidateQueries({ queryKey: ['agent-unread'] });
      router.replace(`/chat?session=${session.id}`, { scroll: false });
    }).catch(() => {
      if (!cancelled) router.replace('/chat');
    }).finally(() => {
      if (!cancelled) setAgentLoading(false);
    });

    return () => { cancelled = true; };
  }, [agentParam, isAuthenticated]);

  const { data: messages, refetch: refetchMessages } = useQuery({
    queryKey: ['chat-messages', selectedSession],
    queryFn: () => (selectedSession ? chatApi.getMessages(selectedSession) : Promise.resolve([])),
    enabled: !!selectedSession,
  });

  const { data: sessionData } = useQuery({
    queryKey: ['chat-session', selectedSession],
    queryFn: () => (selectedSession ? chatApi.getSession(selectedSession) : Promise.resolve(null)),
    enabled: !!selectedSession,
  });

  // Cleanup WebSocket on unmount or session change
  useEffect(() => {
    reconnectAttempted.current = false;
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedSession]);

  // Reconnect to active Celery task when returning to a processing session
  useEffect(() => {
    if (!selectedSession || !aiProcessing || sendingRef.current || reconnectAttempted.current) return;
    if (activeProcessingSession !== selectedSession) return;
    if (wsRef.current) return;
    reconnectAttempted.current = true;

    let cancelled = false;

    (async () => {
      const wsToken = await getFreshToken();
      if (!wsToken || cancelled) return;

      sendingRef.current = true;
      setSending(true);
      setProgressTools([]);
      setProgressTexts([]);
      setStreamingText('');

      const ws = new WebSocket(getWsUrl(selectedSession, wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'reconnect' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'task_started':
              break;
            case 'progress_replay': {
              const replayTools = (data.tools || []).map((name: string) => {
                const fnResolved = t(`fn.${name}`);
                return (fnResolved && fnResolved !== `fn.${name}`) ? fnResolved : name;
              });
              setProgressTools(replayTools);
              if (data.last_text) {
                setStreamingText(data.last_text);
              }
              break;
            }
            case 'token': {
              const tokenContent = data.content ?? '';
              if (tokenContent) setStreamingText(prev => prev + tokenContent);
              break;
            }
            case 'tool_call': {
              setStreamingText(prev => {
                if (prev.trim()) setProgressTexts(texts => [...texts, prev.trim()]);
                return '';
              });
              const fnResolved = data.name ? t(`fn.${data.name}`) : '';
              const toolLabel = (fnResolved && fnResolved !== `fn.${data.name}`) ? fnResolved : (data.display_name || data.name || t('tool'));
              setProgressTools(tools => [...tools, toolLabel]);
              break;
            }
            case 'done': {
              setStreamingText(prev => {
                if (prev.trim()) setProgressTexts(texts => [...texts, prev.trim()]);
                return '';
              });
              setInputRequest(null);
              sendingRef.current = false;
              setSending(false);
              clearAiProcessing();
              refetchMessages().then(() => {
                setProgressTools([]);
                setProgressTexts([]);
              });
              queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
              queryClient.invalidateQueries({ queryKey: ['files'] });
              queryClient.invalidateQueries({ queryKey: ['notes'] });
              queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
              ws.close();
              wsRef.current = null;
              break;
            }
            case 'error': {
              setProgressTools([]);
              setProgressTexts([]);
              setStreamingText('');
              setInputRequest(null);
              clearAiProcessing();
              if (data.message) {
                const errorMsg: ChatMessage = {
                  id: `error-${Date.now()}`,
                  session_id: selectedSession,
                  role: 'assistant',
                  content: `**${t('error')}:** ${data.message}`,
                  created_at: new Date().toISOString(),
                };
                queryClient.setQueryData<ChatMessage[]>(
                  ['chat-messages', selectedSession],
                  (old) => [...(old || []), errorMsg]
                );
              }
              sendingRef.current = false;
              setSending(false);
              ws.close();
              wsRef.current = null;
              break;
            }
          }
        } catch (e) {
          console.warn('WS reconnect parse error:', e);
        }
      };

      ws.onerror = () => {
        sendingRef.current = false;
        setSending(false);
        clearAiProcessing();
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          sendingRef.current = false;
          setSending(false);
          clearAiProcessing();
          setProgressTools([]);
          setProgressTexts([]);
          setStreamingText('');
          wsRef.current = null;
          refetchMessages();
        }
      };
    })();

    return () => { cancelled = true; };
  }, [selectedSession, aiProcessing, activeProcessingSession]);

  const doSend = useCallback(async (sessionId: string, content: string) => {
    if (!sessionId || sendingRef.current) return;
    const wsToken = await getFreshToken();
    if (!wsToken) return;

    sendingRef.current = true;
    setSending(true);
    setProgressTools([]);
    setProgressTexts([]);
    setStreamingText('');

    // Add user message optimistically
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    queryClient.setQueryData<ChatMessage[]>(
      ['chat-messages', sessionId],
      (old) => [...(old || []), tempUserMessage]
    );

    try {
      const ws = new WebSocket(getWsUrl(sessionId, wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'message', content }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'task_started':
              // Celery task dispatched — set global indicator
              if (data.message_id) {
                setAiProcessing(sessionId, data.message_id);
              }
              break;
            case 'progress_replay': {
              const replayTools = (data.tools || []).map((name: string) => {
                const fnResolved = t(`fn.${name}`);
                return (fnResolved && fnResolved !== `fn.${name}`) ? fnResolved : name;
              });
              setProgressTools(replayTools);
              if (data.last_text) {
                setStreamingText(data.last_text);
              }
              break;
            }
            case 'token': {
              const tokenContent = data.content ?? '';
              if (tokenContent) {
                setStreamingText(prev => prev + tokenContent);
              }
              break;
            }
            case 'tool_call': {
              // Flush current streaming text as a progress text
              setStreamingText(prev => {
                if (prev.trim()) {
                  setProgressTexts(texts => [...texts, prev.trim()]);
                }
                return '';
              });
              const fnResolved = data.name ? t(`fn.${data.name}`) : '';
              const toolLabel = (fnResolved && fnResolved !== `fn.${data.name}`) ? fnResolved : (data.display_name || data.name || t('tool'));
              setProgressTools(tools => [...tools, toolLabel]);
              break;
            }
            case 'tool_result':
              break;
            case 'input_request':
              setInputRequest({ prompt: data.prompt });
              setInputResponse('');
              break;
            case 'done': {
              // Flush remaining streaming text
              setStreamingText(prev => {
                if (prev.trim()) {
                  setProgressTexts(texts => [...texts, prev.trim()]);
                }
                return '';
              });
              setInputRequest(null);
              sendingRef.current = false;
              setSending(false);
              clearAiProcessing();
              // Refetch from DB, then clear progress (smooth transition)
              refetchMessages().then(() => {
                setProgressTools([]);
                setProgressTexts([]);
              });
              queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
              queryClient.invalidateQueries({ queryKey: ['files'] });
              queryClient.invalidateQueries({ queryKey: ['notes'] });
              queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
              ws.close();
              wsRef.current = null;
              break;
            }
            case 'error': {
              setProgressTools([]);
              setProgressTexts([]);
              setStreamingText('');
              setInputRequest(null);
              clearAiProcessing();
              // Show error as temporary assistant message
              if (data.message) {
                const errorMsg: ChatMessage = {
                  id: `error-${Date.now()}`,
                  session_id: sessionId,
                  role: 'assistant',
                  content: `**${t('error')}:** ${data.message}`,
                  created_at: new Date().toISOString(),
                };
                queryClient.setQueryData<ChatMessage[]>(
                  ['chat-messages', sessionId],
                  (old) => [...(old || []), errorMsg]
                );
              }
              sendingRef.current = false;
              setSending(false);
              ws.close();
              wsRef.current = null;
              break;
            }
          }
        } catch (e) {
          console.warn('WS message parse error:', e);
        }
      };

      ws.onerror = () => {
        // Fallback to HTTP — keep loading state
        setProgressTools([]); setProgressTexts([]);
        setStreamingText('');
        wsRef.current = null;
        chatApi.sendMessage(sessionId, content).then(() => {
          refetchMessages();
          queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
          queryClient.invalidateQueries({ queryKey: ['files'] });
          queryClient.invalidateQueries({ queryKey: ['notes'] });
        }).finally(() => {
          sendingRef.current = false;
          setSending(false);
          setProgressTools([]); setProgressTexts([]);
          setStreamingText('');
        });
      };

      ws.onclose = () => {
        // Unexpected close (not from done/error handlers which set wsRef to null)
        if (wsRef.current === ws) {
          sendingRef.current = false;
          setSending(false);
          clearAiProcessing();
          setProgressTools([]); setProgressTexts([]);
          setStreamingText('');
          wsRef.current = null;
          // Refetch messages — celery task may have completed and saved to DB
          refetchMessages();
        }
      };
    } catch {
      // Fallback to HTTP
      chatApi.sendMessage(sessionId, content).then(() => {
        refetchMessages();
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      }).finally(() => {
        sendingRef.current = false;
        setSending(false);
        setProgressTools([]); setProgressTexts([]);
        setStreamingText('');
      });
    }
  }, [queryClient, refetchMessages]);

  // Auto-send initial message from dashboard
  useEffect(() => {
    if (initialMessage && selectedSession && !initialMessageSent.current && !sending) {
      initialMessageSent.current = true;
      router.replace(`/chat?session=${selectedSession}`, { scroll: false });
      doSend(selectedSession, initialMessage);
    }
  }, [initialMessage, selectedSession]);

  // Clear search and progress items when session changes
  useEffect(() => {
    setSearchTerm('');
    setProgressTools([]); setProgressTexts([]);
    setStreamingText('');
  }, [selectedSession]);

  // Scroll to bottom on new messages or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, progressTools, progressTexts]);

  // Restore focus when sending finishes
  const prevSendingRef = useRef(false);
  useEffect(() => {
    if (prevSendingRef.current && !sending) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    prevSendingRef.current = sending;
  }, [sending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || sending) return;

    // Build content: prepend file attachment info if present
    let content = message.trim();
    if (attachedFile) {
      const fileTag = `[${t('attachment')}: ${attachedFile.path}]`;
      content = content ? `${fileTag}\n${content}` : `${fileTag}\n${t('analyzeFile')}`;
      setAttachedFile(null);
    }
    if (!content) return;

    setMessage('');
    doSend(selectedSession, content);
  };

  if (authLoading || agentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 flex flex-col min-h-0 p-4 md:p-8">
        <div className="max-w-[96rem] mx-auto w-full flex flex-col flex-1 min-h-0">
        {selectedSession ? (
          <>
            {/* Header */}
            <ChatHeader
              agentType={sessionData?.agent_type}
              sessionId={selectedSession}
              messages={messages || []}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
            />

            {/* Chat card */}
            <div className="flex-1 flex flex-col bg-gray-800 rounded-xl border border-gray-700 overflow-hidden min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 md:px-6 py-6 space-y-1">
                {messages?.map((msg) => {
                  const matchesSearch = !searchTerm || (msg.content || '').toLowerCase().includes(searchTerm.toLowerCase());
                  const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 py-4 transition-opacity ${msg.role === 'user' ? 'bg-gray-900/40 -mx-4 px-4 rounded-lg' : ''} ${searchTerm && !matchesSearch ? 'opacity-20' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-gray-400" />
                      ) : (
                        <MartaniLogo size={18} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-400">
                          {msg.role === 'user' ? 'You' : 'MARTANI'}
                        </span>
                        {msg.source && msg.source !== 'chat' && (
                          <>
                            {msg.source === 'schedule' ? (
                              <Clock className="w-3 h-3 text-primary-400" />
                            ) : (
                              <Zap className="w-3 h-3 text-yellow-400" />
                            )}
                            <span className={`text-[11px] ${msg.source === 'schedule' ? 'text-primary-400' : 'text-yellow-400'}`}>
                              {msg.source === 'schedule' ? t('autoSchedule') : t('autoReact')}
                            </span>
                          </>
                        )}
                        {timeStr && (
                          <span className="text-[11px] text-gray-500">{timeStr}</span>
                        )}
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none overflow-hidden break-words text-gray-100">
                        <MessageErrorBoundary content={msg.content || ''}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content || ''}</ReactMarkdown>
                        </MessageErrorBoundary>
                      </div>
                      {/* Source files from RAG */}
                      {msg.role === 'assistant' && msg.rag_context && (
                        <SourceFiles ragContext={msg.rag_context} />
                      )}
                    </div>
                  </div>
                  );
                })}
                {/* Progress: unified Thinking container */}
                {(progressTools.length > 0 || progressTexts.length > 0 || streamingText) && (
                  <div className="flex gap-3 py-4">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MartaniLogo size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-400">MARTANI</span>
                      </div>
                      <div className="space-y-1.5 overflow-hidden">
                        {/* Tool chain: single scrollable row */}
                        {progressTools.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-400 overflow-hidden">
                            <Wrench className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                              {progressTools.map((tool, idx) => (
                                <span key={idx} className="inline-flex items-center whitespace-nowrap">
                                  {idx > 0 && <span className="text-gray-600 mx-0.5">›</span>}
                                  {tool}
                                </span>
                              ))}
                            </div>
                            {/* Bouncing dots (waiting for next tool) */}
                            {sending && !streamingText && (
                              <span className="flex gap-0.5 items-center flex-shrink-0 ml-1">
                                <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                            )}
                          </div>
                        )}

                        {/* Status text: show only the last progressText or current streamingText */}
                        {(progressTexts.length > 0 || streamingText) && (
                          <div className="text-sm text-gray-300/80 pl-5 ml-0.5 border-l-2 border-gray-500/40 min-w-0">
                            <div className="pl-3 prose prose-sm prose-invert max-w-none overflow-hidden break-words">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {streamingText || progressTexts[progressTexts.length - 1]}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Typing indicator — only when no tool chain is showing */}
                {sending && progressTools.length === 0 && !streamingText && (
                  <div className="flex gap-3 py-4">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MartaniLogo size={18} />
                    </div>
                    <div className="pt-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* MFA / OTP Input Request */}
                {inputRequest && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 max-w-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-yellow-400" />
                      <p className="text-sm text-yellow-200">{inputRequest.prompt}</p>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = inputResponse.trim();
                        if (!val || !wsRef.current) return;
                        wsRef.current.send(JSON.stringify({ type: 'input_response', content: val }));
                        setInputRequest(null);
                        setInputResponse('');
                        setProgressTools(tools => [...tools, t('verifyingCode')]);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={inputResponse}
                        onChange={(e) => setInputResponse(e.target.value)}
                        placeholder={t('enterCode')}
                        className="flex-1 px-3 py-2 text-sm border border-yellow-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-500/50 bg-gray-800 text-white placeholder-gray-500"
                      />
                      <button
                        type="submit"
                        disabled={!inputResponse.trim()}
                        className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('send')}
                      </button>
                    </form>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-gray-700 px-4 py-3 flex-shrink-0">
              {sessionData?.category_id && !sessionData?.category_name ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl text-yellow-400 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  대화에 필요한 카테고리가 삭제되었습니다.
                </div>
              ) : (
              <div>
                {/* Attached file chip */}
                {attachedFile && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 border border-primary-500/30 rounded-lg">
                      <FileText className="w-4 h-4 text-primary-400" />
                      <span className="text-sm text-primary-300 font-medium truncate max-w-[300px]">{attachedFile.path}</span>
                      <button
                        onClick={() => setAttachedFile(null)}
                        className="p-0.5 text-primary-400/60 hover:text-primary-300 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-end gap-2 bg-gray-900/50 border border-gray-700 rounded-2xl p-2">
                  <textarea
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                    }}
                    placeholder={attachedFile ? t('placeholderFile') : t('placeholder')}
                    rows={1}
                    className="flex-1 px-3 py-2 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none max-h-40 overflow-y-auto"
                    style={{ minHeight: '40px' }}
                    autoFocus={!!attachedFile}
                  />
                  <button
                    type="submit"
                    disabled={(!message.trim() && !attachedFile) || sending}
                    className="p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
              )}
            </div>
            </div>
          </>
        ) : (
          /* Empty state — header + toolbar + dark card */
          <>
            {/* Page header — same as ChatHeader */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <MessageSquare className="w-8 h-8 text-primary-400" />
              <h1 className="text-2xl font-bold text-gray-100">메신저</h1>
            </div>

            {/* Toolbar */}
            <div className={pageActionToolbarRowClass}>
              <button
                onClick={() => setShowNewChatModal(true)}
                disabled={emptyStarting}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium shadow-sm"
              >
                {emptyStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                새 대화
              </button>
              <button
                onClick={() => setShowEmptyHistory(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-sm font-medium"
              >
                <List className="w-4 h-4" />
                대화 목록
              </button>
            </div>

            {/* Dark card */}
            <div className="flex-1 flex flex-col bg-gray-950 rounded-xl border border-gray-700 overflow-hidden relative min-h-0">
              <ChatTwinkle />
              <div className="flex-1 flex items-center justify-center relative z-10">
                <div className="text-center space-y-5 max-w-md w-full px-4">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto">
                    <MartaniLogo size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-200">마티니와 대화를 시작하세요</h3>
                    <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">전체 파일들 또는 사용자가 카테고리로 분류된 파일들을<br />참조하여 답변합니다.</p>
                  </div>
                  <button
                    onClick={() => setShowNewChatModal(true)}
                    disabled={emptyStarting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-500/20"
                  >
                    {emptyStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    새 대화 시작하기
                  </button>
                </div>
              </div>
            </div>

            {/* Category selection modal */}
            {showNewChatModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-sm w-full mx-4 shadow-2xl">
                  <h3 className="text-lg font-semibold text-gray-100 mb-1">새 대화 시작</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    {emptyCategories && emptyCategories.length > 0
                      ? '카테고리를 선택하면 해당 파일들로 검색 범위가 제한됩니다.'
                      : '마티니와 새 대화를 시작합니다.'}
                  </p>

                  <div className="space-y-1.5 mb-4 max-h-[240px] overflow-y-auto">
                    <button
                      onClick={() => handleEmptyNewChat()}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-200">전체 (카테고리 없음)</span>
                    </button>
                    {emptyCategories?.map((cat) => {
                      const colorMap: Record<string, string> = { blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500', orange: 'bg-orange-500', pink: 'bg-pink-500', gray: 'bg-gray-500' };
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleEmptyNewChat(cat.id)}
                          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 transition-colors"
                        >
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colorMap[cat.color] || 'bg-blue-500'}`} />
                          <span className="text-gray-200 flex-1">{cat.name}</span>
                          <span className="text-xs text-gray-500">{cat.file_count}개 파일</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowNewChatModal(false)}
                      className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* History modal */}
            {showEmptyHistory && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-100">대화 목록</h3>
                    <button onClick={() => setShowEmptyHistory(false)} className="p-1 text-gray-400 hover:text-gray-200">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {emptySavedSessions.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">저장된 대화가 없습니다</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                      {emptySavedSessions.map((s) => {
                        const colorMap: Record<string, string> = { blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500', orange: 'bg-orange-500', pink: 'bg-pink-500', gray: 'bg-gray-500' };
                        return (
                          <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 hover:bg-gray-700 transition-colors group">
                            <button
                              onClick={() => handleEmptyLoadSession(s.id)}
                              disabled={emptyLoadingId === s.id}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="flex items-center gap-2">
                                {s.category_name && (
                                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorMap[s.category_name] || 'bg-blue-500'}`} />
                                )}
                                <span className="text-sm text-gray-200 truncate">
                                  {emptyLoadingId === s.id ? (
                                    <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />불러오는 중...</span>
                                  ) : (
                                    s.title || '제목 없음'
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-gray-500">{new Date(s.updated_at).toLocaleDateString('ko-KR')}</span>
                                {s.category_name && <span className="text-xs text-gray-500">{s.category_name}</span>}
                              </div>
                            </button>
                            <button
                              onClick={() => handleEmptyDeleteSession(s.id)}
                              className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                              title="삭제"
                            >
                              <Trash2Icon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </main>
      {EmptyConfirmDialog}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
