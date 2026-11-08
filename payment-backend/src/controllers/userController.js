import { getUserById, listUsers } from '../services/userService.js';

export async function getCurrentUserController(req, res) {
  const user = await getUserById(req.user.id);
  return res.json({ user });
}

export async function listUsersController(req, res) {
  const users = await listUsers(req.user.id);
  return res.json({ users });
}
