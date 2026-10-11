import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as types from "@babel/types";

const traverse = traverseModule.default;
const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = fs.readdirSync(root, { recursive: true }).filter((name) => name.endsWith(".jsx") && !name.startsWith(`locales${path.sep}`) && name !== path.join("seo", "render.jsx"));
const source = JSON.parse(fs.readFileSync(path.join(root, "locales/fr.json"), "utf8"));
const english = JSON.parse(fs.readFileSync(path.join(root, "locales/en.json"), "utf8"));
const attributes = new Set(["title", "aria-label", "placeholder", "label", "message", "confirmLabel", "dialogTitle", "emptyLabel", "emptyMessage", "caption", "selectionLabel", "suffix"]);
let changed = 0;
const human = (value) => typeof value === "string" && /\p{L}/u.test(value);
function add(value) { if (human(value)) { if (!Object.hasOwn(source, value)) source[value] = value.includes("::") ? value.slice(value.indexOf("::") + 2) : value; if (!Object.hasOwn(english, value)) english[value] = ""; } }
for (const name of files) {
  const filename = path.join(root, name), code = fs.readFileSync(filename, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["jsx"] });
  const edits = [], owners = new Set();
  function owner(node) {
    for (let current = node; current; current = current.parentPath) {
      if (current.isFunctionDeclaration() && (/^[A-Z]/.test(current.node.id?.name ?? "") || current.node.id?.name === "legalDocuments")) return current;
      if (current.isArrowFunctionExpression() && current.node.body.type === "BlockStatement" && current.parentPath.isVariableDeclarator() && /^[A-Z]/.test(current.parentPath.node.id?.name ?? "")) return current;
    }
  }
  const call = (text) => { add(text); return `localeText(${JSON.stringify(text)})`; };
  function expression(node, component) {
    if (node.isStringLiteral() && human(node.node.value)) edits.push({ start: node.node.start, end: node.node.end, value: call(node.node.value) });
    else if (node.isTemplateLiteral() && node.node.quasis.some((part) => human(part.value.cooked))) {
      const text = node.node.quasis.map((part, index) => part.value.cooked + (index < node.node.expressions.length ? `{value${index}}` : "")).join("");
      add(text);
      edits.push({ start: node.node.start, end: node.node.end, value: `localeText(${JSON.stringify(text)}, { ${node.node.expressions.map((part, index) => `value${index}: ${code.slice(part.start, part.end)}`).join(", ")} })` });
    } else if (node.isConditionalExpression()) { expression(node.get("consequent"), component); expression(node.get("alternate"), component); }
    else if (node.isLogicalExpression()) expression(node.get("right"), component);
    else if (node.isIdentifier() && ["label", "cta", "error", "success", ...(name === path.join("pages", "PublicGamesPage.jsx") || name === path.join("components", "game", "GameSupport.jsx") ? ["item"] : [])].includes(node.node.name)) edits.push({ start: node.node.start, end: node.node.end, value: `localeText(${node.node.name})` });
    else if ((node.isMemberExpression() || node.isOptionalMemberExpression()) && node.node.property.name === "label") edits.push({ start: node.node.start, end: node.node.end, value: `localeText(${code.slice(node.node.start, node.node.end)})` });
    else if ((node.isMemberExpression() || node.isOptionalMemberExpression()) && ((node.node.object.name === "game" && ["description", "name"].includes(node.node.property.name)) || (node.node.object.name === "rules" && node.node.property.name === "goal") || (node.node.object.name === "section" && node.node.property.name === "title") || (name === path.join("components", "help", "HelpContent.jsx") && ["title", "lead", "body", "category", "imageAlt", "intro"].includes(node.node.property.name)))) edits.push({ start: node.node.start, end: node.node.end, value: `localeText(${code.slice(node.node.start, node.node.end)})` });
    else if ((node.isMemberExpression() || node.isOptionalMemberExpression()) && (
      (name === path.join("components", "shop", "ShopCatalog.jsx") && ["name", "description"].includes(node.node.property.name)) ||
      (name === path.join("components", "patchnotes", "PatchnoteContent.jsx") && node.node.object.name === "block" && ["title", "content"].includes(node.node.property.name)) ||
      (name === path.join("pages", "ProfilePage.jsx") && node.node.object.name === "achievement" && ["name", "title", "description"].includes(node.node.property.name)) ||
      (name === path.join("privacy", "LegalPage.jsx") && node.node.object.name === "document" && node.node.property.name === "intro")
    )) edits.push({ start: node.node.start, end: node.node.end, value: `localeText(${code.slice(node.node.start, node.node.end)})` });
    else if (name === path.join("privacy", "LegalPage.jsx") && node.isIdentifier({ name: "title" })) edits.push({ start: node.node.start, end: node.node.end, value: "localeText(title)" });
    else if (node.isCallExpression() && ["gameTitle", "achievementTypeLabel", "transactionLabel", "gameAudienceLabel", "gameCategoryLabel", "gameComplexityLabel", "shopCategoryLabel", "shopTypeLabel"].includes(node.node.callee.name)) edits.push({ start: node.node.start, end: node.node.end, value: `localeText(${code.slice(node.node.start, node.node.end)})` });
    else return;
    owners.add(component);
  }
  traverse(ast, {
    StringLiteral(node) {
      if (node.parentPath.isCallExpression() && ["t", "localeText"].includes(node.parentPath.node.callee.name)) add(node.node.value);
      if (node.parentPath.isObjectProperty() && ["label", "title", "message"].includes(node.parentPath.node.key.name)) add(node.node.value);
      if (node.parentPath.isArrayExpression() && /[A-ZÀ-Ÿ]/u.test(node.node.value[0] ?? "") && human(node.node.value)) add(node.node.value);
    },
    JSXText(node) {
      const component = owner(node); if (!component) return;
      const text = types.react.buildChildren({ children: [node.node] })[0]?.value;
      if (!human(text) || !text.trim()) return;
      const key = text.trim();
      const value = (text.startsWith(" ") ? '" " + ' : "") + call(key) + (text.endsWith(" ") ? ' + " "' : "");
      edits.push({ start: node.node.start, end: node.node.end, value: `{${value}}` }); owners.add(component);
    },
    JSXAttribute(node) {
      const component = owner(node); if (!component || !attributes.has(node.node.name.name)) return;
      const value = node.get("value");
      if (value.isStringLiteral() && human(value.node.value)) { edits.push({ start: value.node.start, end: value.node.end, value: `{${call(value.node.value)}}` }); owners.add(component); }
      else if (value.isJSXExpressionContainer()) expression(value.get("expression"), component);
    },
    JSXExpressionContainer(node) {
      if (node.parentPath.isJSXAttribute()) return;
      const component = owner(node); if (component) expression(node.get("expression"), component);
    }
  });
  if (!edits.length) continue;
  for (const component of owners) {
    if (component.node.body.type !== "BlockStatement") continue;
    if (component.scope.hasOwnBinding("localeText")) continue;
    edits.push({ start: component.node.body.start + 1, end: component.node.body.start + 1, value: '\n  const { t: localeText } = useLocale();' });
  }
  const localeImport = ast.program.body.find((node) => node.type === "ImportDeclaration" && node.source.value.endsWith("/LocaleProvider.jsx"));
  if (localeImport) {
    if (!localeImport.specifiers.some((node) => node.imported?.name === "useLocale")) {
      const position = code.indexOf("}", localeImport.start);
      edits.push({ start: position, end: position, value: ", useLocale " });
    }
  } else {
    const relative = path.relative(path.dirname(filename), path.join(root, "locales/LocaleProvider.jsx")).replaceAll(path.sep, "/");
    edits.push({ start: 0, end: 0, value: `import { useLocale } from ${JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`)};\n` });
  }
  let next = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
  parse(next, { sourceType: "module", plugins: ["jsx"] });
  fs.writeFileSync(filename, next); changed++;
}
for (const name of ["config/site.js", "features/games/config.js"]) {
  const ast = parse(fs.readFileSync(path.join(root, name), "utf8"), { sourceType: "module" });
  traverse(ast, { StringLiteral(node) { if (human(node.node.value) && (/[\sàâçéèêëîïôùûüœ]/i.test(node.node.value) || /^[A-ZÀ-Ÿ]/u.test(node.node.value))) add(node.node.value); } });
}
for (const key of Object.keys(english)) add(key);
const server = parse(fs.readFileSync(new URL("../../server/src/index.js", import.meta.url), "utf8"), { sourceType: "module" });
traverse(server, { VariableDeclarator(node) { if (node.node.id.name === "defaultGameDescriptions") for (const entry of node.node.init.properties) add(entry.value.value); } });
for (const [language, catalog] of [["fr", source], ["en", english]]) fs.writeFileSync(path.join(root, `locales/${language}.json`), JSON.stringify(Object.fromEntries(Object.entries(catalog).filter(([, value]) => language === "fr" || value).sort(([a], [b]) => a.localeCompare(b, "fr"))), null, 2) + "\n");
console.log(JSON.stringify({ components: changed, texts: Object.keys(source).length }));
