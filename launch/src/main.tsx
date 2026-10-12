import { createRoot } from 'react-dom/client';
import '@ignite/theme/tokens.css';
import '@ignite/theme/motion.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
