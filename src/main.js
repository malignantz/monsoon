import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// Escape hatch: visiting /clearStorage (case-sensitive) wipes all persisted
// state — settings, favorites, view prefs — then redirects to a clean home so
// the next load is a true first run. Runs before mount so nothing reads the
// stale state first.
if (location.pathname === '/clearStorage') {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Storage can be unavailable (private mode, blocked) — nothing to clear.
  }
  location.replace('/');
}

const app = mount(App, { target: document.getElementById('app') });

export default app;
