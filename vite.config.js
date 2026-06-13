import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { splitTravelData } from './scripts/split-data.mjs';

export default defineConfig({
  plugins: [
    {
      // Regenerate src/generated/{travel-core,travel-detail}.json from
      // data/travel-data.json on every dev-server start and build. After
      // rerunning the bake scripts (§9), restart `npm run dev` to pick up
      // fresh data.
      name: 'split-travel-data',
      buildStart() {
        splitTravelData();
      }
    },
    svelte()
  ],
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {}
});
