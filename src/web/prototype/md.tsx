// PROTOTYPE shared content renderer. Throwaway.
// Shared on purpose: this is content rendering, not layout. Variants must not share layout.
import DOMPurify from "dompurify";
import * as echarts from "echarts";
import katex from "katex";
import { marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import "katex/dist/katex.min.css";

const CHART_TOKEN = "@@PCHART";
const MATH_TOKEN = "@@PMATH";
const MATH_PATTERN = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)/gu;

function render(source: string) {
  const charts: Array<{ id: string; option: echarts.EChartsOption }> = [];
  const math: Array<{ expression: string; displayMode: boolean }> = [];

  let prepared = source.replace(/```chart\s*\n([\s\S]*?)```/gu, (_m, body: string) => {
    try {
      const id = `${charts.length}`;
      charts.push({ id, option: JSON.parse(body) as echarts.EChartsOption });
      return `\n\n${CHART_TOKEN}${id}@@\n\n`;
    } catch {
      return "\n\nChart error\n\n";
    }
  });

  prepared = prepared.replace(MATH_PATTERN, (_m, displayBracket, displayDollar, inlineBracket) => {
    const expression = displayBracket ?? displayDollar ?? inlineBracket;
    const id = `${math.length}`;
    math.push({ expression, displayMode: Boolean(displayBracket ?? displayDollar) });
    return `${MATH_TOKEN}${id}@@`;
  });

  let html = DOMPurify.sanitize(marked.parse(prepared, { breaks: true, gfm: true }) as string);
  math.forEach((item, index) => {
    html = html.replace(
      `${MATH_TOKEN}${index}@@`,
      katex.renderToString(item.expression, { displayMode: item.displayMode, throwOnError: false }),
    );
  });
  for (const chart of charts) {
    html = html.replace(`${CHART_TOKEN}${chart.id}@@`, `<div class="p-chart" data-chart-id="${chart.id}"></div>`);
  }
  return { html, charts };
}

export function Md({ source, className }: { source: string; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const out = useMemo(() => render(source), [source]);

  useEffect(() => {
    if (!container.current) return;
    const instances: echarts.ECharts[] = [];
    for (const chart of out.charts) {
      const element = container.current.querySelector(`[data-chart-id="${chart.id}"]`);
      if (!(element instanceof HTMLElement)) continue;
      const instance = echarts.init(element);
      instance.setOption(chart.option);
      instances.push(instance);
    }
    const resize = () => instances.forEach((i) => i.resize());
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      instances.forEach((i) => i.dispose());
    };
  }, [out]);

  return <div ref={container} className={`p-md ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: out.html }} />;
}
