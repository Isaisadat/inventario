const express = require('express');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { search, desde, hasta, producto } = req.query;
    const filter = { usuario: req.user._id };
    if (producto) filter['items.producto'] = producto;
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) filter.fecha.$lte = new Date(hasta);
    }
    if (search) {
      filter.$or = [
        { 'items.nombreProducto': { $regex: search, $options: 'i' } },
        { 'items.proveedor': { $regex: search, $options: 'i' } },
        { 'cliente.nombre': { $regex: search, $options: 'i' } },
        { notas: { $regex: search, $options: 'i' } }
      ];
    }
    const sales = await Sale.find(filter).sort({ fecha: -1 });
    res.json(sales);
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const filter = { usuario: req.user._id };
    const sales = await Sale.find(filter);
    const totalVentas = sales.length;
    const totalIngresos = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCosto = sales.reduce((sum, s) => sum + (s.costoTotal || 0), 0);
    const totalGananciaReal = sales.reduce((sum, s) => sum + (s.gananciaTotal || 0), 0);
    const totalUnidadesVendidas = sales.reduce((sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.cantidad, 0), 0);
    res.json({ totalVentas, totalIngresos, totalCosto, totalGananciaReal, totalUnidadesVendidas });
  } catch (err) {
    console.error('Sales stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas de ventas' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { items, cliente, fecha, notas } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Se requiere al menos un producto' });
    }
    const saleItems = [];
    let total = 0, costoTotal = 0;
    for (const item of items) {
      const { productoId, cantidad, precioVenta, color } = item;
      if (!productoId || !cantidad || !precioVenta) {
        return res.status(400).json({ error: 'Cada item necesita: productoId, cantidad, precioVenta' });
      }
      const product = await Product.findOne({ _id: productoId, usuario: req.user._id });
      if (!product) return res.status(404).json({ error: `Producto no encontrado: ${productoId}` });
      if (color && product.variantes && product.variantes.length) {
        const variant = product.variantes.find(v => v.color === color);
        if (!variant) return res.status(400).json({ error: `Color "${color}" no encontrado en "${product.nombre}"` });
        if (variant.cantidad < cantidad) {
          return res.status(400).json({ error: `Stock insuficiente para "${product.nombre}" color ${color}. Disponible: ${variant.cantidad}` });
        }
        variant.cantidad -= Number(cantidad);
        product.cantidad = product.variantes.reduce((s, v) => s + v.cantidad, 0);
      } else {
        if (product.cantidad < cantidad) {
          return res.status(400).json({ error: `Stock insuficiente para "${product.nombre}". Disponible: ${product.cantidad}` });
        }
        product.cantidad -= Number(cantidad);
      }
      const itemTotal = Number(cantidad) * Number(precioVenta);
      const itemCosto = Number(cantidad) * product.precioCompra;
      const itemGanancia = itemTotal - itemCosto;
      saleItems.push({
        producto: product._id,
        nombreProducto: product.nombre,
        proveedor: product.proveedor,
        cantidad: Number(cantidad),
        precioVenta: Number(precioVenta),
        total: itemTotal,
        costoTotal: itemCosto,
        ganancia: itemGanancia,
        color: color || ''
      });
      total += itemTotal;
      costoTotal += itemCosto;
      await product.save();
    }
    const sale = new Sale({
      usuario: req.user._id,
      items: saleItems,
      total,
      costoTotal,
      gananciaTotal: total - costoTotal,
      cliente: cliente || undefined,
      fecha: fecha || Date.now(),
      notas: notas || ''
    });
    await sale.save();
    res.status(201).json(sale);
  } catch (err) {
    console.error('Create sale error:', err);
    res.status(500).json({ error: err.message || 'Error al registrar venta' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    for (const item of sale.items) {
      const product = await Product.findOne({ _id: item.producto, usuario: req.user._id });
      if (product) {
        if (item.color && product.variantes && product.variantes.length) {
          const variant = product.variantes.find(v => v.color === item.color);
          if (variant) variant.cantidad += item.cantidad;
          product.cantidad = product.variantes.reduce((s, v) => s + v.cantidad, 0);
        } else {
          product.cantidad += item.cantidad;
        }
        await product.save();
      }
    }
    await Sale.deleteOne({ _id: sale._id });
    res.json({ message: 'Venta cancelada y stock restaurado' });
  } catch (err) {
    console.error('Delete sale error:', err);
    res.status(500).json({ error: 'Error al cancelar venta' });
  }
});

module.exports = router;
