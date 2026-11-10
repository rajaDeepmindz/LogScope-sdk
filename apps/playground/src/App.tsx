import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Plus,
  Settings2,
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  PlugZap,
  X,
  CheckCircle2,
  AlertTriangle,
  Database,
  FileText,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import { detectResponse, normalizeResponse } from "@logscope/core";
import {
  clearHistory,
  pruneHistory,
  readHistory,
  writeHistory,
  type StoredEvent,
} from "./history";
import "./studio.css";
import "./fullscreen.css";
type Transport = "REST" | "WebSocket" | "SSE" | "File";
type Theme = "violet" | "ocean" | "forest" | "sunset" | "rose";
const themes: { id: Theme; label: string; color: string }[] = [
  { id: "violet", label: "Violet", color: "#8e80ff" },
  { id: "ocean", label: "Ocean", color: "#38a9e8" },
  { id: "forest", label: "Forest", color: "#36b783" },
  { id: "sunset", label: "Sunset", color: "#f29b55" },
  { id: "rose", label: "Rose", color: "#ed7190" },
];
type Source = {
  id: string;
  name: string;
  transport: Transport;
  url: string;
  method: "GET" | "POST";
  body: string;
  headers: string;
  enabled: boolean;
  status: string;
  hidden: string[];
  labels: Record<string, string>;
  offset: number;
  mapping?: ReturnType<typeof detectResponse>["mapping"];
  preview?: unknown;
};
type View = "live" | "compare" | "replay";
type TimedEvent = StoredEvent & { comparisonTime: number };
type FileImportMessage =
  | { type: "batch"; events: StoredEvent[] }
  | { type: "progress"; count: number }
  | { type: "imported"; count: number; retained: number }
  | { type: "save-progress"; saved: number; total: number }
  | { type: "saved" }
  | { type: "save-error"; message: string }
  | { type: "error"; message: string };
const defaultSource: Source = {
  id: "",
  name: "New Application",
  transport: "REST",
  url: "",
  method: "GET",
  body: "",
  headers: "{}",
  enabled: true,
  status: "Not tested",
  hidden: [],
  labels: {},
  offset: 0,
};
const stamp = (n: number) =>
  new Date(n).toLocaleTimeString("en-GB", { hour12: false }) +
  "." +
  String(new Date(n).getMilliseconds()).padStart(3, "0");
