// 打包所有 ES 模块为单个 standalone.js，支持 file:// 直接双击打开
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = path.join(ROOT, 'js');
const POOL_FILE = path.join(ROOT, 'assets', 'data', 'playerpool.json');
const HIST_FILE = path.join(ROOT, 'assets', 'data', 'historicalpool.json');
const OUT = path.join(ROOT, 'standalone.js');

// 模块加载顺序（依赖在前）
const MODULES = ['data.js', 'build.js', 'simEngine.js', 'engine.js', 'ui.js'];

function read(name) {
  return fs.readFileSync(path.join(JS_DIR, name), 'utf8');
}

// 提取 `export const X` / `export function X` / `export async function X` 的名字
function extractExports(src) {
  const names = new Set();
  const re = /export\s+(?:const|function|async\s+function)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return [...names];
}

// 提取并替换 import 语句，返回 { 替换后代码, 依赖名列表 }
// import { A, B } from './data.js';
// import * as E from './engine.js';
function processImports(src, nsVar) {
  const deps = new Map(); // depName -> [names] 或 '*' 命名空间
  const namedRe = /import\s*\{([^}]*)\}\s*from\s*['"](\.\/)?([\w.-]+)['"];/g;
  let m;
  while ((m = namedRe.exec(src))) {
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
    deps.set(m[3], names);
  }
  const starRe = /import\s*\*\s*as\s+([\w$]+)\s*from\s*['"](\.\/)?([\w.-]+)['"];/g;
  while ((m = starRe.exec(src))) {
    deps.set(m[3], m[1]); // 用非数组值表示命名空间
  }
  let out = src;
  out = out.replace(/import\s*\{[^}]*\}\s*from\s*['"](\.\/)?[\w.-]+['"];/g, '');
  out = out.replace(/import\s*\*\s*as\s+[\w$]+\s*from\s*['"](\.\/)?[\w.-]+['"];/g, '');
  // 在文件开头插入解构赋值
  let header = '';
  for (const [dep, names] of deps) {
    if (Array.isArray(names)) {
      header += `const { ${names.join(', ')} } = ${nsVar}['${dep}'];\n`;
    } else {
      header += `const ${names} = ${nsVar}['${dep}'];\n`;
    }
  }
  return { out, header, deps };
}

// 移除 export 前缀（保留 const/function）
function stripExports(src) {
  return src
    .replace(/export\s+async\s+function/g, 'async function')
    .replace(/export\s+function/g, 'function')
    .replace(/export\s+const/g, 'const');
}

function build() {
  const parts = [];
  const ns = '__BL';
  parts.push(`/* 完美球员 · 单文件版（由 tools/build_standalone.mjs 生成） */`);
  parts.push(`(function () {`);
  parts.push(`  window.${ns} = window.${ns} || {};`);
  parts.push(`  var __M = window.${ns};`);
  // 内嵌球员池
  const pool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
  parts.push(`  window.__POOL_INLINE = ${JSON.stringify(pool)};`);
  // 内嵌历史球员池
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(HIST_FILE, 'utf8')); } catch {}
  parts.push(`  window.__HIST_INLINE = ${JSON.stringify(hist)};`);

  for (const file of MODULES) {
    let src = read(file);
    const exports = extractExports(src);
    const { out, header, deps } = processImports(src, ns);
    let code = stripExports(out);
    const depsStr = [...deps.keys()].join(',');
    parts.push(`\n  // ===== ${file} (deps: ${depsStr || 'none'}) =====`);
    parts.push(`  (function () {`);
    if (header) parts.push(header.trimEnd());
    parts.push(code.trim());
    if (exports.length) {
      parts.push(`  __M['${file}'] = { ${exports.join(', ')} };`);
    }
    parts.push(`  })();`);
  }

  // ui.js 需要直接执行（无 exports），且它引用全局 BL 已经通过闭包
  parts.push(`})();`);
  parts.push(`\n/* end of bundle */`);

  fs.writeFileSync(OUT, parts.join('\n'), 'utf8');
  console.log('built:', OUT, '(', fs.statSync(OUT).size, 'bytes )');
}

build();
