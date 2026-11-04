import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { useI18n } from '../../i18n';

/**
 * 顶栏只承担「方位 + 工具」：左侧是当前一级页面与详情对象的面包屑，
 * 页面标题交给内容区的 h1（此前两处都写标题，详情页顶栏还停在列表标题上）。
 */
export default function Topbar({
  title,
  detail,
  theme,
  onToggleTheme,
  onReload,
  reloading,
}: Readonly<{
  title: string;
  /** 详情对象的标识（技能 id / Agent key / 预设名 / 项目 id），无详情时不传 */
  detail?: string | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onReload?: () => void;
  reloading?: boolean;
}>) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="topbar">
      {detail ? (
        <div className="topbar__crumb">
          <span className="topbar__tab">{title}</span>
          <span className="topbar__sep" aria-hidden="true">
            /
          </span>
          <span className="topbar__sub" title={detail}>
            {detail}
          </span>
        </div>
      ) : null}
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        {onReload && (
          <Button variant="ghost" size="sm" onClick={onReload} title={t('topbar.refresh')} aria-label={t('topbar.refresh')}>
            <span className={reloading ? 'topbar__reload' : ''}>
              <Icon name="refresh" size={15} />
            </span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTheme}
          title={t('topbar.toggleTheme')}
          aria-label={t('topbar.toggleTheme')}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
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
