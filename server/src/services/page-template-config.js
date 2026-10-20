const reserved = new Set(["content", "title", "slug", "description", "constructor", "prototype", "__proto__"]);
const types = new Set(["text", "textarea", "number", "boolean", "url", "image", "color", "select"]);
const text = (value, max) => String(value ?? "").trim().slice(0, max);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const escapeMarkdown = value => escapeHtml(value).replace(/[\\`*_{}\[\]()#+.!|>-]/g, "\\$&");

function variableValue(field, value, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required && field.required) throw new Error(`Renseigne la variable « ${field.label} ».`);
    return "";
  }
  if (field.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`« ${field.label} » doit être un choix oui/non.`);
    return value;
  }
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e9) throw new Error(`Nombre invalide pour « ${field.label} ».`);
    return value;
  }
  if (typeof value !== "string" || value.length > (field.type === "textarea" ? 20000 : 4000)) throw new Error(`Valeur trop longue ou invalide pour « ${field.label} ».`);
  if (field.type === "select" && !field.options.includes(value)) throw new Error(`Choix invalide pour « ${field.label} ».`);
  if (field.type === "color" && !/^#[a-f\d]{6}$/i.test(value)) throw new Error(`Couleur invalide pour « ${field.label} ».`);
  if (["url", "image"].includes(field.type)) {
    if (value.length > 2048 || /[\s<>"'\\(){}\[\]]/.test(value)) throw new Error(`Lien invalide pour « ${field.label} ».`);
    if (!/^(?:\/(?!\/)|#)/.test(value)) {
      let url;
      try { url = new URL(value); } catch { throw new Error(`Lien invalide pour « ${field.label} ».`); }
      const protocols = field.type === "image" ? ["http:", "https:"] : ["http:", "https:", "mailto:"];
      if (!protocols.includes(url.protocol) || url.username || url.password) throw new Error(`Lien invalide pour « ${field.label} ».`);
    }
  }
  return value;
}

export function normalizePageTemplate(input) {
  const name = text(input?.name, 120);
  if (!name) throw new Error("Indique un nom pour le modèle.");
  if (!["html", "markdown"].includes(input.format)) throw new Error("Choisis le format du modèle.");
  if (typeof input.layout !== "string" || !input.layout.trim() || input.layout.length > 100000) throw new Error("Le layout doit contenir entre 1 et 100 000 caractères.");
  if (!Array.isArray(input.variables ?? []) || (input.variables ?? []).length > 32) throw new Error("Un modèle peut contenir jusqu’à 32 variables.");
  const keys = new Set(reserved);
  const variables = (input.variables ?? []).map(field => {
    if (!field || typeof field !== "object") throw new Error("Variable invalide.");
    const key = text(field.key, 40), label = text(field.label, 80) || key;
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || keys.has(key)) throw new Error(`Identifiant de variable invalide ou déjà utilisé : ${key}.`);
    keys.add(key);
    if (!types.has(field.type)) throw new Error(`Type de variable invalide : ${key}.`);
    const options = field.type === "select" ? field.options : [];
    if (!Array.isArray(options) || options.length > 40 || options.some(option => typeof option !== "string" || !option.trim() || option.length > 120) || field.type === "select" && !options.length || new Set(options).size !== options.length) throw new Error(`Choix invalides pour « ${label} ».`);
    const normalized = { key, label, type: field.type, required: field.required === true, help: text(field.help, 240), options };
    return { ...normalized, defaultValue: variableValue(normalized, field.defaultValue) };
  });
  const tokens = [...input.layout.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => match[1]);
  if (tokens.filter(token => token === "content").length !== 1) throw new Error("Le layout doit contenir exactement une zone {{content}}.");
  for (const token of tokens) if (!keys.has(token) || ["constructor", "prototype", "__proto__"].includes(token)) throw new Error(`Variable inconnue dans le layout : ${token}.`);
  const presentation = input.presentation ?? {};
  const maxWidth = presentation.maxWidth ?? 0, padding = presentation.padding ?? 28;
  if (!Number.isInteger(maxWidth) || maxWidth !== 0 && (maxWidth < 480 || maxWidth > 1920)) throw new Error("La largeur doit être automatique ou comprise entre 480 et 1 920 px.");
  if (!Number.isInteger(padding) || padding < 0 || padding > 64) throw new Error("La marge intérieure doit être comprise entre 0 et 64 px.");
  return { name, description: text(input.description, 280), format: input.format, layout: input.layout, variables, style: input.style ?? "", script: input.script ?? "", presentation: { maxWidth, padding, showTitle: presentation.showTitle !== false, showBackLink: presentation.showBackLink !== false } };
}

export function resolveTemplatePage(page, template, { strict = false } = {}) {
  if (page.format !== template.format) throw new Error("Le format de la page doit correspondre à celui du modèle.");
  const values = {}, provided = page.variableValues ?? {};
  if (!provided || typeof provided !== "object" || Array.isArray(provided) || JSON.stringify(provided).length > 64000) throw new Error("Les valeurs des variables sont invalides ou trop volumineuses.");
  for (const field of template.variables) values[field.key] = variableValue(field, Object.hasOwn(provided, field.key) ? provided[field.key] : field.defaultValue, strict);
  const variables = { ...values, title: page.title, slug: page.slug, description: page.description };
  const fields = new Map(template.variables.map(field => [field.key, field]));
  const escape = (key, value) => {
    if (template.format === "html") return escapeHtml(value);
    if (["url", "image"].includes(fields.get(key)?.type)) return String(value).replace(/[*_`!]/g, char => `%${char.charCodeAt(0).toString(16)}`);
    return escapeMarkdown(value);
  };
  function substitute(source, content) {
    let size = source.length;
    return source.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (token, key) => {
      const value = key === "content" && content !== undefined ? content : Object.hasOwn(variables, key) ? escape(key, variables[key]) : token;
      size += value.length - token.length;
      if (size > 150000) throw new Error("La page générée dépasse 150 000 caractères.");
      return value;
    });
  }
  const content = substitute(template.layout, substitute(page.content));
  return { ...page, content, variables, presentation: template.presentation, templateName: template.name, templateVersion: template.version, templateUpdatedAt: template.publishedAt,
    style: [template.style, page.style].filter(Boolean).join("\n"),
    script: [template.script, page.script].filter(value => value?.trim()).map(value => `{\n${value}\n}`).join("\n") };
}
