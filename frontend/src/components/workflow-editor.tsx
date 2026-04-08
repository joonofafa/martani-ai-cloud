'use client';

import { useState, useCallback, useRef, useMemo, useEffect, DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
  MarkerType,
  ReactFlowInstance,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { miningApi, refineryApi, bridgeApi, pipelineApi } from '@/lib/api';
import { pageActionToolbarRowClass } from '@/lib/page-toolbar';
import {
  Search, Factory, Cable, Play, Loader2, CheckCircle2, AlertCircle,
  X, Plus, Globe, Mail, FolderOutput, Trash2, Pencil, RefreshCw, Save,
  GripVertical, List, Workflow, ChevronRight, FileText, Sparkles,
} from 'lucide-react';
import type { PipelineItem } from '@/types';

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

type NodeStatus = 'idle' | 'running' | 'done' | 'error';

interface CollectData {
  label: string;
  urls: { url: string; engine: string }[];
  prompt: string;
  status: NodeStatus;
  taskId: string | null;
  resultCount: number;
  errorMsg: string | null;
  [key: string]: unknown;
}

interface RefineData {
  label: string;
  prompt: string;
  outputFormat: string;
  filterRules: { include_keywords?: string[]; exclude_keywords?: string[]; dedup?: boolean };
  status: NodeStatus;
  ruleId: string | null;
  resultCount: number;
  errorMsg: string | null;
  [key: string]: unknown;
}

interface DeliverData {
  label: string;
  name: string;
  destType: string;
  webhookUrl: string;
  emailTo: string;
  emailSubject: string;
  autoTrigger: boolean;
  status: NodeStatus;
  configId: string | null;
  delivered: boolean;
  errorMsg: string | null;
  [key: string]: unknown;
}

type WorkflowNodeData = CollectData | RefineData | DeliverData;

const ENGINE_OPTIONS = [
  { key: 'crawl4ai', label: 'Crawl4AI', icon: Search },
  { key: 'scrapling', label: 'Scrapling', icon: Globe },
  { key: 'scrapling_stealth', label: 'Stealth', icon: Workflow },
] as const;

const PALETTE_ITEMS = [
  { type: 'collect', label: '수집', icon: Search, color: 'teal' },
  { type: 'refine', label: '정제', icon: Factory, color: 'orange' },
  { type: 'deliver', label: '전달', icon: Cable, color: 'blue' },
] as const;

const WORKFLOW_TEMPLATES = [
  {
    id: 'news-daily',
    name: '뉴스 헤드라인 요약',
    level: '기본',
    description: '뉴스 목록 페이지에서 헤드라인/링크/점수를 수집해 텍스트 요약으로 정리',
    collect: {
      url: 'https://news.ycombinator.com/',
      engine: 'crawl4ai',
      prompt: '헤드라인 기사 목록에서 제목, 링크, 점수(있다면), 게시 시간을 수집하고 최신순으로 정리해 주세요.',
    },
    refine: {
      prompt: '중복 기사 링크를 제거하고, 핵심 이슈를 한국어로 1~2문장씩 요약해 주세요.',
      outputFormat: 'summary',
      filterRules: { dedup: true },
    },
    deliver: { name: '일일 뉴스 요약 전달', destType: 'cloud_folder', autoTrigger: true },
  },
  {
    id: 'shopping-monitor',
    name: '쇼핑 상품 모니터링',
    level: '중급',
    description: '상품 목록 페이지에서 가격/재고를 구조화(CSV)해 비교 가능한 형태로 저장',
    collect: {
      url: 'https://books.toscrape.com/',
      engine: 'scrapling',
      prompt: '상품 목록에서 상품명, 가격, 재고 상태, 평점, 상품 상세 링크를 수집해 주세요.',
    },
    refine: {
      prompt: '가격 형식을 숫자로 정규화하고, 상품명 중복을 제거한 후 가격 오름차순으로 정리해 주세요.',
      outputFormat: 'csv',
      filterRules: { dedup: true },
    },
    deliver: { name: '상품 가격 모니터링 전달', destType: 'cloud_folder', autoTrigger: true },
  },
  {
    id: 'hn-multipage',
    name: '다중 페이지 트렌드 수집',
    level: '고급',
    description: 'URL 패턴([1-3])을 사용해 여러 페이지를 한 번에 수집한 뒤 트렌드를 추출',
    collect: {
      url: 'https://news.ycombinator.com/news?p=[1-3]',
      engine: 'scrapling_stealth',
      prompt: '여러 페이지에서 반복적으로 등장하는 기술 키워드, 제목, 링크를 수집해 주세요.',
    },
    refine: {
      prompt: '키워드 빈도를 계산해 상위 트렌드 10개를 만들고, 대표 기사 링크를 1개씩 연결해 주세요.',
      outputFormat: 'json',
      filterRules: { include_keywords: ['AI', 'OpenAI', 'model'], dedup: true },
    },
    deliver: { name: '트렌드 분석 전달', destType: 'cloud_folder', autoTrigger: true },
  },
  {
    id: 'dev-blog-watch',
    name: '개발 블로그 릴리즈 추적',
    level: '고급',
    description: '공식 블로그 글을 수집하고 버전/기능 변경점을 텍스트 브리핑으로 생성',
    collect: {
      url: 'https://huggingface.co/blog',
      engine: 'crawl4ai',
      prompt: '블로그 글 목록에서 제목, 발행일, 요약, 링크를 수집해 주세요.',
    },
    refine: {
      prompt: '업데이트 성격(모델/인프라/정책)으로 분류하고 팀 공유용 브리핑 형태로 정리해 주세요.',
      outputFormat: 'summary',
      filterRules: { exclude_keywords: ['jobs'], dedup: true },
    },
    deliver: { name: '개발 릴리즈 브리핑 전달', destType: 'cloud_folder', autoTrigger: true },
  },
  {
    id: 'collect-fanout-analysis',
    name: '합류 검증 템플릿',
    level: '고급',
    description: '수집 2개를 정제 1개로 합류시켜 구조 개선(다중 입력) 동작을 검증',
    collect: {
      url: 'https://news.ycombinator.com/',
      engine: 'crawl4ai',
      prompt: '기술 뉴스 제목, 링크, 점수를 수집해 주세요.',
    },
    refine: {
      prompt: '중복 링크를 제거하고 핵심 키워드 중심으로 요약해 주세요.',
      outputFormat: 'summary',
      filterRules: { dedup: true },
    },
    deliver: { name: '합류 분석 결과 전달', destType: 'cloud_folder', autoTrigger: true },
    graph: {
      nodes: [
        { id: 'c1', type: 'collect', position: { x: 80, y: 110 }, data: { label: '수집-뉴스A', urls: [{ url: 'https://news.ycombinator.com/news?p=[1-2]', engine: 'scrapling_stealth' }], prompt: '기술 뉴스 제목, 링크, 점수, 댓글 수를 수집해 주세요.' } },
        { id: 'c2', type: 'collect', position: { x: 80, y: 340 }, data: { label: '수집-뉴스B', urls: [{ url: 'https://news.ycombinator.com/newest', engine: 'crawl4ai' }], prompt: '최신 뉴스 목록에서 제목, 링크, 게시 시간을 수집해 주세요.' } },
        { id: 'r1', type: 'refine', position: { x: 430, y: 225 }, data: { label: '정제-합류분석', prompt: '두 수집원 데이터를 합쳐 중복 링크를 제거하고 핵심 이슈 10개를 JSON으로 정리해 주세요.', outputFormat: 'json', filterRules: { include_keywords: ['AI', 'security', 'open source'], dedup: true } } },
        { id: 'd1', type: 'deliver', position: { x: 780, y: 225 }, data: { label: '전달-통합결과', name: '합류 분석 결과 전달', destType: 'cloud_folder', autoTrigger: true } },
      ],
      edges: [
        { source: 'c1', target: 'r1' },
        { source: 'c2', target: 'r1' },
        { source: 'r1', target: 'd1' },
      ],
    },
  },
  {
    id: 'dual-collect-triple-refine',
    name: '듀얼 수집 트리플 정제',
    level: '고급',
    description: '2개 수집원에서 들어온 데이터를 3개 정제 노드로 분기해 용도별 결과를 생성',
    collect: {
      url: 'https://huggingface.co/blog',
      engine: 'crawl4ai',
      prompt: '보안/릴리즈 관련 공지의 제목, 날짜, 링크를 수집해 주세요.',
    },
    refine: {
      prompt: '취약점/패치/정책 변경으로 분류하고 우선순위를 요약해 주세요.',
      outputFormat: 'json',
      filterRules: { dedup: true },
    },
    deliver: { name: '보안 동향 브리핑 전달', destType: 'cloud_folder', autoTrigger: true },
    graph: {
      nodes: [
        { id: 'c1', type: 'collect', position: { x: 60, y: 70 }, data: { label: '수집-보안공지', urls: [{ url: 'https://huggingface.co/blog', engine: 'crawl4ai' }], prompt: '보안/릴리즈 관련 공지의 제목, 날짜, 링크를 수집해 주세요.' } },
        { id: 'c2', type: 'collect', position: { x: 60, y: 350 }, data: { label: '수집-기술뉴스', urls: [{ url: 'https://news.ycombinator.com/newest', engine: 'scrapling_stealth' }], prompt: '보안 키워드가 포함된 최신 글의 제목, 링크, 점수를 수집해 주세요.' } },
        { id: 'r1', type: 'refine', position: { x: 370, y: 40 }, data: { label: '정제-공지분류', prompt: '공지 항목을 패치/취약점/정책 변경으로 분류하고 우선순위를 표기해 JSON으로 반환하세요.', outputFormat: 'json', filterRules: { include_keywords: ['security', 'patch', 'vulnerability'], dedup: true } } },
        { id: 'r2', type: 'refine', position: { x: 370, y: 220 }, data: { label: '정제-브리핑', prompt: '수집된 항목을 팀 브리핑 TEXT 형식으로 요약하고 액션 아이템을 3개 제시하세요.', outputFormat: 'summary', filterRules: { dedup: true } } },
        { id: 'r3', type: 'refine', position: { x: 370, y: 400 }, data: { label: '정제-모니터링CSV', prompt: '제목, 링크, 날짜, 중요도를 CSV 컬럼 구조로 정리해 주세요.', outputFormat: 'csv', filterRules: { dedup: true } } },
        { id: 'd1', type: 'deliver', position: { x: 710, y: 40 }, data: { label: '전달-구조화', name: '보안 구조화 데이터 전달', destType: 'cloud_folder', autoTrigger: true } },
        { id: 'd2', type: 'deliver', position: { x: 710, y: 220 }, data: { label: '전달-브리핑', name: '보안 브리핑 전달', destType: 'cloud_folder', autoTrigger: true } },
        { id: 'd3', type: 'deliver', position: { x: 710, y: 400 }, data: { label: '전달-모니터링', name: '보안 모니터링 CSV 전달', destType: 'cloud_folder', autoTrigger: true } },
      ],
      edges: [
        { source: 'c1', target: 'r1' },
        { source: 'c2', target: 'r2' },
        { source: 'c2', target: 'r3' },
        { source: 'r1', target: 'd1' },
        { source: 'r2', target: 'd2' },
        { source: 'r3', target: 'd3' },
      ],
    },
  },
];

function makeDefaultData(type: string): WorkflowNodeData {
  if (type === 'collect') {
    return { label: '수집', urls: [{ url: '', engine: 'crawl4ai' }], prompt: '', status: 'idle', taskId: null, resultCount: 0, errorMsg: null } satisfies CollectData;
  }
  if (type === 'refine') {
    return { label: '정제', prompt: '', outputFormat: 'json', filterRules: {}, status: 'idle', ruleId: null, resultCount: 0, errorMsg: null } satisfies RefineData;
  }
  return { label: '전달', name: '', destType: 'webhook', webhookUrl: '', emailTo: '', emailSubject: '', autoTrigger: false, status: 'idle', configId: null, delivered: false, errorMsg: null } satisfies DeliverData;
}

function makeNewWorkflowNodes(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      { id: 'n1', type: 'collect', position: { x: 80, y: 200 }, data: makeDefaultData('collect') },
      { id: 'n2', type: 'refine', position: { x: 420, y: 200 }, data: makeDefaultData('refine') },
      { id: 'n3', type: 'deliver', position: { x: 760, y: 200 }, data: makeDefaultData('deliver') },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }, style: { stroke: '#6b7280', strokeWidth: 2 }, animated: false },
      { id: 'e2-3', source: 'n2', target: 'n3', markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }, style: { stroke: '#6b7280', strokeWidth: 2 }, animated: false },
    ],
  };
}

