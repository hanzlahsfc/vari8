import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { assertPortAvailable, createReportServer } from "./local-preview.mjs";

const temporaryDirectories = [];
const servers = [];

after(async () => {
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("reports server serves report files and keeps access inside reports/", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-preview-reports-"));
  const outside = await mkdtemp(join(tmpdir(), "local-preview-outside-"));
  temporaryDirectories.push(root, outside);
  await writeFile(join(root, "summary.html"), "<h1>summary</h1>");
  await writeFile(join(outside, "private.txt"), "private");
  await symlink(join(outside, "private.txt"), join(root, "escape.txt"));

  const port = await unusedPort();
  const server = await createReportServer({ root, port });
  servers.push(server);

  const health = await fetch(`http://127.0.0.1:${port}/__health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");

  const index = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /summary\.html/);

  const report = await fetch(`http://127.0.0.1:${port}/summary.html`);
  assert.equal(report.status, 200);
  assert.equal(report.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await report.text(), "<h1>summary</h1>");

  const traversal = await fetch(`http://127.0.0.1:${port}/%2e%2e/private.txt`);
  assert.notEqual(traversal.status, 200);
  const symlinkResponse = await fetch(`http://127.0.0.1:${port}/escape.txt`);
  assert.equal(symlinkResponse.status, 403);
  assert.notEqual(
    await symlinkResponse.text(),
    await readFile(join(outside, "private.txt"), "utf8"),
  );
});

test("occupied ports are reported without stopping the existing listener", async () => {
  const server = createServer((_request, response) =>
    response.end("still here"),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const port = server.address().port;

  await assert.rejects(
    assertPortAvailable(port),
    /already in use; no process was stopped/,
  );
  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "still here");
});
