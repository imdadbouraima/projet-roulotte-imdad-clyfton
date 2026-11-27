
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logging.js";

// Démarre le serveur HTTP avec l'application et le port configuré.
const app = createApp();

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API listening");
});
