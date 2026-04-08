'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AxiosError } from 'axios';
import { Download, Lock, FileText, AlertCircle } from 'lucide-react';
import { publicSharesApi, type PublicShareInfo } from '@/lib/api';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;

  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInfo();
  }, [token]);

  const loadInfo = async () => {
    try {
      const data = await publicSharesApi.getInfo(token);
      setInfo(data);
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status === 404) {
        setError('이 공유 링크는 존재하지 않습니다.');
      } else if (status === 410) {
        setError('이 공유 링크는 만료되었거나 삭제되었습니다.');
      } else {
        setError('공유 정보를 불러올 수 없습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!info) return;
    if (info.has_password && !password) {
      setPasswordError(true);
      return;
    }

    setDownloading(true);
    setPasswordError(false);
    try {
      const blob = await publicSharesApi.download(token, password || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = info.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Update download count locally
      setInfo((prev) => prev ? { ...prev, download_count: prev.download_count + 1 } : prev);
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status === 403) {
        setPasswordError(true);
      } else if (status === 410) {
        setError('이 공유 링크는 만료되었거나 삭제되었습니다.');
      } else {
        setError('다운로드에 실패했습니다.');
      }
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-sm w-full text-center shadow-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-200 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-sm w-full shadow-xl">
        {/* File info */}
        <div className="text-center mb-6">
          <FileText className="w-16 h-16 text-primary-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-100 break-all">
            {info.filename}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {formatBytes(info.size)}
            {info.mime_type && ` · ${info.mime_type}`}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {info.download_count > 0 && `${info.download_count}회 다운로드`}
            {info.expires_at && (
              <span>
                {info.download_count > 0 && ' · '}
                만료: {new Date(info.expires_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>

        {/* Password input */}
        {info.has_password && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">비밀번호가 필요합니다</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
              placeholder="비밀번호 입력"
              className={`w-full px-4 py-2.5 bg-gray-700 border rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500 ${
                passwordError ? 'border-red-500' : 'border-gray-600'
              }`}
              onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
            />
            {passwordError && (
              <p className="text-xs text-red-400 mt-1">비밀번호가 올바르지 않습니다</p>
            )}
          </div>
        )}

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
        >
          {downloading ? (
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Download className="w-5 h-5" />
              <span>다운로드</span>
            </>
          )}
        </button>

        {/* Branding */}
        <p className="text-center text-xs text-gray-600 mt-6">
          Martani Cloud
        </p>
      </div>
    </div>
  );
}
