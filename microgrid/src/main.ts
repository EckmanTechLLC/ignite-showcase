import { mount } from 'svelte';
import '@ignite/theme/tokens.css';
import '@ignite/theme/motion.css';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