/** API / DB용 — React Flow 노드·엣지를 JSON 직렬화 가능한 형태로 */
function serializeWorkflowForApi(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
      ...(typeof n.width === 'number' && { width: n.width }),
      ...(typeof n.height === 'number' && { height: n.height }),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle != null ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle != null ? { targetHandle: e.targetHandle } : {}),
      markerEnd: e.markerEnd ?? { type: MarkerType.ArrowClosed, color: '#6b7280' },
      style: e.style ?? { stroke: '#6b7280', strokeWidth: 2 },
      animated: e.animated ?? false,
    })),
  };
}

/** 서버에 저장된 workflow_data → React Flow 상태 */
function parseWorkflowFromApi(raw: { nodes: unknown[]; edges: unknown[] } | null | undefined): { nodes: Node[]; edges: Edge[] } | null {
  if (!raw?.nodes || !Array.isArray(raw.nodes) || raw.nodes.length === 0) return null;
  const nodes = raw.nodes as Node[];
  const edges = (Array.isArray(raw.edges) ? raw.edges : []) as Edge[];
  return {
    nodes: nodes.map((n) => ({
      ...n,
      position:
        n.position && typeof (n.position as { x?: number }).x === 'number'
          ? n.position
          : { x: 0, y: 0 },
    })) as Node[],
    edges: edges.map((e) => ({
      ...e,
      markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed, color: '#6b7280' },
      style: e.style || { stroke: '#6b7280', strokeWidth: 2 },
    })) as Edge[],
  };
}

