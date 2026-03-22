import { useState } from 'react';
import { ChevronDown, Terminal, Copy, Check, Zap, Code2, ArrowRight, ExternalLink } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';

// ─── Types ───

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  params?: Param[];
  body?: Param[];
  response: string;
}

interface APIGroup {
  title: string;
  base: string;
  description: string;
  endpoints: Endpoint[];
}

// ─── API Data ───

const SMS_API: APIGroup = {
  title: 'SMS Wall',
  base: 'https://api.kyc.rip/v1/tools/sms',
  description: 'Anonymous SMS verification. Get temporary phone numbers, receive codes, no identity required.',
  endpoints: [
    {
      method: 'GET',
      path: '/countries',
      description: 'List all available countries with phone numbers.',
      response: `[
  { "id": "1", "name": "Russia", "code": "RU" },
  { "id": "12", "name": "United States", "code": "US" },
  ...
]`,
    },
    {
      method: 'GET',
      path: '/services',
      description: 'List all supported services for SMS verification.',
      response: `[
  { "id": "telegram", "name": "Telegram" },
  { "id": "whatsapp", "name": "WhatsApp" },
  ...
]`,
    },
    {
      method: 'GET',
      path: '/price',
      description: 'Check the price for a specific country + service combo.',
      params: [
        { name: 'country', type: 'string', required: true, description: 'Country ID from /countries' },
        { name: 'service', type: 'string', required: true, description: 'Service ID from /services' },
      ],
      response: `{
  "price": "0.50",
  "cost_price": "0.25",
  "success_rate": 0.85,
  "engine": "smspool"
}`,
    },
    {
      method: 'GET',
      path: '/stock',
      description: 'Check stock availability for a country + service.',
      params: [
        { name: 'country', type: 'string', required: true, description: 'Country ID' },
        { name: 'service', type: 'string', required: true, description: 'Service ID' },
      ],
      response: `{
  "stock": 142,
  "available": true
}`,
    },
    {
      method: 'GET',
      path: '/suggested',
      description: 'Get suggested countries with best availability for a service.',
      params: [
        { name: 'service', type: 'string', required: true, description: 'Service ID' },
      ],
      response: `[
  { "country": "1", "name": "Russia", "stock": 500, "price": "0.30" },
  { "country": "12", "name": "United States", "stock": 120, "price": "0.80" },
  ...
]`,
    },
    {
      method: 'POST',
      path: '/payment/create',
      description: 'Create a Monero or Lightning payment to fund your wallet.',
      body: [
        { name: 'amount', type: 'number', required: true, description: 'USD amount to deposit (min $0.05, max $100)' },
        { name: 'method', type: 'string', required: true, description: '"XMR" or "LN"' },
        { name: 'walletToken', type: 'string', description: 'Existing wallet token to top up (optional)' },
      ],
      response: `{
  "method": "XMR",
  "address": "4Bx2...integrated_address",
  "paymentId": "abc123...",
  "amount": 0.00345,
  "usd": 1.00
}`,
    },
    {
      method: 'GET',
      path: '/payment/check',
      description: 'Poll payment status. Returns wallet token when payment confirms.',
      params: [
        { name: 'paymentId', type: 'string', required: true, description: 'Payment ID from /payment/create' },
      ],
      response: `// Pending:
{ "status": "PENDING" }

// Completed:
{
  "status": "COMPLETED",
  "walletToken": "a1b2c3d4...",
  "balanceUSD": 1.00
}

// Expired:
{ "status": "EXPIRED" }`,
    },
    {
      method: 'GET',
      path: '/balance',
      description: 'Check your wallet balance and spending history.',
      params: [
        { name: 'token', type: 'string', required: true, description: 'Your wallet token' },
      ],
      response: `{
  "balanceUSD": 0.75,
  "totalDeposited": 2.00,
  "totalSpent": 1.25
}`,
    },
    {
      method: 'POST',
      path: '/purchase',
      description: 'Buy a temporary phone number. Deducts from wallet balance.',
      body: [
        { name: 'country', type: 'string', required: true, description: 'Country ID' },
        { name: 'service', type: 'string', required: true, description: 'Service ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "orderId": "smspool_123456",
  "phone": "+12025551234",
  "country": "US",
  "service": "telegram",
  "balanceUSD": 0.25,
  "charged": 0.50
}`,
    },
    {
      method: 'GET',
      path: '/check',
      description: 'Check SMS status. Poll this until you receive the code.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID from /purchase' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `// Waiting for SMS:
{ "status": "WAITING", "phone": "+12025551234" }

// Code received:
{
  "status": "COMPLETED",
  "phone": "+12025551234",
  "code": "123456",
  "sms": "Your verification code is 123456"
}

// Expired (auto-refund):
{
  "status": "EXPIRED",
  "refunded": 0.50,
  "balanceUSD": 0.75
}`,
    },
    {
      method: 'GET',
      path: '/cancel',
      description: 'Cancel an active order and get a refund to your wallet.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "status": "CANCELLED",
  "balanceUSD": 0.75
}`,
    },
    {
      method: 'GET',
      path: '/resend',
      description: 'Request SMS resend for an active order.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{ "status": "RESENT" }`,
    },
    {
      method: 'GET',
      path: '/health',
      description: 'Check SMS engine availability and health.',
      response: `[
  {
    "engine": "smspool",
    "status": "OK",
    "latency": 120
  }
]`,
    },
  ],
};

const DEAD_DROP_API: APIGroup = {
  title: 'Dead Drop',
  base: 'https://api.kyc.rip/v1/tools/drop',
  description: 'Self-destructing encrypted messages. AES-256-GCM client-side encryption.',
  endpoints: [
    {
      method: 'POST',
      path: '/drop',
      description: 'Create an encrypted dead drop. Encryption happens client-side before calling this.',
      body: [
        { name: 'content', type: 'string', required: true, description: 'Encrypted ciphertext (base64)' },
        { name: 'password', type: 'string', description: 'Optional server-side password protection' },
        { name: 'expiry', type: 'number', description: 'TTL in seconds (default: 86400)' },
      ],
      response: `{
  "id": "abc123def456",
  "expiresAt": "2026-03-24T12:00:00Z"
}`,
    },
    {
      method: 'GET',
      path: '/drop/:id',
      description: 'Read a dead drop. Message is permanently deleted after reading.',
      params: [
        { name: 'id', type: 'string', required: true, description: 'Drop ID (URL path parameter)' },
      ],
      response: `{
  "content": "encrypted_base64_ciphertext...",
  "createdAt": "2026-03-23T12:00:00Z"
}

// Already read or expired:
404 Not Found`,
    },
  ],
};

const ESIM_API: APIGroup = {
  title: 'eSIM',
  base: 'https://api.kyc.rip/v1/tools/esim',
  description: 'Anonymous eSIM data plans. 120+ countries, 3G/4G/5G. Install via QR code.',
  endpoints: [
    {
      method: 'GET',
      path: '/countries',
      description: 'List all countries with eSIM availability.',
      response: `[
  { "code": "US", "name": "United States", "engine": "smspool" },
  { "code": "DE", "name": "Germany", "engine": "smspool" },
  ...
]`,
    },
    {
      method: 'GET',
      path: '/plans',
      description: 'List eSIM data plans. Optionally filter by country.',
      params: [
        { name: 'country', type: 'string', description: 'ISO country code (e.g. US, DE)' },
      ],
      response: `[
  {
    "id": "smspool:975",
    "name": "0.1GB / 7d",
    "country": "US",
    "dataGB": 0.1,
    "durationDays": 7,
    "price": "0.80",
    "speed": "3G/4G/5G"
  },
  ...
]`,
    },
    {
      method: 'POST',
      path: '/purchase',
      description: 'Purchase an eSIM plan. Returns order ID for status tracking.',
      body: [
        { name: 'planId', type: 'string', required: true, description: 'Plan ID from /plans' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "orderId": "smspool:ABCDEF123",
  "planId": "smspool:975",
  "status": "PENDING",
  "balanceUSD": 4.20,
  "charged": 0.80
}`,
    },
    {
      method: 'GET',
      path: '/profile',
      description: 'Get eSIM activation QR code and install URL.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID from purchase' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "qrCode": "LPA:1$sm-dp-plus.example.com$...",
  "activationUrl": "https://esim.example.com/activate/..."
}`,
    },
    {
      method: 'GET',
      path: '/status',
      description: 'Check eSIM order status and data usage.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "orderId": "smspool:ABCDEF123",
  "status": "ACTIVE",
  "dataRemainingMB": 512,
  "expiresAt": 1711929600000
}`,
    },
    {
      method: 'GET',
      path: '/health',
      description: 'Check eSIM engine health status.',
      response: `[{ "name": "smspool", "status": "ONLINE", "latency": 120 }]`,
    },
  ],
};

const PROXY_API: APIGroup = {
  title: 'Proxy Wall',
  base: 'https://api.kyc.rip/v1/tools/proxy',
  description: 'Anonymous proxy access. Residential, datacenter, and mobile proxies with SOCKS5/HTTP.',
  endpoints: [
    {
      method: 'GET',
      path: '/plans',
      description: 'List available proxy plans by type.',
      params: [
        { name: 'type', type: 'string', description: 'Filter: residential, datacenter, mobile' },
      ],
      response: `[
  {
    "id": "placeholder:res-1gb-30d",
    "name": "Residential 1GB / 30d",
    "type": "residential",
    "bandwidthGB": 1,
    "durationDays": 30,
    "price": "3.00"
  },
  ...
]`,
    },
    {
      method: 'GET',
      path: '/locations',
      description: 'List available proxy locations.',
      response: `[
  { "id": "placeholder:US", "country": "United States", "countryCode": "US" },
  ...
]`,
    },
    {
      method: 'POST',
      path: '/purchase',
      description: 'Purchase proxy access. Returns order ID for credentials.',
      body: [
        { name: 'planId', type: 'string', required: true, description: 'Plan ID from /plans' },
        { name: 'location', type: 'string', required: true, description: 'Location ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "orderId": "placeholder:ord_abc123",
  "credentials": {
    "host": "proxy.example.com",
    "port": 1080,
    "username": "user_abc",
    "password": "pass_xyz",
    "protocol": "socks5"
  },
  "balanceUSD": 7.00
}`,
    },
    {
      method: 'GET',
      path: '/credentials',
      description: 'Get proxy connection credentials.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "host": "proxy.example.com",
  "port": 1080,
  "username": "user_abc",
  "password": "pass_xyz",
  "protocol": "socks5"
}`,
    },
    {
      method: 'GET',
      path: '/status',
      description: 'Check proxy subscription status.',
      params: [
        { name: 'order_id', type: 'string', required: true, description: 'Order ID' },
        { name: 'token', type: 'string', required: true, description: 'Wallet token' },
      ],
      response: `{
  "orderId": "placeholder:ord_abc123",
  "status": "ACTIVE",
  "bandwidthUsedMB": 256,
  "bandwidthRemainingMB": 768,
  "expiresAt": 1714521600000
}`,
    },
    {
      method: 'GET',
      path: '/health',
      description: 'Check proxy engine health status.',
      response: `[{ "name": "placeholder", "status": "MAINTENANCE", "latency": 0 }]`,
    },
  ],
};

const QUICK_START = `# ─── walls.rip SMS Wall — Full Flow ───

# 1. Browse available services
curl -s https://api.kyc.rip/v1/tools/sms/services | jq '.[0:5]'

# 2. Check price for Telegram in the US
curl -s "https://api.kyc.rip/v1/tools/sms/price?country=12&service=telegram"

# 3. Create a payment ($1 via Monero)
curl -s -X POST https://api.kyc.rip/v1/tools/sms/payment/create \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 1.00, "method": "XMR"}'

# → Send XMR to the returned address

# 4. Poll payment status (repeat until COMPLETED)
curl -s "https://api.kyc.rip/v1/tools/sms/payment/check?paymentId=YOUR_PAYMENT_ID"

# → Save the walletToken from the response

# 5. Purchase a number
curl -s -X POST https://api.kyc.rip/v1/tools/sms/purchase \\
  -H "Content-Type: application/json" \\
  -d '{"country": "12", "service": "telegram", "token": "YOUR_WALLET_TOKEN"}'

# → Use the returned phone number for verification

# 6. Poll for SMS code (repeat every 5s)
curl -s "https://api.kyc.rip/v1/tools/sms/check?order_id=YOUR_ORDER_ID&token=YOUR_WALLET_TOKEN"

# → When status is "COMPLETED", the code field has your SMS code

# 7. (Optional) Cancel if no longer needed
curl -s "https://api.kyc.rip/v1/tools/sms/cancel?order_id=YOUR_ORDER_ID&token=YOUR_WALLET_TOKEN"`;

// ─── Components ───

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
        method === 'GET'
          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
          : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
      }`}
    >
      {method}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 p-1.5 rounded border border-wr-border/50 bg-wr-base/80 text-wr-dim hover:text-wr-green hover:border-wr-green/50 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-wr-green" /> : <Copy size={12} />}
    </button>
  );
}

