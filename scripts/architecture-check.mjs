import fs from "node:fs";
import path from "node:path";
import { parsers } from "prettier/plugins/babel";

const files = [];
function walkFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(file);
    else if (file.endsWith(".js")) files.push(file);
  }
}
walkFiles("src");
walkFiles("server");
const graph = new Map(),
  failures = [];
function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key);
    return;
  }
  visit(node, parent, key);
  for (const [name, value] of Object.entries(node))
    if (
      ![
        "loc",
        "comments",
        "leadingComments",
        "trailingComments",
        "innerComments",
        "tokens",
      ].includes(name)
    )
      walk(value, visit, node, name);
}
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parsers.babel.parse(source, {});
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
    continue;
  }
  const references = new Set();
  for (const statement of ast.program.body.filter(
    (n) => n.type !== "ImportDeclaration",
  ))
    walk(statement, (node, parent, key) => {
      if (node.type !== "Identifier") return;
      if (key === "property" && !parent.computed) return;
      if (key === "key" && !parent.computed && !parent.shorthand) return;
      references.add(node.name);
    });
  const dependencies = [];
  walk(ast.program, (node) => {
    if (node.type === "ImportDeclaration")
      for (const specifier of node.specifiers)
        if (!references.has(specifier.local.name))
          failures.push(`${file}: unused import ${specifier.local.name}`);
    const specifier = [
      "ImportDeclaration",
      "ExportNamedDeclaration",
      "ExportAllDeclaration",
    ].includes(node.type)
      ? node.source?.value
      : node.type === "ImportExpression"
        ? node.source?.value
        : null;
    if (!specifier?.startsWith(".")) return;
    const dependency = path.normalize(path.join(path.dirname(file), specifier));
    if (!fs.existsSync(dependency))
      failures.push(`${file}: missing ${specifier}`);
    if (dependency.endsWith(".js")) dependencies.push(dependency);
    if (
      file.startsWith("src/content/") &&
      !dependency.startsWith("src/content/")
    )
      failures.push(`${file}: content must stay independent of runtime code`);
    if (
      file.startsWith("src/ui/") &&
      (dependency.startsWith("src/game/") ||
        dependency === "src/game.js" ||
        dependency === "src/multiplayer.js")
    )
      failures.push(
        `${file}: UI must receive data instead of importing the game`,
      );
    if (
      file.startsWith("src/game/") &&
      (dependency.startsWith("src/ui/") || dependency === "src/main.js")
    )
      failures.push(`${file}: gameplay must not import the DOM interface`);
  });
  graph.set(file, dependencies);
}
const visited = new Set();
function visit(file, stack = []) {
  if (stack.includes(file)) {
    failures.push("Import cycle: " + [...stack, file].join(" -> "));
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  for (const dependency of graph.get(file) || [])
    visit(dependency, [...stack, file]);
}
for (const file of files) visit(file);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Architecture: ${files.length} modules, valid syntax, no unused imports or import cycles.`,
  );
