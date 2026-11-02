import { normalizeResponse } from "@logscope/core";
import { writeHistory } from "./history";

type ImportRequest = { file: File; sourceId: string; maxEvents: number };
type ImportEvent = {
  id: string;
  sourceId: string;
  timestamp: number;
  receivedAt: number;
  level: string;
  message: string;
  [key: string]: unknown;
};
type ImportResponse =
  | { type: "batch"; events: ImportEvent[] }
  | { type: "progress"; count: number }
  | { type: "imported"; count: number; retained: number }
  | { type: "saved" }
  | { type: "save-error"; message: string }
  | { type: "error"; message: string };

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const { file, sourceId, maxEvents } = event.data;
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let currentRecord = "";
  let records: string[] = [];
  let imported = 0;
  let retained: ImportEvent[] = [];
  const recordStart =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?/;

  const flush = () => {
    if (!records.length) return;
    const receivedAt = Date.now();
    const logs = normalizeResponse(records, sourceId);
    const batch = logs.map((log, index) => {
      const timestamp = Date.parse(log.timestamp);
      const eventTimestamp = Number.isFinite(timestamp)
        ? timestamp
        : receivedAt;
      const event: ImportEvent = {
        ...log,
        id: `${sourceId}:${log.id}:${eventTimestamp}:${imported + index}`,
        sourceId,
        timestamp: eventTimestamp,
        receivedAt,
        level: log.level,
        message: log.message,
      };
      return event;
    });
    imported += batch.length;
    batch.sort((a, b) => a.timestamp - b.timestamp);
    const merged: ImportEvent[] = [];
    let retainedIndex = 0;
    let batchIndex = 0;
    while (retainedIndex < retained.length && batchIndex < batch.length) {
      if (retained[retainedIndex].timestamp <= batch[batchIndex].timestamp) {
        merged.push(retained[retainedIndex++]);
      } else {
        merged.push(batch[batchIndex++]);
      }
    }
    merged.push(
      ...retained.slice(retainedIndex),
      ...batch.slice(batchIndex),
    );
    retained = merged.slice(-maxEvents);
    self.postMessage({
      type: "progress",
      count: imported,
    } satisfies ImportResponse);
    records = [];
  };

  const acceptLine = (line: string) => {
    if (recordStart.test(line) && currentRecord) {
      records.push(currentRecord);
      if (records.length >= 5000) flush();
      currentRecord = line;
    } else {
      currentRecord = currentRecord ? `${currentRecord}\n${line}` : line;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      lines.forEach(acceptLine);
    }
    if (pending) acceptLine(pending);
    if (currentRecord) records.push(currentRecord);
    flush();
    for (let index = 0; index < retained.length; index += 5000) {
      self.postMessage({
        type: "batch",
        events: retained.slice(index, index + 5000),
      } satisfies ImportResponse);
    }
    self.postMessage({
      type: "imported",
      count: imported,
      retained: retained.length,
    } satisfies ImportResponse);
    try {
      for (let index = 0; index < retained.length; index += 5000) {
        await writeHistory(retained.slice(index, index + 5000));
      }
      self.postMessage({ type: "saved" } satisfies ImportResponse);
    } catch (error) {
      self.postMessage({
        type: "save-error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies ImportResponse);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies ImportResponse);
  } finally {
    reader.releaseLock();
  }
};
