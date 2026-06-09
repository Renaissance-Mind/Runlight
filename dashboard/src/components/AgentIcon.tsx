import chatgptLogo from "../assets/chatgpt-logo.svg";
import claudeLogo from "../assets/claude-logo.svg";

export default function AgentIcon({ agentType }: { agentType: string }) {
  if (agentType === "codex") {
    return <img src={chatgptLogo} alt="Codex" className="h-4 w-4 block" />;
  }
  if (agentType === "claude_code") {
    return <img src={claudeLogo} alt="Claude Code" className="h-4 w-4 block" />;
  }
  return <span className="text-xs font-semibold text-accent-blue leading-none">{agentType}</span>;
}
