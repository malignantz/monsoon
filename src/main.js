import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { prefs } from './lib/data.svelte.js';
import { applyTheme, watchSystemTheme } from './lib/theme.js';

// Note: the /clearStorage storage-reset escape hatch is a standalone static
// page (public/clearStorage.html), served by Cloudflare Pages at that clean
// URL — it never loads this SPA, so there's no guard here.

// index.html already set data-theme before first paint; this re-asserts it from
// the loaded prefs and keeps a 'system' choice following the device.
applyTheme(prefs.theme);
watchSystemTheme(() => prefs.theme);

const app = mount(App, { target: document.getElementById('app') });

export default app;
