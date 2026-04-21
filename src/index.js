import './env.js';
import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Analytics API corriendo en http://localhost:${PORT}`);
  console.log(`Property ID: ${process.env.GA4_PROPERTY_ID}`);
  console.log(`Frontend: ${process.env.FRONTEND_URL}`);
});
