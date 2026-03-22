import { Shield, X } from 'lucide-react';

interface ToSModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ToSModal({ isOpen, onClose }: ToSModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-wr-surface border border-wr-border max-w-2xl w-full h-[80vh] flex flex-col shadow-2xl rounded-sm relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-wr-dim hover:text-wr-green">
          <X size={20} />
        </button>

        <div className="p-6 border-b border-wr-border bg-wr-base/50">
          <h2 className="text-xl font-bold text-wr-green tracking-widest flex items-center gap-2">
            <Shield size={20} /> TERMS OF SERVICE
          </h2>
          <div className="text-xs text-wr-dim mt-1 text-left">Ghost Mail — Disposable Encrypted Email Service</div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-wr-dim font-mono leading-relaxed custom-scrollbar text-left">
          <section>
            <h3 className="text-wr-green font-bold mb-2">1. Acceptance of Terms</h3>
            <p>By accessing or using GHOST MAIL (the "Service"), you agree to be bound by these Terms. The Service is operated by GV Labs LLC ("Company", "we", or "us"), a Wyoming limited liability company. If you do not agree, please do not use the Service.</p>
          </section>

          <section>
            <h3 className="text-wr-green font-bold mb-2">2. Service Description</h3>
            <p>GHOST MAIL provides temporary, disposable email addresses intended for privacy protection and testing purposes.</p>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li><strong>Receive Only:</strong> The Service is strictly for receiving emails. Outbound email functionality is disabled to prevent spam and abuse.</li>
              <li><strong>Ephemeral Nature:</strong> Emails and associated data are automatically and permanently deleted after the expiration period. We cannot recover deleted data.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-wr-green font-bold mb-2">3. Crypto Payments & Refund Policy</h3>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li><strong>Finality:</strong> All payments made via cryptocurrency (including but not limited to Monero, Litecoin, Solana) are final and non-refundable.</li>
              <li><strong>Network Issues:</strong> We are not responsible for funds lost due to blockchain network errors, incorrect wallet addresses, or transaction delays.</li>
              <li><strong>Access:</strong> Service access is granted automatically upon network confirmation of the transaction.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-wr-green font-bold mb-2">4. User Responsibilities & Prohibited Use</h3>
            <p>You agree NOT to use the Service for:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li>Illegal activities under the laws of the United States or your local jurisdiction.</li>
              <li>Registering accounts for the purpose of harassment, fraud, botnet operations, or distributing malware.</li>
              <li>Receiving content related to terrorism, child exploitation, or illegal trafficking.</li>
            </ul>
            <p className="mt-2">We reserve the right to blacklist specific domains, block IP addresses, or terminate service access immediately without refund if abuse is detected.</p>
          </section>

          <section>
            <h3 className="text-wr-green font-bold mb-2">5. Privacy & Data Retention (No Logs Policy)</h3>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li><strong>Minimal Data:</strong> We do not require registration, email addresses, or KYC. We do not track your real IP address in relation to your temporary inbox.</li>
              <li><strong>Zero Knowledge:</strong> Once an email is deleted from our servers (either manually or upon expiration), it is cryptographically erased. We do not maintain backups of user content.</li>
              <li><strong>Third Parties:</strong> We do not sell or share any user data.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-wr-green font-bold mb-2">6. Disclaimers & Limitation of Liability</h3>
            <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE."</p>
            <p className="mt-2">TO THE FULLEST EXTENT PERMITTED BY LAW, GV LABS LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF CRYPTOCURRENCY, OR LOSS OF PROFITS, ARISING OUT OF YOUR USE OF THE SERVICE.</p>
            <p className="mt-2">We do not guarantee that our domains will be accepted by all third-party services (e.g., some websites may block disposable email domains).</p>
          </section>

          <section>
            <h3 className="text-wr-green font-bold mb-2">7. Governing Law</h3>
            <p>These Terms shall be governed by the laws of the State of Wyoming, without regard to its conflict of law provisions.</p>
          </section>
        </div>

        <div className="p-4 border-t border-wr-border bg-wr-base flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-wr-green text-wr-base font-black uppercase tracking-widest text-[10px] rounded-sm hover:opacity-90 transition-all shadow-lg shadow-wr-green/20">
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
