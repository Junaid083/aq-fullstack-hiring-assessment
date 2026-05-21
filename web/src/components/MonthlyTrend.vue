<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { apiGet } from "../api";

type TrendRow = {
  month:         string;
  activity_type: string;
  total_kg_co2e: string;
};

const rows    = ref<TrendRow[]>([]);
const loading = ref(true);
const error   = ref<string | null>(null);

const months = computed(() => [...new Set(rows.value.map((r) => r.month))].sort());
const types  = computed(() => [...new Set(rows.value.map((r) => r.activity_type))].sort());

const totals = computed(() => {
  const map = new Map<string, number>();
  for (const r of rows.value) {
    map.set(`${r.month}__${r.activity_type}`, Number(r.total_kg_co2e));
  }
  return map;
});

function get(month: string, type: string): number {
  return totals.value.get(`${month}__${type}`) ?? 0;
}

function rowTotal(month: string): number {
  return types.value.reduce((sum, t) => sum + get(month, t), 0);
}

function fmt(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

function label(type: string): string {
  return type.replaceAll("_", " ");
}

onMounted(async () => {
  try {
    rows.value = await apiGet<TrendRow[]>(
      "/reports/monthly-trend?from=2024-01-01&to=2025-01-01"
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load trend";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="trend-section">
    <h2>Monthly Trend — 2024</h2>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <p v-else-if="loading">
      Loading…
    </p>

    <div
      v-else
      class="table-wrap"
    >
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th
              v-for="t in types"
              :key="t"
              class="num"
            >
              {{ label(t) }}
            </th>
            <th class="num total-col">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in months"
            :key="m"
          >
            <td class="month-col">
              {{ m }}
            </td>
            <td
              v-for="t in types"
              :key="t"
              class="num"
            >
              {{ get(m, t) > 0 ? fmt(get(m, t)) : "—" }}
            </td>
            <td class="num total-col">
              {{ fmt(rowTotal(m)) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.trend-section { margin-top: 2rem; }

.table-wrap {
  overflow-x: auto;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  white-space: nowrap;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.4rem 0.85rem;
  text-align: left;
}

th { background: #f4f4f4; font-weight: 600; }

.num        { text-align: right; font-variant-numeric: tabular-nums; }
.month-col  { font-weight: 600; color: #333; }
.total-col  { background: #f9f9f9; font-weight: 600; }

.error { color: #b00020; }
</style>
