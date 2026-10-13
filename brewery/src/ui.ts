import { createSignal } from 'solid-js';

/** Help overlay (`?`, or `?about` in the URL) and the perf readout (`?perf` in the URL, `P` toggles). */
const params = new URLSearchParams(location.search);
export const [help, setHelp] = createSignal(params.has('about'));
export const perfEnabled = import.meta.env.DEV || params.has('perf');
export const [perfOpen, setPerfOpen] = createSignal(params.has('perf'));
