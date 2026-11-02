import { env } from '../config/env.js';
import { login, register } from '../services/authService.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'strict',
  path: '/'
};

function sendSession(res, result, status) {
  res.cookie('token', result.token, cookieOptions);
  return res.status(status).json({ user: result.user, token: result.token });
}

export async function registerController(req, res) {
  const result = await register(req.body?.username, req.body?.password);
  return sendSession(res, result, 201);
}

export async function loginController(req, res) {
  const result = await login(req.body?.username, req.body?.password);
  return sendSession(res, result, 200);
}

export function logoutController(req, res) {
  res.clearCookie('token', cookieOptions);
  return res.status(204).end();
}
