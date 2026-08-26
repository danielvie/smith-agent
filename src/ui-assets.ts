import { readFile } from "node:fs/promises";
import { getAsset, isSea } from "node:sea";
import { join } from "node:path";

export type UiAssetName = "index.html" | "client.js" | "client.css";

export async function loadUiAsset(name: UiAssetName): Promise<string> {
  if (isSea()) return getAsset(`ui/${name}`, "utf8");
  return readFile(join(process.cwd(), "dist", "ui", name), "utf8");
}
