import { InvoiceCard, SwapCard, DispenserCard, DeadDropCard } from '../components/ghostChat/SmartCards';

const URL_REGEX = /(https?:\/\/(?:walls\.rip|localhost:\d+)\/[^\s]+)/g;

export const parseSmartMessage = (content: string) => {
  if (!content) return null;

  if (!content.match(URL_REGEX)) return content;

  const parts = content.split(URL_REGEX);

  return parts.map((part, index) => {
    const match = part.match(URL_REGEX);

    if (match) {
      const urlString = match[0];
      try {
        const url = new URL(urlString);
        const path = url.pathname;
        const params = url.searchParams;
        const source = params.get('source');

        if (source === 'invoice' || (path.includes('/invoice'))) {
          return (
            <div key={index} onClick={() => window.open(urlString, '_blank')}>
              <InvoiceCard params={params} />
            </div>
          );
        }

        if (params.has('pay_to')) {
          return (
            <div key={index} onClick={() => window.open(urlString, '_blank')}>
              <InvoiceCard params={params} />
            </div>
          );
        }

        if (path.includes('/dispenser') || source === 'dispenser') {
          return (
            <div key={index} onClick={() => window.open(urlString, '_blank')}>
              <DispenserCard />
            </div>
          );
        }

        if (path.includes('/swap')) {
          return (
            <div key={index} onClick={() => window.open(urlString, '_blank')}>
              <SwapCard params={params} />
            </div>
          );
        }

        if (path.includes('/drop') || source === 'drop') {
          return (
            <div key={index} onClick={() => window.open(urlString, '_blank')}>
              <DeadDropCard params={params} />
            </div>
          );
        }

        return (
          <a key={index} href={urlString} target="_blank" rel="noopener noreferrer" className="text-xmr-green hover:underline break-all opacity-80 hover:opacity-100">
            {part}
          </a>
        );

      } catch (e) {
        return <span key={index}>{part}</span>;
      }
    }
    return <span key={index}>{part}</span>;
  });
};
