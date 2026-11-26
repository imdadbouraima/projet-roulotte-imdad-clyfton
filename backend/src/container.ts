import { createAuth } from "./fourni/auth/index.js";
import { config } from "./config.js";
import { userRepository } from "./users/user.repository.js";

// Branche l'authentification sur la base de données et les réglages du projet.
export const auth = createAuth({
  users: userRepository,
  jwtSecret: config.JWT_SECRET,
  jwtExpiresIn: config.JWT_EXPIRES_IN,
});