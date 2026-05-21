<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "./api";
import UploadCsv from "./components/UploadCsv.vue";
import ReportTable from "./components/ReportTable.vue";
import IssuesTable from "./components/IssuesTable.vue";
import MonthlyTrend from "./components/MonthlyTrend.vue";

type Report = {
  org:   string;
  range: { from: string; to: string };
  by_business_unit: Array<{
    business_unit_id: string;
    name:             string;
    total_kg_co2e:    number;
    is_rollup:        boolean;
  }>;
  by_activity_type: Array<{
    activity_type: string;
    total_kg_co2e: number;
  }>;
};

const report     = ref<Report | null>(null);
const error      = ref<string | null>(null);
const refreshKey = ref(0);

async function loadReport() {
  error.value = null;
  try {
    report.value = await apiGet<Report>("/reports/totals?from=2024-01-01&to=2025-01-01");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load report";
  }
}

function onUploaded() {
  loadReport();
  refreshKey.value++;
}

onMounted(loadReport);
</script>

<template>
  <main>
    <h1>AQ Emissions Tracker</h1>

    <UploadCsv @uploaded="onUploaded" />

    <hr>

    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <p v-else-if="!report">
      Loading report…
    </p>
    <ReportTable
      v-else
      :by-business-unit="report.by_business_unit"
      :by-activity-type="report.by_activity_type"
    />

    <hr>

    <IssuesTable :key="refreshKey" />

    <hr>

    <MonthlyTrend :key="refreshKey" />
  </main>
</template>

<style>
body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
  max-width: 900px;
}
h1 {
  margin-bottom: 1.5rem;
}
</style>
