import { createDeadDrop } from './deadDropService';

export const HELP_MESSAGE = `
[ COMMAND LIST ]
----------------
/enc <msg>            : Encrypt & Copy (Manual Mode)
/handshake            : Send Handshake packet
/invoice <amt> <addr> : Create Payment Request
/swap <from> <to>     : Share Swap Pair
/dispenser            : Batch Transfer Tool
/ghost                : Mixer Tool
/drop [ttl] <msg>    : Dead Drop, ttl default to 24h
/clear                : Clear Screen
/?                    : Show this help

[ TIME FORMATS ]
10m = 10 Minutes
1h  = 1 Hour
1d  = 1 Day
`;

const parseTTL = (timeStr: string): number | null => {
  const match = timeStr.match(/^(\d+)([mwdh])$/i);
  if (!match) return null;

  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm': return val * 60;
    case 'h': return val * 3600;
    case 'd': return val * 86400;
    case 'w': return val * 604800;
    default: return null;
  }
};

export const processSlashCommands = async (text: string): Promise<string | undefined> => {
  const cleanText = text.trim();

  if (cleanText.startsWith('/invoice')) {
    const parts = cleanText.split(/\s+/);
    const amount = parts[1];
    let currency = 'XMR';
    let address = '';

    if (parts.length === 3) {
      address = parts[2];
    } else if (parts.length === 4) {
      currency = parts[2].toUpperCase();
      address = parts[3];
    } else {
      return text;
    }

    if (address && address.length > 10) {
      return `${window.location.origin}/swap?pay_to=${address}&amount=${amount}&currency=${currency}&source=invoice`;
    }
  }

  const swapMatch = cleanText.match(/^\/swap\s+(\w+)\s+(\w+)/i);
  if (swapMatch) {
    const from = swapMatch[1].toUpperCase();
    const to = swapMatch[2].toUpperCase();
    return `${window.location.origin}/swap?from=${from}&to=${to}&source=chat`;
  }

  if (cleanText.startsWith('/drop')) {
    const args = cleanText.substring(5).trim();

    if (!args) {
      return `${window.location.origin}/drop?source=chat_empty`;
    }

    const match = args.match(/^(\d+[mhdw])\s+(.+)$/i);

    let ttl = 0;
    let content = args;

    if (match) {
      const parsedSeconds = parseTTL(match[1]);
      if (parsedSeconds) {
        ttl = parsedSeconds;
        content = match[2];
      }
    }
    if (!content) {
      return `${window.location.origin}/drop?source=drop`;
    } else {
      try {
        const dropLink = await createDeadDrop(content, ttl);

        let displayMsg = dropLink;
        if (ttl > 0) {
          displayMsg = `${dropLink} \n(Auto-destruct in ${match ? match[1] : 'custom time'})`;
        }
        return displayMsg;
      } catch (error) {
        throw new Error("Drop creation failed");
      }
    }
  }

  if (cleanText.toLowerCase() === '/dispenser') return `${window.location.origin}/dispenser?source=chat`;
  if (cleanText.toLowerCase() === '/ghost') return `${window.location.origin}/ghost?source=chat`;

  return text;
};
