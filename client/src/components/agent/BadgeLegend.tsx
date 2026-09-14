import { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { AGENT_BADGE_LEGEND } from './agentBadges';

/**
 * 「标签说明」入口 + 弹窗：把卡片上的徽标一次讲清。
 * 徽标挂在卡片上时只能靠悬停看 title，用户往往不知道要悬停；
 * 这里给一个显式入口，把同一份解释（AGENT_BADGE_LEGEND）集中列出来。
 */
export default function BadgeLegend() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" title="卡片上这些标签分别是什么意思？" onClick={() => setOpen(true)}>
        标签说明
      </Button>
      <Modal
        open={open}
        title="卡片上的标签是什么意思？"
        width={620}
        onClose={() => setOpen(false)}
        footer={<Button variant="ghost" onClick={() => setOpen(false)}>知道了</Button>}
      >
        <p className="badge-legend__intro">
          每张卡片对应一个<strong>实际的技能目录</strong>。多个 Agent 指向同一目录时合成一张卡：卡片标题是其中的<strong>主 Agent</strong>（安装方式、预设等策略以它为准），其余以「别名 X」列出——它们和主 Agent 走的是同一个路径，点芯片可进入各自的详情页。
        </p>
        <div className="badge-legend">
          {AGENT_BADGE_LEGEND.map((it) => (
            <div className="badge-legend__row" key={it.label}>
              <span className="badge-legend__tag">
                <Badge tone={it.tone} dot={it.dot}>{it.label}</Badge>
              </span>
              <span className="badge-legend__desc">{it.desc}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
