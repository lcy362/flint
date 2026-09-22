/**
 * English messages — the default and the source of truth for key names.
 *
 * Conventions:
 * - Flat, dotted keys grouped by area.
 * - `{name}` placeholders are interpolated by `t(key, params)`.
 * - `**bold**` markers are rendered by `rich(t(key))`.
 *
 * `zh.ts` must cover exactly the same keys (enforced by type).
 */
export const en = {
  /* ---------- common ---------- */
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.create': 'Create',
  'common.add': 'Add',
  'common.refresh': 'Refresh',
  'common.reset': 'Reset',
  'common.search': 'Search',
  'common.back': '← Back',
  'common.ok': 'Got it',
  'common.register': 'Register',
  'common.empty': 'No data',
  'common.loadFailed': 'Failed to load',
  'common.loading': 'Loading…',
  'common.scanning': 'Scanning…',
  'common.noOptions': 'No options available',
  'common.noMatch': 'No matches',
  'common.clear': 'Clear',
  'common.selectedCount': '{n} selected',
  'common.filterPlaceholder': 'Filter {label}…',
  'common.itemCount': '{n} items',
  'common.skillCount': '{n} skills',
  'common.name': 'Name',
  'common.deleted': 'Deleted',
  'common.updated': 'Updated',
  'common.confirmRun': 'Confirm and run',
  'common.noTags': 'No tags',

  /* ---------- view mode ---------- */
  'view.card': 'Cards',
  'view.list': 'List',

  /* ---------- navigation ---------- */
  'nav.label': 'Navigation',
  'nav.library': 'Library',
  'nav.agents': 'Agents',
  'nav.presets': 'Presets',
  'nav.projects': 'Projects',
  'nav.health': 'Health',
  'nav.settings': 'Settings',
  'nav.footer': 'Local skills vault',

  /* ---------- topbar ---------- */
  'topbar.refresh': 'Refresh',
  'topbar.toggleTheme': 'Toggle theme',
  'topbar.toggleLang': 'Switch to Chinese',

  /* ---------- page subtitles ---------- */
  'app.library.sub': 'Unified skill vault',
  'app.agents.sub': 'Manage skills per agent',
  'app.presets.sub': 'Skill preset groups',
  'app.projects.sub': 'Project skill binding',
  'app.health.sub': 'Health checks and diagnostics',
  'app.settings.sub': 'Language, active agents and sync strategy',

  /* ---------- filters & list titles ---------- */
  'filter.source': 'Source',
  'filter.tags': 'Tags',
  'filter.searchSkills': 'Search skill name / description',
  'filter.searchAgent': 'Search name / key / directory',
  'filter.searchAgentName': 'Search agent name / key',
  'list.filtered': 'Filtered',
  'list.allSkills': 'All skills',
  'list.allPresets': 'All presets',
  'list.allProjects': 'All projects',
  'list.allSkillDirs': 'All skill directories',
  'list.allAgents': 'All agents',

  /* ---------- library ---------- */
  'library.subtitle': '{n} skills in total',
  'library.sourceEmpty': 'No repositories registered yet.',
  'library.tagsEmpty':
    'None of the {n} skills has a tag yet. Open any skill card, add tags in the detail dialog, and they become filterable here.',
  'library.untaggedOnly': 'Untagged only',
  'library.legend.title': 'What do the badges on a skill card mean?',
  'library.legend.intro':
    'Badges on a skill card only describe **what this tool did with it**: the switch at the start of a row says whether it is on the distribution list, and the badges describe where it came from and how it is stored.',
  'library.empty.title': 'Library is empty',
  'library.empty.hint':
    'No skills imported yet. Register an own repository below, then add skills through "Collect" / "Import".',
  'library.detail': 'Detail',

  /* ---------- skill detail dialog ---------- */
  'skillDetail.origin': 'from {origin}',
  'skillDetail.newTag': 'New tag',
  'skillDetail.files': 'Extra files: {files}',

  /* ---------- repositories ---------- */
  'repo.kind.own': 'Own repo',
  'repo.kind.third': 'Third-party repo',
  'repo.section': 'Repositories',
  'repo.register': 'Register repository',
  'repo.registerTitle': 'Register repository',
  'repo.editTitle': 'Edit repository',
  'repo.addSkills': 'Add skills',
  'repo.addSkills.hint':
    'Collect from an installed agent, or import from external directories (e.g. a third-party library used as a data source only)',
  'repo.addTo': 'Add skills to {name}',
  'repo.empty.title': 'No repositories',
  'repo.empty.hint': 'Click "Register repository" to add an own or third-party repository.',
  'repo.updated': 'Repository updated',
  'repo.registered.own': 'Own repository {id} registered',
  'repo.registered.third': 'Third-party repository {id} registered',
  'repo.collectTab': 'Collect from agents',
  'repo.importTab': 'Import from folders',
  'repo.kind': 'Type',
  'repo.kindSwitch':
    'Switching from {from} to {to}. The id **{id}** stays the same, so skill references (tags / presets / projects) are unaffected; the path has been recalculated for the new type.',
  'repo.id': 'ID',
  'repo.idHint': 'Immutable: it is part of the skill identifier name@id',
  'repo.namePlaceholder': 'Defaults to the ID',
  'repo.path': 'Path',
  'repo.layout': 'Layout',
  'repo.layout.auto': 'auto (detect automatically)',
  'repo.layout.nested': 'nested (categorised)',
  'repo.layout.flat': 'flat',
  'repo.flatOnly': 'flat only',
  'repo.flatOnlyHint': 'Own repositories are flat-only: skills are read from the direct subdirectories of {root}. To keep category folders, register that folder as a read-only source instead.',
  'repo.root': 'root (optional)',
  'repo.rootHint': 'Skills root directory; defaults to <path>/skills',
  'repo.scanRoot': 'Skill scan root:',
  'repo.idPathRequired': 'ID and path are required',

  /* ---------- collect wizard (library page) ---------- */
  'collect.taken.fully': 'Taken over',
  'collect.taken.partial': 'Partly taken over',
  'collect.taken.none': 'Not taken over',
  'collect.taken.fully.title': 'Every skill points at the repository copy',
  'collect.taken.partial.title': 'Some skills point at the repository copy',
  'collect.taken.none.title':
    'Skill bodies still live in the agent directory and have not been replaced by links into the repository',
  'collect.takenToast': 'Took over {name}: this directory now points at the repository copy',
  'collect.takeoverFailed': 'Takeover failed',
  'collect.keepRepoVersion': 'Repository copy (keep as is)',
  'collect.allKept': 'Everything keeps the repository as is; no file was written',
  'collect.done': 'Collected {n} skills',
  'collect.doneSkipped': 'Collected {n} skills, skipped {s}',
  'collect.confirm.summary':
    '{write} skills will be written to {repo} ({added} new · {overwritten} repository copies overwritten), {kept} keep the repository as is; {picked} items selected, merged into {groups} by name:',
  'collect.badge.repoBody': 'Repository body · no collect needed',
  'collect.badge.repoBody.title':
    'Inside the agent this is a link to the repository body, so there is no separate version to collect',
  'collect.sub.repoVersion': 'Repository copy · {dest}',
  'collect.sub.symlinkTo': 'link → {target}',
  'collect.sub.symlinkToBody': 'link → {target} (that is the repository body)',
  'collect.sub.symlinkDangling': 'link → (dangling)',
  'collect.dangling': '(dangling)',
  'collect.sub.realDir': 'real directory',
  'collect.sub.symlink': 'link',
  'collect.adoptVersion': 'Version to adopt:',
  'collect.writeTo': 'Write: {src} → {dest}',
  'collect.badge.keep': 'Keep as is',
  'collect.badge.keep.title': 'No file is written; the repository copy stays as it is',
  'collect.badge.overwrite': 'Overwrite repository copy',
  'collect.badge.overwrite.title': 'Will overwrite the existing repository copy: {dest}',
  'collect.badge.new': 'New',
  'collect.confirm.note':
    'Agent directories are never touched; "Overwrite repository copy" first deletes the same-named directory under **{root}** and then writes the chosen version.',
  'collect.confirm.button': 'Confirm collect',
  'collect.final.noop': 'No action · {dest}',
  'collect.final.keep': 'Keeps the existing repository copy untouched: nothing is written or deleted',
  'collect.final.overwriteTitle': '{n}. Overwrite {dest}',
  'collect.final.overwriteOps':
    'Step 1: delete the existing directory **{dest}** and all of its content. Step 2: copy everything from **{src}** to that location',
  'collect.final.overwrite': 'Overwrite',
  'collect.final.newTitle': '{n}. Add {dest}',
  'collect.final.newOps':
    'Copy everything from **{src}** to that location (no same-named directory exists there yet)',
  'collect.final.summary':
    '{write} file writes in total ({added} new · {overwritten} existing directories overwritten), {kept} keep the repository as is. Here is the complete plan — please review each item:',
  'collect.final.notesIntro': 'These are all the file operations that will run. Nothing else happens:',
  'collect.final.note1': '· No other file is deleted or modified; the rest of the repository is unaffected',
  'collect.final.note2': '· No agent directory (including the links inside it) is changed or deleted',
  'collect.final.note3': '· Copying duplicates the whole directory; the source stays exactly as it is',
  'collect.noAgents': 'No installed agent to collect from',
  'collect.agentMeta': '{key} · {n} items',
  'collect.noTakeoverNote':
    'Not taken over: entries in this directory are still real directories or links pointing outside the repository. When a same-named copy already exists in the repository you can "take over", which replaces this directory entry with a link to the repository copy.',
  'collect.selectAll': 'Select all ({a}/{b})',
  'collect.toggleAria': 'Collect {name}',
  'collect.takeover': 'Take over',
  'collect.takeover.symlinkTitle':
    'Take over: this link currently points outside the repository; after takeover it points at the repository copy (the external directory it pointed to is unaffected, the original link is discarded)',
  'collect.takeover.realTitle':
    'Take over: this real skill directory will be replaced by a link to the repository copy. If this version has local changes, select it for "Collect" first',
  'collect.next': 'Next: confirm',
  'collect.repoVersionBadge.title': 'This directory points at the repository body {target}',
  'collect.existsBadge': 'Already in repository',
  'collect.existsBadge.title': 'The repository already has a skill with this name; collection deduplicates and skips it',

  /* ---------- collect modal (agent / project detail) ---------- */
  'collectModal.title': 'Collect to repository',
  'collectModal.button': 'Collect',
  'collectModal.intro':
    'Copy {name} into the chosen repository so every agent / project can share it; **the original skill in this directory stays untouched**.',
  'collectModal.noRepo.title': 'No repository registered yet',
  'collectModal.noRepo.hint': 'Register an own repository in the Library first, then come back to collect.',
  'collectModal.targetRepo': 'Target repository',
  'collectModal.externalNote':
    'Note: this directory currently holds a link pointing elsewhere. Collecting copies the content of {target} into the repository (the external directory itself is neither changed nor deleted).',
  'collectModal.checking': 'Checking whether the repository already has a same-named skill…',
  'collectModal.notCollectable':
    'This entry is not collectable (it may be a dangling link, or not a skill directory containing SKILL.md).',
  'collectModal.alreadyLinked': 'It is already a link to this repository, so there is nothing to collect.',
  'collectModal.existsLabel': 'Repository already has this skill name',
  'collectModal.existsHint':
    'Same as collecting on the Library page: keep leaves the repository copy alone, overwrite deletes the same-named directory in the repository first and then writes the source version',
  'collectModal.keep': 'Keep the repository as is (no overwrite)',
  'collectModal.overwrite': 'Overwrite the repository copy with the source version',
  'collectModal.takeover.symlink': 'Take over too: replace this directory entry with a link to the repository copy',
  'collectModal.takeover.copy': 'Take over too: replace this entry with the repository version and register it as managed',
  'collectModal.note.order': 'Takeover runs after collection:',
  'collectModal.note.externalSymlinkToLink':
    '· The link in this directory is replaced by a **link** to the repository copy; the external directory it pointed to is unaffected and the original link is discarded.',
  'collectModal.note.externalSymlinkToCopy':
    '· The link in this directory is replaced by a **real copy** of the repository version; the external directory it pointed to is unaffected and the original link is discarded.',
  'collectModal.note.keepRepo':
    '· This skill in the directory is replaced by the repository version: you chose "keep the repository as is", so this version does not enter the repository and the repository version is what will be read after takeover.',
  'collectModal.note.replaceByRepo':
    '· This skill in the directory will be **replaced by the repository version** (its content already exists in the repository copy, so nothing is lost).',
  'collectModal.note.formSymlink':
    '· A **link to the repository copy** is created in place: later edits to the repository copy take effect immediately, with no second copy.',
  'collectModal.note.formCopy':
    '· The project keeps a **real copy** and no link: the project stays self-contained and git-committable, and repository updates are synced in.',
  'collectModal.note.register': '· The skill is **registered as managed** and maintained by this tool from then on.',
  'collectModal.collected': 'Collected "{name}" into the repository',
  'collectModal.notCollected': 'Nothing copied into the repository: {reason}',
  'collectModal.noChange': 'no change',
  'collectModal.takeoverFailed': 'Takeover incomplete: {reason}',
  'collectModal.takeoverUnknown': 'unknown reason',
  'collectModal.takeoverDone.symlink': 'Took over: this directory is now a link to the repository copy',
  'collectModal.takeoverDone.copy':
    'Took over: the project now holds a real copy of the repository version, registered as managed',

  /* ---------- badges: skills ---------- */
  'badge.reason.own': 'Own',
  'badge.reason.own.title':
    "It already existed in this directory and is not in the vault yet; use \"Collect to repository\" to manage it centrally",
  'badge.reason.preset': 'From preset',
  'badge.reason.preset.title': 'Brought in by a linked preset group',
  'badge.reason.external': 'External link',
  'badge.reason.external.title':
    'This link points outside the repository (not inside any registered repository), so it does not count as taken over. It is handled like an own skill: you can collect it or take it over (which repoints this directory at the repository copy)',
  'badge.reason.manual.title': 'Added manually by the user',
  'badge.reason.shared.title':
    'It lives in the shared standard directory this agent additionally reads: skills there work directly, but are not managed by this agent\u2019s distribution strategy (read-only)',
  'badge.store.symlink': 'Link',
  'badge.store.symlink.title':
    'Linked to the body in the vault: no files copied, no extra space, and vault edits take effect immediately',
  'badge.store.copy': 'Copy',
  'badge.store.copy.title':
    'An independent copy was made into this directory: vault changes do not follow automatically, re-sync is needed',
  'badge.store.pending': 'Pending',
  'badge.store.pending.title': 'On the distribution list, but not written to the skill directory yet',
  'badge.state.on': 'Enabled',
  'badge.state.on.title': 'The skill is present in this directory and usable by this agent / project (self-owned and external links count as installed too)',
  'badge.state.off': 'Disabled',
  'badge.state.off.title': 'Previously distributed here by this tool, now removed from the distribution list',
  'badge.readonly': 'Read-only',
  'badge.readonly.title':
    'It lives in the shared standard directory this agent additionally reads: usable directly, but not distributed by this tool and not switchable here.',
  'badge.takenOver': 'Taken over',
  'badge.takenOver.title':
    'This entry is a link to a skill in the repository. Edit the repository copy and it takes effect here immediately, with no second copy.',
  'badge.symlink': 'Link',
  'badge.symlink.title': 'Link pointing at {target}',
  'badge.legend.trigger': 'Badge guide',

  /* ---------- badges: agents ---------- */
  'agentBadge.active': 'Active',
  'agentBadge.active.title':
    'In the active set: changes to presets and the vault are synced to this directory automatically.',
  'agentBadge.inactive': 'Inactive',
  'agentBadge.inactive.title':
    'Not in the active set: changes do not follow automatically; use "Sync" on the agent detail page.',
  'agentBadge.preset': 'Preset {name}',
  'agentBadge.presetLabel': 'Preset NAME',
  'agentBadge.preset.title':
    'Distribution baseline: these agents follow the same preset, and every skill enabled in that preset is installed into this directory.',
  'agentBadge.noPreset': 'No preset',
  'agentBadge.noPreset.title':
    'No distribution baseline: only skills you enable individually on the agent detail page are installed, following no preset.',
  'agentBadge.family': '{family} family',
  'agentBadge.family.title':
    'Products of the same family (e.g. international / China editions): their skill directories are independent, they are just grouped for comparison.',
  'agentBadge.custom': 'Custom',
  'agentBadge.custom.title':
    'A tool added by the user beyond the built-in list: it has a fixed global skill directory and can be deleted here or on the Settings page.',
  'agentBadge.installed': 'Installed',
  'agentBadge.installed.title': 'This skill directory exists on this machine, so skills can be installed into it.',
  'agentBadge.notInstalled': 'Not installed',
  'agentBadge.notInstalled.title':
    'This skill directory does not exist on this machine yet — usually the tool is not installed, or it has never loaded skills. It is created automatically once the agent is active and synced.',
  'agentBadge.openStandard': 'Ecosystem-recommended',
  'agentBadge.openStandard.title':
    '{dir} is the most widely adopted shared skill directory in the open ecosystem: most agents (Codex, Warp, OpenHands, GitHub Copilot, Cursor, OpenCode and more) read it, so one copy serves them all.',
  'agentBadge.openStandard.legend':
    'Marks the ~/.agents/skills directory itself rather than a single agent: it is the most widely adopted shared skill directory in the open ecosystem, so one copy serves most tools. Since nearly every agent reads it, "also reads" is no longer annotated per agent.',

  /* ---------- agents ---------- */
  'agents.subtitle': '{dirs} skill directories · {agents} agents',
  'agents.openStandard.title': 'Ecosystem-recommended directory',
  'agents.openStandard.context': 'Ecosystem-recommended directory · {dir}',
  'agents.openStandard.tip':
    'Most agents read this directory, so it is the recommended place to manage skills first: a skill installed here works for every tool that reads it. To install for one specific agent only, use that agent\u2019s own directory.',
  'agents.addCustom': 'Add custom agent',
  'agents.addCustom.title': 'Add a custom agent outside the built-in list',
  'agents.notFound.title': 'Agent not found',
  'agents.notFound.hint': 'No agent with key "{key}".',
  'agents.onlyInstalled': 'Installed only',
  'agents.legend.title': 'What do the badges on a card mean?',
  'agents.legend.intro':
    'Each card maps to one **actual skill directory**. When several agents use the same directory they are merged into one card: the title lists those agents (each can be opened individually) and they **share a single set of settings** — one directory has one set of settings, regardless of "ownership". Internally that set is stored under one of the agents (a storage location only, changeable on the agent detail page).',
  'agents.empty.title': 'No agents',
  'agents.empty.hint': 'No agent has been registered in the system yet.',
  'agents.synced': 'Updated and synced',
  'agents.sync.failed': 'Sync finished with {n} failures',
  'agents.sync.done': 'Synced: {created} added / {removed} removed',
  'agents.deleteConfirm': 'Delete custom agent "{name}"? This cannot be undone.',
  'agents.deletedCustom': 'Custom agent deleted',
  'agents.failed': 'Failed',
  'agents.presetReason.title':
    'Brought in by the linked preset "{preset}"; switch it off here to exclude it for this agent only',
  'agents.installModeAria': 'Install mode for {name}',
  'agents.install.symlink': 'Link (no file copy, takes effect immediately)',
  'agents.install.copy': 'Copy (independent copy, needs re-sync)',
  'agents.activate': 'Set active',
  'agents.deactivate': 'Remove from active',
  'agents.active.toggle.title':
    'Add to / remove from the active set: agents in one directory share a single strategy, so the whole directory toggles together (takes effect immediately when added)',
  'agents.dirs': 'Directories',
  'agents.dirs.title': 'Override this agent\u2019s global / project skill directory',
  'agents.sync': 'Sync',
  'agents.sync.title':
    'Fill in missing skills for the current strategy and reclaim extra links deployed by this tool (your own content is never touched)',
  'agents.delete.title': 'Delete this custom agent (built-in agents cannot be deleted)',
  'agents.inactive.title': 'This directory is not in the active set; changes do not follow automatically',
  'agents.inactive.bodySiblings':
    'This skill directory also has {names} in the active set, so vault and preset changes are still synced in automatically; your actions on this page are written immediately too.',
  'agents.inactive.bodyAlone':
    'Future vault and preset changes are not synced to this directory automatically; click "Sync" here. Your actions on this page are still written immediately. To make it follow continuously, click "Set active" at the top right.',
  'agents.alias.badge': 'Shared directory',
  'agents.alias.title': 'It shares one skill directory with "{name}"',
  'agents.alias.body':
    'The directory has a single physical body, so these agents **share the same** preset / install mode: a change here equals a change there, and both sides always see the same thing. Internally that set is stored under "{name}" — a storage location only, not ownership of the strategy.',
  'agents.currentSkills': 'Current skills',
  'agents.currentSkills.note': 'What this directory holds right now, read-only',
  'agents.skillDirs.title': 'This agent reads skills from these directories',
  'agents.skillDirs': 'Skill directories',
  'agents.project': 'Project {path}',
  'agents.alsoUsedBy': 'This directory is also read directly by {names}, so no separate install is needed',
  'agents.sharedWith.pre': 'Shares',
  'agents.sharedWith.post': 'as the same skill directory: they share one strategy, and one distribution reaches them all',
  'agents.noSkills': 'This agent has no skills',
  'agents.currentSkillsCount': 'Current skills ({n})',
  'agents.syncFailedItems': 'Failed sync items',
  'agents.section.control': 'Skill control',
  'agents.section.control.note': 'Changes take effect and sync immediately',
  'agents.preset.section': 'Linked preset',
  'agents.preset.badge.title': 'Skills brought in by the linked preset and currently enabled',
  'agents.preset.fieldHint': 'Changes take effect and sync immediately',
  'agents.preset.none': 'No preset',
  'agents.preset.hint':
    'Pick a preset as the distribution baseline: every skill enabled in it is installed into this agent. If none is picked, only skills enabled under "Add skills directly" below are used.',
  'agents.preset.brings': 'This preset currently brings in {n} skills',
  'agents.preset.bringsTags': ' (including {t} matched by linked tags)',
  'agents.preset.empty.title': 'This preset has no enabled skill yet',
  'agents.preset.empty.hint': 'Go to the Presets page to add skills or link tags.',
  'agents.direct.section': 'Add skills directly',
  'agents.direct.badge.title': 'Skills enabled directly (not via a preset)',
  'agents.direct.hint':
    'Pick from the whole vault: turning one on installs it for this agent alone (regardless of the preset above), turning it off removes it. Skills marked "From preset" come from the linked preset and can be switched off for this agent only.',
  'agents.source.empty': 'The vault has no sources yet.',
  'agents.tags.empty': 'No skill has tags yet.',
  'agents.legend.skill.title': 'What do the badges on a skill mean?',
  'agents.legend.skill.intro':
    'The switch controls whether the skill is installed for this agent; the badges describe where it came from and how it is stored.',
  'agents.list.empty': 'No matching skills',
  'agents.libraryEmpty.title': 'Library is empty',
  'agents.libraryEmpty.hint': 'Register and import skills in the Library first.',
  'agents.install.section': 'Install and storage',
  'agents.install.hint':
    '"Default install mode" decides whether a new skill comes in as a link or a copy, and can be overridden per skill.',
  'agents.install.hintSiblings':
    ' Agents sharing this directory share the same settings; "settings stored under" only decides which agent holds them.',
  'agents.install.default': 'Default install mode',
  'agents.install.defaultHint': 'Can be overridden per skill below',
  'agents.install.strategy': 'Settings stored under',
  'agents.install.strategyHint':
    'These agents share one set of settings; internally it must be stored under one of them, and moving it never changes the settings themselves',
  'agents.install.auto': 'Automatic (active first, then by name)',
  'agents.install.perSkill': 'Override install mode per skill',
  'agents.install.noneEnabled': 'No skill is enabled right now',
  'agents.openDetail': 'Open details for {name}',
  'agents.dir.overridden': 'Directories overridden',
  'agents.dir.title': 'Override directories · {name}',
  'agents.dir.global': 'Global skill directory',
  'agents.dir.project': 'Project-level skill directory (relative to the project root)',
  'agents.dir.projectHint': 'Relative path; the system picker is unavailable, please type it manually',
  'agents.dir.note': 'Leave empty to restore the built-in default; once overridden the agent counts as installed.',

  /* ---------- presets ---------- */
  'presets.subtitle': '{n} preset groups in total',
  'presets.new': 'New preset',
  'presets.notFound.title': 'Preset not found',
  'presets.notFound.hint': 'No preset named "{name}".',
  'presets.empty.title': 'No presets yet',
  'presets.empty.hint': 'Click "New preset", give it a name, then open it to add skills and link tags.',
  'presets.enabledCount': '{n} skills enabled',
  'presets.noneEnabled': 'No skill enabled yet',
  'presets.created': 'Created; opening the detail page to add skills',
  'presets.name': 'Preset name',
  'presets.namePlaceholder': 'e.g. Frontend productivity',
  'presets.nameHint': 'After creating, open the detail page to add skills and link tags',
  'presets.saved': 'Saved',
  'presets.via.tag': 'tag',
  'presets.via.explicit': 'explicit',
  'presets.autoTag': 'Included by tag',
  'presets.autoTag.title':
    'Automatically included because it carries a tag linked to this preset; not directly switchable. Remove the matching tag to disable it',
  'presets.deployed': 'Distributed',
  'presets.deployed.title': 'This skill directory has an active agent, so changes to this preset sync in automatically',
  'presets.notDeployed': 'Not distributed',
  'presets.notDeployed.title':
    'No agent in this skill directory is active, so changes to this preset do not sync automatically; sync manually on the agent detail page',
  'presets.detail.enabled': '{n} skills enabled',
  'presets.detail.enabledWithAuto': '{n} skills enabled (including {auto} included by tag)',
  'presets.section.current': 'Current state',
  'presets.section.current.note': 'Distribution result, read-only',
  'presets.enabled.section': 'Enabled skills',
  'presets.enabled.hint': 'This preset ends up enabling the skills below: {explicit} explicit',
  'presets.enabled.hintAuto': ', {auto} included automatically by linked tags',
  'presets.enabled.empty.title': 'No skill enabled yet',
  'presets.enabled.empty.hint': 'Turn on skill switches under "How to adjust" below, or link tags.',
  'presets.applied.section': 'Agents using this preset',
  'presets.applied.hint':
    'Pick this preset under "Linked preset" on an agent detail page and it will receive these skills; agents sharing one skill directory are merged into a row (they share the same settings). "Distributed" means that directory follows changes to this preset automatically; directories with no active agent do not, so add one to the active set on the Settings page or sync manually on its detail page.',
  'presets.applied.empty.title': 'No agent uses this preset',
  'presets.applied.empty.hint': 'Pick this preset under "Linked preset" on an agent detail page to distribute skills to it.',
  'presets.section.adjust': 'How to adjust',
  'presets.section.adjust.note': 'Changes take effect and sync immediately',
  'presets.byTag.section': 'Include by tag',
  'presets.byTag.badge.title': 'Skills included automatically through linked tags',
  'presets.byTag.hint':
    'Skills carrying these tags are included in this preset automatically, merged with "Include by skill"; {n} tags are linked right now. Click to add / remove; the number after a tag is how many skills in the vault use it (0 means none yet).',
  'presets.byTag.empty':
    'The vault has no tags yet. Tag some skills in the Library first; then you can pick them here and matching skills are included automatically.',
  'presets.bySkill.section': 'Include by skill',
  'presets.bySkill.badge.title': 'Skills enabled explicitly',
  'presets.bySkill.hint':
    'The switch controls whether a skill is explicitly included in this preset. Skills marked "Included by tag" come from the tags above; their switch is locked, so remove the matching tag to disable them.',
  'presets.source.empty': 'No skill source yet.',
  'presets.tags.empty': 'No skill has tags yet.',
  'presets.legend.title': 'What do the badges on a skill mean?',
  'presets.legend.intro':
    'The switch controls whether a skill is explicitly included in this preset; the badges describe where it came from and how it is stored.',
  'presets.legend.autoTag.desc':
    'Included automatically because it carries a tag linked to this preset; the switch is locked. Remove the matching tag to disable it.',

  /* ---------- projects ---------- */
  'projects.subtitle': '{n} projects in total',
  'projects.new': 'New project',
  'projects.notFound.title': 'Project not found',
  'projects.notFound.hint': 'No project with id "{id}".',
  'projects.empty.title': 'No projects',
  'projects.empty.hint': 'No project links skills yet. Click "New project" to create one.',
  'projects.allCount': 'All projects ({n})',
  'projects.created': 'Created',
  'projects.path': 'Project path',
  'projects.tags': 'Tags (comma separated)',
  'projects.tagsHint': 'Once tagged, skills with the same tag in the vault enter this project automatically',
  'projects.tagsEdit.title': 'Edit project tags',
  'projects.tagsEdit.hint': 'Skills in the vault carrying the same tag enter this project automatically',
  'projects.deployed': 'Deployed',
  'projects.notDeployed': 'Not deployed',
  'projects.deployAria': 'Deploy {name}',
  'projects.tags.button': 'Tags',
  'projects.tags.button.title': 'Edit project tags; skills with the same tag enter this project automatically',
  'projects.push': 'Push to repository',
  'projects.push.title': 'Write skills changed inside the project back to the repository',
  'projects.sync': 'Sync',
  'projects.sync.title': 'Materialise the desired set into .agents and link it into each agent\u2019s project directory',
  'projects.noSkills': 'This project has no skills',
  'projects.skillsCount': 'Project skills ({n})',
  'projects.deploy.section': 'Deploy to agents',
  'projects.deploy.badge.title': 'Agents this project\u2019s skill directory has been deployed to',
  'projects.deploy.count': '{n} deployed',
  'projects.deploy.hint':
    'Turn the switch on to deploy this project\u2019s .agents/skills into that agent\u2019s project skill directory: one body shared by many agents, with no per-agent copy.',
  'projects.deploy.empty.match': 'No matching agents',
  'projects.deploy.empty.none': 'No agent registered yet',
  'projects.addSkill.title': 'Add skills',
  'projects.push.done': 'Pushed {n} skills back',
  'projects.push.nothing': 'Nothing to push back',
  'projects.push.toRepo': 'Push to {id}',
  'projects.push.note':
    'Write skills changed in .agents/skills back into the repository body; only same-named skills already in the repository are overwritten.',
  'projects.pushResult.pushed': 'Pushed back:',
  'projects.pushResult.none': 'none',
  'projects.pushResult.skipped': 'Skipped:',
  'projects.pushResult.errors': 'Errors:',

  /* ---------- health ---------- */
  'health.dim.sync': 'Sync',
  'health.dim.dup': 'Duplicate skills',
  'health.dim.durability': 'Broken links',
  'health.dim.config': 'Config',
  'health.dim.repo': 'Repositories',
  'health.dim.project': 'Projects',
  'health.dim.repos': 'Repositories',
  'health.dim.skills': 'Skills',
  'health.dim.presets': 'Presets',
  'health.dim.projects': 'Projects',
  'health.dim.sources': 'Sources',
  'health.andMore': ' and {n} more',
  'health.status.warn': 'Warning',
  'health.status.error': 'Error',
  'health.rediagnose': 'Re-run diagnostics',
  'health.empty.title': 'No diagnostic result',
  'health.empty.hint': 'Run diagnostics to check the health of your skill vault.',
  'health.allGood.title': 'All good',
  'health.allGood.hint': 'No problem detected.',
  'health.noneInGroup': 'Nothing to report',
  'health.fix': 'Fix',
  'health.fixModal.title': 'Confirm the fix',
  'health.fixModal.subject': 'Diagnostic item',
  'health.fixModal.ops': 'What will run',
  'health.fix.applied': 'Fixed: {msg}',
  'health.fix.failed': 'Cannot fix automatically: {msg}',
  'health.plan.sync.missing': 'Fill in the {n} missing skills: {names}',
  'health.plan.sync.broken': 'Rebuild the {n} broken links: {names}',
  'health.plan.sync.extra':
    'Clean up the {n} extra items: {names} — only **links deployed by this tool** are reclaimed; your real directories and external links stay',
  'health.plan.sync.reconcile': 'Re-reconcile against the current desired set, filling gaps and repairing broken links',
  'health.plan.sync.scope': 'Affects this one skill directory only; other agents are untouched',
  'health.plan.sync.intro': 'Re-reconcile this skill directory against the current desired set:',
  'health.plan.broken.intro': 'Re-run sync for every **active** agent (a wider scope than a single item):',
  'health.plan.broken.op1': 'Rebuild all broken links',
  'health.plan.broken.op2': 'Also fill gaps and clean up extra items (again, only links deployed by this tool)',
  'health.plan.broken.op3': 'Agents outside the active set are unaffected; your real directories and external links stay',
  'health.plan.project.intro': 'Create the skill directory structure for this project:',
  'health.plan.project.op1': 'Create the directory {dir}',
  'health.plan.project.op2': 'Left untouched if it already exists; no skill is written or deleted',
  'health.plan.repo.intro': 'Add the skills root for this repository:',
  'health.plan.repo.op1': 'Create the {skills} directory under repository {id}',
  'health.plan.repo.op2': 'Left untouched if it already exists; no skill is written or deleted',
  'health.plan.generic.intro': 'Run the fix for this item:',
  'health.plan.generic.ops': 'This item has no detail steps to list',

  /* ---------- settings ---------- */
  'settings.saved': 'Settings saved',
  'settings.section.sync': 'Sync strategy',
  'settings.syncEmpty': 'No settings',
  'settings.defaultSync': 'Default install mode',
  'settings.defaultSync.hint': 'Default for new agents; can be overridden on each agent detail page',
  'settings.sync.symlink': 'Link (no file copy, takes effect immediately)',
  'settings.sync.copy': 'Copy (independent copy, needs re-sync)',
  'settings.watchers': 'Follow vault changes automatically (optional, off by default)',
  'settings.watchers.hint':
    'When enabled, vault changes are watched and pushed to agents using "copy" (copied files do not update themselves). Normal syncing is trigger-based and needs no long-running process.',
  'settings.section.language': 'Language',
  'settings.language.label': 'Interface language',
  'settings.language.hint':
    'Applies to the whole interface and to messages returned by the server. Defaults to English.',
  'settings.section.custom': 'Custom agents',
  'settings.custom.add': 'Add',
  'settings.custom.empty.title': 'No custom agent',
  'settings.custom.empty.hint': 'Tools beyond the built-in list can be registered here with their global skill directory.',
  'settings.custom.recursive': 'Recursive scan',
  'settings.section.logs': 'Logs',
  'settings.logs.download': 'Download logs',
  'settings.logs.copyDiag': 'Copy diagnostics',
  'settings.logs.hint':
    'When something goes wrong, download the full logs or copy the diagnostics and paste them into a GitHub issue; local paths are masked in the logs.',
  'settings.logs.empty': 'No logs',
  'settings.logs.noContent': '(no log content)',
  'settings.logs.downloaded': 'Logs downloaded',
  'settings.diag.title': '# flint diagnostics',
  'settings.diag.platform': '- Platform: {v}',
  'settings.diag.browser': '- Browser: {v}',
  'settings.diag.logPath': '- Server log path: {v}',
  'settings.diag.logSize': '- Server log size: {v} bytes',
  'settings.diag.recentLogs': '## Recent logs',
  'settings.diag.copied': 'Copied; paste it into a GitHub issue',

  /* ---------- add agent modal ---------- */
  'addAgent.title': 'Add custom agent',
  'addAgent.added': 'Agent added',
  'addAgent.key': 'Key (unique)',
  'addAgent.global': 'Global skill directory',
  'addAgent.project': 'Project-level directory (optional, relative to project root)',
  'addAgent.projectHint': 'Relative path; the system picker is unavailable, please type it manually',
  'addAgent.recursive': 'Recursive scan (nested layout)',

  /* ---------- entity list / fold ---------- */
  'entity.expand': 'Expand',
  'entity.collapse': 'Collapse',
  'entity.expandList': 'Expand list',
  'entity.collapseList': 'Collapse list',
  'fold.collapse': 'Collapse {label}',
  'fold.expand': 'Expand {label}',

  /* ---------- skill list ---------- */
  'skillList.toggleDisabledAria': '{name}: included automatically by a tag, cannot be switched off directly',
  'skillList.enableAria': 'Enable {name}',
  'skillList.disableAria': 'Disable {name}',

  /* ---------- path fields ---------- */
  'path.pick': 'Choose…',
  'path.addDir': 'Add folder…',
  'path.addFile': 'Add file…',
  'path.duplicate': 'This path is already in the list',

  /* ---------- import panel ---------- */
  'import.done': 'Imported {n} skills',
  'import.doneSkipped': 'Imported {n} skills, {s} skipped as duplicates',
  'import.dirsLabel': 'Source directories (one per line; flat / nested / indexed catalog are supported)',
  'import.note':
    'Directories are used as data sources only and are not registered in the system; same-named skills are skipped automatically.',
  'import.previewCount': 'Detection result ({n})',
  'import.detect': 'Detect',
  'import.start': 'Start import',
} as const;

/** Key union derived from the English catalog. */
export type MsgKey = keyof typeof en;
