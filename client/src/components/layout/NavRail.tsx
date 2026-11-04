import type { Tab } from '../../state/store';
import { useI18n, type MsgKey } from '../../i18n';
import Icon, { type IconName } from '../ui/Icon';

const ITEMS: { key: Tab; label: MsgKey; icon: IconName }[] = [
  { key: 'library', label: 'nav.library', icon: 'library' },
  { key: 'agents', label: 'nav.agents', icon: 'agents' },
  { key: 'presets', label: 'nav.presets', icon: 'presets' },
  { key: 'projects', label: 'nav.projects', icon: 'projects' },
  { key: 'health', label: 'nav.health', icon: 'health' },
  { key: 'settings', label: 'nav.settings', icon: 'settings' },
];

export default function NavRail({
  active,
  onSelect,
  counts,
}: Readonly<{
  active: Tab;
  onSelect: (t: Tab) => void;
  counts?: Partial<Record<Tab, number>>;
}>) {
  const { t } = useI18n();
  return (
    <nav className="rail scroll" aria-label={t('nav.label')}>
      <div className="rail__brand">
        <span className="rail__mark" aria-hidden="true">
          <Icon name="flint" size={22} strokeWidth={1.4} />
        </span>
        <span className="rail__wordmark">FLINT</span>
        <span className="rail__tag">local</span>
      </div>
      <div className="rail__label" aria-hidden="true">
        {t('nav.label')}
      </div>
      {ITEMS.map((it) => {
        const on = active === it.key;
        return (
          <button
            key={it.key}
            type="button"
            className={`rail__link ${on ? 'is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            title={t(it.label)}
            onClick={() => onSelect(it.key)}
          >
            <span className="rail__icon">
              <Icon name={it.icon} />
            </span>
            <span className="rail__text">{t(it.label)}</span>
            {counts?.[it.key] !== undefined && <span className="count">{counts[it.key]}</span>}
          </button>
        );
      })}
      <div className="rail__foot">
        <span>{t('nav.footer')}</span>
      </div>
    </nav>
  );
}
