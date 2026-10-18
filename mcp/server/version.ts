// 第 1 条：版本号只在这里写一处；test/v120.mjs / v121.mjs / v122.mjs 断言它和 package.json、SKILL.md、zhiyike.py、manifest.json 一致。
// 不读 ../package.json：线上进程跑在 app/react-prototype/server/，上一级的 package.json 是网站的，不是 MCP 的。
export const VERSION = '1.2.2';
