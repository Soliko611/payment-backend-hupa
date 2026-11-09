const apiBaseUrl = (
  import.meta.env.VITE_API_URL || 'https://payment-backend-hupa.onrender.com'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (response.status === 204) {
    return null;
  }

  const body = await response.text();
  if (!body) {
    throw new ApiError('The server returned an empty response. Check whether the operation completed before retrying.', response.status);
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError('The server returned an invalid response. Please try again later.', response.status);
    }
    throw error;
  }
  if (!response.ok) {
    throw new ApiError(result.error ?? 'The request could not be completed.', response.status);
  }
  return result;
}
