// PROTOTYPE server. Throwaway — deliberately separate from src/server.ts so the real
// server stays untouched. No agent, no API key, no persistence: fixtures only.
import index from "./index.html";

const port = Number(process.env.SMITH_PROTOTYPE_PORT ?? 3211);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  development: true,
  routes: { "/": index },
});

console.log(`Layout prototype: http://127.0.0.1:${server.port}/`);
console.log("Variants A–J. Arrow keys or the bottom bar to cycle; the select changes the fixture state.");
