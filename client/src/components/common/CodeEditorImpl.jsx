import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, indentUnit } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap } from "@codemirror/search";
import { linter, lintGutter } from "@codemirror/lint";
import { codeLanguage, codeDiagnostics } from "./code-languages.js";
import { editorDocumentValue } from "./code-files.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import "./code-editor.css";

const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword], color: "#dfa8f4" },
  { tag: [tags.string, tags.attributeValue], color: "#b8dc94" },
  { tag: [tags.number, tags.bool, tags.null], color: "#edbe83" },
  { tag: [tags.tagName, tags.typeName], color: "#85cfdd" },
  { tag: [tags.propertyName, tags.attributeName], color: "#f1d98e" },
  { tag: tags.comment, color: "#9aaeb2", fontStyle: "italic" },
  { tag: tags.heading, color: "#85cfdd", fontWeight: "bold" },
  { tag: [tags.operator, tags.punctuation], color: "#c7d2dc" }
]);

export default function CodeEditorImpl({ value = "", onChange, language = "javascript", label = "Code", readOnly = false, maxLength = 524288, height = 280 }) {
  const { t } = useLocale();
  const host = useRef(null), editor = useRef(null), callback = useRef(onChange), config = useRef(new Compartment());
  const externalChange = useRef(false);
  const [diagnostics, setDiagnostics] = useState([]);
  callback.current = onChange;
  useEffect(() => {
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: editorDocumentValue(value), extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), history(),
      indentOnInput(), indentUnit.of("  "), bracketMatching(), closeBrackets(), autocompletion(),
      syntaxHighlighting(colors), lintGutter(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...searchKeymap, indentWithTab]),
      EditorState.transactionFilter.of(transaction => transaction.docChanged && transaction.newDoc.length > maxLength ? [] : transaction),
      EditorView.updateListener.of(update => { if (update.docChanged && !externalChange.current) callback.current?.(update.state.doc.toString()); }),
      config.current.of([])
    ] }) });
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, []);
  useEffect(() => {
    const view = editor.current;
    view.dispatch({ effects: config.current.reconfigure([
      codeLanguage(language), EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", role: "textbox", tabindex: "0", spellcheck: "false" }),
      linter(current => { const next = codeDiagnostics(current, language); setDiagnostics(next); return next; }, { delay: 400 })
    ]) });
  }, [language, label, readOnly]);
  useEffect(() => {
    const view = editor.current;
    const text = editorDocumentValue(value);
    if (view && text !== view.state.doc.toString()) {
      externalChange.current = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }
      finally { externalChange.current = false; }
    }
  }, [value]);
  return <div className="code-field" style={{ "--code-height": typeof height === "number" ? `${height}px` : height }}>
    <div className="code-field-heading"><span>{language.toUpperCase()}</span><span>{readOnly ? t("Lecture seule") : t("Édition")} · {editorDocumentValue(value).split("\n").length} {t("lignes")}</span></div>
    <div ref={host} className="code-field-host"/>
    {diagnostics.length > 0 && <ul className="code-field-diagnostics" aria-live="polite">{diagnostics.slice(0, 3).map((row, index) => <li key={index}>{t("Ligne")} {editorDocumentValue(value).slice(0, row.from).split("\n").length} : {t(row.message)}</li>)}</ul>}
  </div>;
}
