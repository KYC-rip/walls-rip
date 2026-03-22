interface RequestConfig extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeout?: number;
}

export class APIError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const getApiBase = () => {
  return import.meta.env.VITE_API_URL || 'https://api.kyc.rip';
};

const getMailApiBase = () => {
  return import.meta.env.VITE_MAIL_API_URL || 'https://mail-api.kyc.rip';
};

type APIType = 'api' | 'mail-api';

export async function apiClient<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
  return client<T>('api', endpoint, config);
}

export async function mailApiClient<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
  return client<T>('mail-api', endpoint, config);
}

async function client<T>(type: APIType, endpoint: string, { body, timeout, ...customConfig }: RequestConfig = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const baseUrl = type === 'mail-api' ? getMailApiBase() : getApiBase();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${path}`;

  const config: RequestInit = {
    method: body ? 'POST' : 'GET',
    ...customConfig,
    headers: {
      ...headers,
      ...(customConfig.headers as Record<string, string>),
    },
  };

  if (body && typeof body === 'object') {
    config.body = JSON.stringify(body);
  } else if (body && typeof body === 'string') {
    config.body = body;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout || 20000);
    config.signal = controller.signal;

    const response = await fetch(url, config);
    clearTimeout(id);

    if (response.status === 204) return {} as T;
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      const text = await response.text();
      throw new APIError(text || `HTTP Error ${response.status}`, response.status, text);
    }
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      return data;
    } else {
      const err = data as { error?: string; message?: string };
      throw new APIError(err.error || err.message || `HTTP Error ${response.status}`, response.status, data);
    }
  } catch (error: unknown) {
    if (error instanceof APIError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new APIError('REQUEST_TIMEOUT', 408);
    throw new APIError((error as Error).message || 'NETWORK_ERROR', 0);
  }
}
