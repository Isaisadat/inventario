require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const fs = require('fs');

cloudinary.config({
  secure: true
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'inventario',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }]
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const clientRoutes = require('./routes/clients');
const exportRoutes = require('./routes/export');
const { auth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', auth, (req, res) => {
  upload.single('imagen')(req, res, err => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message || 'Error al subir imagen' });
    }
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });
    res.json({ url: req.file.path });
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/export', exportRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Conectado a MongoDB');
    app.listen(PORT, () => {
      console.log(`Servidor en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error de conexión MongoDB:', err);
    process.exit(1);
  });
