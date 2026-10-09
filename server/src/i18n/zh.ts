/**
 * 简体中文服务端消息。键名与 en.ts 完全一致（类型约束保证）。
 * 仅承载用户可见文案（API 错误、同步结果、诊断消息……）；
 * 日志永远是纯英文字面量，不走 i18n。
 */
import type { MsgKey } from './en.js';

export const zh: Record<MsgKey, string> = {
  /* ---------- sync ---------- */
  'sync.unknownAgent': '未知 agent: {agent}',
  'sync.mkdirFailed': '无法创建目录 {dir}: {msg}',
  'sync.externalLink': '已存在外部软链，未自动替换：{dir}',
  'sync.realDirMismatch': '同名实体目录不是本工具部署的副本，未自动覆盖：{dir}',
  'sync.fileExists': '同名文件已存在，未自动覆盖：{dir}',
  'sync.symlinkFallback': '{name}: 软链不可用，已降级为复制（{msg}）',

  /* ---------- diagnose ---------- */
  'diag.configOk': '配置已加载: {path}',
  'diag.configMissing': '配置不存在，将用默认值',
  'diag.noRepos': '未配置 skill 仓库',
  'diag.repoMissing': '仓库 {id} 目录缺失: {path}',
  'diag.repoOk': '仓库 {id} @ {path}',
  'diag.repoNestedSkills': '仓库 {id}: 有 {n} 个技能位于分类子目录里，不会被识别（{names}）。自有仓库仅支持扁平布局——请把它们移到根下，或把该目录登记为只读来源',
  'diag.fsrc': '外部源 {id}: {path}',
  'diag.noProjects': '未登记项目（无需校验）',
  'diag.projectMissing': '项目路径缺失: {path}',
  'diag.projectNoAgents': '项目 {path}（已登记，未生成 .agents/skills）',
  'diag.syncMissing': '缺 {n}',
  'diag.syncExtra': '多 {n}',
  'diag.syncBroken': '失效 {n}',
  'diag.syncOk': '{agent}: {n} 期望 已同步',
  'diag.syncBad': '{agent}: {n} 期望 · {parts}',
  'diag.syncNone': '无活跃 agent，未比对',
  'diag.brokenFound': '{agent} 存在失效软链: {name}',
  'diag.noBroken': '无失效软链',
  'diag.dupFound': '{name} 有 {n} 个来源待收编',
  'diag.noDup': '无同名多来源',
  'diag.contentSec': '{name} · {loc} · {rule}',
  'diag.contentAllOk': '{n} 个自有仓库技能内容检查通过',
  'diag.contentNoOwn': '无自有仓库技能可检查',
  'diag.contentItem': '{name}: {msg}',
  'diag.content.yaml': 'SKILL.md frontmatter 无法解析（YAML 损坏）',
  'diag.content.missing-name': 'SKILL.md frontmatter 缺少 name',
  'diag.content.missing-description': 'SKILL.md frontmatter 缺少 description',
  'diag.content.name-dir-mismatch': 'frontmatter name 与目录名不一致，可能导致加载不到',
  'diag.content.name-slug': 'frontmatter name 不符合小写连字符规范',

  /* ---------- 内容安全规则（F1） ---------- */
  'sec.rule.pipeToShell': '远程代码执行：下载内容直接管道给 shell',
  'sec.rule.bashCRemote': '远程代码执行：shell -c 内嵌命令替换',
  'sec.rule.reverseShell': '利用 /dev/tcp 的反向 shell',
  'sec.rule.netcatExec': 'netcat 命令执行（-e）',
  'sec.rule.powershellIex': 'PowerShell 代码执行（IEX / Invoke-Expression）',
  'sec.rule.rmRfAbsolute': '对根路径的递归删除',
  'sec.rule.evalCall': '动态代码求值（eval）',
  'sec.rule.childProcess': '使用 Node.js child_process',
  'sec.rule.subprocessShell': 'Python subprocess 开启 shell=True',
  'sec.rule.osSystem': 'Python os.system 执行',
  'sec.rule.sudo': '通过 sudo 提权',
  'sec.rule.chmod777': '全局可写权限（chmod 777）',
  'sec.rule.shellRcWrite': '写入 shell 启动脚本',
  'sec.rule.openaiKey': '硬编码 OpenAI API 密钥',
  'sec.rule.anthropicKey': '硬编码 Anthropic API 密钥',
  'sec.rule.awsAccessKey': '硬编码 AWS 访问密钥',
  'sec.rule.githubPat': '硬编码 GitHub token',
  'sec.rule.githubPatFine': '硬编码 GitHub 细粒度 token',
  'sec.rule.slackToken': '硬编码 Slack token',
  'sec.rule.googleApiKey': '硬编码 Google API 密钥',
  'sec.rule.stripeKey': '硬编码 Stripe 密钥',
  'sec.rule.npmToken': '硬编码 npm token',
  'sec.rule.privateKeyBlock': '内嵌私钥块',
  'sec.rule.genericSecret': '硬编码凭据赋值',
  'sec.rule.ignorePrevious': '提示注入：忽略先前指令',
  'sec.rule.disregardRules': '提示注入：作废既有规则',
  'sec.rule.ignorePreviousZh': '提示注入：忽略先前指令（中文）',
  'sec.rule.disregardRulesZh': '提示注入：无视系统规则（中文）',
  'sec.rule.dontTellUser': '要求对用户隐瞒行为',
  'sec.rule.hideFromUserZh': '要求对用户隐瞒行为（中文）',
  'sec.rule.asOfNowIgnore': '提示注入：“从现在起忽略…”',
  'sec.rule.jailbreak': '越狱 / 无限制模式措辞',
  'sec.rule.zeroWidth': '零宽字符（可能隐藏文本）',
  'sec.rule.bidiControl': '双向控制字符（文本伪装）',
  'sec.rule.unicodeTags': 'Unicode 标签字符（不可见载荷）',
  'sec.rule.longBase64': '超长 base64 串（可能为编码载荷）',

  /* ---------- fix ---------- */
  'fix.resynced': '已重同步 {agent}',
  'fix.resyncedActive': '已重同步活跃 agent，消除失效软链',
  'fix.projectReady': '已确保项目结构存在: {path}',
  'fix.repoNotFound': 'repo 未找到',
  'fix.repoCreated': '已创建仓库目录: {path}',
  'fix.tagsMigrated': '已迁移 {n} 个 skill 标签到 frontmatter',
  'fix.nothing': '该项无需自动修复',

  /* ---------- takeover ---------- */
  'takeover.repoMissing': 'repo 不存在: {id}',
  'takeover.copyMissing': '仓库副本 {name} 不存在，请先归集入库',
  'takeover.srcMissing': '来源目录 {name} 不存在',
  'takeover.isRepoBody': '来源目录里的 {name} 就是仓库本体，无需接管',
  'takeover.needConfirm': '接管会把该目录里的条目替换为指向仓库副本的软链，请确认',
  'takeover.agentNotInstalled': 'agent 未安装: {key}',

  /* ---------- projects ---------- */
  'projects.notRegistered': '项目未登记',
  'projects.noRepo': '无仓库可回写',
  'projects.noAgentsDir': '项目尚无 .agents/skills',
  'projects.notInRepo': '{name}（仓库中无同名 skill，未回写）',
  'projects.takeoverConfirm': '接管会用仓库那一版替换项目里的 {name}，请确认',
  'projects.pathMissing': '路径不存在: {path}',
  'projects.alreadyRegistered': '项目已登记',

  /* ---------- collect ---------- */
  'collect.sourceMissing': '（来源目录不存在: {name}）',
  'collect.srcUnreachable': '{name}（源不可达: {msg}）',
  'collect.existsSkip': '{name}（已存在，去重跳过）',
  'collect.sameBody': '{name}（源与仓库副本为同一本体，跳过覆盖）',
  'collect.overwriteFailed': '{name}（覆盖失败: {msg}）',
  'collect.copyFailed': '{name}（{msg}）',
  'collect.agentNotInstalled': '（agent 未安装: {key}）',

  /* ---------- import ---------- */
  'import.pathMissing': '路径不存在',
  'import.dirMissing': '（路径不存在）',
  'import.noRepo': '（无仓库可导入）',
  'import.srcUnreachable': '{name}（源不可达: {msg}）',
  'import.existsSkip': '{name}（已存在，去重跳过）',
  'import.failed': '{name}（{msg}）',

  /* ---------- merge / presets ---------- */
  'merge.skillNotFound': 'skill 不存在: {name}',
  'preset.exists': 'preset 已存在: {name}',
  'preset.notFound': 'preset 不存在: {name}',

  /* ---------- picker ---------- */
  'picker.title.dir': 'Skills Hub — 选择目录',
  'picker.title.file': 'Skills Hub — 选择文件',
  'picker.unavailableDir': '无法调起系统目录选择器：{msg}。请手动输入路径。',
  'picker.unavailableFile': '无法调起系统文件选择器：{msg}。请手动输入路径。',
  'picker.notFound': '当前环境未找到可用的原生选择器（zenity / kdialog），请手动输入路径。',

  /* ---------- card actions ---------- */
  'card.collect': '归集到仓库',
  'card.collect.title': '把这个技能复制进你的仓库，之后各 Agent / 项目都能共享；本目录里的原技能保持不动',
  'card.delete': '删除',
  'card.delete.title': '从本目录移除这个技能（不可撤销）',
  'card.disable': '停用',
  'card.disable.title': '停用此技能（取消分发）',
  'card.enable': '启用',
  'card.enable.title': '启用此技能',

  /* ---------- route-level errors ---------- */
  'api.repoExists': 'repo {id} 已存在',
  'api.agentExists': 'agent {key} 已存在',
  'api.noInstalledAgent': '无已安装 agent 可归集',
  /* ---------- register preview ---------- */
  'register.idEmpty': '标识 ID 不能为空',
  'register.idInvalid': '标识 {id} 不合法：只允许字母、数字与 . _ -，且以字母或数字开头',
  'api.skillEnabled': '该技能正处于启用状态；请先关闭（移除期望）再删除',
  'api.noRepoToCollect': '无仓库可归集',
};
