// PROTOTYPE shared props contract. Throwaway.
import type { Scenario } from "./fixtures";

export interface VariantProps {
  scenario: Scenario;
  draft: string;
  setDraft: (value: string) => void;
  /** Stub. Prototypes never mutate anything real. */
  noop: (label: string) => void;
}

export interface Variant {
  key: string;
  name: string;
  note: string;
  Component: (props: VariantProps) => React.ReactElement;
}

export function shortPath(path: string): string {
  const parts = path.split(/[\/]/u).filter(Boolean);
  return parts.slice(-2).join("/");
}

export function approvalTitle(kind: string): string {
  return kind === "shell" ? "Run a command" : "Write to a file";
}

export function argLines(args: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(args).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value, null, 2)]);
}
