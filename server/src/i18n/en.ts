/**
 * English server messages — default locale and source of truth for keys.
 * Only user-facing strings live here (API errors, sync results, diagnostics...);
 * log messages are always plain English literals and never localized.
 */
export const en = {
  /* ---------- sync ---------- */
  'sync.unknownAgent': 'Unknown agent: {agent}',
  'sync.mkdirFailed': 'Cannot create directory {dir}: {msg}',
  'sync.externalLink': 'Existing external link, not replaced automatically: {dir}',
  'sync.realDirMismatch': 'Same-named real directory is not a copy deployed by this tool, not overwritten: {dir}',
  'sync.fileExists': 'Same-named file already exists, not overwritten: {dir}',
  'sync.symlinkFallback': '{name}: symlink unavailable, fell back to copy ({msg})',

  /* ---------- diagnose ---------- */
  'diag.configOk': 'Config loaded: {path}',
  'diag.configMissing': 'Config file not found; defaults will be used',
  'diag.noRepos': 'No skill repository configured',
  'diag.repoMissing': 'Repository {id} directory missing: {path}',
  'diag.repoOk': 'Repository {id} @ {path}',
  'diag.repoNestedSkills': 'Repository {id}: {n} skill(s) sit in category subdirectories and are not recognised ({names}). Own repositories are flat-only — move them to the root, or register that folder as a read-only source',
  'diag.fsrc': 'External source {id}: {path}',
  'diag.noProjects': 'No project registered (nothing to check)',
  'diag.projectMissing': 'Project path missing: {path}',
  'diag.projectNoAgents': 'Project {path} (registered, .agents/skills not created yet)',
  'diag.syncMissing': 'missing {n}',
  'diag.syncExtra': 'extra {n}',
  'diag.syncBroken': 'broken {n}',
  'diag.syncOk': '{agent}: {n} desired · in sync',
  'diag.syncBad': '{agent}: {n} desired · {parts}',
  'diag.syncNone': 'No active agent; nothing compared',
  'diag.brokenFound': '{agent} has a broken link: {name}',
  'diag.noBroken': 'No broken link',
  'diag.dupFound': '{name} has {n} sources to merge',
  'diag.noDup': 'No same-name multi-source',
  'diag.contentSec': '{name} · {loc} · {rule}',
  'diag.contentAllOk': 'Content checks passed for {n} own-repository skill(s)',
  'diag.contentNoOwn': 'No own-repository skill to inspect',
  'diag.content.yaml': '{name}: SKILL.md frontmatter cannot be parsed (broken YAML)',
  'diag.content.missing-name': '{name}: SKILL.md frontmatter is missing "name"',
  'diag.content.missing-description': '{name}: SKILL.md frontmatter is missing "description"',
  'diag.content.name-dir-mismatch': '{name}: frontmatter name differs from the directory name; some agents may fail to load it',
  'diag.content.name-slug': '{name}: frontmatter name is not lowercase-hyphen style',

  /* ---------- content security rules (F1) ---------- */
  'sec.rule.pipeToShell': 'Remote code execution: piping a download into a shell',
  'sec.rule.bashCRemote': 'Remote code execution: shell -c with command substitution',
  'sec.rule.reverseShell': 'Reverse shell over /dev/tcp',
  'sec.rule.netcatExec': 'Netcat command execution (-e)',
  'sec.rule.powershellIex': 'PowerShell code execution (IEX / Invoke-Expression)',
  'sec.rule.rmRfAbsolute': 'Destructive recursive delete on a root path',
  'sec.rule.evalCall': 'Dynamic code evaluation (eval)',
  'sec.rule.childProcess': 'Node.js child_process usage',
  'sec.rule.subprocessShell': 'Python subprocess with shell=True',
  'sec.rule.osSystem': 'Python os.system execution',
  'sec.rule.sudo': 'Privilege escalation via sudo',
  'sec.rule.chmod777': 'World-writable permissions (chmod 777)',
  'sec.rule.shellRcWrite': 'Writing to a shell startup file',
  'sec.rule.openaiKey': 'Hardcoded OpenAI API key',
  'sec.rule.anthropicKey': 'Hardcoded Anthropic API key',
  'sec.rule.awsAccessKey': 'Hardcoded AWS access key',
  'sec.rule.githubPat': 'Hardcoded GitHub token',
  'sec.rule.githubPatFine': 'Hardcoded GitHub fine-grained token',
  'sec.rule.slackToken': 'Hardcoded Slack token',
  'sec.rule.googleApiKey': 'Hardcoded Google API key',
  'sec.rule.stripeKey': 'Hardcoded Stripe secret key',
  'sec.rule.npmToken': 'Hardcoded npm token',
  'sec.rule.privateKeyBlock': 'Embedded private key block',
  'sec.rule.genericSecret': 'Hardcoded credential assignment',
  'sec.rule.ignorePrevious': 'Prompt injection: ignoring previous instructions',
  'sec.rule.disregardRules': 'Prompt injection: disregarding existing rules',
  'sec.rule.ignorePreviousZh': 'Prompt injection: ignoring previous instructions (zh)',
  'sec.rule.disregardRulesZh': 'Prompt injection: overriding system rules (zh)',
  'sec.rule.dontTellUser': 'Instruction to hide behavior from the user',
  'sec.rule.hideFromUserZh': 'Instruction to hide behavior from the user (zh)',
  'sec.rule.asOfNowIgnore': 'Prompt injection: "as of now, ignore ..."',
  'sec.rule.jailbreak': 'Jailbreak / unrestricted-mode phrasing',
  'sec.rule.zeroWidth': 'Zero-width characters (possible hidden text)',
  'sec.rule.bidiControl': 'Bidirectional control characters (text spoofing)',
  'sec.rule.unicodeTags': 'Unicode tag characters (invisible payload)',
  'sec.rule.longBase64': 'Long base64 blob (possible encoded payload)',

  /* ---------- fix ---------- */
  'fix.resynced': 'Re-synced {agent}',
  'fix.resyncedActive': 'Re-synced active agents; broken links cleared',
  'fix.projectReady': 'Project structure ensured: {path}',
  'fix.repoNotFound': 'Repository not found',
  'fix.repoCreated': 'Repository directory created: {path}',
  'fix.tagsMigrated': 'Migrated tags of {n} skills into frontmatter',
  'fix.nothing': 'This item needs no automatic fix',

  /* ---------- takeover ---------- */
  'takeover.repoMissing': 'Repository not found: {id}',
  'takeover.copyMissing': 'Repository copy of {name} does not exist; collect it first',
  'takeover.srcMissing': 'Source entry {name} does not exist',
  'takeover.isRepoBody': '{name} in the source directory is already the repository body; takeover not needed',
  'takeover.needConfirm': 'Takeover replaces this directory entry with a link to the repository copy; please confirm',
  'takeover.agentNotInstalled': 'Agent not installed: {key}',

  /* ---------- projects ---------- */
  'projects.notRegistered': 'Project not registered',
  'projects.noRepo': 'No repository to push back to',
  'projects.noAgentsDir': 'Project has no .agents/skills yet',
  'projects.notInRepo': '{name} (no same-named skill in the repository, not written back)',
  'projects.takeoverConfirm': 'Takeover replaces {name} in the project with the repository version; please confirm',
  'projects.pathMissing': 'Path does not exist: {path}',
  'projects.alreadyRegistered': 'Project already registered',

  /* ---------- collect ---------- */
  'collect.sourceMissing': '(source directory not found: {name})',
  'collect.srcUnreachable': '{name} (source unreachable: {msg})',
  'collect.existsSkip': '{name} (already exists, skipped as duplicate)',
  'collect.sameBody': '{name} (source and repository copy are the same body; overwrite skipped)',
  'collect.overwriteFailed': '{name} (overwrite failed: {msg})',
  'collect.copyFailed': '{name} ({msg})',
  'collect.agentNotInstalled': '(agent not installed: {key})',

  /* ---------- import ---------- */
  'import.pathMissing': 'Path does not exist',
  'import.dirMissing': '(path does not exist)',
  'import.noRepo': '(no repository to import into)',
  'import.srcUnreachable': '{name} (source unreachable: {msg})',
  'import.existsSkip': '{name} (already exists, skipped as duplicate)',
  'import.failed': '{name} ({msg})',

  /* ---------- merge / presets ---------- */
  'merge.skillNotFound': 'Skill not found: {name}',
  'preset.exists': 'Preset already exists: {name}',
  'preset.notFound': 'Preset not found: {name}',

  /* ---------- picker ---------- */
  'picker.title.dir': 'Skills Hub — Choose a folder',
  'picker.title.file': 'Skills Hub — Choose a file',
  'picker.unavailableDir': 'Cannot open the system folder picker: {msg}. Please type the path manually.',
  'picker.unavailableFile': 'Cannot open the system file picker: {msg}. Please type the path manually.',
  'picker.notFound': 'No native picker (zenity / kdialog) available in this environment; please type the path manually.',

  /* ---------- card actions ---------- */
  'card.collect': 'Collect to repository',
  'card.collect.title': 'Copy this skill into your repository so every agent / project can share it; the original in this directory stays untouched',
  'card.delete': 'Delete',
  'card.delete.title': 'Remove this skill from this directory (cannot be undone)',
  'card.disable': 'Disable',
  'card.disable.title': 'Disable this skill (stop distributing it)',
  'card.enable': 'Enable',
  'card.enable.title': 'Enable this skill',

  /* ---------- route-level errors ---------- */
  'api.repoExists': 'Repository {id} already exists',
  'api.agentExists': 'Agent {key} already exists',
  'api.noInstalledAgent': 'No installed agent to collect from',
  /* ---------- register preview ---------- */
  'register.idEmpty': 'ID must not be empty',
  'register.idInvalid': 'Invalid ID {id}: only letters, digits and . _ - are allowed, starting with a letter or digit',
  'api.skillEnabled': 'This skill is currently enabled; disable it first (remove it from the desired set) before deleting',
  'api.noRepoToCollect': 'No repository to collect into',
} as const;

/** Key union derived from the English catalog. */
export type MsgKey = keyof typeof en;
