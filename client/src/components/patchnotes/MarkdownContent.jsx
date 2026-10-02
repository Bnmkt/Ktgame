import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ children, className = "" }) {
  return <div className={`patchnote-markdown ${className}`}><ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: ({ href, children: label }) => <a href={href} target="_blank" rel="noreferrer">{label}</a>
    }}
  >{String(children ?? "")}</ReactMarkdown></div>;
}
