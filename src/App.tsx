import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LangRouter } from './i18n/LangRouter';
import HomePage from './pages/HomePage';
import { DeadDrop } from './pages/DeadDrop';
import { GhostMail } from './pages/GhostMail';
import { SMSWall } from './pages/SMSWall';
import { ESIMWall } from './pages/ESIMWall';
import { ProxyWall } from './pages/ProxyWall';
import FAQ from './pages/FAQ';
import { PGPTerminal } from './pages/PGPTerminal';
import { InvitePage } from './pages/InvitePage';
import APIPage from './pages/APIPage';
import NotFound from './pages/NotFound';
import { InstallPrompt } from './components/InstallPrompt';

// Routes without the language prefix
const PAGES = [
  { path: '/', element: <HomePage /> },
  { path: '/drop', element: <DeadDrop /> },
  { path: '/mail', element: <GhostMail /> },
  { path: '/sms', element: <SMSWall /> },
  { path: '/esim', element: <ESIMWall /> },
  { path: '/proxy', element: <ProxyWall /> },
  { path: '/faq', element: <FAQ /> },
  { path: '/comms', element: <PGPTerminal /> },
  { path: '/comms/invite', element: <InvitePage /> },
  { path: '/api', element: <APIPage /> },
];

// Language prefixes (en has no prefix)
const LANG_PREFIXES = ['zh-TW', 'zh', 'ru', 'es', 'pt', 'ja'];

export default function App() {
  return (
    <BrowserRouter>
      <LangRouter>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
            },
          }}
        />
        <Routes>
          {/* Default (English) routes */}
          {PAGES.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
          {/* Language-prefixed routes */}
          {LANG_PREFIXES.map((lang) =>
            PAGES.map(({ path, element }) => (
              <Route
                key={`${lang}-${path}`}
                path={`/${lang}${path === '/' ? '' : path}`}
                element={element}
              />
            ))
          )}
          {/* 404 catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <InstallPrompt />
      </LangRouter>
    </BrowserRouter>
  );
}
