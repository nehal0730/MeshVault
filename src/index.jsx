import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize React
function initReact() {
  try {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      console.error('❌ Root element (#root) not found!');
      document.body.innerHTML = '<div style="padding: 2rem; font-family: sans-serif;"><h1>Error</h1><p>Root element not found. Check index.html for &lt;div id="root"&gt;&lt;/div&gt;</p></div>';
      return;
    }

    console.log('✅ Initializing React app...');
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('✅ React app initialized');
  } catch (error) {
    console.error('❌ Error initializing React:', error);
    document.body.innerHTML = `<div style="padding: 2rem; font-family: sans-serif;"><h1>Error</h1><p>Failed to initialize React: ${error.message}</p><pre>${error.stack}</pre></div>`;
  }
}

// Initialize React when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReact);
} else {
  // DOM already loaded
  initReact();
}

