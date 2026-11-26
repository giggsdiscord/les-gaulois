/** Point d'entrée Vite : choisit Supabase (variables VITE_*) ou le mode démo local. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { createApi } from './api/index.ts';
import { GameProvider } from './state/GameContext.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable dans index.html');

createRoot(root).render(
  <StrictMode>
    <GameProvider api={createApi()}>
      <App />
    </GameProvider>
  </StrictMode>,
);
