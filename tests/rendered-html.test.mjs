import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the River poker experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /RIVER/);
  assert.match(html, /赢家通吃/);
  assert.match(html, /随机洗牌/);
  assert.match(html, /庄家 BTN/);
  assert.match(html, /小盲 SB/);
  assert.match(html, /大盲 BB/);
  assert.match(html, /枪口 UTG/);
  assert.equal((html.match(/empty-card-slot/g) ?? []).length, 5);
  assert.doesNotMatch(html, /class="(?:red )?card-reveal"/);
  assert.match(html, /打开账户记录/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("removes starter-only assets and metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /资金流水/);
  assert.match(page, /牌局记录/);
  assert.match(page, /estimateHandStrength/);
  assert.match(page, /raisesThisStreet/);
  assert.match(page, /无人下注，可以过牌或下注/);
  assert.match(layout, /RIVER 德扑竞技/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
});
