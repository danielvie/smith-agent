import DOMPurify from "dompurify";
import * as echarts from "echarts";
import katex from "katex";
import { marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import "katex/dist/katex.min.css";

/**
 * A rendered response is a list of segments rather than one HTML blob: charts own their
 * own DOM node so React never replaces it out from under echarts. Scraping the rendered
 * HTML for chart placeholders looks simpler but leaves orphaned containers whenever a
 * streaming delta rewrites innerHTML without changing the effect's dependencies.
 */
export type Segment =
  | { kind: "html"; html: string }
  | { kind: "chart"; option: echarts.EChartsOption; source: string };

// Placeholders must survive marked.parse untouched. Anything wrapped in double
// underscores does not: marked reads it as strong emphasis, and the substitution below
// then finds nothing to replace.
const CHART_TOKEN = "@@SMITHCHART";
const MATH_TOKEN = "@@SMITHMATH";
const MATH_PATTERN = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|\$([^$\n]+)\$/gu;

export function renderMarkdown(source: string): Segment[] {
  const charts: Array<{ id: string; option: echarts.EChartsOption; source: string }> = [];
  const math: Array<{ expression: string; displayMode: boolean }> = [];

  let prepared = source.replace(/```chart\s*\n([\s\S]*?)```/gu, (_match, body: string) => {
    try {
      const option = JSON.parse(body) as unknown;
      if (option === null || typeof option !== "object" || Array.isArray(option)) throw new Error("Chart JSON must be an object.");
      const id = `${charts.length}`;
      charts.push({ id, option: option as echarts.EChartsOption, source: body });
      return `\n\n${CHART_TOKEN}${id}@@\n\n`;
    } catch (error) {
      return `\n\nChart error: ${error instanceof Error ? error.message : String(error)}\n\n`;
    }
  });

  prepared = prepared.replace(MATH_PATTERN, (_match, displayBracket, displayDollar, inlineBracket, inlineDollar) => {
    const expression = displayBracket ?? displayDollar ?? inlineBracket ?? inlineDollar;
    const displayMode = Boolean(displayBracket ?? displayDollar);
    const id = `${math.length}`;
    math.push({ expression, displayMode });
    return `${MATH_TOKEN}${id}@@`;
  });

  let html = DOMPurify.sanitize(marked.parse(prepared, { breaks: true, gfm: true }) as string);
  math.forEach((item, index) => {
    let rendered: string;
    try {
      rendered = katex.renderToString(item.expression, { displayMode: item.displayMode, throwOnError: false });
    } catch (error) {
      rendered = `<code>LaTeX error: ${String(error)}</code>`;
    }
    html = html.replace(`${MATH_TOKEN}${index}@@`, () => rendered);
  });

  const segments: Segment[] = [];
  let rest = html;
  for (const chart of charts) {
    const token = `${CHART_TOKEN}${chart.id}@@`;
    const at = rest.indexOf(token);
    if (at < 0) continue;
    let before = rest.slice(0, at);
    let after = rest.slice(at + token.length);
    // The token sits alone in its own paragraph; drop the wrapper marked put around it.
    if (before.endsWith("<p>")) before = before.slice(0, -3);
    if (after.startsWith("</p>")) after = after.slice(4);
    segments.push({ kind: "html", html: before });
    segments.push({ kind: "chart", option: chart.option, source: chart.source });
    rest = after;
  }
  segments.push({ kind: "html", html: rest });
  return segments;
}

function Chart({ option, source }: { option: echarts.EChartsOption; source: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const instance = echarts.init(host.current);
    instance.setOption(option);
    const resize = () => instance.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      instance.dispose();
    };
    // Re-initialise only when the chart definition itself changes, not on every delta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  return <div className="chart" ref={host} />;
}

export function Markdown({ source }: { source: string }) {
  const segments = useMemo(() => renderMarkdown(source), [source]);

  return (
    <div className="markdown">
      {segments.map((segment, index) =>
        segment.kind === "chart" ? (
          <Chart option={segment.option} source={segment.source} key={`chart-${index}`} />
        ) : segment.html ? (
          <div className="markdown-part" dangerouslySetInnerHTML={{ __html: segment.html }} key={`html-${index}`} />
        ) : null,
      )}
    </div>
  );
}
