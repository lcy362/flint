# 在智能体页增加「新增自定义 Agent」流程

## Context（为什么要做）
自定义 Agent 的**后端与表单其实都已存在**，但入口只在「设置页」：
- 服务端 `GET/POST/DELETE /agents/custom` 已实现（Routes：[routes.ts](file:///Users/lcy/Documents/trae_projects/local-skills-hub/server/src/api/routes.ts#L320-L346)）。
- 数据类型 `CustomAgent`（key/name/globalDir/projectDir/recursive）已定义（[types.ts](file:///Users/lcy/Documents/trae_projects/local-skills-hub/server/src/config/types.ts#L27-L37)）。
- `customToDef()`/`allAgentDefs()` 已把自定义 Agent 合并进统一列表，AgentView 带 `custom: true`（[agents.ts](file:///Users/lcy/Documents/trae_projects/local-skills-hub/server/src/core/agents.ts#L97-L112)）。
- 前端新建表单 `AddAgentModal` 目前 `Settings.tsx` 里是局部组件（[Settings.tsx](file:///Users/lcy/Documents/trae_projects/local-skills-hub/client/src/views/Settings.tsx#L281-L332)）。

用户一直在看「智能体页」，却无法在那里创建 / 管理自定义 Agent。目标：把「新增自定义 Agent」入口放到智能体页并复用现有表单，同时让自定义 Agent 在该页能一眼识别并可删除。

用户已确认：入口放智能体页 + 复用弹窗；除新增外也提供删除入口，并在卡片/详情标出「自定义」。**服务端无需改动。**

## 改动清单

### 1. 复用新建表单：抽出共享组件
新建 `client/src/components/agent/AddAgentModal.tsx`，把 `Settings.tsx` 里的 `AddAgentModal`（281-332 行，props `{ open, onClose, onDone }`，提交 `POST /agents/custom`）原样搬过去，并补齐自身需要的 imports（Modal、Button、FieldInput、PathField、Switch、useToast、api）。
`Settings.tsx` 改为 `import { AddAgentModal } from '../components/agent/AddAgentModal'`，删除本地定义；清理因此不再使用的 imports（如 PathField/Switch，若仅该处使用）。

### 2. 智能体页入口（`client/src/views/Agents.tsx`）
- `PageHeader` 的 actions 加「新增自定义 Agent」按钮（放在「刷新」旁），`onClick` 打开 `AddAgentModal`；`onDone` → `reload()` 刷新列表。
- 引入共享组件并加本地 `addOpen` state。

### 3. 卡片标记（`Agents.tsx` + `agentBadges.tsx`）
- `agentBadges.tsx` 新增 `CUSTOM_META` 与 `customBadge(agent)`：label「自定义」、色调 accent、desc「内置清单之外由用户新增的工具；可在详情页删除」。并在 `AGENT_BADGE_LEGEND` 加对应条目。
- `Agents.tsx` 卡片 `badges` 里：`primary.custom && customBadge(primary)`。

### 4. 详情页：自定义标记 + 删除（`Agents.tsx` 的 `AgentDetail`）
- 头部徽标区加 `agent.custom && customBadge(agent)`。
- `detail-actions` 里当 `agent.custom` 时追加「删除」按钮（danger）：
  `confirm()` 后调 `DELETE /agents/custom/{key}`，成功→ `toast` + `onBack()`（`navigate({...route, sub:null})`）+ `reload()`；失败→ `toast` 报错。
- 内置 Agent（`custom` 为空）不受影响，不显示删除按钮。

## 复用点
- 表单：`AddAgentModal`（从 Settings 抽出共享）。
- 删除：直接调现有 `DELETE /agents/custom/:key`；服务端已顺带清理 `agents[key]` 与 `activeAgents`。
- 标记：沿用 `agentBadges.tsx` 的 Badge 文案/图例模式。
- 路由返回：复用现有 `backToList`。

## 验证
1. `npm run build -w server && npm run build -w client` 均通过。
2. dev 已在跑，打开 http://localhost:5173/ 智能体页：
   - PageHeader 出现「新增自定义 Agent」；填 key/name/globalDir 创建（如 key `my-tool`，目录 `~/.my-tool/skills`）→ 列表出现该卡并带「自定义」徽标。
   - 进其详情页：头部有「自定义」徽标和「删除」按钮；删除后回到列表、卡片消失。
   - 设置页「自定义 Agent」列表同步显示新建项，删除后同步为空。
   - 内置 Agent 卡片/详情无「自定义」徽标、无「删除」按钮，行为不变。