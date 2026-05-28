const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  proveedor: {
    type: String,
    required: true,
    trim: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0
  },
  precioCompra: {
    type: Number,
    required: true,
    min: 0
  },
  precioVenta: {
    type: Number,
    required: true,
    min: 0
  },
  fechaCompra: {
    type: Date,
    default: Date.now
  },
  fechaPublicacion: {
    type: Date
  },
  categoria: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    trim: true
  },
  material: {
    type: String,
    trim: true
  },
  notas: {
    type: String,
    trim: true
  },
  activo: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

productSchema.index({ usuario: 1, nombre: 1 });
productSchema.index({ usuario: 1, proveedor: 1 });

module.exports = mongoose.model('Product', productSchema);
