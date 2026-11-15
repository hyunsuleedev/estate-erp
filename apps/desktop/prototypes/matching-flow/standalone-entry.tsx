import { createRoot } from 'react-dom/client';
import { Demo } from './main';

createRoot(document.getElementById('root')!).render(<Demo variant={1} standalone />);
