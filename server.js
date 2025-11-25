require('dotenv').config();
const express = require('express');
const uploadRoutes = require('./src/routes/uploadRoutes');

const app = express();
app.use(express.json());

// Routes
const whatsappRoutes = require('./src/routes/whatsappRoutes');

app.use('/api', uploadRoutes);
app.use('/', whatsappRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
