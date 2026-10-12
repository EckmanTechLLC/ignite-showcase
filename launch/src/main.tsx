import { createRoot } from 'react-dom/client';
import { configureEnv } from '@ignite/client';
import '@ignite/theme/tokens.css';
import '@ignite/theme/motion.css';
import './app.css';
import { App } from './App';

// Dev: talk to the gateway through the Vite proxy (same-origin) so the lab's CORS list does not matter.
if (import.meta.env.DEV && import.meta.env.VITE_GATEWAY_URL) configureEnv({ gatewayUrl: '' });

createRoot(document.getElementById('root')!).render(<App />);
