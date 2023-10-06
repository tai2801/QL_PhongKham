import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`MediBook API dang chay tai http://localhost:${config.port} (DB_CLIENT=${config.dbClient})`);
});