// ═══════════════════════════════════════════
// Status badge
// ═══════════════════════════════════════════

function StatusBadge({ status }: { status: NodeStatus }) {
  if (status === 'idle') return null;
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
  return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
}

// ═══════════════════════════════════════════
// Custom Nodes
// ═══════════════════════════════════════════

function CollectNode({ data, selected }: NodeProps<Node<CollectData>>) {
  const d = data as CollectData;
  return (
    <div className={`bg-gray-800 rounded-xl border-2 ${selected ? 'border-teal-400' : 'border-gray-700'} min-w-[220px] shadow-lg`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-teal-500/10 rounded-t-xl">
        <Search className="w-4 h-4 text-teal-400" />
        <span className="text-sm font-semibold text-teal-300">{d.label}</span>
        <div className="ml-auto"><StatusBadge status={d.status} /></div>
      </div>
      <div className="px-3 py-2 text-xs text-gray-400 space-y-1">
        <p>{d.urls.filter(u => u.url).length}개 URL</p>
        {d.prompt && <p className="truncate max-w-[180px]">{d.prompt}</p>}
        {d.resultCount > 0 && <p className="text-green-400">{d.resultCount}건 수집</p>}
        {d.errorMsg && <p className="text-red-400 truncate max-w-[180px]">{d.errorMsg}</p>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-teal-500 !w-3 !h-3 !border-2 !border-gray-800" />
    </div>
  );
}

function RefineNode({ data, selected }: NodeProps<Node<RefineData>>) {
  const d = data as RefineData;
  return (
    <div className={`bg-gray-800 rounded-xl border-2 ${selected ? 'border-orange-400' : 'border-gray-700'} min-w-[220px] shadow-lg`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-orange-500/10 rounded-t-xl">
        <Factory className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-semibold text-orange-300">{d.label}</span>
        <div className="ml-auto"><StatusBadge status={d.status} /></div>
      </div>
      <div className="px-3 py-2 text-xs text-gray-400 space-y-1">
        {d.prompt && <p className="truncate max-w-[180px]">{d.prompt}</p>}
        <p>출력: {d.outputFormat.toUpperCase()}</p>
        {d.resultCount > 0 && <p className="text-green-400">{d.resultCount}건 정제</p>}
        {d.errorMsg && <p className="text-red-400 truncate max-w-[180px]">{d.errorMsg}</p>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-gray-800" />
      <Handle type="source" position={Position.Right} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-gray-800" />
    </div>
  );
}

function DeliverNode({ data, selected }: NodeProps<Node<DeliverData>>) {
  const d = data as DeliverData;
  const DestIcon = d.destType === 'email' ? Mail : d.destType === 'cloud_folder' ? FolderOutput : Globe;
  const destTypeLabel = d.destType === 'cloud_folder' ? 'FOLDER' : d.destType.toUpperCase();
  return (
    <div className={`bg-gray-800 rounded-xl border-2 ${selected ? 'border-blue-400' : 'border-gray-700'} min-w-[220px] shadow-lg`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-blue-500/10 rounded-t-xl">
        <Cable className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-blue-300">{d.label}</span>
        <div className="ml-auto"><StatusBadge status={d.status} /></div>
      </div>
      <div className="px-3 py-2 text-xs text-gray-400 space-y-1">
        <div className="flex items-center gap-1"><DestIcon className="w-3 h-3" /><span>{destTypeLabel}</span></div>
        {d.name && <p className="truncate max-w-[180px]">{d.name}</p>}
        {d.delivered && <p className="text-green-400">전달 완료</p>}
        {d.errorMsg && <p className="text-red-400 truncate max-w-[180px]">{d.errorMsg}</p>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-gray-800" />
    </div>
  );
}

const nodeTypes: NodeTypes = { collect: CollectNode, refine: RefineNode, deliver: DeliverNode };

// ═══════════════════════════════════════════
// Config Panels
// ═══════════════════════════════════════════

function ConfigPanel({ node, onUpdate, onClose }: { node: Node<WorkflowNodeData>; onUpdate: (id: string, data: Partial<WorkflowNodeData>) => void; onClose: () => void }) {
  if (node.type === 'collect') return <CollectConfigPanel node={node as Node<CollectData>} onUpdate={onUpdate} onClose={onClose} />;
  if (node.type === 'refine') return <RefineConfigPanel node={node as Node<RefineData>} onUpdate={onUpdate} onClose={onClose} />;
  return <DeliverConfigPanel node={node as Node<DeliverData>} onUpdate={onUpdate} onClose={onClose} />;
}

function CollectConfigPanel({ node, onUpdate, onClose }: { node: Node<CollectData>; onUpdate: (id: string, data: Partial<CollectData>) => void; onClose: () => void }) {
  const d = node.data as CollectData;
  const currentEntry = d.urls?.[0] ?? { url: '', engine: 'crawl4ai' };
  const updatePrimaryUrl = (value: string) => {
    onUpdate(node.id, { urls: [{ ...currentEntry, url: value }] });
  };
  const updatePrimaryEngine = (value: string) => {
    onUpdate(node.id, { urls: [{ ...currentEntry, engine: value }] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Search className="w-5 h-5 text-teal-400" /><h3 className="text-lg font-semibold text-gray-100">수집 설정</h3></div>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
      </div>
      <div><label className="block text-xs font-medium text-gray-400 mb-1">노드명</label><input type="text" value={d.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" /></div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">대상 URL</label>
        <div className="space-y-2">
          <input
            type="text"
            value={currentEntry.url}
            onChange={(e) => updatePrimaryUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">크롤링 엔진</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ENGINE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = currentEntry.engine === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => updatePrimaryEngine(opt.key)}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-teal-500 text-white border-teal-500'
                        : 'bg-gray-900 text-gray-300 border-gray-700 hover:text-white hover:border-teal-500/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div><label className="block text-xs font-medium text-gray-400 mb-1">프롬프트</label><textarea value={d.prompt} onChange={(e) => onUpdate(node.id, { prompt: e.target.value })} placeholder="수집할 데이터와 추출 방법을 설명하세요" rows={4} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" /></div>
    </div>
  );
}

function RefineConfigPanel({ node, onUpdate, onClose }: { node: Node<RefineData>; onUpdate: (id: string, data: Partial<RefineData>) => void; onClose: () => void }) {
  const d = node.data as RefineData;
  const [kwInput, setKwInput] = useState('');
  const [exKwInput, setExKwInput] = useState('');
  const outputOptions = [
    { key: 'json', label: 'JSON', icon: Workflow },
    { key: 'csv', label: 'CSV', icon: List },
    { key: 'summary', label: 'TEXT', icon: FileText },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Factory className="w-5 h-5 text-orange-400" /><h3 className="text-lg font-semibold text-gray-100">정제 설정</h3></div>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
      </div>
      <div><label className="block text-xs font-medium text-gray-400 mb-1">노드명</label><input type="text" value={d.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
      <div><label className="block text-xs font-medium text-gray-400 mb-1">정제 프롬프트</label><textarea value={d.prompt} onChange={(e) => onUpdate(node.id, { prompt: e.target.value })} placeholder="AI에게 데이터 정제 방법을 지시하세요" rows={3} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" /></div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">출력 형식</label>
        <div className="grid grid-cols-3 gap-2">
          {outputOptions.map((opt) => {
            const Icon = opt.icon;
            const active = d.outputFormat === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onUpdate(node.id, { outputFormat: opt.key })}
                className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-2 ${
                  active
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">필터 규칙</label>
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="text" value={kwInput} onChange={(e) => setKwInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const kw = kwInput.trim(); if (kw) { const cur = d.filterRules.include_keywords || []; if (!cur.includes(kw)) onUpdate(node.id, { filterRules: { ...d.filterRules, include_keywords: [...cur, kw] } }); setKwInput(''); } } }} placeholder="포함 키워드" className="w-full min-w-0 px-3 py-1.5 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500" />
            <input type="text" value={exKwInput} onChange={(e) => setExKwInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const kw = exKwInput.trim(); if (kw) { const cur = d.filterRules.exclude_keywords || []; if (!cur.includes(kw)) onUpdate(node.id, { filterRules: { ...d.filterRules, exclude_keywords: [...cur, kw] } }); setExKwInput(''); } } }} placeholder="제외 키워드" className="w-full min-w-0 px-3 py-1.5 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          {((d.filterRules.include_keywords?.length || 0) + (d.filterRules.exclude_keywords?.length || 0) > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {(d.filterRules.include_keywords || []).map((kw) => (<span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full">+{kw}<button onClick={() => onUpdate(node.id, { filterRules: { ...d.filterRules, include_keywords: d.filterRules.include_keywords?.filter(k => k !== kw) } })}><X className="w-3 h-3" /></button></span>))}
              {(d.filterRules.exclude_keywords || []).map((kw) => (<span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full">-{kw}<button onClick={() => onUpdate(node.id, { filterRules: { ...d.filterRules, exclude_keywords: d.filterRules.exclude_keywords?.filter(k => k !== kw) } })}><X className="w-3 h-3" /></button></span>))}
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
            <input type="checkbox" checked={d.filterRules.dedup || false} onChange={(e) => onUpdate(node.id, { filterRules: { ...d.filterRules, dedup: e.target.checked } })} className="toggle-check flex-shrink-0" />
            중복 제거
          </label>
        </div>
      </div>
    </div>
  );
}

function DeliverConfigPanel({ node, onUpdate, onClose }: { node: Node<DeliverData>; onUpdate: (id: string, data: Partial<DeliverData>) => void; onClose: () => void }) {
  const d = node.data as DeliverData;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Cable className="w-5 h-5 text-blue-400" /><h3 className="text-lg font-semibold text-gray-100">전달 설정</h3></div>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
      </div>
      <div><label className="block text-xs font-medium text-gray-400 mb-1">노드명</label><input type="text" value={d.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
      <div><label className="block text-xs font-medium text-gray-400 mb-1">브릿지명</label><input type="text" value={d.name} onChange={(e) => onUpdate(node.id, { name: e.target.value })} placeholder="예: 일일 리포트 전송" className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">전달 방식</label>
        <div className="grid grid-cols-3 gap-2">
          {[{ key: 'webhook', icon: Globe, label: 'Webhook' }, { key: 'email', icon: Mail, label: 'Email' }, { key: 'cloud_folder', icon: FolderOutput, label: 'Folder' }].map((opt) => (
            <button key={opt.key} onClick={() => onUpdate(node.id, { destType: opt.key })} className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${d.destType === opt.key ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200'}`}>
              <opt.icon className="w-3.5 h-3.5" /> {opt.label}
            </button>
          ))}
        </div>
      </div>
      {d.destType === 'webhook' && (<div><label className="block text-xs font-medium text-gray-400 mb-1">Webhook URL</label><input type="url" value={d.webhookUrl} onChange={(e) => onUpdate(node.id, { webhookUrl: e.target.value })} placeholder="https://example.com/webhook" className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>)}
      {d.destType === 'email' && (<><div><label className="block text-xs font-medium text-gray-400 mb-1">받는 사람</label><input type="email" value={d.emailTo} onChange={(e) => onUpdate(node.id, { emailTo: e.target.value })} placeholder="user@example.com" className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="block text-xs font-medium text-gray-400 mb-1">제목 <span className="text-gray-600">(선택)</span></label><input type="text" value={d.emailSubject} onChange={(e) => onUpdate(node.id, { emailSubject: e.target.value })} placeholder="기본: [Martani] 브릿지 전달" className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div></>)}
      {d.destType === 'cloud_folder' && (<div className="bg-gray-900 rounded-lg border border-gray-700 p-3"><div className="flex items-center gap-2 text-xs text-gray-300"><FolderOutput className="w-3.5 h-3.5 text-blue-400" />/AI Workspace/Exports/ 폴더에 자동 저장</div></div>)}
      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300"><input type="checkbox" checked={d.autoTrigger} onChange={(e) => onUpdate(node.id, { autoTrigger: e.target.checked })} className="toggle-check flex-shrink-0" />정제 완료 시 자동 실행</label>
    </div>
  );
}

// ═══════════════════════════════════════════
// Grid Twinkle Overlay
// ═══════════════════════════════════════════

function GridTwinkle() {
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

// ═══════════════════════════════════════════
// Worker List Panel (dropdown)
// ═══════════════════════════════════════════

function WorkerListPanel({
  pipelines,
  isLoading,
  searchQuery,
  onSearch,
  onSelect,
  onDelete,
  onClose,
}: {
  pipelines: PipelineItem[] | undefined;
  isLoading: boolean;
  searchQuery: string;
  onSearch: (q: string) => void;
  onSelect: (p: PipelineItem) => void;
  onDelete: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const filtered = useMemo(() => {
    if (!pipelines) return [];
    if (!searchQuery.trim()) return pipelines;
    const q = searchQuery.toLowerCase();
    return pipelines.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  }, [pipelines, searchQuery]);

  return (
    <div className="absolute top-full left-0 mt-1 w-[400px] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
      {/* Search bar */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="작업자 검색..."
            autoFocus
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">
            {searchQuery ? '검색 결과가 없습니다' : '저장된 작업자가 없습니다'}
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors cursor-pointer group border-b border-gray-700/50 last:border-b-0"
              onClick={() => { onSelect(p); onClose(); }}
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <Workflow className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                <p className="text-xs text-gray-500 truncate">{p.description || '설명 없음'}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  p.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'
                }`}>
                  {p.status === 'active' ? '활성' : '대기'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(p.id, p.name); }}
                  className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Empty State
// ═══════════════════════════════════════════

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col bg-gray-950 rounded-xl border border-gray-700 overflow-hidden relative min-h-0">
      <GridTwinkle />
      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="text-center space-y-5 max-w-md w-full px-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto">
            <Workflow className="w-8 h-8 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-200">워크플로우를 시작하세요</h3>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              새 작업자를 만들거나 기존 작업자를 선택하세요
            </p>
          </div>
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" />
            새 작업자 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Workflow Editor
// ═══════════════════════════════════════════

let idCounter = 0;
const nextId = () => `wf_${++idCounter}_${Date.now()}`;

export function WorkflowEditor() {
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Active workflow state
  const [activeWorkflow, setActiveWorkflow] = useState<{ id: string | null; name: string } | null>(null);
  const [showList, setShowList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Dialog state
  const [nameDialog, setNameDialog] = useState<{ open: boolean; defaultName: string }>({ open: false, defaultName: '' });
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; defaultName: string; pipelineId: string | null }>({
    open: false,
    defaultName: '',
    pipelineId: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; pipelineId: string; pipelineName: string }>({ open: false, pipelineId: '', pipelineName: '' });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Pipeline data
  const { data: pipelines, isLoading: pipelinesLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: pipelineApi.list,
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!showList) return;
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as HTMLElement)) setShowList(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showList]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  // ── Create new workflow ──
  const openCreateDialog = useCallback(() => {
    const randomPart = Math.random().toString(36).slice(2, 9).toUpperCase();
    setNameDialog({ open: true, defaultName: `작업자-${randomPart}` });
  }, []);

  const openRenameDialog = useCallback(() => {
    if (!activeWorkflow) return;
    setRenameDialog({
      open: true,
      defaultName: activeWorkflow.name,
      pipelineId: activeWorkflow.id,
    });
  }, [activeWorkflow]);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameDialog.open) return;
    const trimmed = (renameInputRef.current?.value ?? '').trim();
    const finalName = trimmed || renameDialog.defaultName;
    const { pipelineId } = renameDialog;
    setRenameDialog({ open: false, defaultName: '', pipelineId: null });
    setActiveWorkflow((prev) => (prev ? { ...prev, name: finalName } : null));
    if (pipelineId) {
      try {
        await pipelineApi.update(pipelineId, { name: finalName });
        queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      } catch {
        /* keep local name; list may be stale until refresh */
      }
    }
  }, [renameDialog, queryClient]);

  const handleCreateNew = useCallback(async (name: string) => {
    setNameDialog({ open: false, defaultName: '' });
    const finalName = name.trim() || `작업자-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

    const { nodes: newNodes, edges: newEdges } = makeNewWorkflowNodes();
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(null);
    setActiveWorkflow({ id: null, name: finalName });

    try {
      const pipeline = await pipelineApi.create({
        name: finalName,
        description: '새 워크플로우',
        workflow_data: serializeWorkflowForApi(newNodes, newEdges),
      });
      setActiveWorkflow({ id: pipeline.id, name: pipeline.name });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    } catch {
      // Pipeline creation failed, still allow editing locally
    }
  }, [setNodes, setEdges, queryClient]);

  const handleSaveWorkflow = useCallback(async () => {
    const pid = activeWorkflow?.id;
    if (!pid) return;
    setIsSaving(true);
    try {
      const workflow_data = serializeWorkflowForApi(nodes, edges);
      await pipelineApi.update(pid, { workflow_data });
      await queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    } catch {
      /* noop — could toast */
    } finally {
      setIsSaving(false);
    }
  }, [activeWorkflow?.id, nodes, edges, queryClient]);

  // ── Load workflow from pipeline ──
  const handleSelectPipeline = useCallback((p: PipelineItem) => {
    setSelectedNodeId(null);
    const parsed = parseWorkflowFromApi(p.workflow_data);
    if (parsed) {
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
    } else {
      const { nodes: newNodes, edges: newEdges } = makeNewWorkflowNodes();
      setNodes(newNodes);
      setEdges(newEdges);
    }
    setActiveWorkflow({ id: p.id, name: p.name });
  }, [setNodes, setEdges]);

  // ── Delete pipeline ──
  const openDeleteDialog = useCallback((id: string, name: string) => {
    setDeleteDialog({ open: true, pipelineId: id, pipelineName: name });
  }, []);

  const handleDeletePipeline = useCallback(async () => {
    const { pipelineId } = deleteDialog;
    setDeleteDialog({ open: false, pipelineId: '', pipelineName: '' });
    if (!pipelineId) return;
    try {
      await pipelineApi.delete(pipelineId);
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      if (activeWorkflow?.id === pipelineId) {
        setActiveWorkflow(null);
        setNodes([]);
        setEdges([]);
      }
    } catch { /* noop */ }
  }, [deleteDialog, activeWorkflow, setNodes, setEdges, queryClient]);

  // ── Close workflow ──
  const handleCloseWorkflow = useCallback(() => {
    setActiveWorkflow(null);
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
  }, [setNodes, setEdges]);

  // ── Edge connections ──
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || params.source === params.target) return;

    const sourceNode = nodes.find((n) => n.id === params.source);
    const targetNode = nodes.find((n) => n.id === params.target);
    if (!sourceNode || !targetNode) return;

    // Fail-closed connection rules
    if (sourceNode.type === 'deliver') return; // deliver is terminal
    if (targetNode.type === 'collect') return; // collect cannot have inputs

    // Avoid duplicate edges between same source/target
    const duplicate = edges.some((e) => e.source === params.source && e.target === params.target);
    if (duplicate) return;

    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }, style: { stroke: '#6b7280', strokeWidth: 2 }, animated: false }, eds));
  }, [setEdges, nodes, edges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const updateNodeData = useCallback((id: string, data: Partial<WorkflowNodeData>) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
  }, [setNodes]);

  const onDragOver = useCallback((event: DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !rfInstance || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = rfInstance.screenToFlowPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    setNodes((nds) => [...nds, { id: nextId(), type, position, data: makeDefaultData(type) }]);
  }, [rfInstance, setNodes]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  // ── Execution engine ──
  const executeWorkflow = useCallback(async () => {
    if (isExecuting) return;
    setIsExecuting(true);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0); }
    for (const e of edges) { adj.get(e.source)?.push(e.target); inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1); }

    const queue: string[] = [];
    inDeg.forEach((deg, id) => { if (deg === 0) queue.push(id); });

    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const next of adj.get(id) || []) { const d = (inDeg.get(next) || 1) - 1; inDeg.set(next, d); if (d === 0) queue.push(next); }
    }

    const producedTaskIds = new Map<string, string[]>();
    const producedRuleIds = new Map<string, string[]>();

    setEdges((eds) => eds.map((e) => ({ ...e, animated: true, style: { ...e.style, stroke: '#3b82f6' } })));

    for (const nodeId of order) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      updateNodeData(nodeId, { status: 'running', errorMsg: null } as any);

      try {
        if (node.type === 'collect') {
          const cd = node.data as CollectData;
          const urls = cd.urls.filter((u) => u.url.trim()).map((u) => u.url.trim());
          if (urls.length === 0 || !cd.prompt.trim()) { updateNodeData(nodeId, { status: 'error', errorMsg: 'URL과 프롬프트를 입력하세요' } as any); continue; }
          let hostname = 'mining'; try { hostname = new URL(urls[0]).hostname.replace(/^www\./, ''); } catch {}
          const task = await miningApi.createTask({ name: `마이닝: ${hostname}`, description: cd.prompt, target_urls: urls, scraping_engine: cd.urls[0]?.engine || 'crawl4ai' });
          await miningApi.runTask(task.id);
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const detail = await miningApi.getTask(task.id);
            if (detail.last_run_status && detail.last_run_status !== 'running') {
              if (detail.last_run_status === 'success') { const results = await miningApi.getResults(task.id); updateNodeData(nodeId, { status: 'done', taskId: task.id, resultCount: results.length } as any); producedTaskIds.set(nodeId, [task.id]); }
              else { updateNodeData(nodeId, { status: 'error', taskId: task.id, errorMsg: detail.last_run_message || '수집 실패' } as any); }
              break;
            }
          }
          if (activeWorkflow?.id) { try { await pipelineApi.update(activeWorkflow.id, { mining_task_id: task.id }); } catch {} }
          queryClient.invalidateQueries({ queryKey: ['mining-tasks'] });

        } else if (node.type === 'refine') {
          const rd = node.data as RefineData;
          if (!rd.prompt.trim()) { updateNodeData(nodeId, { status: 'error', errorMsg: '정제 프롬프트를 입력하세요' } as any); continue; }
          const sourceEdges = edges.filter((e) => e.target === nodeId);
          const sourceTaskIds = Array.from(
            new Set(
              sourceEdges.flatMap((e) => producedTaskIds.get(e.source) || []),
            ),
          );
          if (sourceTaskIds.length === 0) { updateNodeData(nodeId, { status: 'error', errorMsg: '연결된 수집 노드의 결과가 없습니다' } as any); continue; }
          const filterRules: any = {};
          if (rd.filterRules.include_keywords?.length) filterRules.include_keywords = rd.filterRules.include_keywords;
          if (rd.filterRules.exclude_keywords?.length) filterRules.exclude_keywords = rd.filterRules.exclude_keywords;
          if (rd.filterRules.dedup) filterRules.dedup = true;

          const createdRuleIds: string[] = [];
          let totalRefineResults = 0;
          let refineFailure: string | null = null;

          for (const sourceTaskId of sourceTaskIds) {
            const rule = await refineryApi.createRule({
              name: `정제(${sourceTaskIds.length > 1 ? sourceTaskId.slice(0, 8) : ''}): ${rd.prompt.slice(0, 30)}`,
              source_task_id: sourceTaskId,
              prompt: rd.prompt,
              output_format: rd.outputFormat,
              filter_rules: Object.keys(filterRules).length > 0 ? filterRules : undefined,
            });
            createdRuleIds.push(rule.id);
            await refineryApi.runRule(rule.id);

            let finished = false;
            for (let i = 0; i < 60; i++) {
              await new Promise((r) => setTimeout(r, 3000));
              const detail = await refineryApi.getRule(rule.id);
              if (detail.last_run_status && detail.last_run_status !== 'running') {
                if (detail.last_run_status === 'success') {
                  const results = await refineryApi.getResults(rule.id);
                  totalRefineResults += results.length;
                } else {
                  refineFailure = detail.last_run_message || `정제 실패 (${rule.id})`;
                }
                finished = true;
                break;
              }
            }
            if (!finished && !refineFailure) {
              refineFailure = `정제 실행 시간 초과 (${rule.id})`;
            }
            if (refineFailure) break;
          }

          if (refineFailure) {
            updateNodeData(nodeId, {
              status: 'error',
              ruleIds: createdRuleIds,
              errorMsg: refineFailure,
            } as any);
            continue;
          }

          updateNodeData(nodeId, {
            status: 'done',
            ruleId: createdRuleIds[0] || null,
            ruleIds: createdRuleIds,
            resultCount: totalRefineResults,
          } as any);
          producedRuleIds.set(nodeId, createdRuleIds);

          if (activeWorkflow?.id && createdRuleIds[0]) { try { await pipelineApi.update(activeWorkflow.id, { refinery_rule_id: createdRuleIds[0] }); } catch {} }
          queryClient.invalidateQueries({ queryKey: ['refinery-rules'] });

        } else if (node.type === 'deliver') {
          const dd = node.data as DeliverData;
          if (!dd.name.trim()) { updateNodeData(nodeId, { status: 'error', errorMsg: '브릿지명을 입력하세요' } as any); continue; }
          const sourceEdges = edges.filter((e) => e.target === nodeId);
          const sourceRuleIds = Array.from(
            new Set(
              sourceEdges.flatMap((e) => producedRuleIds.get(e.source) || []),
            ),
          );
          if (sourceRuleIds.length === 0) { updateNodeData(nodeId, { status: 'error', errorMsg: '연결된 정제 노드의 결과가 없습니다' } as any); continue; }
          const destConfig: Record<string, any> = {};
          if (dd.destType === 'webhook') {
            if (!dd.webhookUrl.trim()) { updateNodeData(nodeId, { status: 'error', errorMsg: 'Webhook URL을 입력하세요' } as any); continue; }
            destConfig.url = dd.webhookUrl.trim();
          } else if (dd.destType === 'email') {
            if (!dd.emailTo.trim()) { updateNodeData(nodeId, { status: 'error', errorMsg: '수신 이메일 주소를 입력하세요' } as any); continue; }
            destConfig.email = dd.emailTo.trim();
            if (dd.emailSubject.trim()) destConfig.subject = dd.emailSubject.trim();
          }

          const configIds: string[] = [];
          let deliveryFailure: string | null = null;
          let deliverySuccess = 0;
          for (const sourceRuleId of sourceRuleIds) {
            const cfg = await bridgeApi.createConfig({
              name: `${dd.name}${sourceRuleIds.length > 1 ? ` (${sourceRuleId.slice(0, 8)})` : ''}`,
              source_rule_id: sourceRuleId,
              destination_type: dd.destType,
              destination_config: Object.keys(destConfig).length > 0 ? destConfig : undefined,
              auto_trigger: dd.autoTrigger,
            });
            configIds.push(cfg.id);
            try {
              await bridgeApi.runConfig(cfg.id);
              let completed = false;
              for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                const detail = await bridgeApi.getConfig(cfg.id);
                const runStatus = detail.last_run_status;
                if (runStatus && runStatus !== 'running') {
                  if (runStatus === 'success') {
                    deliverySuccess += 1;
                  } else {
                    deliveryFailure = detail.last_run_message || `전달 실패 (${cfg.id})`;
                  }
                  completed = true;
                  break;
                }
              }
              if (!completed && !deliveryFailure) {
                deliveryFailure = `전달 실행 시간 초과 (${cfg.id})`;
              }
            } catch (e: any) {
              deliveryFailure = e?.message || `전달 실행 실패 (${cfg.id})`;
            }
            if (deliveryFailure) break;
          }

          if (deliveryFailure) {
            updateNodeData(nodeId, {
              status: 'error',
              configIds,
              errorMsg: deliveryFailure,
            } as any);
            continue;
          }

          updateNodeData(nodeId, {
            status: 'done',
            configId: configIds[0] || null,
            configIds,
            delivered: true,
            resultCount: deliverySuccess,
          } as any);
          if (activeWorkflow?.id && configIds[0]) { try { await pipelineApi.update(activeWorkflow.id, { bridge_config_id: configIds[0] }); } catch {} }
          queryClient.invalidateQueries({ queryKey: ['bridge-configs'] });
        }
      } catch (err: any) {
        updateNodeData(nodeId, { status: 'error', errorMsg: err?.message || '실행 오류' } as any);
      }
    }

    setEdges((eds) => eds.map((e) => ({ ...e, animated: false, style: { ...e.style, stroke: '#22c55e' } })));
    setIsExecuting(false);
  }, [nodes, edges, isExecuting, activeWorkflow, updateNodeData, setEdges, queryClient]);

  const resetStatuses = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle', errorMsg: null, resultCount: 0, taskId: null, ruleId: null, configId: null, delivered: false } })));
    setEdges((eds) => eds.map((e) => ({ ...e, animated: false, style: { ...e.style, stroke: '#6b7280' } })));
  }, [setNodes, setEdges]);

  const applyTemplate = useCallback((templateId: string) => {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;

    const graphTemplate = (tpl as any).graph;
    if (graphTemplate) {
      const templateNodes: Node[] = graphTemplate.nodes.map((n: any) => {
        const baseData = makeDefaultData(n.type);
        const extraTag = templateId === 'collect-fanout-analysis' ? { templateTag: '합류 테스트' } : {};
        return {
          id: n.id,
          type: n.type,
          position: n.position,
          data: { ...baseData, ...n.data, ...extraTag },
        } as Node;
      });
      const templateEdges: Edge[] = graphTemplate.edges.map((e: any, idx: number) => ({
        id: `te_${idx}_${e.source}_${e.target}`,
        source: e.source,
        target: e.target,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
        style: { stroke: '#6b7280', strokeWidth: 2 },
        animated: false,
      }));
      setNodes(templateNodes);
      setEdges(templateEdges);
      setSelectedNodeId(null);
      setTemplateDialogOpen(false);
      return;
    }

    const { nodes: baseNodes, edges: baseEdges } = makeNewWorkflowNodes();
    const templatedNodes = baseNodes.map((node) => {
      if (node.type === 'collect') {
        const data = node.data as CollectData;
        return {
          ...node,
          data: {
            ...data,
            label: '수집',
            urls: [{ url: tpl.collect.url, engine: tpl.collect.engine }],
            prompt: tpl.collect.prompt,
            status: 'idle',
            taskId: null,
            resultCount: 0,
            errorMsg: null,
          } satisfies CollectData,
        };
      }
      if (node.type === 'refine') {
        const data = node.data as RefineData;
        return {
          ...node,
          data: {
            ...data,
            label: '정제',
            prompt: tpl.refine.prompt,
            outputFormat: tpl.refine.outputFormat,
            filterRules: JSON.parse(JSON.stringify(tpl.refine.filterRules)),
            status: 'idle',
            ruleId: null,
            resultCount: 0,
            errorMsg: null,
          } satisfies RefineData,
        };
      }
      const data = node.data as DeliverData;
      return {
        ...node,
        data: {
          ...data,
          label: '전달',
          name: tpl.deliver.name,
          destType: tpl.deliver.destType,
          webhookUrl: '',
          emailTo: '',
          emailSubject: '',
          autoTrigger: tpl.deliver.autoTrigger,
          status: 'idle',
          configId: null,
          delivered: false,
          errorMsg: null,
        } satisfies DeliverData,
      };
    });

    setNodes(templatedNodes);
    setEdges(baseEdges);
    setSelectedNodeId(null);
    setTemplateDialogOpen(false);
  }, [setNodes, setEdges]);

  // ═══ Render ═══

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-0">
      {/* ── Toolbar ── */}
      <div className={pageActionToolbarRowClass}>
        {/* New Worker */}
        <button
          onClick={openCreateDialog}
          className="inline-flex h-[38px] min-h-[38px] max-h-[38px] items-center justify-center gap-2 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium leading-[1] whitespace-nowrap shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">새 작업자</span>
        </button>

        {/* Worker List */}
        <div className="relative" ref={listRef}>
          <button
            onClick={() => { setShowList(!showList); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border ${
              showList ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-800 text-gray-300 hover:text-white border-gray-700 hover:border-gray-600'
            }`}
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">목록</span>
            {pipelines && pipelines.length > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded text-[10px] font-medium">{pipelines.length}</span>
            )}
          </button>
          {showList && (
            <WorkerListPanel
              pipelines={pipelines}
              isLoading={pipelinesLoading}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              onSelect={handleSelectPipeline}
              onDelete={(id, name) => openDeleteDialog(id, name)}
              onClose={() => setShowList(false)}
            />
          )}
        </div>

        {/* 저장 — 항상 표시 (작업자 미선택·미생성 시 비활성) */}
        <button
          type="button"
          onClick={() => void handleSaveWorkflow()}
          disabled={!activeWorkflow?.id || isSaving || isExecuting}
          title={
            !activeWorkflow
              ? '목록에서 작업자를 선택하거나 「새 작업자」로 만든 뒤 저장할 수 있습니다'
              : !activeWorkflow.id
                ? '서버에 작업자가 생성된 뒤 저장할 수 있습니다'
                : '현재 워크플로를 서버에 저장합니다'
          }
          aria-label="워크플로 저장"
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-sm font-medium text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">저장</span>
        </button>

        {/* Active workflow indicator */}
        {activeWorkflow && (
          <div className="flex items-center gap-1.5 sm:gap-2 ml-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-800/80 rounded-lg border border-gray-700 min-w-0">
            <Workflow className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            <span className="text-sm text-gray-300 font-medium truncate min-w-0">{activeWorkflow.name}</span>
            <button
              type="button"
              onClick={openRenameDialog}
              className="p-0.5 text-gray-500 hover:text-orange-400 transition-colors flex-shrink-0"
              title="이름 변경"
              aria-label="작업자 이름 변경"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCloseWorkflow}
              className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
              title="닫기"
              aria-label="워크플로우 닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Canvas or Empty State (flex-col so EmptyState flex-1 fills height) ── */}
      <div className="flex flex-col flex-1 min-h-0">
        {!activeWorkflow ? (
          <EmptyState onCreate={openCreateDialog} />
        ) : (
          <div className="flex flex-1 min-h-0 gap-0 rounded-xl overflow-hidden border border-gray-700">
            <div id="workflow-mining-canvas" ref={reactFlowWrapper} className="workflow-mining-reactflow flex-1 relative min-h-0" onDragOver={onDragOver} onDrop={onDrop}>
              <GridTwinkle />
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onInit={setRfInstance}
                nodeTypes={nodeTypes}
                fitView
                className="bg-gray-950"
                defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }, style: { stroke: '#6b7280', strokeWidth: 2 } }}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#374151" gap={20} size={1} />
                <Controls className="!bg-gray-800 !border-gray-700 !rounded-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-400 [&>button:hover]:!bg-gray-700" />
                <MiniMap className="!bg-gray-900 !border-gray-700 !rounded-lg !hidden sm:!block" nodeColor={(n) => n.type === 'collect' ? '#14b8a6' : n.type === 'refine' ? '#f97316' : '#3b82f6'} maskColor="rgba(0,0,0,0.6)" />

                {/* Palette */}
                <Panel position="top-left" className="z-30 flex items-center gap-1.5 sm:gap-3">
                  <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-700 p-1 sm:p-1.5">
                    {PALETTE_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const colorMap = { teal: 'text-teal-400 hover:bg-teal-500/15', orange: 'text-orange-400 hover:bg-orange-500/15', blue: 'text-blue-400 hover:bg-blue-500/15' };
                      return (
                        <div key={item.type} draggable onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', item.type); e.dataTransfer.effectAllowed = 'move'; }} className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md cursor-grab text-[10px] sm:text-xs font-medium transition-colors ${colorMap[item.color]}`} title={`드래그하여 ${item.label} 노드 추가`}>
                          <GripVertical className="w-2.5 sm:w-3 h-2.5 sm:h-3 opacity-40 hidden sm:block" /><Icon className="w-3 sm:w-3.5 h-3 sm:h-3.5" />{item.label}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setTemplateDialogOpen(true)}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-700 text-xs sm:text-sm text-gray-200 hover:border-orange-400/60 hover:text-white transition-colors"
                    title="실행 가능한 워크플로우 템플릿 불러오기"
                  >
                    <Sparkles className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-orange-400" />
                    <span className="hidden sm:inline">템플릿</span>
                  </button>
                </Panel>

                {/* Actions */}
                <Panel position="top-right" className="z-30 flex items-center gap-1 sm:gap-2">
                  <button onClick={executeWorkflow} disabled={isExecuting} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors shadow-lg whitespace-nowrap">
                    {isExecuting ? <Loader2 className="w-3.5 sm:w-4 h-3.5 sm:h-4 animate-spin" /> : <Play className="w-3.5 sm:w-4 h-3.5 sm:h-4" />}
                    <span className="hidden sm:inline">{isExecuting ? '실행 중...' : '실행'}</span>
                  </button>
                  <button onClick={resetStatuses} disabled={isExecuting} className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-800/90 backdrop-blur-sm hover:bg-gray-700 text-gray-300 rounded-lg text-xs sm:text-sm border border-gray-700 transition-colors whitespace-nowrap">
                    <span className="hidden sm:inline">초기화</span>
                    <RefreshCw className="w-3.5 h-3.5 sm:hidden" />
                  </button>
                  {selectedNodeId && (
                    <button onClick={deleteSelectedNode} className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs sm:text-sm border border-red-500/20 transition-colors">
                      <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" /><span className="hidden sm:inline">삭제</span>
                    </button>
                  )}
                </Panel>
              </ReactFlow>
            </div>

            {/* Config Panel */}
            {selectedNode && (
              <div className="fixed sm:relative inset-0 sm:inset-auto z-50 sm:z-auto w-full sm:w-[360px] bg-gray-800 sm:border-l border-gray-700 p-5 overflow-y-auto flex-shrink-0">
                <ConfigPanel node={selectedNode as Node<WorkflowNodeData>} onUpdate={updateNodeData} onClose={() => setSelectedNodeId(null)} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Name Input Dialog ── */}
      {nameDialog.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-[400px] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-base font-semibold text-gray-100">새 작업자 만들기</h3>
              <p className="text-xs text-gray-500 mt-1">작업자 이름을 입력하세요</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateNew(nameInputRef.current?.value || nameDialog.defaultName);
              }}
              className="px-5 py-4 space-y-4"
            >
              <input
                ref={nameInputRef}
                type="text"
                defaultValue={nameDialog.defaultName}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="작업자 이름"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setNameDialog({ open: false, defaultName: '' })} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors">취소</button>
                <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium rounded-lg transition-colors">만들기</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Rename Dialog ── */}
      {renameDialog.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-[400px] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-base font-semibold text-gray-100">작업자 이름 변경</h3>
              <p className="text-xs text-gray-500 mt-1">목록에 표시되는 이름을 바꿉니다</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleRenameConfirm();
              }}
              className="px-5 py-4 space-y-4"
            >
              <input
                key={renameDialog.defaultName}
                ref={renameInputRef}
                type="text"
                defaultValue={renameDialog.defaultName}
                autoFocus
                onFocus={(e) => e.target.select()}
                maxLength={200}
                className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="작업자 이름"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameDialog({ open: false, defaultName: '', pipelineId: null })}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button type="submit" className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium rounded-lg transition-colors">
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ── */}
      {deleteDialog.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-[380px] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-base font-semibold text-gray-100">작업자 삭제</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-300"><span className="font-medium text-white">{deleteDialog.pipelineName}</span> 작업자를 삭제하시겠습니까?</p>
              <p className="text-xs text-gray-500 mt-1">이 작업은 되돌릴 수 없습니다.</p>
            </div>
            <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2">
              <button onClick={() => setDeleteDialog({ open: false, pipelineId: '', pipelineName: '' })} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors">취소</button>
              <button onClick={handleDeletePipeline} className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template Dialog ── */}
      {templateDialogOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-[760px] max-w-[92vw] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-100">워크플로우 템플릿</h3>
                <p className="text-xs text-gray-500 mt-1">수집 → 정제 → 전달이 바로 실행 가능한 예시 템플릿</p>
              </div>
              <button
                onClick={() => setTemplateDialogOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {WORKFLOW_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl.id)}
                  className="text-left p-4 rounded-lg border border-gray-700 bg-gray-900/50 hover:border-orange-400/50 hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-100">{tpl.name}</p>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      tpl.level === '기본' ? 'bg-emerald-500/15 text-emerald-300' : tpl.level === '중급' ? 'bg-blue-500/15 text-blue-300' : 'bg-orange-500/15 text-orange-300'
                    }`}>
                      {tpl.level}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">{tpl.description}</p>
                  <div className="text-[11px] text-gray-500 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300">수집:{tpl.collect.engine}</span>
                    <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-300">정제:{tpl.refine.outputFormat.toUpperCase()}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">전달:Folder</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setTemplateDialogOpen(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
