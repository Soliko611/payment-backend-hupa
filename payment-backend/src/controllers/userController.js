import { getUserById } from '../services/userService.js';

export async function getCurrentUserController(req, res) {
  const user = await getUserById(req.user.id);
  return res.json({ user });
}
