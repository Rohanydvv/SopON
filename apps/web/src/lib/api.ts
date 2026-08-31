const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown[];
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  token?: string,
): Promise<{ success: boolean; data: T; error?: ApiError }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const json = await res.json();

    if (!res.ok) {
      const errorMsg = json.error?.message || json.message || 'An error occurred';
      const errorCode = json.error?.code || 'API_ERROR';
      throw {
        code: errorCode,
        message: errorMsg,
        details: json.error?.details,
      };
    }

    return json;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
      throw err;
    }
    throw {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to the backend server. Please check your connection.',
    };
  }
}