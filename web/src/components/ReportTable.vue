<script setup lang="ts">
defineProps<{
  byBusinessUnit: Array<{
    business_unit_id: string;
    name:             string;
    total_kg_co2e:    number;
    is_rollup:        boolean;
  }>;
  byActivityType: Array<{
    activity_type:  string;
    total_kg_co2e:  number;
  }>;
}>();

function fmt(n: number) {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function label(type: string) {
  return type.replaceAll("_", " ");
}
</script>

<template>
  <section class="report-section">
    <h2>Emissions by Business Unit</h2>
    <table>
      <thead>
        <tr>
          <th>Business Unit</th>
          <th class="num">
            Total kg CO₂e
          </th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="bu in byBusinessUnit"
          :key="bu.business_unit_id"
          :class="{ rollup: bu.is_rollup }"
        >
          <td>{{ bu.name }}</td>
          <td class="num">
            {{ fmt(bu.total_kg_co2e) }}
          </td>
          <td class="type-badge">
            {{ bu.is_rollup ? "Rollup" : "Leaf" }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="report-section">
    <h2>Emissions by Activity Type</h2>
    <table>
      <thead>
        <tr>
          <th>Activity</th>
          <th class="num">
            Total kg CO₂e
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="at in byActivityType"
          :key="at.activity_type"
        >
          <td>{{ label(at.activity_type) }}</td>
          <td class="num">
            {{ fmt(at.total_kg_co2e) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.report-section { margin-bottom: 2rem; }

table {
  border-collapse: collapse;
  width: 100%;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  text-align: left;
}

th { background: #f4f4f4; font-weight: 600; }

tr.rollup td { font-weight: bold; background: #f9f9f9; }

.num { text-align: right; font-variant-numeric: tabular-nums; }

.type-badge { color: #555; font-size: 0.85rem; }
</style>
