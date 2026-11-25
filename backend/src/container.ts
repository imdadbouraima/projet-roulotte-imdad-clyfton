import { createAuth } from "./fourni/auth/index.js";
import { config } from "./config.js";
import { userRepository } from "./users/user.repository.js";

export const auth = createAuth({
  users: userRepository,
  jwtSecret: config.JWT_SECRET,
  jwtExpiresIn: config.JWT_EXPIRES_IN,
});