import chatgptLogo from "../assets/chatgpt-logo.svg";
import claudeLogo from "../assets/claude-logo.svg";
import antigravityLogo from "../assets/agents/antigravity.svg";
import clineLogo from "../assets/agents/cline.svg";
import codebuddyLogo from "../assets/agents/codebuddy.svg";
import cursorLogo from "../assets/agents/cursor.svg";
import factoryDroidLogo from "../assets/agents/factory-droid.svg";
import geminiCliLogo from "../assets/agents/gemini-cli.svg";
import githubCopilotLogo from "../assets/agents/github-copilot.svg";
import hermesLogo from "../assets/agents/hermes.png";
import kimiLogo from "../assets/agents/kimi.svg";
import kiroLogo from "../assets/agents/kiro.svg";
import opencodeLogo from "../assets/agents/opencode.svg";
import piLogo from "../assets/agents/pi.png";
import qoderLogo from "../assets/agents/qoder.svg";
import qwenLogo from "../assets/agents/qwen.svg";
import stepfunLogo from "../assets/agents/stepfun.svg";
import traeLogo from "../assets/agents/trae.svg";
import workbuddyLogo from "../assets/agents/workbuddy.svg";

type AgentIconDefinition = {
  alt: string;
  src: string;
};

const AGENT_ICONS: Record<string, AgentIconDefinition> = {
  codex: { alt: "Codex", src: chatgptLogo },
  claude_code: { alt: "Claude Code", src: claudeLogo },
  gemini: { alt: "Gemini CLI", src: geminiCliLogo },
  cursor: { alt: "Cursor", src: cursorLogo },
  trae: { alt: "Trae", src: traeLogo },
  traecn: { alt: "Trae CN", src: traeLogo },
  traecli: { alt: "Trae CLI", src: traeLogo },
  copilot: { alt: "GitHub Copilot", src: githubCopilotLogo },
  qoder: { alt: "Qoder", src: qoderLogo },
  droid: { alt: "Factory Droid", src: factoryDroidLogo },
  codebuddy: { alt: "CodeBuddy", src: codebuddyLogo },
  codybuddycn: { alt: "CodeBuddy CN", src: codebuddyLogo },
  stepfun: { alt: "Stepfun", src: stepfunLogo },
  opencode: { alt: "OpenCode", src: opencodeLogo },
  antigravity: { alt: "Google Antigravity", src: antigravityLogo },
  "google-antigravity": { alt: "Google Antigravity", src: antigravityLogo },
  workbuddy: { alt: "WorkBuddy", src: workbuddyLogo },
  hermes: { alt: "Hermes Agent", src: hermesLogo },
  qwen: { alt: "Qwen Code", src: qwenLogo },
  kimi: { alt: "Kimi Code", src: kimiLogo },
  pi: { alt: "Pi", src: piLogo },
  kiro: { alt: "Kiro", src: kiroLogo },
  cline: { alt: "Cline", src: clineLogo },
};

function normalizeAgentType(agentType: string) {
  const normalized = String(agentType || "").trim().toLowerCase();
  if (normalized === "claude") return "claude_code";
  if (normalized === "cursor-cli") return "cursor";
  if (normalized === "qoder-cli") return "qoder";
  return normalized;
}

export default function AgentIcon({ agentType }: { agentType: string }) {
  const definition = AGENT_ICONS[normalizeAgentType(agentType)];
  if (definition) return <img src={definition.src} alt={definition.alt} title={definition.alt} className="block h-4 w-4 object-contain" />;
  return <span className="text-xs font-semibold text-accent-blue leading-none">{agentType}</span>;
}
