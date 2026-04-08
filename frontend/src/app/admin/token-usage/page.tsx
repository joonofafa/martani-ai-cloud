'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { adminApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import {
  Zap, ArrowLeft, Loader2, MessageSquare, Clock, Eye, Mic, Search,
} from 'lucide-react';

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(input: number, output: number): string {
  const cost = (input / 1_000_000) * 0.039 + (output / 1_000_000) * 0.19;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export default function TokenUsagePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== 'admin')) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, user, router]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['token-stats', days],
    queryFn: () => adminApi.getTokenStats(days),
    enabled: !!user && user.role === 'admin',
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Totals
  const totals = stats?.reduce(
    (acc, u) => ({
      chat: acc.chat + u.chat_input + u.chat_output,
      schedule: acc.schedule + u.schedule_input + u.schedule_output,
      vision: acc.vision + u.vision_input + u.vision_output,
      audio: acc.audio + u.audio_input + u.audio_output,
      mining: acc.mining + u.mining_input + u.mining_output,
    }),
    { chat: 0, schedule: 0, vision: 0, audio: 0, mining: 0 }
  ) || { chat: 0, schedule: 0, vision: 0, audio: 0, mining: 0 };
  const grandTotal = totals.chat + totals.schedule + totals.vision + totals.audio + totals.mining;

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.push('/admin')} className="p-2 text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Zap className="w-8 h-8 text-purple-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-100">토큰 사용 통계</h1>
              <p className="text-sm text-gray-500">사용자별 LLM API 사용량 (gpt-oss-120b 기준)</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: '전체', value: grandTotal, icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { label: 'AI Chat', value: totals.chat, icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: '스케줄', value: totals.schedule, icon: Clock, color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: '비전 인덱싱', value: totals.vision, icon: Eye, color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { label: '오디오 인덱싱', value: totals.audio, icon: Mic, color: 'text-pink-400', bg: 'bg-pink-500/10' },
              { label: '마이닝', value: totals.mining, icon: Search, color: 'text-teal-400', bg: 'bg-teal-500/10' },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="bg-gray-800 rounded-xl border border-gray-700 p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`p-1.5 rounded-lg ${card.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${card.color}`} />
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-500">{card.label}</span>
                  </div>
                  <p className={`text-lg sm:text-xl font-bold ${card.color}`}>{fmtTok(card.value)}</p>
                </div>
              );
            })}
          </div>

          {/* Period Filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5">
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    days === d ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {d}일
                </button>
              ))}
            </div>
            {stats && (
              <span className="text-xs text-gray-500">{stats.length}명의 사용자</span>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
            </div>
          ) : !stats || stats.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              해당 기간에 사용 내역이 없습니다.
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase whitespace-nowrap">사용자</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase whitespace-nowrap">요금제</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase whitespace-nowrap">월 사용량</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-blue-400 uppercase whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1"><MessageSquare className="w-3 h-3" />Chat</span>
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-green-400 uppercase whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1"><Clock className="w-3 h-3" />Schedule</span>
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-orange-400 uppercase whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1"><Eye className="w-3 h-3" />Vision</span>
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-pink-400 uppercase whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1"><Mic className="w-3 h-3" />Audio</span>
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-teal-400 uppercase whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1"><Search className="w-3 h-3" />Mining</span>
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-400 uppercase whitespace-nowrap">추정 비용</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {stats.map((u) => {
                      const chatTotal = u.chat_input + u.chat_output;
                      const schedTotal = u.schedule_input + u.schedule_output;
                      const visTotal = u.vision_input + u.vision_output;
                      const audTotal = u.audio_input + u.audio_output;
                      const minTotal = u.mining_input + u.mining_output;
                      const allInput = u.chat_input + u.schedule_input + u.vision_input + u.audio_input + u.mining_input;
                      const allOutput = u.chat_output + u.schedule_output + u.vision_output + u.audio_output + u.mining_output;
                      const pct = u.token_quota > 0 ? (u.tokens_used_month / u.token_quota) * 100 : 0;

                      return (
                        <tr key={u.user_id} className="hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-200 truncate max-w-[180px]">{u.email}</p>
                            {u.name && <p className="text-xs text-gray-500">{u.name}</p>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                              u.plan === 'pro' ? 'bg-purple-500/20 text-purple-400'
                                : u.plan === 'basic' ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-gray-700 text-gray-400'
                            }`}>
                              {u.plan === 'pro' ? 'Pro' : u.plan === 'basic' ? 'Basic' : 'Free'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="text-sm text-gray-200 font-mono">{fmtTok(u.tokens_used_month)}</div>
                            <div className="w-16 bg-gray-700 rounded-full h-1 mt-1 ml-auto">
                              <div
                                className={`h-1 rounded-full ${pct > 80 ? 'bg-red-500' : 'bg-purple-500'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            {chatTotal > 0 ? (
                              <div>
                                <span className="text-sm text-blue-400 font-mono">{fmtTok(chatTotal)}</span>
                                <p className="text-[10px] text-gray-500">in {fmtTok(u.chat_input)} / out {fmtTok(u.chat_output)}</p>
                              </div>
                            ) : <span className="text-xs text-gray-600">-</span>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {schedTotal > 0 ? (
                              <div>
                                <span className="text-sm text-green-400 font-mono">{fmtTok(schedTotal)}</span>
                                <p className="text-[10px] text-gray-500">in {fmtTok(u.schedule_input)} / out {fmtTok(u.schedule_output)}</p>
                              </div>
                            ) : <span className="text-xs text-gray-600">-</span>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {visTotal > 0 ? (
                              <span className="text-sm text-orange-400 font-mono">{fmtTok(visTotal)}</span>
                            ) : <span className="text-xs text-gray-600">-</span>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {audTotal > 0 ? (
                              <span className="text-sm text-pink-400 font-mono">{fmtTok(audTotal)}</span>
                            ) : <span className="text-xs text-gray-600">-</span>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {minTotal > 0 ? (
                              <span className="text-sm text-teal-400 font-mono">{fmtTok(minTotal)}</span>
                            ) : <span className="text-xs text-gray-600">-</span>}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-sm text-gray-300 font-mono">{fmtCost(allInput, allOutput)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