function ParamTable({ params, title }: { params: Param[]; title: string }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold text-wr-dim uppercase tracking-wider mb-1.5">{title}</div>
      <div className="border border-wr-border/50 rounded-sm overflow-hidden">
        {params.map((p, i) => (
          <div
            key={p.name}
            className={`flex items-start gap-3 px-3 py-2 text-[11px] ${
              i < params.length - 1 ? 'border-b border-wr-border/30' : ''
            } ${i % 2 === 0 ? 'bg-wr-surface/30' : ''}`}
          >
            <div className="flex items-center gap-1.5 shrink-0 min-w-[100px]">
              <code className="text-wr-accent font-bold">{p.name}</code>
              {p.required && <span className="text-red-400 text-[9px]">*</span>}
            </div>
            <span className="text-wr-dim/60 shrink-0 text-[10px]">{p.type}</span>
            <span className="text-wr-dim">{p.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint, base }: { endpoint: Endpoint; base: string }) {
  const [open, setOpen] = useState(false);
  const fullUrl = `${base}${endpoint.path}`;
  const curlExample =
    endpoint.method === 'GET'
      ? `curl -s "${fullUrl}${endpoint.params ? '?' + endpoint.params.filter(p => p.required).map(p => `${p.name}=...`).join('&') : ''}"`
      : `curl -s -X POST ${fullUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(
          Object.fromEntries((endpoint.body || []).map(b => [b.name, b.type === 'number' ? 0 : '...'])),
          null,
          0
        )}'`;

  return (
    <div className="border border-wr-border/50 rounded-sm overflow-hidden group hover:border-wr-accent/30 transition-colors">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-wr-accent/5 transition-colors"
      >
        <MethodBadge method={endpoint.method} />
        <code className="text-xs font-bold text-wr-green flex-1 truncate">{endpoint.path}</code>
        <span className="text-[11px] text-wr-dim hidden sm:inline flex-shrink-0 max-w-[40%] truncate">
          {endpoint.description}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-wr-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-wr-border/30 pt-3 space-y-3">
          <p className="text-[12px] text-wr-dim">{endpoint.description}</p>

          {endpoint.params && <ParamTable params={endpoint.params} title="Query Parameters" />}
          {endpoint.body && <ParamTable params={endpoint.body} title="Request Body (JSON)" />}

          {/* curl example */}
          <div>
            <div className="text-[10px] font-bold text-wr-dim uppercase tracking-wider mb-1.5">curl</div>
            <div className="relative">
              <pre className="p-3 rounded-sm bg-wr-base border border-wr-border/50 text-[11px] text-cyan-400 overflow-x-auto">
                <code>{curlExample}</code>
              </pre>
              <CopyButton text={curlExample} />
            </div>
          </div>

          {/* Response */}
          <div>
            <div className="text-[10px] font-bold text-wr-dim uppercase tracking-wider mb-1.5">Response</div>
            <div className="relative">
              <pre className="p-3 rounded-sm bg-wr-base border border-wr-border/50 text-[11px] text-wr-green overflow-x-auto">
                <code>{endpoint.response}</code>
              </pre>
              <CopyButton text={endpoint.response} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function APISection({ group }: { group: APIGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 rounded-sm border border-wr-border bg-wr-surface/50 hover:border-wr-accent/30 transition-colors text-left"
      >
        <div>
          <h2 className="text-lg font-black tracking-tight">
            {group.title} <span className="text-wr-accent">API</span>
          </h2>
          <p className="text-[11px] text-wr-dim mt-0.5">{group.description}</p>
          <code className="text-[10px] text-cyan-400 mt-1 block">{group.base}</code>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <span className="text-[10px] font-bold text-wr-dim">
            {group.endpoints.length} endpoint{group.endpoints.length !== 1 ? 's' : ''}
          </span>
          <ChevronDown
            size={16}
            className={`text-wr-dim transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 pl-0 md:pl-2">
          {group.endpoints.map((ep) => (
            <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} base={group.base} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Page ───

export default function APIPage() {
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="API Reference — walls.rip"
        description="walls.rip public API documentation. Programmatic access to SMS Wall, Dead Drop, and Ghost Mail. No API keys needed."
        path="/api"
      />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      <Header />

      <main className="w-full max-w-4xl px-4 relative z-10 mb-20">
        {/* ═══ HERO ═══ */}
        <div className="text-center py-10 mb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 mb-4">
            <Terminal size={32} />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight mb-2">
            API <span className="text-wr-accent">Reference</span>
          </h1>
          <p className="text-wr-dim text-xs max-w-lg mx-auto leading-relaxed">
            Programmatic access to walls.rip services. Build bots, integrate verification flows,
            automate anonymous communication. No API keys required.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-[10px] font-bold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              REST API
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-wr-border text-wr-dim text-[10px] font-bold">
              <Code2 size={10} />
              JSON responses
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-wr-border text-wr-dim text-[10px] font-bold">
              <Zap size={10} />
              No rate limits
            </div>
          </div>
        </div>

        {/* ═══ AUTH NOTE ═══ */}
        <div className="p-4 rounded-sm border border-wr-accent/30 bg-wr-accent/5 mb-8">
          <div className="flex items-start gap-3">
            <Terminal size={16} className="text-wr-accent shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-wr-accent mb-1">Authentication</h3>
              <p className="text-[11px] text-wr-dim leading-relaxed">
                No API keys needed. No signup. No OAuth. Wallet tokens are your auth.
                Create a payment, receive a <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">walletToken</code>,
                and use it to authenticate purchase and management requests. Tokens are ephemeral
                and expire after 7 days of inactivity.
              </p>
            </div>
          </div>
        </div>

        {/* ═══ QUICK START ═══ */}
        <div className="mb-8">
          <button
            onClick={() => setQuickStartOpen(!quickStartOpen)}
            className="w-full flex items-center justify-between p-4 rounded-sm border border-wr-green/30 bg-wr-green/5 hover:bg-wr-green/10 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <ArrowRight size={16} className={`text-wr-green transition-transform duration-200 ${quickStartOpen ? 'rotate-90' : ''}`} />
              <div>
                <h3 className="text-sm font-bold text-wr-green">Quick Start: Complete SMS Flow</h3>
                <p className="text-[10px] text-wr-dim mt-0.5">
                  Payment &rarr; Purchase &rarr; Poll &rarr; Code. Full curl walkthrough.
                </p>
              </div>
            </div>
            <ChevronDown
              size={14}
              className={`text-wr-dim transition-transform duration-200 ${quickStartOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {quickStartOpen && (
            <div className="mt-2 relative">
              <pre className="p-4 rounded-sm bg-wr-base border border-wr-border text-[11px] text-wr-green overflow-x-auto leading-relaxed">
                <code>{QUICK_START}</code>
              </pre>
              <CopyButton text={QUICK_START} />
            </div>
          )}
        </div>

        {/* ═══ API SECTIONS ═══ */}
        <div className="space-y-8">
          <APISection group={SMS_API} />
          <APISection group={ESIM_API} />
          <APISection group={PROXY_API} />
          <APISection group={DEAD_DROP_API} />

          {/* Ghost Mail note */}
          <div className="p-5 rounded-sm border border-cyan-400/30 bg-cyan-400/5">
            <div className="flex items-start gap-3">
              <ExternalLink size={16} className="text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-cyan-400 mb-1">Ghost Mail API</h3>
                <p className="text-[11px] text-wr-dim leading-relaxed mb-2">
                  Ghost Mail uses a separate API host at{' '}
                  <code className="text-cyan-400 bg-wr-base px-1.5 py-0.5 rounded text-[10px] border border-wr-border/50">
                    https://mail-api.kyc.rip
                  </code>
                  {' '}and is documented separately. The mail API handles inbox creation,
                  email polling, PGP key management, and premium tier upgrades.
                </p>
                <a
                  href="https://mail-api.kyc.rip"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 hover:underline"
                >
                  View Ghost Mail API <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ NOTES ═══ */}
        <div className="mt-12 space-y-4">
          <h2 className="text-lg font-black tracking-tight">
            Integration <span className="text-wr-accent">Notes</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                title: 'Polling Strategy',
                text: 'Poll /payment/check every 10s for XMR (wait for confirmation), every 3s for Lightning. Poll /check every 5s for SMS codes. Max wait ~20 minutes.',
              },
              {
                title: 'Error Handling',
                text: 'All errors return { "error": "message" } with appropriate HTTP status codes. 502 = upstream provider issue. 503 = engine unavailable. 402 = insufficient balance.',
              },
              {
                title: 'Wallet Lifecycle',
                text: 'Wallets expire after 7 days of inactivity. Top up existing wallets by passing walletToken in /payment/create. No minimum purchase amount per number.',
              },
              {
                title: 'Automatic Refunds',
                text: 'If an SMS order expires without receiving a code, the charge is automatically refunded to your wallet. Cancel active orders manually for immediate refund.',
              },
            ].map((note) => (
              <div key={note.title} className="p-4 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <h3 className="text-xs font-bold mb-1.5 text-wr-accent">{note.title}</h3>
                <p className="text-[11px] text-wr-dim leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ AGENT PROMPT ═══ */}
        <div className="mt-8 p-5 rounded-sm border border-wr-border bg-wr-surface/50">
          <h3 className="text-xs font-bold text-wr-accent mb-2 uppercase tracking-wider">For AI Agents</h3>
          <p className="text-[11px] text-wr-dim leading-relaxed">
            This API is designed to be agent-friendly. All endpoints return structured JSON.
            The typical agent flow is:{' '}
            <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">
              /services</code> &rarr;{' '}
            <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">
              /price</code> &rarr;{' '}
            <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">
              /payment/create</code> &rarr;{' '}
            <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">
              poll /payment/check</code> &rarr;{' '}
            <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">
              /purchase</code> &rarr;{' '}
            <code className="text-wr-green bg-wr-base px-1 py-0.5 rounded text-[10px]">
              poll /check</code>.
            No browser, no cookies, no sessions. Pure stateless REST.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
