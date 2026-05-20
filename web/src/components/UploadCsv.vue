<script setup lang="ts">
import { ref } from "vue";
import { apiPost } from "../api";
import { CHUNK_SIZE } from "../constants";

type ChunkResult = {
  batchId:       string;
  chunkAccepted: number;
  chunkRejected: number;
  totalAccepted: number;
  totalRejected: number;
  skipped:       boolean;
};

const dragging  = ref(false);
const uploading = ref(false);
const error     = ref<string | null>(null);
const result    = ref<{ batchId: string; accepted: number; rejected: number; skipped: boolean } | null>(null);

const progress = ref({ current: 0, total: 0 });

async function computeHash(content: string): Promise<string> {
  const buffer = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function splitIntoChunks(content: string): string[] {
  const lines    = content.trim().split("\n");
  const header   = lines[0] ?? "";
  const dataRows = lines.slice(1).filter((l) => l.trim());
  const chunks: string[] = [];

  for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
    chunks.push([header, ...dataRows.slice(i, i + CHUNK_SIZE)].join("\n"));
  }

  return chunks.length ? chunks : [content];
}

async function processFile(file: File) {
  if (!file.name.endsWith(".csv")) {
    error.value = "Only CSV files are supported";
    return;
  }

  error.value   = null;
  result.value  = null;
  uploading.value = true;

  try {
    const content  = await file.text();
    const fileHash = await computeHash(content);
    const chunks   = splitIntoChunks(content);

    progress.value = { current: 0, total: chunks.length };

    let batchId: string | undefined;
    let lastResult: ChunkResult | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;

      lastResult = await apiPost<ChunkResult>("/ingestion/upload", {
        filename: file.name,
        content:  chunk,
        // First chunk carries fileHash for idempotency; subsequent carry batchId
        ...(i === 0 ? { fileHash } : { batchId }),
      });

      batchId = lastResult.batchId;
      progress.value.current = i + 1;

      // Already processed (same file uploaded before) — no need to send more chunks
      if (lastResult.skipped) break;
    }

    if (lastResult) {
      result.value = {
        batchId:  lastResult.batchId,
        accepted: lastResult.totalAccepted,
        rejected: lastResult.totalRejected,
        skipped:  lastResult.skipped,
      };
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Upload failed";
  } finally {
    uploading.value = false;
  }
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) processFile(file);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) processFile(file);
}
</script>

<template>
  <section class="upload">
    <h2>Upload Activities CSV</h2>

    <div
      class="dropzone"
      :class="{ active: dragging, uploading }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="uploading">
        <p class="status">
          Uploading chunk {{ progress.current }} of {{ progress.total }}…
        </p>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${(progress.current / progress.total) * 100}%` }"
          />
        </div>
      </template>

      <template v-else>
        <p>Drag & drop your CSV here, or</p>
        <label class="btn">
          Choose file
          <input
            type="file"
            accept=".csv"
            hidden
            @change="onFileInput"
          >
        </label>
      </template>
    </div>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>

    <div
      v-if="result"
      class="result"
    >
      <p v-if="result.skipped">
        ⚠️ Same file already uploaded — showing previous result.
      </p>
      <p>Batch ID: <code>{{ result.batchId }}</code></p>
      <p class="accepted">
        ✓ {{ result.accepted }} rows accepted
      </p>
      <p
        v-if="result.rejected > 0"
        class="rejected"
      >
        ✗ {{ result.rejected }} rows rejected — see Data Issues below
      </p>
    </div>
  </section>
</template>

<style scoped>
.upload { margin-bottom: 2rem; }

.dropzone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
}
.dropzone.active   { border-color: #0070f3; background: #f0f7ff; }
.dropzone.uploading { border-color: #0070f3; }

.btn {
  display: inline-block;
  margin-top: 0.75rem;
  padding: 0.5rem 1.25rem;
  background: #0070f3;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn:hover { background: #005bb5; }

.progress-bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  margin-top: 1rem;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #0070f3;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.status   { margin-bottom: 0.5rem; color: #555; font-size: 0.9rem; }
.result   { margin-top: 1rem; padding: 1rem; background: #f9f9f9; border-radius: 6px; }
.accepted { color: #16a34a; font-weight: bold; }
.rejected { color: #b00020; font-weight: bold; }
.error    { color: #b00020; margin-top: 0.5rem; }
code      { font-size: 0.8rem; background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
</style>
