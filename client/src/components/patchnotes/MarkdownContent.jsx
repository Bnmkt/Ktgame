import { useLocale } from "../../locales/LocaleProvider.jsx";
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

export function MarkdownContent({ children, className = "", inlineImages = true, compactPreview = false }) {
  const { t: localeText } = useLocale();
  return <div className={`patchnote-markdown ${className}`}><ReactMarkdown
    remarkPlugins={[remarkGfm, remarkKtgaTokens]}
    components={{
      span: ({ children: label, "data-ktga-token": token }) => token ? <MarkdownToken value={token} /> : <span>{localeText(label)}</span>,
      img: ({ src = "", alt = "", title }) => {
        if (!inlineImages || compactPreview) return null;
        const apiPath = src.startsWith(`${BASE_PATH}/api/`) ? src.slice(BASE_PATH.length) : src.startsWith("/api/") ? src : null;
        return <img src={apiPath ? `${API_URL}${apiPath}` : src} alt={alt} title={title} />;
      },
      a: ({ href, children: label }) => {
        const safeHref = safeMarkdownUrl(href);
        return safeHref && !compactPreview ? <a href={safeHref} target="_blank" rel="noopener noreferrer">{localeText(label)}</a> : <span>{localeText(label)}</span>;
      }
    }}
  >{String(children ?? "")}</ReactMarkdown></div>;
}
