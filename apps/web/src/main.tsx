import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { SeasonRoot } from './features/seasons/Season.tsx';

const el = document.getElementById('root');
if (el) createRoot(el).render(<SeasonRoot><App /></SeasonRoot>);
