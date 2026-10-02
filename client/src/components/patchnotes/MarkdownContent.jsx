import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeMarkdownUrl(value) {
  const href = String(value ?? "").trim();
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^(?:\/|#)(?!\/)/.test(href)) return href;
  return "";
}

export function MarkdownContent({ children, className = "" }) {
  return <div className={`patchnote-markdown ${className}`}><ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: ({ href, children: label }) => {
        const safeHref = safeMarkdownUrl(href);
        return safeHref ? <a href={safeHref} target="_blank" rel="noopener noreferrer">{label}</a> : <span>{label}</span>;
      }
    }}
  >{String(children ?? "")}</ReactMarkdown></div>;
}
