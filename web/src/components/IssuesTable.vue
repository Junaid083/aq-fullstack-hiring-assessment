<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../api";

type Issue = {
  id:              string;
  upload_batch_id: string;
  raw_row:         Record<string, string>;
  reason_code:     string;
  reason_detail:   string;
  status:          "rejected" | "corrected";
  created_at:      string;
};

type IssuesResponse = {
  total:  number;
  limit:  number;
  offset: number;
  items:  Issue[];
};

const issues = ref<Issue[]>([]);
const total  = ref(0);
const loading = ref(true);
const error   = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await apiGet<IssuesResponse>("/ingestion/issues?limit=100&offset=0");
    issues.value = res.items;
    total.value  = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load issues";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="issues-section">
    <h2>Data Issues ({{ total }})</h2>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <p v-else-if="loading">
      Loading…
    </p>
    <p v-else-if="issues.length === 0">
      No issues found — all rows were accepted.
    </p>

    <table v-else>
      <thead>
        <tr>
          <th>Status</th>
          <th>Reason</th>
          <th>Business Unit</th>
          <th>Activity</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>Source Ref</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="issue in issues"
          :key="issue.id"
          :class="issue.status"
        >
          <td>
            <span :class="`badge badge--${issue.status}`">{{ issue.status }}</span>
          </td>
          <td class="reason">
            {{ issue.reason_detail }}
          </td>
          <td>{{ issue.raw_row.business_unit_id ?? "—" }}</td>
          <td>{{ issue.raw_row.activity_type ?? "—" }}</td>
          <td>{{ issue.raw_row.quantity ?? "—" }}</td>
          <td>{{ issue.raw_row.unit ?? "—" }}</td>
          <td class="source-ref">
            {{ issue.raw_row.source_ref ?? "—" }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.issues-section { margin-top: 2rem; }

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9rem;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.45rem 0.85rem;
  text-align: left;
}

th { background: #f4f4f4; font-weight: 600; }

tr.corrected { background: #fffbe6; }
tr.rejected  { background: #fff5f5; }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}
.badge--rejected  { background: #fee2e2; color: #b00020; }
.badge--corrected { background: #fef9c3; color: #854d0e; }

.reason     { color: #444; font-family: monospace; font-size: 0.8rem; max-width: 320px; }
.source-ref { color: #666; font-family: monospace; font-size: 0.8rem; }

.error { color: #b00020; }
</style>
