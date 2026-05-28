const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  nombreProducto: { type: String, required: true },
  proveedor: { type: String, required: true },
  cantidad: { type: Number, required: true, min: 1 },
  precioVenta: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true },
  costoTotal: { type: Number, default: 0 },
  ganancia: { type: Number, default: 0 },
  color: { type: String, default: '' }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [saleItemSchema],
  total: {
    type: Number,
    required: true,
    min: 0
  },
  costoTotal: {
    type: Number,
    default: 0
  },
  gananciaTotal: {
    type: Number,
    default: 0
  },
  cliente: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    nombre: { type: String }
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  notas: {
    type: String,
    trim: true
  }
}, { timestamps: true });

saleSchema.index({ usuario: 1, fecha: -1 });

module.exports = mongoose.model('Sale', saleSchema);
