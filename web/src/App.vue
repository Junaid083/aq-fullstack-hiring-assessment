<script setup lang="ts">
import UploadCsv from "./components/UploadCsv.vue";
</script>

<template>
  <main>
    <h1>AQ Emissions Tracker</h1>
    <UploadCsv />
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
