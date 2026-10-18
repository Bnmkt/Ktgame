export const sourceLanguage = (path = "") => path.endsWith(".css") ? "css" : path.endsWith(".json") ? "json" : path.endsWith(".jsx") ? "jsx" : "javascript";
