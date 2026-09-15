import Button from '../ui/Button';
import { useI18n } from '../../i18n';

export default function Topbar({
  title,
  sub,
  theme,
  onToggleTheme,
  onReload,
  reloading,
}: {
  title: string;
  sub?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onReload?: () => void;
  reloading?: boolean;
}) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="topbar">
      <div>
        <div className="page-head__title" style={{ fontSize: 'var(--fs-20)' }}>
          {title}
        </div>
        {sub && <div className="page-head__sub">{sub}</div>}
      </div>
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        {onReload && (
          <Button variant="ghost" size="sm" onClick={onReload} title={t('topbar.refresh')}>
            <span className={reloading ? 'topbar__reload' : ''}>↻</span>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onToggleTheme} title={t('topbar.toggleTheme')} aria-label={t('topbar.toggleTheme')}>
          {theme === 'dark' ? '☾' : '☀'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          title={t('topbar.toggleLang')}
          aria-label={t('topbar.toggleLang')}
        >
          <span className="mono">{lang === 'zh' ? 'EN' : '中'}</span>
        </Button>
      </div>
    </header>
  );
}
