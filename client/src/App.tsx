import { useCallback, useEffect, useState } from 'react';
import NavRail from './components/layout/NavRail';
import Topbar from './components/layout/Topbar';
import { ToastProvider, useToast } from './components/ui/Toast';
import Library from './views/Library';
import Agents from './views/Agents';
import Presets from './views/Presets';
import Projects from './views/Projects';
import Health from './views/Health';
import Settings from './views/Settings';
import { emitReload, getStoredTheme, storeTheme, type Tab } from './state/store';
import { navigate, useRoute } from './state/router';
import { useI18n, type MsgKey } from './i18n';

/** 一级页面的标题 / 副标题键（语言切换时随之变化） */
const TITLES: Record<Tab, { t: MsgKey }> = {
  library: { t: 'nav.library' },
  agents: { t: 'nav.agents' },
  presets: { t: 'nav.presets' },
  projects: { t: 'nav.projects' },
  health: { t: 'nav.health' },
  settings: { t: 'nav.settings' },
};

export default function App() {
  const route = useRoute();
  const { tab } = route;
  const { t } = useI18n();
  const [theme, setTheme] = useState<'light' | 'dark'>(getStoredTheme());
  const [reloading, setReloading] = useState(false);
  useToast();

  // 应用主题。首帧由 index.html 的内联脚本先写好，避免深色底闪一下白。
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 只有用户显式切换才记住选择；跟随系统时不在首次打开就写死
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      return next;
    });
  }, []);

  /** 切换一级页面：回到该页顶层，不残留上一页的详情与筛选 */
  const selectTab = useCallback((t: Tab) => {
    navigate({ tab: t, sub: null, query: new URLSearchParams() });
  }, []);

  const reloadAll = useCallback(() => {
    setReloading(true);
    emitReload();
    setTimeout(() => setReloading(false), 600);
  }, []);

  return (
    <div className="hub">
      <NavRail active={tab} onSelect={selectTab} />
      <div className="shell-main">
        <Topbar
          title={t(TITLES[tab].t)}
          detail={route.sub}
          theme={theme}
          onToggleTheme={toggleTheme}
          onReload={reloadAll}
          reloading={reloading}
        />
        <main className="shell-content" key={tab}>
          {tab === 'library' && <Library />}
          {tab === 'agents' && <Agents />}
          {tab === 'presets' && <Presets />}
          {tab === 'projects' && <Projects />}
          {tab === 'health' && <Health />}
          {tab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}

export function AppWithToasts() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
