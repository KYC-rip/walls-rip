import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import HomePage from './pages/HomePage';
import { DeadDrop } from './pages/DeadDrop';
import { GhostMail } from './pages/GhostMail';
import { SMSWall } from './pages/SMSWall';
import FAQ from './pages/FAQ';
import { PGPTerminal } from './pages/PGPTerminal';
import { InvitePage } from './pages/InvitePage';

export default function App() {
  return (
    <BrowserRouter>
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
        <Route path="/" element={<HomePage />} />
        <Route path="/drop" element={<DeadDrop />} />
        <Route path="/mail" element={<GhostMail />} />
        <Route path="/sms" element={<SMSWall />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/comms" element={<PGPTerminal />} />
        <Route path="/comms/invite" element={<InvitePage />} />
      </Routes>
    </BrowserRouter>
  );
}
