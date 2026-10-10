import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URL, BASE_PATH } from "../../api.js";
import "./markdown-content.css";
import { remarkKtgaTokens } from "./markdown-tokens.js";
import { MarkdownToken } from "./MarkdownToken.jsx";

function safeMarkdownUrl(value) {
  const href = String(value ?? "").trim();
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^(?:\/|#)(?!\/)/.test(href)) return href;
  return "";
}

export function MarkdownContent({ children, className = "", inlineImages = true }) {
  return <div className={`patchnote-markdown ${className}`}><ReactMarkdown
    remarkPlugins={[remarkGfm, remarkKtgaTokens]}
    components={{
      span: ({ children: label, "data-ktga-token": token }) => token ? <MarkdownToken value={token} /> : <span>{label}</span>,
      img: ({ src = "", alt = "", title }) => {
        if (!inlineImages) return null;
        const apiPath = src.startsWith(`${BASE_PATH}/api/`) ? src.slice(BASE_PATH.length) : src.startsWith("/api/") ? src : null;
        return <img src={apiPath ? `${API_URL}${apiPath}` : src} alt={alt} title={title} />;
      },
      a: ({ href, children: label }) => {
        const safeHref = safeMarkdownUrl(href);
        return safeHref ? <a href={safeHref} target="_blank" rel="noopener noreferrer">{label}</a> : <span>{label}</span>;
      }
    }}
  >{String(children ?? "")}</ReactMarkdown></div>;
}
