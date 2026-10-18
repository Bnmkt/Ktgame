import { useLocale } from "../../locales/LocaleProvider.jsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URL, BASE_PATH } from "../../api.js";
import "./markdown-content.css";
import { remarkKtgaTokens } from "./markdown-tokens.js";
import { MarkdownToken } from "./MarkdownToken.jsx";
import { markdownImageLayout } from "./markdown-image-layout.js";

function safeMarkdownUrl(value) {
  const href = String(value ?? "").trim();
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^(?:\/|#)(?!\/)/.test(href)) return href;
  return "";
}

function remarkLineBreaks() {
  return (tree) => {
    function visit(node) {
      if (!node.children || ["code", "inlineCode", "html"].includes(node.type)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") { visit(child); return [child]; }
        return child.value.split(/\r\n?|\n/).flatMap((value, index) => [...(index ? [{ type: "break" }] : []), { type: "text", value }]);
      });
    }
    visit(tree);
  };
}

export function MarkdownContent({ children, className = "", inlineImages = true, compactPreview = false, preserveLineBreaks = false }) {
  const { t: localeText } = useLocale();
  return <div className={`patchnote-markdown ${className}`}><ReactMarkdown
    remarkPlugins={[remarkGfm, remarkKtgaTokens, ...(preserveLineBreaks ? [remarkLineBreaks] : [])]}
    components={{
      span: ({ children: label, "data-ktga-token": token }) => token ? <MarkdownToken value={token} /> : <span>{localeText(label)}</span>,
      img: ({ src = "", alt = "", title }) => {
        if (!inlineImages || compactPreview) return null;
        const apiPath = src.startsWith(`${BASE_PATH}/api/`) ? src.slice(BASE_PATH.length) : src.startsWith("/api/") ? src : null;
        const layout = markdownImageLayout(title);
        return <img className={layout ? `markdown-media-float media-${layout.side}` : undefined} style={layout ? { "--media-width": layout.width, "--media-height": layout.height } : undefined} src={apiPath ? `${API_URL}${apiPath}` : src} alt={alt} title={layout ? undefined : title} loading="lazy" />;
      },
      a: ({ href, children: label }) => {
        const safeHref = safeMarkdownUrl(href);
        return safeHref && !compactPreview ? <a href={safeHref} target="_blank" rel="noopener noreferrer">{localeText(label)}</a> : <span>{localeText(label)}</span>;
      }
    }}
  >{String(children ?? "")}</ReactMarkdown></div>;
}
