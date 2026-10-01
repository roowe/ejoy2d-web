// Converts ejoy2d Lua data tables with Fengari at build time; the browser only reads JSON.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fengari from 'fengari';

const { lua, lauxlib, to_luastring, to_jsstring } = fengari;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] ?? resolve(root, 'assets-source/sample.lua');
const destination = process.argv[3] ?? resolve(root, 'public/assets/sample.json');
const L = lauxlib.luaL_newstate();

function value(index) {
  switch (lua.lua_type(L, index)) {
    case lua.LUA_TNIL: return null;
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, index);
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, index);
    case lua.LUA_TSTRING: return to_jsstring(lua.lua_tolstring(L, index));
    case lua.LUA_TTABLE: {
      const result = {};
      const table = lua.lua_absindex(L, index);
      lua.lua_pushnil(L);
      while (lua.lua_next(L, table)) {
        const key = value(-2);
        if (typeof key !== 'number' && typeof key !== 'string') throw new Error('Unsupported Lua table key');
        result[key] = value(-1);
        lua.lua_pop(L, 1);
      }
      return result;
    }
    default: throw new Error('Assets may only contain literal data');
  }
}

function entries(table) {
  const result = [];
  for (let i = 1; Object.hasOwn(table, i); i++) result.push(table[i]);
  return result;
}

// No standard libraries are opened: resource conversion has no Lua filesystem/network API.
const input = await readFile(source, 'utf8');
if (lauxlib.luaL_loadstring(L, to_luastring(input)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
  throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
}
const raw = entries(value(-1));
lua.lua_close(L);
const matrices = raw.filter(o => o.type === 'matrix').flatMap(o => entries(o).map(entries));
let textureCount = 0;
const exports = {};
const objects = raw.filter(o => o.type !== 'matrix').map(o => {
  if (o.export) {
    if (Object.hasOwn(exports, o.export)) throw new Error(`Duplicate export: ${o.export}`);
    exports[o.export] = o.id;
  }
  if (o.type === 'picture') {
    return { type: o.type, id: o.id, quads: entries(o).map(q => {
      const tex = q.tex ?? 1;
      textureCount = Math.max(textureCount, tex);
      return { tex, src: entries(q.src), screen: entries(q.screen) };
    }) };
  }
  if (o.type === 'animation') {
    return { type: o.type, id: o.id, components: entries(o.component), actions: entries(o).map(action => ({
      name: action.action ?? '',
      frames: entries(action).map(frame => ({ parts: entries(frame).map(part => {
        if (typeof part === 'number') return { index: part };
        const result = { ...part };
        // Fengari uses signed 32-bit Lua integers, including hexadecimal color literals.
        if (part.color !== undefined) result.color = part.color >>> 0;
        if (part.add !== undefined) result.add = part.add >>> 0;
        if (part.mat !== undefined) {
          result.mat = typeof part.mat === 'number' ? matrices[part.mat] : entries(part.mat);
          if (!result.mat) throw new Error(`Unknown matrix pool index: ${part.mat}`);
        }
        return result;
      }) })),
    })) };
  }
  if (o.type === 'label') return { ...o, color: o.color >>> 0 };
  if (o.type === 'pannel') return o;
  throw new Error(`Unsupported MVP resource type: ${o.type}`);
});
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify({ textureCount, exports, objects }, null, 2) + '\n');
const types = {};
for (const object of objects) types[object.type] = (types[object.type] ?? 0) + 1;
const report = { source: source.replaceAll('\\', '/').split('/').at(-1), objects: objects.length, types, matrices: matrices.length, textureCount, exports };
await writeFile(destination.replace(/\.json$/, '.report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
