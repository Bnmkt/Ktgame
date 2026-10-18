export const sourceLanguage = (path = "") => path.endsWith(".css") ? "css" : path.endsWith(".json") ? "json" : path.endsWith(".jsx") ? "jsx" : "javascript";
export const editorDocumentValue = value => String(value ?? "").replace(/\r\n?/g, "\n");
