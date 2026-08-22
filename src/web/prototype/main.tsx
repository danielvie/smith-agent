// PROTOTYPE entry point. Throwaway — see README.md in this directory.
//
// Two generations of layout variants on one throwaway route, switchable via ?variant=,
// each driven by a fixture scenario picked with ?scenario=.
//
//   gen 1 (A–J): ten independent bets on the whole composition.
//   gen 2 (K–R): eight descendants of D (timeline spine) crossed with G (bands) and I (terminal).
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { scenarioByKey, scenarios } from "./fixtures";
import type { Variant } from "./kit";
import { variantA } from "./variants/a-rail";
import { variantB } from "./variants/b-document";
import { variantC } from "./variants/c-margin";
import { variantD } from "./variants/d-spine";
import { variantE } from "./variants/e-composer";
import { variantF } from "./variants/f-focus-pane";
import { variantG } from "./variants/g-bands";
import { variantH } from "./variants/h-toprail";
import { variantI } from "./variants/i-terminal";
import { variantJ } from "./variants/j-focus";
import { variantK } from "./variants/k-spine-bands";
import { variantL } from "./variants/l-ledger";
import { variantM } from "./variants/m-band-node";
import { variantN } from "./variants/n-strips";
import { variantO } from "./variants/o-changelog";
import { variantP } from "./variants/p-tail";
import { variantQ } from "./variants/q-numbered";
import { variantR } from "./variants/r-density";
import "./base.css";

const gen1: Variant[] = [variantA, variantB, variantC, variantD, variantE, variantF, variantG, variantH, variantI, variantJ];
const gen2: Variant[] = [variantK, variantL, variantM, variantN, variantO, variantP, variantQ, variantR];
const all: Variant[] = [...gen1, ...gen2];

const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";

function generationOf(key: string): "1" | "2" {
  return gen2.some((v) => v.key === key) ? "2" : "1";
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    variant: params.get("variant") ?? "K",
    scenario: params.get("scenario") ?? "streaming",
  };
}

function writeParams(variant: string, scenario: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variant);
  url.searchParams.set("scenario", scenario);
  window.history.replaceState({}, "", url);
}

function Switcher({
  variant,
  scenario,
  generation,
  onVariant,
  onScenario,
  onGeneration,
}: {
  variant: Variant;
  scenario: string;
  generation: "1" | "2";
  onVariant: (step: number) => void;
  onScenario: (key: string) => void;
  onGeneration: (gen: "1" | "2") => void;
}) {
  if (isProduction) return null;
  return (
    <div className="p-switch">
      <button onClick={() => onVariant(-1)} title="Previous variant (←)">‹</button>
      <div className="p-switch-label">
        {variant.key} — {variant.name}
        <small>{variant.note}</small>
      </div>
      <button onClick={() => onVariant(1)} title="Next variant (→)">›</button>
      <div className="p-switch-sep" />
      <select value={generation} onChange={(event) => onGeneration(event.target.value as "1" | "2")} title="Generation">
        <option value="1">gen 1 · A–J</option>
        <option value="2">gen 2 · K–R</option>
      </select>
      <select value={scenario} onChange={(event) => onScenario(event.target.value)} title="Fixture state">
        {scenarios.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}

function Prototype() {
  const initial = readParams();
  const [variantKey, setVariantKey] = useState(initial.variant);
  const [scenarioKey, setScenarioKey] = useState(initial.scenario);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | undefined>();

  const scenario = scenarioByKey(scenarioKey);
  const generation = generationOf(variantKey);
  const pool = generation === "2" ? gen2 : gen1;
  const index = Math.max(0, pool.findIndex((v) => v.key === variantKey));
  const variant = pool[index] ?? all[0]!;

  useEffect(() => {
    writeParams(variant.key, scenario.key);
    document.title = `Prototype ${variant.key} — ${variant.name}`;
  }, [variant, scenario]);

  useEffect(() => {
    setDraft(scenario.draft ?? "");
  }, [scenario]);

  const step = useCallback(
    (delta: number) => {
      const next = pool[(index + delta + pool.length) % pool.length]!;
      setVariantKey(next.key);
    },
    [index, pool],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName) || target.isContentEditable)) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const noop = useCallback((label: string) => {
    setToast(`${label} — stub, prototypes do not mutate`);
    window.setTimeout(() => setToast(undefined), 1400);
  }, []);

  const Component = variant.Component;

  return (
    <>
      <Component key={`${variant.key}-${scenario.key}`} scenario={scenario} draft={draft} setDraft={setDraft} noop={noop} />
      {toast && (
        <div style={{ position: "fixed", bottom: 58, left: "50%", transform: "translateX(-50%)", zIndex: 9998, padding: "6px 14px", borderRadius: 999, background: "#2a2f3b", color: "#d9deea", fontSize: 12 }}>
          {toast}
        </div>
      )}
      <Switcher
        variant={variant}
        scenario={scenario.key}
        generation={generation}
        onVariant={step}
        onScenario={setScenarioKey}
        onGeneration={(gen) => setVariantKey(gen === "2" ? gen2[0]!.key : gen1[0]!.key)}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Prototype />);
