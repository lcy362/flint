import type { ReactNode } from 'react';
import Button from '../ui/Button';
import Segment from '../ui/Segment';
import { useViewModeOptions, type ViewMode } from '../../state/viewMode';
import { useI18n } from '../../i18n';

export interface FilterBarProps {
  /** 搜索框（必填，作为主操作） */
  search: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** 与搜索同排的筛选控件（MultiSelect / SwitchLabel 等） */
  controls?: ReactNode;
  /** 是否存在生效中的筛选条件（决定是否出现「重置」） */
  hasFilters?: boolean;
  onReset?: () => void;
  /** 行末固定操作（刷新、统计等） */
  actions?: ReactNode;
  /**
   * 视图切换（卡片 / 列表），置于工具条右端填充行尾，
   * 让「看什么」与「怎么看」集中在一处。
   * 传入后请同时给页面上的 EntityList 传 hideToggle，避免出现两个入口。
   */
  view?: { value: ViewMode; onChange: (v: ViewMode) => void };
}

/**
 * 统一搜索 / 筛选控制条：一行内集中搜索、各维度筛选、重置与视图切换。
 * 筛选维度一律使用宽度恒定的控件（下拉 / 开关），选项数量增长不会撑坏排版。
 */
export default function FilterBar({
  search,
  controls,
  hasFilters = false,
  onReset,
  actions,
  view,
}: FilterBarProps) {
  const { t } = useI18n();
  const viewModeOptions = useViewModeOptions();
  return (
    <div className="filterbar">
      <div className="filterbar__row">
        <div className="filterbar__search">
          <SearchIcon />
          <input
            className="field"
            type="search"
            value={search.value}
            placeholder={search.placeholder ?? t('common.search')}
            aria-label={search.placeholder ?? t('common.search')}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search.value !== '') {
                e.preventDefault();
                search.onChange('');
              }
            }}
          />
          {search.value !== '' && (
            <button
              type="button"
              className="filterbar__clear"
              aria-label={t('common.clear')}
              title={t('common.clear')}
              onClick={() => search.onChange('')}
            >
              <ClearIcon />
            </button>
          )}
        </div>

        <div className="filterbar__controls">
          {controls}
          {hasFilters && onReset && (
            <Button variant="ghost" onClick={onReset}>
              {t('common.reset')}
            </Button>
          )}
          {actions}
        </div>

        {view && (
          <div className="filterbar__view">
            <Segment<ViewMode> value={view.value} onChange={view.onChange} options={viewModeOptions} />
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="filterbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" width="14" height="14">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
