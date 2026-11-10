import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const remoteLoadTestEnabled = __ENV.LOAD_TEST_ALLOW_REMOTE === 'true';
const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);
const isApprovedRenderTarget = baseUrl === 'https://payment-backend-hupa.onrender.com';

if (!isLocalTarget && !(isApprovedRenderTarget && remoteLoadTestEnabled)) {
  throw new Error(
    'Target must be localhost, or the project Render API with LOAD_TEST_ALLOW_REMOTE=true.'
  );
}

const vus = Number(__ENV.VUS || 5);
if (!Number.isInteger(vus) || vus < 1 || vus > 10) {
  throw new Error('VUS must be an integer between 1 and 10.');
}

const apiErrors = new Rate('api_errors');

export const options = {
  stages: [
    { duration: '10s', target: vus },
    { duration: '30s', target: vus },
    { duration: '10s', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
    api_errors: ['rate<0.01']
  }
};

export function setup() {
  const username = __ENV.LOAD_TEST_USERNAME;
  const password = __ENV.LOAD_TEST_PASSWORD;
  if (!username || !password) {
    fail('Set LOAD_TEST_USERNAME and LOAD_TEST_PASSWORD for a dedicated test account.');
  }

  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ username, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } }
  );

  let token;
  try {
    token = response.json('token');
  } catch {
    fail(`Login failed with HTTP ${response.status}; check the test account and API configuration.`);
  }
  if (response.status !== 200 || typeof token !== 'string' || token.length === 0) {
    fail(`Login failed with HTTP ${response.status}; check the test account and API configuration.`);
  }

  return { token };
}

function getAuthenticated(path, endpoint, token) {
  const response = http.get(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint }
  });
  const succeeded = check(response, {
    [`${endpoint} returns 200`]: (result) => result.status === 200
  });
  apiErrors.add(!succeeded);
}

export default function ({ token }) {
  getAuthenticated('/api/users/me', 'current_user', token);
  getAuthenticated('/api/users', 'users', token);
  getAuthenticated('/api/transfers', 'transfer_history', token);
  sleep(1);
}
