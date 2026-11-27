import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHtml, safeJsonForScript } from "./routes/auth";
import { positiveEnvInt, canEvictCachedRoom } from "./roomStore";
import { registerSocketHandlers, joinSocketLimiter, joinIpLimiter, signalingLimiter } from "./sockets";
import { setupAuthRoutes } from "./routes/auth";
import { setupAiRoutes } from "./routes/ai";
import { setupRoomsRoutes } from "./routes/rooms";

test("index.ts remains lean and under 300 lines after modular extraction (#238)", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const lineCount = source.split(/\r?\n/).length;
  assert.ok(
    lineCount < 300,
    `server/index.ts has ${lineCount} lines, expected < 300 lines after extracting route and socket handlers`
  );
  assert.match(source, /setupAuthRoutes/);
  assert.match(source, /setupAiRoutes/);
  assert.match(source, /setupRoomsRoutes/);
  assert.match(source, /registerSocketHandlers/);
});

test("auth route helpers properly escape and serialize inputs (#238)", () => {
  assert.equal(escapeHtml("<script>alert('xss')&\"test\"</script>"), "&lt;script&gt;alert(&#039;xss&#039;)&amp;&quot;test&quot;&lt;/script&gt;");
  const scriptJson = safeJsonForScript({ tag: "</script><script>alert(1)</script>" });
  assert.ok(!scriptJson.includes("</script>"));
  assert.ok(scriptJson.includes("\\u003c/script\\u003e"));
});

test("roomStore and socket limiters are modularly exported and operational (#238)", () => {
  assert.equal(typeof positiveEnvInt, "function");
  assert.equal(positiveEnvInt("NON_EXISTENT_VAR_123", 42), 42);
  assert.equal(typeof canEvictCachedRoom, "function");
  assert.equal(typeof registerSocketHandlers, "function");
  assert.equal(typeof setupAuthRoutes, "function");
  assert.equal(typeof setupAiRoutes, "function");
  assert.equal(typeof setupRoomsRoutes, "function");

  assert.equal(joinSocketLimiter.check("dummy-socket-1").allowed, true);
  assert.equal(joinIpLimiter.check("127.0.0.1").allowed, true);
  assert.equal(signalingLimiter.check("dummy-peer-1").allowed, true);
  joinSocketLimiter.clear("dummy-socket-1");
  joinIpLimiter.clear("127.0.0.1");
  signalingLimiter.clear("dummy-peer-1");
});
