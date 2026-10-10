import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";
import { readRoute } from "../../navigation/routes.js";
import { remarkKtgaTokens } from "../patchnotes/markdown-tokens.js";
import { MarkdownToken } from "../patchnotes/MarkdownToken.jsx";
import "../patchnotes/markdown-content.css";

export function ChatMessageContent({ message, siteIcon, onNavigate }) {
  return <div className="conversation-message-body"><ReactMarkdown remarkPlugins={[remarkGfm, remarkKtgaTokens]} skipHtml
    allowedElements={["p", "strong", "em", "del", "code", "br", "a", "span"]} unwrapDisallowed
    components={{
      span: ({ children, "data-ktga-token": token }) => token ? <MarkdownToken value={token} /> : <span>{children}</span>,
      a: ({ href, children }) => {
        let url;
        try { url = new URL(href); } catch { return <span>{children}</span>; }
        if (!["ktga.me", "www.ktga.me"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password) return <span className="conversation-link-blocked">Lien externe bloque</span>;
        const link = (message.links || []).find((entry) => entry.path === `${url.pathname}${url.search}${url.hash}`);
        if (!link) return <span>{children}</span>;
        if (link.active === false) return <span className="conversation-route-link conversation-route-ended"><span className="conversation-route-mark"><CosmeticIcon value="site" source={siteIcon} /></span><span className="conversation-route-label"><strong>{link.label}</strong></span><CheckCircle2 size={16} aria-hidden="true" /></span>;
        return <a className="conversation-route-link" href={link.href} onClick={(event) => {
          if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const target = new URL(link.href);
          const route = readRoute(target);
          if (route.view === "not-found") return;
          event.preventDefault(); onNavigate(route.view, route.id, { search: target.search, hash: target.hash });
        }}><span className="conversation-route-mark"><CosmeticIcon value="site" source={siteIcon} /></span><span className="conversation-route-label"><strong>{link.label}</strong>{link.detail && <small>{link.detail}</small>}</span><ArrowUpRight size={16} aria-hidden="true" /></a>;
      }
    }}
  >{message.content}</ReactMarkdown></div>;
}