const asText = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));
function nearestEvent(
  events: TimedEvent[],
  target: number,
  tolerance: number,
): TimedEvent | undefined {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].comparisonTime < target) low = middle + 1;
    else high = middle;
  }
  const before = events[low - 1];
  const after = events[low];
  const nearest =
    !before ||
    (after && target - before.comparisonTime > after.comparisonTime - target)
      ? after
      : before;
  return nearest && Math.abs(nearest.comparisonTime - target) <= tolerance
    ? nearest
    : undefined;
}
function VirtualLogList<T>({
  items,
  itemHeight,
  getKey,
  renderItem,
  empty,
}: {
  items: T[];
  itemHeight: number;
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  empty: React.ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(470);
  const viewportRef = useRef<HTMLDivElement>(null);
  const overscan = 8;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan,
  );
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={viewportRef}
      className="log-scroll"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {items.length ? (
        <div
          style={{
            height: items.length * itemHeight,
            position: "relative",
          }}
        >
          {items.slice(start, end).map((item, index) => (
            <div
              key={getKey(item)}
              style={{
                position: "absolute",
                top: (start + index) * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
                overflow: "hidden",
              }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : (
        empty
      )}
    </div>
  );
}
function rowsFrom(payload: unknown, s: Source): StoredEvent[] {
  const found = s.mapping || detectResponse(payload, s.id).mapping;
  return normalizeResponse(payload, s.id, found).map((log, i) => {
    let n = Date.parse(log.timestamp);
    if (!Number.isFinite(n)) n = Date.now();
    return {
      ...log,
      id: `${s.id}:${log.id}:${n}:${i}`,
      sourceId: s.id,
      timestamp: n,
      receivedAt: Date.now(),
      level: log.level,
      message: log.message,
    } as StoredEvent;
  });
}
export default function App() {
  const [theme, setTheme] = useState<Theme>("violet");
  const [view, setView] = useState<View>("live");
  const [sources, setSources] = useState<Source[]>([]);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loadingSources, setLoadingSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const [dialog, setDialog] = useState<
    "connect" | "fields" | "settings" | null
  >(null);
  const [draft, setDraft] = useState<Source>(defaultSource);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [testInfo, setTestInfo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [schemaSource, setSchemaSource] = useState("");
  const [retention, setRetention] = useState(3);
  const [maxEvents, setMaxEvents] = useState(100000);
  const [storageInfo, setStorageInfo] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [range, setRange] = useState(180);
  const [customMin, setCustomMin] = useState(45);
  const [cursor, setCursor] = useState(0);
  const [play, setPlay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tolerance, setTolerance] = useState(1500);
  const [capture, setCapture] = useState(true);
  const [notice, setNotice] = useState("Add a source to begin capturing logs.");
  const activeConnections = useRef<Map<string, () => void>>(new Map());
  const localFileSourceIds = useRef(new Set<string>());
  const deferredSearch = useDeferredValue(search);
  const append = useCallback(
    (incoming: StoredEvent[], persist = true) => {
      if (!incoming.length) return;
      setEvents((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const fresh = incoming
          .filter((e) => {
            if (existing.has(e.id)) return false;
            existing.add(e.id);
            return true;
          })
          .sort((a, b) => a.timestamp - b.timestamp);
        const merged: StoredEvent[] = [];
        let previousIndex = 0;
        let incomingIndex = 0;
        while (previousIndex < prev.length && incomingIndex < fresh.length) {
          if (prev[previousIndex].timestamp <= fresh[incomingIndex].timestamp) {
            merged.push(prev[previousIndex++]);
          } else {
            merged.push(fresh[incomingIndex++]);
          }
        }
        merged.push(...prev.slice(previousIndex), ...fresh.slice(incomingIndex));
        return merged.slice(-maxEvents);
      });
      if (persist) {
        void writeHistory(incoming).catch((e) =>
          setNotice("IndexedDB write failed: " + String(e)),
        );
      }
    },
    [maxEvents],
  );
  useEffect(() => {
    let alive = true;
    readHistory(maxEvents)
      .then((saved) => {
        if (!alive || !saved.length) return;
        setEvents((prev) => {
          if (!prev.length) return saved;
          const m = new Map(prev.map((x) => [x.id, x]));
          saved.forEach((x) => m.set(x.id, x));
          return [...m.values()]
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-maxEvents);
        });
      })
      .catch(() => setNotice("IndexedDB unavailable; history remains in RAM."));
    return () => {
      alive = false;
    };
  }, [maxEvents]);
  useEffect(() => {
    const id = setInterval(() => {
      setClock(Date.now());
      void pruneHistory(
        retention,
        maxEvents,
        localFileSourceIds.current,
      ).catch((error) =>
        setNotice(`IndexedDB pruning failed: ${String(error)}`),
      );
      setEvents((old) =>
        old
          .filter(
            (e) =>
              localFileSourceIds.current.has(e.sourceId) ||
              e.timestamp >= Date.now() - retention * 3600000,
          )
          .slice(-maxEvents),
      );
    }, 30000);
    return () => clearInterval(id);
  }, [retention, maxEvents]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!play) return;
      setCursor((t) => {
        const next = t + 250 * speed;
        return next >= clock ? (setPlay(false), clock) : next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [play, speed, clock]);
  useEffect(
    () => () => {
      activeConnections.current.forEach((stop) => stop());
      activeConnections.current.clear();
    },
    [],
  );
  const mutateSource = (id: string, patch: Partial<Source>) =>
    setSources((old) => old.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const receive = (s: Source, payload: unknown) => {
    setLoadingSources((current) => {
      if (!current.has(s.id)) return current;
      const next = new Set(current);
      next.delete(s.id);
      return next;
    });
    try {
      append(rowsFrom(payload, s));
    } catch (e) {
      setNotice(`${s.name} parse error: ${String(e)}`);
    }
  };
  const testSource = async () => {
    setTestBusy(true);
    setTestInfo("Testing connection…");
    try {
      const s = { ...draft };
      if (s.transport === "REST") {
        if (!/^https?:\/\//.test(s.url))
          throw Error("REST requires an http(s) URL");
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 12000);
        try {
          const headers = JSON.parse(s.headers || "{}") as Record<
            string,
            string
          >;
          const res = await fetch(s.url, {
            method: s.method,
            headers,
            body: s.method === "POST" ? s.body || undefined : undefined,
            signal: controller.signal,
          });
          if (!res.ok) throw Error(`HTTP ${res.status}`);
          const text = await res.text();
          let response: unknown;
          try {
            response = JSON.parse(text);
          } catch {
            response = text;
          }
          const found = detectResponse(response, s.id || "preview");
          setDraft((p) => ({
            ...p,
            preview: response,
            mapping: found.mapping,
            status: "Test passed",
          }));
          setTestInfo(
            `✓ HTTP ${res.status} · ${found.format} · confidence ${Math.round(found.confidence * 100)}% · ${rowsFrom(response, { ...s, mapping: found.mapping }).length} log entries · ${JSON.stringify(found.mapping)}`,
          );
        } finally {
          clearTimeout(timer);
        }
      } else {
        if (s.transport === "WebSocket") {
          if (!/^wss?:\/\//.test(s.url))
            throw Error("WebSocket requires ws(s) URL");
          await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(s.url);
            const timer = setTimeout(() => {
              ws.close();
              reject(Error("No message received within 8s"));
            }, 8000);
            ws.onmessage = (e) => {
              clearTimeout(timer);
              let response: unknown = e.data;
              try {
                response = JSON.parse(e.data);
              } catch {}
              const found = detectResponse(response, s.id || "preview");
              setDraft((p) => ({
                ...p,
                preview: response,
                mapping: found.mapping,
                status: "Test passed",
              }));
              setTestInfo(
                `✓ WebSocket message received · ${found.format} · ${JSON.stringify(found.mapping)}`,
              );
              ws.close();
              resolve();
            };
            ws.onerror = () => {
              clearTimeout(timer);
              reject(Error("WebSocket handshake or connection failed"));
            };
          });
        } else {
          if (!/^https?:\/\//.test(s.url))
            throw Error("SSE requires http(s) URL");
          await new Promise<void>((resolve, reject) => {
            const es = new EventSource(s.url);
            const timer = setTimeout(() => {
              es.close();
              reject(Error("No SSE message received within 8s"));
            }, 8000);
            es.onmessage = (e) => {
              clearTimeout(timer);
              let response: unknown = e.data;
              try {
                response = JSON.parse(e.data);
              } catch {}
              const found = detectResponse(response, s.id || "preview");
              setDraft((p) => ({
                ...p,
                preview: response,
                mapping: found.mapping,
                status: "Test passed",
              }));
              setTestInfo(
                `✓ SSE event received · ${found.format} · ${JSON.stringify(found.mapping)}`,
              );
              es.close();
              resolve();
            };
            es.onerror = () => {
              clearTimeout(timer);
              es.close();
              reject(Error("SSE connection failed"));
            };
          });
        }
      }
    } catch (e) {
      setTestInfo(
        `⚠ ${String(e)}. Check server, CORS, authentication and endpoint.`,
      );
    } finally {
      setTestBusy(false);
    }
  };
  const connect = (s: Source) => {
    if (s.transport === "File") return;
    if (s.transport === "REST") {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let requestController: AbortController | undefined;
      let stopped = false;
      const pull = async () => {
        if (stopped) return;
        requestController = new AbortController();
        const abortRequest = () => requestController?.abort();
        controller.signal.addEventListener("abort", abortRequest, {
          once: true,
        });
        const timeout = setTimeout(() => requestController?.abort(), 12000);
        try {
          const response = await fetch(s.url, {
            method: s.method,
            headers: JSON.parse(s.headers || "{}") as Record<string, string>,
            body: s.method === "POST" ? s.body || undefined : undefined,
            signal: requestController.signal,
          });
          if (!response.ok) throw Error(`HTTP ${response.status}`);
          const text = await response.text();
          let payload: unknown;
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
          receive(s, payload);
          mutateSource(s.id, { status: "Connected" });
        } catch (e) {
          if (!stopped) {
            setLoadingSources((current) => {
              const next = new Set(current);
              next.delete(s.id);
              return next;
            });
            mutateSource(s.id, { status: `Error: ${String(e)}` });
          }
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener("abort", abortRequest);
          requestController = undefined;
          if (!stopped) timer = setTimeout(() => void pull(), 10000);
        }
      };
      void pull();
      activeConnections.current.set(s.id, () => {
        stopped = true;
        controller.abort();
        requestController?.abort();
        if (timer) clearTimeout(timer);
      });
    } else if (s.transport === "WebSocket") {
      const ws = new WebSocket(s.url);
      ws.onmessage = (e) => {
        let p: unknown = e.data;
        try {
          p = JSON.parse(e.data);
        } catch {}
        receive(s, p);
      };
      ws.onopen = () => mutateSource(s.id, { status: "Connected" });
      ws.onerror = () => {
        setLoadingSources((current) => {
          const next = new Set(current);
          next.delete(s.id);
          return next;
        });
        mutateSource(s.id, { status: "Connection error" });
      };
      ws.onclose = () => mutateSource(s.id, { status: "Disconnected" });
      activeConnections.current.set(s.id, () => ws.close());
    } else {
      const es = new EventSource(s.url);
      es.onmessage = (e) => {
        let p: unknown = e.data;
        try {
          p = JSON.parse(e.data);
        } catch {}
        receive(s, p);
      };
      es.onopen = () => mutateSource(s.id, { status: "Connected" });
      es.onerror = () => {
        setLoadingSources((current) => {
          const next = new Set(current);
          next.delete(s.id);
          return next;
        });
        mutateSource(s.id, { status: "Reconnecting / error" });
      };
      activeConnections.current.set(s.id, () => es.close());
    }
  };
  const saveSource = async () => {
    if (!draft.name.trim()) {
      setTestInfo("Application name is required");
      return;
    }
    if (draft.transport === "File" && !selectedFile) {
      setTestInfo("Choose a .log or .txt file to import");
      return;
    }
    if (
      draft.transport === "File" &&
      selectedFile &&
      !/\.(log|txt)$/i.test(selectedFile.name)
    ) {
      setTestInfo("Only .log and .txt files can be imported");
      return;
    }
    if (draft.transport !== "File" && !draft.url.trim()) {
      setTestInfo("Endpoint URL is required");
      return;
    }
    const s = {
      ...draft,
      id: "source-" + Date.now(),
      name: draft.name.trim(),
      status: draft.transport === "File" ? "Importing file" : "Connecting",
    };
    if (s.transport === "File") localFileSourceIds.current.add(s.id);
    setLoadingSources((current) => new Set(current).add(s.id));
    setSources((prev) => [...prev, s]);
    setDialog(null);
    if (draft.transport === "File" && selectedFile) {
      const file = selectedFile;
      const importedEvents: StoredEvent[] = [];
      const worker = new Worker(
        new URL("./log-import.worker.ts", import.meta.url),
        { type: "module" },
      );
      try {
        await new Promise<void>((resolve, reject) => {
          let importedCount = 0;
          let retainedCount = 0;
          worker.onmessage = (event: MessageEvent<FileImportMessage>) => {
            const message = event.data;
            if (message.type === "batch") {
              importedEvents.push(...message.events);
            } else if (message.type === "progress") {
              mutateSource(s.id, { status: `Importing (${message.count})` });
              setNotice(`Imported ${message.count} log events so far…`);
            } else if (message.type === "imported") {
              importedCount = message.count;
              retainedCount = message.retained;
              append(importedEvents, false);
              mutateSource(s.id, {
                status: `Imported (${message.retained} events)`,
              });
              setNotice(`Saving ${message.retained} events from ${file.name}…`);
            } else if (message.type === "save-progress") {
              setNotice(
                `Saving ${message.saved.toLocaleString()} of ${message.total.toLocaleString()} events from ${file.name}…`,
              );
            } else if (message.type === "saved") {
              setNotice(
                importedCount > retainedCount
                  ? `Imported ${importedCount} events from ${file.name}; kept the latest ${retainedCount} per the event limit.`
                  : `Imported ${retainedCount} events from ${file.name}.`,
              );
              resolve();
            } else if (message.type === "save-error") {
              setNotice(
                `Imported logs are in memory, but IndexedDB save failed: ${message.message}`,
              );
              resolve();
            } else {
              reject(new Error(message.message));
            }
          };
          worker.onerror = (event) => reject(new Error(event.message));
          worker.postMessage({ file, sourceId: s.id, maxEvents });
        });
      } catch (error) {
        mutateSource(s.id, { status: "Import failed" });
        setNotice(`Could not import ${file.name}: ${String(error)}`);
      } finally {
        worker.terminate();
        setLoadingSources((current) => {
          const next = new Set(current);
          next.delete(s.id);
          return next;
        });
      }
      return;
    }
    try {
      connect(s);
    } catch (e) {
      setLoadingSources((current) => {
        const next = new Set(current);
        next.delete(s.id);
        return next;
      });
      setNotice(String(e));
    }
  };
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const filtered = useMemo(
    () =>
      events
        .filter(
          (e) =>
            sourceById.get(e.sourceId)?.enabled &&
            (severity === "ALL" || e.level === severity) &&
            (!deferredSearch ||
              `${e.message} ${e.level} ${e.service ?? ""} ${e.traceId ?? ""} ${JSON.stringify(e.metadata ?? {})}`
                .toLowerCase()
                .includes(deferredSearch.toLowerCase())),
        )
        .map((e) => ({
          ...e,
          comparisonTime:
            e.timestamp +
            (sourceById.get(e.sourceId)?.offset || 0),
        }))
        .sort((a, b) => a.comparisonTime - b.comparisonTime),
    [events, sourceById, severity, deferredSearch],
  );
  const replayStart = clock - (range === 0 ? customMin : range) * 60000;
  const visible = useMemo(
    () =>
      view !== "replay"
        ? filtered
        : filtered.filter(
            (e) =>
              e.comparisonTime >= replayStart && e.comparisonTime <= cursor,
          ),
    [filtered, view, replayStart, cursor],
  );
  const isFetching = loadingSources.size > 0;
  const active = events.find((x) => x.id === selected),
    activeSource = sourceById.get(active?.sourceId ?? "");
  const first = sources.filter((s) => s.enabled)[0],
    second = sources.filter((s) => s.enabled)[1];
  const comparisonEvents = useMemo(
    () => ({
      left: first
        ? visible.filter((event) => event.sourceId === first.id)
        : [],
      right: second
        ? visible.filter((event) => event.sourceId === second.id)
        : [],
    }),
    [visible, first?.id, second?.id],
  );
  const logRow = (e: StoredEvent & { comparisonTime?: number }) => (
    <button
      key={e.id}
      className={`log-row ${selected === e.id ? "chosen" : ""}`}
      onClick={() => setSelected(e.id)}
    >
      <time>{stamp(e.comparisonTime ?? e.timestamp)}</time>
      <strong className={`severity ${e.level}`}>{e.level}</strong>
      <span className="log-copy">
        <span className="source-name">
          {sourceById.get(e.sourceId)?.name || e.sourceId}
        </span>{" "}
        <span className="message">{e.message}</span>
      </span>
    </button>
  );
  const panel = (
    <section className="panel log-panel">
      <div className="panel-title">
        <strong>
          {view === "compare"
            ? "Side-by-side comparison"
            : view === "replay"
              ? "Replay"
              : "Timeline"}
        </strong>
        <span className="subtle">
          {visible.length ? `${visible.length} events` : isFetching ? "Fetching…" : "0 events"}
        </span>
      </div>
      {view === "compare" && first && second ? (
        <>
          <div className="compare-head">
            <span>{first.name}</span>
            <span>{second.name}</span>
          </div>
          <VirtualLogList
            items={comparisonEvents.left}
            itemHeight={100}
            getKey={(left) => left.id}
            empty={<p className="empty">No events to compare.</p>}
            renderItem={(left) => {
                const right = nearestEvent(
                  comparisonEvents.right,
                  left.comparisonTime,
                  tolerance,
                );
                return (
                  <div className="compare-pair">
                    <div>{logRow(left)}</div>
                    <div>
                      {right ? (
                        logRow(right)
                      ) : (
                        <span className="empty">No event in time window</span>
                      )}
                    </div>
                  </div>
                );
              }}
          />
        </>
      ) : (
        <VirtualLogList
          items={visible}
          itemHeight={48}
          getKey={(event) => event.id}
          renderItem={logRow}
          empty={
            <p className="empty">
              {isFetching
                ? "Fetching logs from your sources…"
                : "No events for this view. Try another source or time range."}
            </p>
          }
        />
      )}
      <div className="panel-bottom">
        {view === "compare"
          ? "Nearest timestamps are not proof of related events."
          : view === "replay"
            ? "Recorded events replayed locally; live capture is independent."
            : "Select an event to inspect its key/value fields."}
      </div>
    </section>
  );
  const detail = (
    <section className="panel detail-panel">
      <div className="panel-title">
        <strong>Event inspector</strong>
        <button
          className="link-button"
          onClick={() => {
            setSchemaSource(active?.sourceId || sources[0]?.id || "");
            setDialog("fields");
          }}
        >
          <Settings2 size={13} /> Fields
        </button>
      </div>
      {active ? (
        <div className="detail-scroll">
          <p className="subtle">
            {activeSource?.name} · {stamp(active.timestamp)}
          </p>
          {Object.entries(active)
            .filter(
              ([key]) =>
                !["id"].includes(key) && !activeSource?.hidden.includes(key),
            )
            .map(([key, value]) => (
              <div className="kv" key={key}>
                <span>{activeSource?.labels[key] || key}</span>
                <span>{asText(value)}</span>
              </div>
            ))}
        </div>
      ) : (
        <p className="empty">Select a log entry</p>
      )}
    </section>
  );
  const openAdd = () => {
    setDraft({ ...defaultSource });
    setSelectedFile(null);
    setTestInfo("");
    setDialog("connect");
  };
  const download = () => {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(visible, null, 2)], {
          type: "application/json",
        }),
      );
    a.href = url;
    a.download = `logscope-${view}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={`studio ${theme}`}>
      <div className="glow" />
      <header className="header">
        <div className="identity">
          <div className="logo">
            <Activity size={19} />
          </div>
          <div>
            <b>
              logscope<span className="accent">.</span>
            </b>
            <small>STUDIO</small>
          </div>
        </div>
        <div className="header-actions">
          <span className="status-dot">
            ● {sources.filter((s) => s.enabled).length} sources
          </span>
          <div className="theme-switch" aria-label="Color theme">
            {themes.map((option) => (
              <button
                key={option.id}
                type="button"
                title={`${option.label} color mode`}
                aria-label={`${option.label} color mode`}
                aria-pressed={theme === option.id}
                className={theme === option.id ? "active" : ""}
                onClick={() => setTheme(option.id)}
              >
                <span
                  className="theme-swatch"
                  style={{ backgroundColor: option.color }}
                />
              </button>
            ))}
          </div>
          <button className="primary" onClick={openAdd}>
            Add source
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="heading">
          <div>
            <h1>Workspace Overview</h1>
            <p>Monitor, compare and replay application logs.</p>
          </div>
          <span className="subtle">LogScope v1.0 alpha · Local-first</span>
        </div>
        <div className="toolbar">
          <div className="segmented">
            {(
              [
                ["live", "Live Logs"],
                ["compare", "Compare"],
                ["replay", "Replay"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => {
                  setView(id);
                  if (id === "replay") {
                    setCursor(Date.now());
                    setPlay(false);
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            className="secondary"
            disabled={!sources.length}
            onClick={() => {
              setSchemaSource(active?.sourceId || sources[0]?.id || "");
              setDialog("fields");
            }}
          >
            <Eye size={15} /> Fields
          </button>
          <button className="secondary" onClick={() => setDialog("settings")}>
            <Settings2 size={15} /> Settings
          </button>
        </div>
        <section className="panel sourcebar">
          <span className="subtle">SOURCES</span>
          <div className="source-chips">
            {sources.map((s) => (
              <button
                key={s.id}
                className={`source-chip ${s.enabled ? "enabled" : ""}`}
                onClick={() => mutateSource(s.id, { enabled: !s.enabled })}
              >
                <span className="signal" />
                {s.name}
                <span className="subtle">{s.transport}</span>
                {s.enabled ? " ✓" : " +"}
              </button>
            ))}
          </div>
        </section>
        {sources.length === 0 ? (
          <section className="panel empty-sources" role="alert">
            <div className="logo">
              <PlugZap size={19} />
            </div>
            <div>
              <h2>No sources connected</h2>
              <p>
                Add your sources to start collecting and viewing application
                logs.
              </p>
            </div>
            <button className="primary" onClick={openAdd}>
              <Plus size={15} /> Add your sources
            </button>
          </section>
        ) : (
          <>
        <div className="kpis">
          {[
            [
              "Visible logs",
              visible.length ? visible.length : isFetching ? "Fetching…" : 0,
            ],
            [
              "Warnings",
              visible.filter((x) => x.level === "WARNING" || x.level === "WARN")
                .length,
            ],
            ["Errors", visible.filter((x) => x.level === "ERROR").length],
          ].map(([label, value]) => (
            <div className="panel kpi" key={label}>
              <span className="subtle">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <section className="panel filter-panel">
          <div className="search-row">
            <label className="search-field">
              <Search size={15} />
              <input
                placeholder="Search logs, tags, values..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="ALL">All levels</option>
              {["INFO", "DEBUG", "WARNING", "ERROR", "FATAL"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          {view === "live" ? (
            <div className="minor-controls">
              <span className="online">
                ● History retained locally when available
              </span>
              <button className="link-button" onClick={() => setView("replay")}>
                View history →
              </button>
            </div>
          ) : view === "compare" ? (
            <div className="minor-controls">
              <span className="subtle">Timestamp matching ±</span>
              <select
                value={tolerance}
                onChange={(e) => setTolerance(+e.target.value)}
              >
                {[
                  [500, "500 ms"],
                  [1500, "1.5 sec"],
                  [3000, "3 sec"],
                  [10000, "10 sec"],
                ].map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="subtle">Adjust clock offsets in Settings</span>
            </div>
          ) : (
            <div className="replay-control">
              <div className="minor-controls">
                <span className="subtle">History</span>
                {[5, 30, 60, 120, 180, 0].map((n) => (
                  <button
                    key={n}
                    className={`mini ${range === n ? "active" : ""}`}
                    onClick={() => {
                      setRange(n);
                      setCursor(Date.now() - (n || customMin) * 60000);
                      setPlay(false);
                    }}
                  >
                    {n === 0 ? "Custom" : n < 60 ? `${n}m` : `${n / 60}h`}
                  </button>
                ))}
                {range === 0 && (
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={customMin}
                    onChange={(e) => setCustomMin(Math.max(1, +e.target.value))}
                    className="minutes"
                  />
                )}
              </div>
              <input
                aria-label="Replay timeline"
                type="range"
                min={replayStart}
                max={clock}
                value={Math.max(replayStart, Math.min(cursor, clock))}
                onChange={(e) => {
                  setCursor(+e.target.value);
                  setPlay(false);
                }}
              />
              <div className="minor-controls">
                <button
                  className="secondary"
                  onClick={() => {
                    setCursor(replayStart);
                    setPlay(false);
                  }}
                >
                  <SkipBack size={14} />
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (cursor >= clock) setCursor(replayStart);
                    setPlay((p) => !p);
                  }}
                >
                  {play ? <Pause size={14} /> : <Play size={14} />}{" "}
                  {play ? "Pause" : "Play"}
                </button>
                <button
                  className="secondary"
                  onClick={() => setCursor((c) => Math.min(clock, c + 1000))}
                >
                  <SkipForward size={14} />
                </button>
                <select
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                >
                  {[0.5, 1, 2, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
                <span className="subtle">
                  {stamp(cursor)} · {visible.length} entries
                </span>
              </div>
            </div>
          )}
        </section>
        <div className="content-grid">
          {panel}
          {detail}
        </div>
          </>
        )}
        <div className="footer">
          <span className="subtle">{notice}</span>
          <div>
            <button
              className="secondary"
              onClick={download}
              disabled={!visible.length}
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      </main>
      {dialog && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-title">
              <h2>
                {dialog === "connect"
                  ? "Connect application"
                  : dialog === "fields"
                    ? "Display fields"
                    : "Storage & time settings"}
              </h2>
              <button className="icon-btn" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            {dialog === "connect" ? (
              <div className="modal-body">
                <p className="subtle">
                  Test the actual response, detect its shape, and add the source
                  to your workspace.
                </p>
                <label>
                  Application name
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Transport
                  <select
                    value={draft.transport}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        transport: e.target.value as Transport,
                      })
                    }
                  >
                    <option>REST</option>
                    <option>WebSocket</option>
                    <option>SSE</option>
                    <option>File</option>
                  </select>
                </label>
                {draft.transport === "File" ? (
                  <label key="file-source">
                    Log file (.log or .txt)
                    <input
                      type="file"
                      accept=".log,.txt,text/plain"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setSelectedFile(file);
                        if (file && draft.name === "New Application") {
                          setDraft({
                            ...draft,
                            name: file.name.replace(/\.(log|txt)$/i, ""),
                          });
                        }
                      }}
                    />
                    <span className="subtle">
                      {selectedFile
                        ? `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB`
                        : "Choose a local plain-text log file to import."}
                    </span>
                  </label>
                ) : (
                  <label key="network-source">
                    Endpoint URL
                    <input
                      placeholder="https://example.com/api/logs"
                      value={draft.url}
                      onChange={(e) =>
                        setDraft({ ...draft, url: e.target.value })
                      }
                    />
                  </label>
                )}
                {draft.transport === "REST" && (
                  <>
                    <label>
                      HTTP method
                      <select
                        value={draft.method}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            method: e.target.value as "GET" | "POST",
                          })
                        }
                      >
                        <option>GET</option>
                        <option>POST</option>
                      </select>
                    </label>
                    {draft.method === "POST" && (
                      <label>
                        Request body
                        <textarea
                          rows={2}
                          value={draft.body}
                          onChange={(e) =>
                            setDraft({ ...draft, body: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Headers (JSON)
                      <textarea
                        rows={2}
                        value={draft.headers}
                        onChange={(e) =>
                          setDraft({ ...draft, headers: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                <div className="modal-actions">
                  {draft.transport !== "File" && (
                    <button
                      className="secondary"
                      disabled={testBusy}
                      onClick={() => void testSource()}
                    >
                      <PlugZap size={14} />{" "}
                      {testBusy ? "Testing…" : "Test connection"}
                    </button>
                  )}
                  <button className="primary" onClick={() => void saveSource()}>
                    {draft.transport === "File" ? (
                      <FileText size={14} />
                    ) : (
                      <Plus size={14} />
                    )}{" "}
                    {draft.transport === "File" ? "Import file" : "Add source"}
                  </button>
                </div>
                {testInfo && <div className="test-result">{testInfo}</div>}
                {draft.preview !== undefined && (
                  <pre className="json-preview">
                    {JSON.stringify(draft.preview, null, 2)?.slice(0, 3000)}
                  </pre>
                )}
                <p className="subtle">
                  {draft.transport === "File"
                    ? "The selected file is read locally in your browser and its parsed events are added to the timeline."
                    : "Network tests are real; CORS and browser authentication restrictions apply. WebSocket/SSE tests wait for the first message. Do not put permanent secrets in browser configuration."}
                </p>
              </div>
            ) : dialog === "fields" ? (
              <div className="modal-body">
                <label>
                  Application
                  <select
                    value={schemaSource}
                    onChange={(e) => setSchemaSource(e.target.value)}
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="subtle">
                  Show/hide keys or rename labels without changing raw log data.
                </p>
                {[
                  ...new Set(
                    events
                      .filter((e) => e.sourceId === schemaSource)
                      .flatMap((e) => Object.keys(e)),
                  ),
                ]
                  .filter((k) => k !== "id")
                  .map((key) => {
                    const s = sources.find((x) => x.id === schemaSource)!;
                    return (
                      <div className="fieldrow" key={key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!s.hidden.includes(key)}
                            onChange={(e) =>
                              mutateSource(s.id, {
                                hidden: e.target.checked
                                  ? s.hidden.filter((k) => k !== key)
                                  : [...s.hidden, key],
                              })
                            }
                          />
                          {key}
                        </label>
                        <input
                          aria-label={`${key} display name`}
                          value={s.labels[key] ?? key}
                          onChange={(e) =>
                            mutateSource(s.id, {
                              labels: { ...s.labels, [key]: e.target.value },
                            })
                          }
                        />
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="modal-body">
                <p className="subtle">
                  IndexedDB history is local to this browser/origin. The memory
                  and disk policies below are limits, not guaranteed storage
                  allocations.
                </p>
                <label>
                  Retention
                  <select
                    value={retention}
                    onChange={(e) => setRetention(+e.target.value)}
                  >
                    {[1, 3, 6, 24, 168].map((n) => (
                      <option key={n} value={n}>
                        {n} hour{n !== 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Max events
                  <input
                    type="number"
                    min="1000"
                    max="1000000"
                    value={maxEvents}
                    onChange={(e) =>
                      setMaxEvents(Math.max(1000, +e.target.value))
                    }
                  />
                </label>
                <button
                  className="secondary"
                  onClick={() => {
                    void navigator.storage
                      ?.estimate()
                      .then((v) =>
                        setStorageInfo(
                          `${((v.usage || 0) / 1048576).toFixed(1)} MB used · ${((v.quota || 0) / 1073741824).toFixed(1)} GB quota`,
                        ),
                      )
                      .catch((e) => setStorageInfo(String(e)));
                  }}
                >
                  <Database size={14} /> Check browser storage
                </button>
                {storageInfo && <p className="subtle">{storageInfo}</p>}
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      void clearHistory().then(() => {
                        setEvents([]);
                        setSelected(null);
                        setNotice("Saved history cleared");
                        setDialog(null);
                      });
                    }}
                  >
                    Clear saved history
                  </button>
                  <button className="primary" onClick={() => setDialog(null)}>
                    Save settings
                  </button>
                </div>
                <h3>Source time offsets</h3>
                {sources.map((s) => (
                  <label key={s.id}>
                    {s.name} (ms)
                    <input
                      type="number"
                      value={s.offset}
                      onChange={(e) =>
                        mutateSource(s.id, { offset: +e.target.value || 0 })
                      }
                    />
                  </label>
                ))}
                <button
                  className="secondary"
                  onClick={() => {
                    activeConnections.current.forEach((stop) => stop());
                    activeConnections.current.clear();
                    setCapture(!capture);
                    setNotice(
                      capture
                        ? "All transport connections stopped."
                        : "Use Connect API to resume sources.",
                    );
                  }}
                >
                  {capture ? "Stop all connections" : "Capture stopped"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
