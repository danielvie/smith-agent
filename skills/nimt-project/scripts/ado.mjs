#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";

const COLLECTION_URL = "https://gide-tfs.web.boeing.com/tfs/IT";
const PROJECT_URL = COLLECTION_URL + "/2CES";
const API_VERSION = "5.0";

function usage() {
  console.log(`Usage:
  node scripts/ado.mjs check
  node scripts/ado.mjs item <id> [--relations]
  node scripts/ado.mjs wiql --query <query>
  node scripts/ado.mjs wiql --file <path>
  node scripts/ado.mjs batch --file <path>
  node scripts/ado.mjs self-test`);
}

function getOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  if (index === args.length - 1) throw new Error(name + " requires a value");
  return args[index + 1];
}

function parseWorkItemId(value) {
  if (!/^\d+$/.test(value ?? "")) throw new Error("Work-item ID must be a positive integer");
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Work-item ID must be a positive integer");
  return id;
}

function authorizationHeaders() {
  const pat = process.env.ADO_PAT;
  if (!pat) throw new Error("ADO_PAT is missing");

  return {
    Authorization: "Basic " + Buffer.from("pat:" + pat).toString("base64"),
    Accept: "application/json",
  };
}

async function requestJson(url, options = {}) {
  const headers = {
    ...authorizationHeaders(),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = typeof payload === "object" && payload?.message
      ? payload.message
      : String(payload || response.statusText).slice(0, 500);
    throw new Error("ADO request failed with " + response.status + ": " + detail);
  }

  return payload;
}

async function readJsonFile(path) {
  if (!path) throw new Error("--file is required");
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON in " + path + ": " + error.message);
  }
}

async function readWiql(args) {
  const query = getOption(args, "--query");
  if (query) return query;

  const path = getOption(args, "--file");
  if (!path) throw new Error("wiql requires --query or --file");

  const text = await readFile(path, "utf8");
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.query !== "string" || !parsed.query.trim()) {
      throw new Error("JSON file must contain a non-empty query field");
    }
    return parsed.query;
  } catch (error) {
    if (error instanceof SyntaxError && text.trim()) return text.trim();
    throw error;
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function checkConnection() {
  const payload = await requestJson(
    COLLECTION_URL + "/_apis/projects?api-version=" + API_VERSION,
  );
  printJson({
    connected: true,
    collection: COLLECTION_URL,
    project: "2CES",
    visibleProjects: payload?.count ?? payload?.value?.length ?? null,
  });
}

async function getItem(args) {
  const id = parseWorkItemId(args[0]);
  const expand = args.includes("--relations") ? "&%24expand=relations" : "";
  const url = PROJECT_URL + "/_apis/wit/workitems/" + id
    + "?api-version=" + API_VERSION + expand;
  printJson(await requestJson(url));
}

async function runWiql(args) {
  const query = await readWiql(args);
  const url = PROJECT_URL + "/_apis/wit/wiql?api-version=" + API_VERSION;
  printJson(await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  }));
}

async function runBatch(args) {
  const body = await readJsonFile(getOption(args, "--file"));
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw new Error("Batch request must contain a non-empty ids array");
  }
  if (body.ids.length > 200) throw new Error("Batch requests support at most 200 IDs");

  const url = PROJECT_URL + "/_apis/wit/workitemsbatch?api-version=" + API_VERSION;
  printJson(await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function selfTest() {
  assert.equal(parseWorkItemId("6717890"), 6717890);
  assert.throws(() => parseWorkItemId("0"), /positive integer/);
  assert.throws(() => parseWorkItemId("abc"), /positive integer/);
  assert.equal(getOption(["--query", "SELECT 1"], "--query"), "SELECT 1");
  assert.equal(getOption([], "--query"), undefined);
  assert.match(PROJECT_URL, /\/2CES$/);
  console.log("ADO script self-test passed");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "check":
      await checkConnection();
      break;
    case "item":
      await getItem(args);
      break;
    case "wiql":
      await runWiql(args);
      break;
    case "batch":
      await runBatch(args);
      break;
    case "self-test":
      selfTest();
      break;
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      usage();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
