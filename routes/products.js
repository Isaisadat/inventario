const express = require('express');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { search, proveedor, categoria, activo, desde, hasta } = req.query;
    const filter = { usuario: req.user._id };
    if (activo !== undefined) filter.activo = activo === 'true';
    if (proveedor) filter.proveedor = { $regex: proveedor, $options: 'i' };
    if (categoria) filter.categoria = { $regex: categoria, $options: 'i' };
    if (desde || hasta) {
      filter.fechaCompra = {};
      if (desde) filter.fechaCompra.$gte = new Date(desde);
      if (hasta) filter.fechaCompra.$lte = new Date(hasta);
    }
    if (search) {
      filter.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { proveedor: { $regex: search, $options: 'i' } },
        { categoria: { $regex: search, $options: 'i' } },
        { color: { $regex: search, $options: 'i' } },
        { material: { $regex: search, $options: 'i' } },
        { notas: { $regex: search, $options: 'i' } }
      ];
    }
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const filter = { usuario: req.user._id, activo: true };
    const products = await Product.find(filter);
    const totalProductos = products.length;
    const totalUnidades = products.reduce((sum, p) => sum + p.cantidad, 0);
    const totalInversion = products.reduce((sum, p) => sum + (p.precioCompra * p.cantidad), 0);
    const totalVentaPotencial = products.reduce((sum, p) => sum + (p.precioVenta * p.cantidad), 0);
    const gananciaPotencial = totalVentaPotencial - totalInversion;
    const productosBajoStock = products.filter(p => p.cantidad <= 5).length;
    const proveedoresUnicos = [...new Set(products.map(p => p.proveedor))].length;
    const productoMasCaro = products.length ? products.reduce((max, p) => p.precioVenta > max.precioVenta ? p : max, products[0]) : null;
    const productoMasBarato = products.length ? products.reduce((min, p) => p.precioVenta < min.precioVenta ? p : min, products[0]) : null;
    res.json({
      totalProductos,
      totalUnidades,
      totalInversion,
      totalVentaPotencial,
      gananciaPotencial,
      productosBajoStock,
      proveedoresUnicos,
      productoMasCaro: productoMasCaro ? { nombre: productoMasCaro.nombre, precio: productoMasCaro.precioVenta } : null,
      productoMasBarato: productoMasBarato ? { nombre: productoMasBarato.nombre, precio: productoMasBarato.precioVenta } : null
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/stats/ventas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const filter = { usuario: req.user._id };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) filter.fecha.$lte = new Date(hasta);
    }
    const sales = await Sale.find(filter);
    const productCounts = {};
    let totalIngresos = 0;
    let totalGanancia = 0;
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const key = item.producto ? item.producto.toString() : item.nombreProducto;
        if (!productCounts[key]) {
          productCounts[key] = { nombre: item.nombreProducto, proveedor: item.proveedor, cantidad: 0, total: 0, ganancia: 0 };
        }
        productCounts[key].cantidad += item.cantidad;
        productCounts[key].total += item.total;
        productCounts[key].ganancia += item.ganancia;
      });
      totalIngresos += sale.total;
      totalGanancia += sale.gananciaTotal;
    });
    const bestSellers = Object.values(productCounts).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    const monthlyData = {};
    sales.forEach(sale => {
      const d = new Date(sale.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) monthlyData[key] = { mes: key, ingresos: 0, ganancia: 0, ventas: 0 };
      monthlyData[key].ingresos += sale.total;
      monthlyData[key].ganancia += sale.gananciaTotal;
      monthlyData[key].ventas += 1;
    });
    const monthly = Object.values(monthlyData).sort((a, b) => a.mes.localeCompare(b.mes));
    res.json({ bestSellers, monthly, totalIngresos, totalGanancia });
  } catch (err) {
    console.error('Sales stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas de ventas' });
  }
});

router.get('/proveedores', async (req, res) => {
  try {
    const proveedores = await Product.distinct('proveedor', { usuario: req.user._id });
    res.json(proveedores.sort());
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

router.get('/colores', async (req, res) => {
  try {
    const colores = await Product.distinct('color', {
      usuario: req.user._id,
      color: { $exists: true, $ne: '' }
    });
    res.json(colores.sort());
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener colores' });
  }
});

router.get('/materiales', async (req, res) => {
  try {
    const materiales = await Product.distinct('material', {
      usuario: req.user._id,
      material: { $exists: true, $ne: '' }
    });
    res.json(materiales.sort());
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener materiales' });
  }
});

router.get('/categorias', async (req, res) => {
  try {
    const categorias = await Product.distinct('categoria', {
      usuario: req.user._id,
      categoria: { $exists: true, $ne: '' }
    });
    res.json(categorias.sort());
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, proveedor, precioCompra, precioVenta, fechaCompra, fechaPublicacion, categoria, url, descripcion, material, variantes, notas } = req.body;
    if (!nombre || !proveedor || precioCompra === undefined || precioVenta === undefined) {
      return res.status(400).json({ error: 'Campos requeridos: nombre, proveedor, precioCompra, precioVenta' });
    }
    const variants = variantes && variantes.length ? variantes.filter(v => v.color) : [];
    if (!variants.length) {
      return res.status(400).json({ error: 'Se requiere al menos una variante de color' });
    }
    const totalCantidad = variants.reduce((s, v) => s + (Number(v.cantidad) || 0), 0);
    const product = new Product({
      usuario: req.user._id, nombre, proveedor, cantidad: totalCantidad,
      precioCompra: Number(precioCompra), precioVenta: Number(precioVenta),
      fechaCompra: fechaCompra || Date.now(), fechaPublicacion: fechaPublicacion || null,
      categoria: categoria || '', url: url || '', descripcion: descripcion || '', color: '', material: material || '',
      variantes: variants, notas: notas || ''
    });
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    const fields = ['nombre', 'proveedor', 'precioCompra', 'precioVenta', 'fechaCompra', 'fechaPublicacion', 'categoria', 'url', 'descripcion', 'material', 'notas', 'activo'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        if (['precioCompra', 'precioVenta'].includes(f)) product[f] = Number(req.body[f]);
        else product[f] = req.body[f];
      }
    });
    if (req.body.variantes !== undefined) {
      const variants = req.body.variantes.filter(v => v.color);
      if (!variants.length) return res.status(400).json({ error: 'Se requiere al menos una variante de color' });
      product.variantes = variants;
      product.cantidad = variants.reduce((s, v) => s + (Number(v.cantidad) || 0), 0);
    }
    await product.save();
    res.json(product);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, usuario: req.user._id });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;
