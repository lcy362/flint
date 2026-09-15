import type { Tab } from '../../state/store';
import { useI18n, type MsgKey } from '../../i18n';

const ITEMS: { key: Tab; label: MsgKey; icon: string }[] = [
  { key: 'library', label: 'nav.library', icon: '◈' },
  { key: 'agents', label: 'nav.agents', icon: '◉' },
  { key: 'presets', label: 'nav.presets', icon: '□' },
  { key: 'projects', label: 'nav.projects', icon: '❐' },
  { key: 'health', label: 'nav.health', icon: '◎' },
  { key: 'settings', label: 'nav.settings', icon: '⚙' },
];

export default function NavRail({
  active,
  onSelect,
  counts,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  counts?: Partial<Record<Tab, number>>;
}) {
  const { t } = useI18n();
  return (
    <nav className="rail scroll">
      <div className="rail__brand">
        <span className="rail__mark">
          Flint<b>·</b>
        </span>
        <span className="rail__tag">local</span>
      </div>
      <div className="rail__label">{t('nav.label')}</div>
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className={`rail__link ${active === it.key ? 'is-active' : ''}`}
          onClick={() => onSelect(it.key)}
        >
          <span style={{ opacity: 0.8 }}>{it.icon}</span>
          {t(it.label)}
          {counts?.[it.key] !== undefined && <span className="count">{counts[it.key]}</span>}
        </button>
      ))}
      <div className="rail__foot">
        <span>{t('nav.footer')}</span>
        <span className="mono">v0.1</span>
      </div>
    </nav>
  );
}
