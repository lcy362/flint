/* eslint-disable */
/**
 * AUTO-GENERATED — 请勿手改。
 * 来源: server/rules/security/*.yaml
 * 重新生成: npm run gen:security-rules
 */

export type SecSeverity = 'info' | 'warn' | 'error';
export type SecCategory = 'dangerous' | 'secret' | 'injection' | 'obfuscation';

export interface SecRule {
  id: string;
  category: SecCategory;
  severity: SecSeverity;
  /** 正则标志（''/i/u 等），与 pattern 一起交给 new RegExp */
  flags: string;
  /** 指向 server/src/i18n 的规则描述键 */
  titleKey: string;
  /** 正则源码（未经 RegExp 解释） */
  pattern: string;
  /** 命中值的最小香农熵（仅泛化凭据规则使用；低于该值视为误报丢弃） */
  minEntropy?: number;
}

/** 由 vendored 规则快照生成的检测规则表（共 36 条） */
export const SEC_RULES: SecRule[] = [
  { id: "DANGEROUS_PIPE_TO_SHELL", category: "dangerous", severity: "error", flags: "i", titleKey: "sec.rule.pipeToShell", pattern: "\\b(curl|wget)\\b[^|\\n]*\\|+\\s*(sudo\\s+)?(ba|z|k)?sh\\b" },
  { id: "DANGEROUS_BASH_C_REMOTE", category: "dangerous", severity: "error", flags: "i", titleKey: "sec.rule.bashCRemote", pattern: "\\b(ba|z|k)?sh\\s+-c\\s*[\"']?\\s*\\$\\s*\\(" },
  { id: "DANGEROUS_REVERSE_SHELL", category: "dangerous", severity: "error", flags: "i", titleKey: "sec.rule.reverseShell", pattern: "/dev/tcp/" },
  { id: "DANGEROUS_NETCAT_EXEC", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.netcatExec", pattern: "\\bnc\\b[^\\n]{0,40}\\s-[a-z]*e[a-z]*\\b" },
  { id: "DANGEROUS_POWERSHELL_IEX", category: "dangerous", severity: "error", flags: "i", titleKey: "sec.rule.powershellIex", pattern: "\\b(iex|invoke-expression)\\b" },
  { id: "DANGEROUS_RM_RF_ABSOLUTE", category: "dangerous", severity: "error", flags: "i", titleKey: "sec.rule.rmRfAbsolute", pattern: "\\brm\\s+-([a-z]*r[a-z]*f|[a-z]*f[a-z]*r)[a-z]*\\s+(/|~|\\$HOME)\\b" },
  { id: "DANGEROUS_EVAL_CALL", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.evalCall", pattern: "\\beval\\s*\\(" },
  { id: "DANGEROUS_CHILD_PROCESS", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.childProcess", pattern: "\\bchild_process\\b" },
  { id: "DANGEROUS_SUBPROCESS_SHELL", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.subprocessShell", pattern: "subprocess\\.(run|call|popen)[^\\n]{0,80}shell\\s*=\\s*true" },
  { id: "DANGEROUS_OS_SYSTEM", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.osSystem", pattern: "\\bos\\.system\\s*\\(" },
  { id: "DANGEROUS_SUDO", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.sudo", pattern: "\\bsudo\\b" },
  { id: "DANGEROUS_CHMOD_777", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.chmod777", pattern: "\\bchmod\\s+(-r\\s+)?777\\b" },
  { id: "DANGEROUS_SHELL_RC_WRITE", category: "dangerous", severity: "warn", flags: "i", titleKey: "sec.rule.shellRcWrite", pattern: ">>?\\s*[^\\n]{0,60}\\.(bashrc|zshrc|bash_profile)\\b" },
  { id: "INJECTION_IGNORE_PREVIOUS", category: "injection", severity: "warn", flags: "i", titleKey: "sec.rule.ignorePrevious", pattern: "\\bignore\\s+(all\\s+)?(the\\s+)?(previous|prior|above|preceding|earlier)\\s+(instructions?|prompts?|rules?|messages?)" },
  { id: "INJECTION_DISREGARD", category: "injection", severity: "warn", flags: "i", titleKey: "sec.rule.disregardRules", pattern: "\\bdisregard\\s+(all\\s+)?(the\\s+)?(previous|prior|above)\\s+(instructions?|rules?|prompts?)" },
  { id: "INJECTION_ZH_IGNORE", category: "injection", severity: "warn", flags: "", titleKey: "sec.rule.ignorePreviousZh", pattern: "忽略(掉)?(之前|以上|上述|前面|先前)(的)?(所有)?(指令|规则|提示|内容|设定)" },
  { id: "INJECTION_ZH_DISREGARD", category: "injection", severity: "warn", flags: "", titleKey: "sec.rule.disregardRulesZh", pattern: "(无视|忽略|作废)(系统|安全|所有)(的)?(指令|规则|提示|设定)" },
  { id: "INJECTION_DONT_TELL_USER", category: "injection", severity: "warn", flags: "i", titleKey: "sec.rule.dontTellUser", pattern: "\\b(do\\s+not|don'?t|never)\\s+(tell|inform|notify|mention\\s+(this\\s+)?to)\\s+(the\\s+)?user" },
  { id: "INJECTION_ZH_HIDE", category: "injection", severity: "warn", flags: "", titleKey: "sec.rule.hideFromUserZh", pattern: "不要(告诉|通知|提示|透露给)用户" },
  { id: "INJECTION_AS_OF_NOW", category: "injection", severity: "warn", flags: "i", titleKey: "sec.rule.asOfNowIgnore", pattern: "as\\s+of\\s+now,?\\s+(ignore|disregard|forget)" },
  { id: "INJECTION_JAILBREAK", category: "injection", severity: "info", flags: "i", titleKey: "sec.rule.jailbreak", pattern: "\\b(jailbreak|dan\\s+mode|developer\\s+mode|unrestricted\\s+mode|no\\s+restrictions?\\s+mode)\\b" },
  { id: "OBFUSCATION_ZERO_WIDTH", category: "obfuscation", severity: "warn", flags: "", titleKey: "sec.rule.zeroWidth", pattern: "[\\u200B\\u200C\\u200D\\u2060\\uFEFF]" },
  { id: "OBFUSCATION_BIDI", category: "obfuscation", severity: "warn", flags: "", titleKey: "sec.rule.bidiControl", pattern: "[\\u202A-\\u202E\\u2066-\\u2069]" },
  { id: "OBFUSCATION_UNICODE_TAGS", category: "obfuscation", severity: "info", flags: "u", titleKey: "sec.rule.unicodeTags", pattern: "[\\u{E0001}-\\u{E007F}]" },
  { id: "OBFUSCATION_LONG_BASE64", category: "obfuscation", severity: "info", flags: "", titleKey: "sec.rule.longBase64", pattern: "[A-Za-z0-9+/]{160,}={0,2}" },
  { id: "SECRET_OPENAI", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.openaiKey", pattern: "\\bsk-(proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{20,})\\b" },
  { id: "SECRET_ANTHROPIC", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.anthropicKey", pattern: "\\bsk-ant-[A-Za-z0-9_-]{20,}\\b" },
  { id: "SECRET_AWS_ACCESS_KEY", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.awsAccessKey", pattern: "\\bAKIA[0-9A-Z]{16}\\b" },
  { id: "SECRET_GITHUB_PAT", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.githubPat", pattern: "\\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\\b" },
  { id: "SECRET_GITHUB_PAT_FINE", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.githubPatFine", pattern: "\\bgithub_pat_[A-Za-z0-9_]{22,}\\b" },
  { id: "SECRET_SLACK", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.slackToken", pattern: "\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b" },
  { id: "SECRET_GOOGLE_API", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.googleApiKey", pattern: "\\bAIza[0-9A-Za-z_-]{35}\\b" },
  { id: "SECRET_STRIPE", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.stripeKey", pattern: "\\b[rs]k_live_[A-Za-z0-9]{20,}\\b" },
  { id: "SECRET_NPM_TOKEN", category: "secret", severity: "warn", flags: "", titleKey: "sec.rule.npmToken", pattern: "\\bnpm_[A-Za-z0-9]{36}\\b" },
  { id: "SECRET_PRIVATE_KEY", category: "secret", severity: "error", flags: "", titleKey: "sec.rule.privateKeyBlock", pattern: "-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----" },
  { id: "SECRET_GENERIC_ASSIGNMENT", category: "secret", severity: "warn", flags: "i", titleKey: "sec.rule.genericSecret", pattern: "\\b(api[_-]?key|apikey|secret|token|password|passwd|access[_-]?key)\\b\\s*[:=]\\s*[\"']?[A-Za-z0-9/_+.\\-]{16,}", minEntropy: 3 },
];
