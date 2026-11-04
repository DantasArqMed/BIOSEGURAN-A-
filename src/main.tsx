import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getBrandingConfig } from './services/brandingService.ts';

// Global console sanitizer to prevent circular JSON serialization crashes in the iframe environment
(function() {
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  function safeArgument(arg: any): any {
    if (arg === null || arg === undefined) return arg;
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      return arg;
    }
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack
      };
    }
    try {
      JSON.stringify(arg);
      return arg;
    } catch (e) {
      if (arg.message) return String(arg.message);
      if (arg.description) return String(arg.description);
      return `[Circular or Unserializable Object: ${Object.prototype.toString.call(arg)}]`;
    }
  }

  console.error = function (...args: any[]) {
    originalConsoleError.apply(console, args.map(safeArgument));
  };

  console.log = function (...args: any[]) {
    originalConsoleLog.apply(console, args.map(safeArgument));
  };

  console.warn = function (...args: any[]) {
    originalConsoleWarn.apply(console, args.map(safeArgument));
  };
})();

// Inicializa o branding global antes de renderizar
getBrandingConfig();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
