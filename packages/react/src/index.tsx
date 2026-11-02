import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LogEngine,
  matchesQuery,
  type LogEntry,
  type LogLevel,
  type LogSource,
  type LogSourceAdapter,
} from "@logscope/core";
import {
  Search,
  Download,
  Trash2,
  Terminal,
  Pause,
  Play,
  Copy,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import "./style.css";
export interface LogViewerProps {
  source?: LogSource;
  adapter?: LogSourceAdapter<any>;
  entries?: LogEntry[];
  height?: number | string;
  title?: string;
  maxEntries?: number;
  theme?: "dark" | "light";
  showMetrics?: boolean;
  onError?: (error: Error) => void;
}
const levels: LogLevel[] = [
  "TRACE",
  "DEBUG",
  "INFO",
  "WARNING",
  "ERROR",
  "FATAL",
  "UNKNOWN",
];
export function LogViewer({
  source,
  adapter,
  entries,
  height = 560,
  title = "Log Explorer",
  maxEntries = 10000,
  theme = "dark",
  showMetrics = true,
  onError,
}: LogViewerProps) {
  const engineRef = useRef<LogEngine | null>(null);
  if (!engineRef.current) engineRef.current = new LogEngine(maxEntries);
  const engine = engineRef.current;
  const [rows, setRows] = useState<LogEntry[]>(entries ?? []);
  const [status, setStatus] = useState("idle");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pausedRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const sourceKey = JSON.stringify(source ?? null);
  useEffect(() => {
    const off = engine.subscribe((all) => {
      if (!pausedRef.current) setRows([...all]);
    });
    const statusOff = engine.subscribeStatus(setStatus);
    return () => {
      off();
      statusOff();
    };
  }, [engine]);
  useEffect(() => {
    if (entries) {
      setRows(entries);
      return;
    }
    if (source && adapter) {
      void engine.connect(source, adapter, (error) =>
        onErrorRef.current?.(error),
      );
      return () => {
        void engine.disconnect();
      };
    }
  }, [engine, sourceKey, adapter, entries]);
  useEffect(
    () => () => {
      void engine.dispose();
    },
    [engine],
  );
  const visible = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (level === "ALL" || r.level === level) &&
            (!query || matchesQuery(r, query)),
        )
        .sort((a, b) =>
          sort === "asc"
            ? a.timestamp.localeCompare(b.timestamp)
            : b.timestamp.localeCompare(a.timestamp),
        ),
    [rows, level, query, sort],
  );
  const counts = useMemo(
    () => ({
      all: rows.length,
      errors: rows.filter((r) => r.level === "ERROR" || r.level === "FATAL")
        .length,
      warnings: rows.filter((r) => r.level === "WARNING").length,
      services: new Set(rows.map((r) => r.service).filter(Boolean)).size,
    }),
    [rows],
  );
  const current = rows.find((x) => x.id === selected);
  const exportFile = (format: "json" | "txt") => {
    const content =
      format === "json"
        ? JSON.stringify(visible, null, 2)
        : visible
            .map(
              (x) =>
                `${x.timestamp} ${x.level} [${x.service || "app"}] ${x.message}`,
            )
            .join("\n");
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === "json" ? "application/json" : "text/plain",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `logscope-logs.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className={`ls-root ls-${theme}`} style={{ height }}>
      <div className="ls-header">
        <div className="ls-title">
          <Terminal size={19} />
          <div>
            <strong>{title}</strong>
            <small>
              {source?.name ?? "Standalone log explorer"} ·{" "}
              <span className={`ls-status ls-${status}`}>
                {entries ? "static" : status}
              </span>
            </small>
          </div>
        </div>
        <div className="ls-actions">
          <button
            onClick={() => {
              pausedRef.current = !pausedRef.current;
              setPaused(pausedRef.current);
              if (!pausedRef.current) setRows([...engine.getEntries()]);
            }}
            title={paused ? "Resume view" : "Pause view"}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
            <span>{paused ? "Resume" : "Pause"}</span>
          </button>
          <button onClick={() => exportFile("json")}>
            <Download size={15} /> JSON
          </button>
          <button onClick={() => exportFile("txt")}>TXT</button>
          <button
            onClick={() => {
              engine.clear();
              setRows([]);
              setSelected(null);
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {showMetrics && (
        <div className="ls-stats">
          {[
            ["EVENTS", counts.all],
            ["ERRORS", counts.errors],
            ["WARNINGS", counts.warnings],
            ["SERVICES", counts.services],
          ].map(([t, n]) => (
            <div className="ls-stat" key={t}>
              <small>{t}</small>
              <b>{n}</b>
            </div>
          ))}
        </div>
      )}
      <div className="ls-filters">
        <div className="ls-search">
          <Search size={16} />
          <input
            aria-label="Search logs"
            placeholder="Search logs · ERROR | timeout + API"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Severity"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="ALL">All levels</option>
          {levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as "asc" | "desc")}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>
      <div className="ls-tabs">
        <span>
          <Activity size={14} /> EVENT STREAM
        </span>
        <span>{visible.length} results</span>
      </div>
      <div className="ls-table-wrap">
        <table className="ls-table">
          <thead>
            <tr>
              <th>TIME</th>
              <th>LEVEL</th>
              <th>SERVICE</th>
              <th>MESSAGE</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                className={selected === r.id ? "ls-selected" : ""}
                key={r.id}
                onClick={() => {
                  setSelected(selected === r.id ? null : r.id);
                  setExpanded(false);
                }}
              >
                <td className="ls-time">
                  {new Date(r.timestamp).toLocaleTimeString()}
                </td>
                <td>
                  <span className={`ls-level ls-level-${r.level}`}>
                    {r.level}
                  </span>
                </td>
                <td className="ls-service">{r.service || "—"}</td>
                <td className="ls-message">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="ls-empty">
            No logs match. Change your filters or connect a data source.
          </div>
        )}
      </div>
      {current && (
        <div className="ls-inspect">
          <div className="ls-inspect-title">
            <strong>Event inspector</strong>
            <button onClick={() => setSelected(null)}>✕</button>
          </div>
          <p>{current.message}</p>
          <div className="ls-inspect-meta">
            {current.timestamp} · {current.sourceId} ·{" "}
            {current.traceId || "No trace ID"}
          </div>
          <button className="ls-expand" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{" "}
            {expanded ? "Hide" : "Show"} raw JSON
          </button>
          {expanded && <pre>{JSON.stringify(current.raw, null, 2)}</pre>}
          <button
            className="ls-copy"
            onClick={() =>
              navigator.clipboard.writeText(
                JSON.stringify(current.raw, null, 2),
              )
            }
          >
            <Copy size={13} /> Copy
          </button>
        </div>
      )}
      <div className="ls-footer">
        <span>LogScope SDK v1.0.0-alpha.1</span>
        <span>
          {rows.length} buffered · {paused ? "view paused" : "ready"}
        </span>
      </div>
    </div>
  );
}
