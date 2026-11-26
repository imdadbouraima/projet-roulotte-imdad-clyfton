
import { createApp } from "./app.js";
import { config } from "./config.js";

// Démarre le serveur HTTP avec l'application et le port configuré.
const app = createApp();

app.listen(config.PORT, () => {
    console.log(`La Roulotte API démarrée sur le port ${config.PORT}`);
});
