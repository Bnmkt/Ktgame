import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { syntaxTree } from "@codemirror/language";

export { sourceLanguage } from "./code-files.js";

export function codeLanguage(name) {
  if (name === "css" || name === "css-declarations") return css();
  if (name === "json") return json();
  if (name === "xml" || name === "svg") return xml();
  if (name === "markdown") return markdown();
  if (name === "html") return html();
  return javascript({ jsx: name === "jsx" });
}

export function codeDiagnostics(view, language) {
  const text = view.state.doc.toString();
  if (!text.trim() || language === "markdown" || language === "css-declarations") return [];
  if (language === "svg" && !text.trimStart().startsWith("<")) return [];
  if (language === "json") return jsonParseLinter()(view);
  const diagnostics = [];
  syntaxTree(view.state).iterate({ enter(node) {
    if ((node.type.isError || ["MissingCloseTag", "MismatchedCloseTag"].includes(node.name)) && diagnostics.length < 25) diagnostics.push({ from: node.from, to: Math.min(text.length, Math.max(node.to, node.from + 1)), severity: "error", message: "Syntaxe incomplète ou incorrecte." });
  } });
  if (language === "svg" && typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(text, "image/svg+xml");
    if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") diagnostics.push({ from: 0, to: Math.min(text.length, 1), severity: "error", message: "Le document doit être un SVG valide." });
    if (document.querySelector("script, foreignObject, iframe") || /\son[a-z]+\s*=|(?:javascript|data):/i.test(text)) diagnostics.push({ from: 0, to: Math.min(text.length, 1), severity: "error", message: "Contenu actif interdit dans une icône SVG." });
  }
  return diagnostics;
}
