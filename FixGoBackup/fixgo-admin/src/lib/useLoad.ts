'use client';
import { useCallback, useEffect, useState } from 'react';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try { setData(await fn()); setError(''); }
    catch (e: any) { setError(e?.message ?? 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); reload(); }, [reload]);
  return { data, error, loading, reload };
}
