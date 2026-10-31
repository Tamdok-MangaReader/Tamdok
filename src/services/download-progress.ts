import { useSyncExternalStore } from "react";

import { getValue, setValue } from "@/constants/storage";
import {
  getActiveDownloads,
  getFailedDownloads,
  type DownloadEntry,
} from "@/services/downloads";
import { subscribeMangaData } from "@/utils/manga-events";

const SOURCE_PREFIX = /^(aidoku|tamdok):/;

let progressById = new Map<string, number>();
let failedById = new Map<string, number>();
const listenersById = new Map<string, Set<() => void>>();
let unsubscribe: (() => void) | null = null;
let recomputing = false;
let dirty = false;

function idOf(sourceId: string, mangaKey: string): string {
  return `${sourceId.replace(SOURCE_PREFIX, "")}:${mangaKey}`;
}

type BatchState = { total: number; active: number };

const BATCHES_KEY = "download_batches_v1";
const batches = new Map<string, BatchState>();
let batchesLoaded = false;

async function loadBatches(): Promise<void> {
  if (batchesLoaded) return;
  batchesLoaded = true;
  const stored = await getValue<Record<string, BatchState>>(BATCHES_KEY, {});
  for (const [id, state] of Object.entries(stored)) {
    if (
      state &&
      typeof state.total === "number" &&
      typeof state.active === "number"
    ) {
      batches.set(id, state);
    }
  }
}

let persistedSignature = "";

function persistBatches(): void {
  const record: Record<string, BatchState> = {};
  for (const [id, state] of batches) record[id] = state;
  const next = JSON.stringify(record);
  if (next === persistedSignature) return;
  persistedSignature = next;
  void setValue(BATCHES_KEY, record);
}

function compute(entries: DownloadEntry[]): Map<string, number> {
  const groups = new Map<string, { count: number; sum: number }>();
  for (const entry of entries) {
    if (entry.status !== "pending" && entry.status !== "downloading") continue;
    const id = idOf(entry.sourceId, entry.mangaKey);
    const group = groups.get(id) ?? { count: 0, sum: 0 };
    group.count += 1;
    group.sum += entry.status === "downloading" ? (entry.progress ?? 0) : 0;
    groups.set(id, group);
  }

  for (const id of [...batches.keys()]) {
    if (!groups.has(id)) batches.delete(id);
  }

  const result = new Map<string, number>();
  for (const [id, group] of groups) {
    const previous = batches.get(id);
    const total = previous
      ? previous.total + Math.max(0, group.count - previous.active)
      : group.count;
    batches.set(id, { total, active: group.count });
    const done = total - group.count;
    result.set(id, Math.min(1, Math.max(0, (done + group.sum) / total)));
  }
  return result;
}

async function recompute(): Promise<void> {
  if (recomputing) {
    dirty = true;
    return;
  }
  recomputing = true;
  try {
    await loadBatches();
    const [activeEntries, failedEntries] = await Promise.all([
      getActiveDownloads(),
      getFailedDownloads(),
    ]);
    const next = compute(activeEntries);
    const nextFailed = new Map<string, number>();
    for (const entry of failedEntries) {
      const id = idOf(entry.sourceId, entry.mangaKey);
      nextFailed.set(id, (nextFailed.get(id) ?? 0) + 1);
    }
    persistBatches();
    const changed = new Set<string>();
    for (const [id, value] of next) {
      if (progressById.get(id) !== value) changed.add(id);
    }
    for (const id of progressById.keys()) {
      if (!next.has(id)) changed.add(id);
    }
    for (const [id, value] of nextFailed) {
      if (failedById.get(id) !== value) changed.add(id);
    }
    for (const id of failedById.keys()) {
      if (!nextFailed.has(id)) changed.add(id);
    }
    progressById = next;
    failedById = nextFailed;
    for (const id of changed) {
      listenersById.get(id)?.forEach((listener) => listener());
    }
  } finally {
    recomputing = false;
    if (dirty) {
      dirty = false;
      void recompute();
    }
  }
}

function ensureSubscribed(): void {
  if (unsubscribe) return;
  unsubscribe = subscribeMangaData(() => void recompute());
  void recompute();
}

function subscribeTo(id: string, listener: () => void): () => void {
  ensureSubscribed();
  let set = listenersById.get(id);
  if (!set) {
    set = new Set();
    listenersById.set(id, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listenersById.delete(id);
    if (listenersById.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}

export function useMangaDownloadProgress(
  sourceId: string | undefined,
  mangaKey: string,
): number | undefined {
  const id = sourceId ? idOf(sourceId, mangaKey) : null;
  return useSyncExternalStore(
    (listener) => (id ? subscribeTo(id, listener) : () => {}),
    () => (id ? progressById.get(id) : undefined),
    () => undefined,
  );
}

export function useMangaDownloadFailures(
  sourceId: string | undefined,
  mangaKey: string,
): number {
  const id = sourceId ? idOf(sourceId, mangaKey) : null;
  return useSyncExternalStore(
    (listener) => (id ? subscribeTo(id, listener) : () => {}),
    () => (id ? (failedById.get(id) ?? 0) : 0),
    () => 0,
  );
}
