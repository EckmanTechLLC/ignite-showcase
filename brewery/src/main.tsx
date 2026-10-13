import { render } from 'solid-js/web';
import '@ignite/theme/tokens.css';
import '@ignite/theme/motion.css';
import './app.css';
import './overlays/overlays.css';
import App from './App';

render(() => <App />, document.getElementById('app')!);
