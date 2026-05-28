const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
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
  telefono: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  notas: {
    type: String,
    trim: true
  }
}, { timestamps: true });

clientSchema.index({ usuario: 1, nombre: 1 });

module.exports = mongoose.model('Client', clientSchema);
