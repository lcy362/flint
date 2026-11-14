import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from './store';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function sameDeps(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * 轻量数据获取 hook：自动感知全局 reload 总线。
 * 刷新时保留上一次的数据，新结果回来再替换，避免列表先被清空。
 * 依赖变了（换了一个资源）才丢掉旧数据。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const dataRef = useRef<T | null>(null);
  const depsRef = useRef(deps);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const depsChanged = !sameDeps(depsRef.current, deps);
    depsRef.current = deps;
    let alive = true;
    setError(null);
    if (depsChanged || dataRef.current === null) {
      if (depsChanged) {
        dataRef.current = null;
        setData(null);
      }
      setLoading(true);
    }
    fnRef
      .current()
      .then((d) => {
        if (!alive) return;
        dataRef.current = d;
        setData(d);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const unsub = subscribe(reload);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, reload };
}
