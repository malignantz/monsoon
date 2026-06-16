import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// Note: the /clearStorage storage-reset escape hatch is a standalone static
// page (public/clearStorage.html), served by Cloudflare Pages at that clean
// URL — it never loads this SPA, so there's no guard here.

const app = mount(App, { target: document.getElementById('app') });

export default app;
