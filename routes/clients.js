const express = require('express');
const Client = require('../models/Client');
const Sale = require('../models/Sale');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { usuario: req.user._id };
    if (search) {
      filter.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { telefono: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const clients = await Client.find(filter).sort({ nombre: 1 });
    const clientesConCompras = await Promise.all(clients.map(async (c) => {
      const compras = await Sale.countDocuments({ usuario: req.user._id, 'cliente.id': c._id });
      const totalGastado = await Sale.aggregate([
        { $match: { usuario: req.user._id, 'cliente.id': c._id } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      return {
        ...c.toObject(),
        totalCompras: compras,
        totalGastado: totalGastado.length ? totalGastado[0].total : 0
      };
    }));
    res.json(clientesConCompras);
  } catch (err) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    const compras = await Sale.find({ usuario: req.user._id, 'cliente.id': client._id }).sort({ fecha: -1 });
    res.json({ client, compras });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, telefono, email, notas } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const client = new Client({ usuario: req.user._id, nombre, telefono, email, notas });
    await client.save();
    res.status(201).json(client);
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    const fields = ['nombre', 'telefono', 'email', 'notas'];
    fields.forEach(f => { if (req.body[f] !== undefined) client[f] = req.body[f]; });
    await client.save();
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findOneAndDelete({ _id: req.params.id, usuario: req.user._id });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

module.exports = router;
