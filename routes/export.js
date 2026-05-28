const express = require('express');
const PDFDocument = require('pdfkit');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function toCSV(headers, rows) {
  return [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
}

function formatCurrency(n) {
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Mexico_City' });
}

function addHeaderFooter(doc, title, user, isLastPage) {
  doc.fontSize(8).fillColor('#999');
  doc.text(`Inventario Compartido · ${user.nombre} (${user.rol === 'fleure' ? 'Joyería' : 'Maquillaje'})`, 50, 10, { align: 'center' });
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 50, 770, { align: 'center' });
  if (!isLastPage) doc.addPage();
}

// ====== PRODUCTOS PDF ======
router.get('/productos/pdf', async (req, res) => {
  try {
    const products = await Product.find({ usuario: req.user._id }).sort({ nombre: 1 });
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventario_${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);
    doc.fontSize(20).fillColor('#6C5CE7').text('Inventario de Productos', 50, 40, { align: 'center' });
    doc.fontSize(10).fillColor('#666').text(`${req.user.nombre} · ${req.user.rol === 'fleure' ? 'Fleure Joyería' : 'Maquillaje'}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#999').text(`Generado: ${new Date().toLocaleString('es-MX')}`, { align: 'center' });
    doc.moveDown(1);
    const startY = 100;
    const colWidths = [120, 90, 50, 70, 70, 70, 70, 70, 80];
    const headers = ['Producto', 'Proveedor', 'Stock', 'Color', 'Material', 'Compra', 'Venta', 'Ganancia', 'Categoría'];
    let y = startY;
    doc.fontSize(8).fillColor('#fff');
    doc.rect(50, y, 690, 18).fill('#6C5CE7');
    let x = 55;
    headers.forEach((h, i) => {
      doc.fillColor('#fff').text(h, x, y + 4, { width: colWidths[i], align: 'left' });
      x += colWidths[i] + 5;
    });
    y += 22;
    products.forEach((p, idx) => {
      if (y > 500) { doc.addPage(); y = 50; }
      const ganancia = p.precioVenta - p.precioCompra;
      const margen = p.precioCompra > 0 ? ((ganancia / p.precioCompra) * 100).toFixed(0) : 0;
      if (idx % 2 === 0) doc.rect(50, y, 690, 18).fill('#f5f6fa');
      x = 55;
      const vals = [
        p.nombre, p.proveedor, String(p.cantidad),
        p.color || '—', p.material || '—',
        formatCurrency(p.precioCompra), formatCurrency(p.precioVenta),
        `${formatCurrency(ganancia)} (${margen}%)`,
        p.categoria || '—'
      ];
      vals.forEach((v, i) => {
        const c = (i === 2 && p.cantidad <= 5) ? '#FF6B6B' : (i === 7 && ganancia > 0 ? '#00B894' : '#2D3436');
        doc.fontSize(7).fillColor(c).text(v, x, y + 3, { width: colWidths[i], align: 'left' });
        x += colWidths[i] + 5;
      });
      y += 20;
    });
    if (y > 600) doc.addPage();
    y = Math.max(y + 20, 650);
    doc.fontSize(16).fillColor('#6C5CE7').text('Resumen', 50, y + 10);
    y += 35;
    const totalProductos = products.length;
    const totalUnidades = products.reduce((s, p) => s + p.cantidad, 0);
    const totalInversion = products.reduce((s, p) => s + p.precioCompra * p.cantidad, 0);
    const totalVenta = products.reduce((s, p) => s + p.precioVenta * p.cantidad, 0);
    doc.fontSize(10).fillColor('#2D3436');
    doc.text(`Total productos: ${totalProductos}`, 50, y);
    doc.text(`Total unidades: ${totalUnidades}`, 50, y + 16);
    doc.text(`Inversión total: ${formatCurrency(totalInversion)}`, 50, y + 32);
    doc.text(`Venta potencial: ${formatCurrency(totalVenta)}`, 50, y + 48);
    doc.text(`Ganancia potencial: ${formatCurrency(totalVenta - totalInversion)}`, 50, y + 64);
    doc.fontSize(8).fillColor('#999').text('Gracias por confiar en Inventario Compartido · ¡Éxito en tus ventas!', 50, 750, { align: 'center' });
    doc.end();
  } catch (err) {
    console.error('PDF products error:', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// ====== VENTAS PDF ======
router.get('/ventas/pdf', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const filter = { usuario: req.user._id };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) filter.fecha.$lte = new Date(hasta);
    }
    const sales = await Sale.find(filter).sort({ fecha: -1 });

    const BEIGE = '#E8D5B7';
    const BEIGE_DARK = '#C4A882';
    const BEIGE_LIGHT = '#F5EDE0';
    const BEIGE_BG = '#EDE0CC';
    const PURPLE = '#9B72CF';
    const TEXT_DARK = '#3D2C2E';
    const TEXT_MEDIUM = '#6B4E52';
    const TEXT_ON_BEIGE = '#4A3728';

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ventas_${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FFF8FA');

    doc.rect(0, 0, doc.page.width, 140).fill(BEIGE);
    doc.rect(0, 140, doc.page.width, 4).fill(BEIGE_DARK);

    doc.fontSize(28).fillColor(TEXT_ON_BEIGE).text('Historial de Ventas', 50, 40, { align: 'center' });
    doc.fontSize(12).fillColor(TEXT_ON_BEIGE).opacity(0.9).text(`${req.user.nombre} · ${req.user.rol === 'fleure' ? 'Fleure Joyería' : 'Maquillaje'}`, { align: 'center' });
    doc.opacity(1);

    let period = '';
    if (desde || hasta) period = ` · Período: ${desde || '—'} a ${hasta || '—'}`;
    doc.fontSize(9).fillColor(TEXT_MEDIUM).text(`Generado: ${new Date().toLocaleString('es-MX')}${period}`, 50, 160, { align: 'center' });

    doc.rect(50, 178, 500, 2).fill(BEIGE).opacity(0.3);
    doc.opacity(1);

    let totalGlobal = 0, gananciaGlobal = 0;

    sales.forEach((sale, idx) => {
      if (idx > 0) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 140).fill(BEIGE);
        doc.rect(0, 140, doc.page.width, 4).fill(BEIGE_DARK);
        doc.fontSize(28).fillColor(TEXT_ON_BEIGE).text('Historial de Ventas', 50, 40, { align: 'center' });
        doc.fontSize(12).fillColor(TEXT_ON_BEIGE).opacity(0.9).text(`${req.user.nombre} · ${req.user.rol === 'fleure' ? 'Fleure Joyería' : 'Maquillaje'}`, { align: 'center' });
        doc.opacity(1);
        doc.fontSize(9).fillColor(TEXT_MEDIUM).text(`Generado: ${new Date().toLocaleString('es-MX')}`, 50, 160, { align: 'center' });
        doc.rect(50, 178, 500, 2).fill(BEIGE).opacity(0.3);
        doc.opacity(1);
      }

      totalGlobal += sale.total;
      gananciaGlobal += sale.gananciaTotal;
      const folio = `V-${sale._id.toString().slice(-6).toUpperCase()}`;
      const fecha = formatDate(sale.fecha);

      doc.rect(50, 195, 500, 50).fill(BEIGE_LIGHT);
      doc.fontSize(16).fillColor(BEIGE_DARK).text(`Venta #${idx + 1} · ${folio}`, 65, 203);
      doc.fontSize(9).fillColor(TEXT_MEDIUM).text(`${fecha}`, 65, 224);
      if (sale.cliente) {
        doc.fontSize(9).fillColor(TEXT_MEDIUM).text(`Cliente: ${sale.cliente.nombre}`, 280, 224);
      }

      const tableTop = 260;
      doc.roundedRect(50, tableTop, 500, 22, 6).fill(BEIGE);
      doc.fontSize(9).fillColor(TEXT_ON_BEIGE);
      doc.text('Producto', 65, tableTop + 5);
      doc.text('Cant', 180, tableTop + 5, { width: 40, align: 'center' });
      doc.text('Precio', 230, tableTop + 5, { width: 70, align: 'center' });
      doc.text('Total', 310, tableTop + 5, { width: 80, align: 'center' });
      doc.text('Costo', 400, tableTop + 5, { width: 70, align: 'center' });
      doc.text('Ganancia', 470, tableTop + 5, { width: 70, align: 'center' });

      let y = tableTop + 26;
      sale.items.forEach((item, i) => {
        if (i % 2 === 0) doc.rect(50, y, 500, 22).fill(BEIGE_LIGHT);
        doc.rect(50, y, 500, 22).fillOpacity(0.3).strokeColor(BEIGE).stroke();
        doc.fillOpacity(1);
        doc.fontSize(8).fillColor(TEXT_DARK);
        doc.text(item.nombreProducto, 60, y + 5, { width: 120 });
        doc.text(String(item.cantidad), 180, y + 5, { width: 40, align: 'center' });
        doc.text(formatCurrency(item.precioVenta), 230, y + 5, { width: 70, align: 'center' });
        doc.text(formatCurrency(item.total), 310, y + 5, { width: 80, align: 'center' });
        doc.text(formatCurrency(item.costoTotal), 400, y + 5, { width: 70, align: 'center' });
        doc.text(formatCurrency(item.ganancia), 470, y + 5, { width: 70, align: 'center' });
        y += 24;
      });

      y += 8;
      doc.roundedRect(50, y, 500, 30, 6).fill(BEIGE_BG);
      doc.fontSize(12).fillColor(BEIGE_DARK);
      doc.text(`Total: ${formatCurrency(sale.total)}`, 65, y + 7, { width: 200 });
      doc.text(`Ganancia: ${formatCurrency(sale.gananciaTotal)}`, 250, y + 7, { width: 200, align: 'right' });

      if (sale.notas) {
        y += 45;
        doc.fontSize(8).fillColor(TEXT_MEDIUM).text(`Notas: ${sale.notas}`, 65, y);
      }
    });

    doc.addPage();
    doc.rect(0, 0, doc.page.width, 160).fill(BEIGE);
    doc.rect(0, 160, doc.page.width, 4).fill(BEIGE_DARK);
    doc.fontSize(28).fillColor(TEXT_ON_BEIGE).text('Resumen General', 50, 50, { align: 'center' });
    doc.fontSize(12).fillColor(TEXT_ON_BEIGE).opacity(0.9).text(`${req.user.nombre} · ${req.user.rol === 'fleure' ? 'Fleure Joyería' : 'Maquillaje'}`, { align: 'center' });
    doc.opacity(1);

    const summaryY = 200;
    doc.roundedRect(50, summaryY, 235, 130, 10).fill(BEIGE_LIGHT);
    doc.roundedRect(315, summaryY, 235, 130, 10).fill(BEIGE_LIGHT);

    doc.fontSize(14).fillColor(BEIGE_DARK).text('Metricas', 70, summaryY + 18);
    doc.fontSize(11).fillColor(TEXT_DARK);
    doc.text(`Ventas: ${sales.length}`, 70, summaryY + 45);
    doc.text(`Ingresos: ${formatCurrency(totalGlobal)}`, 70, summaryY + 70);
    doc.text(`Ganancia: ${formatCurrency(gananciaGlobal)}`, 70, summaryY + 95);

    const promedio = sales.length > 0 ? totalGlobal / sales.length : 0;
    doc.fontSize(14).fillColor(BEIGE_DARK).text('Promedio', 335, summaryY + 18);
    doc.fontSize(11).fillColor(TEXT_DARK);
    doc.text(`Por venta: ${formatCurrency(promedio)}`, 335, summaryY + 45);
    doc.text(`Unidades vendidas: ${sales.reduce((s, sa) => s + sa.items.reduce((si, i) => si + i.cantidad, 0), 0)}`, 335, summaryY + 70);

    const productCounts = {};
    sales.forEach(s => s.items.forEach(i => {
      const key = i.nombreProducto;
      if (!productCounts[key]) productCounts[key] = { cantidad: 0, total: 0, ganancia: 0 };
      productCounts[key].cantidad += i.cantidad;
      productCounts[key].total += i.total;
      productCounts[key].ganancia += i.ganancia;
    }));
    const best = Object.entries(productCounts).sort((a, b) => b[1].cantidad - a[1].cantidad).slice(0, 5);

    const bestY = 370;
    doc.fontSize(16).fillColor(BEIGE_DARK).text('Top productos mas vendidos', 50, bestY);
    doc.roundedRect(50, bestY + 25, 500, 22, 6).fill(BEIGE);
    doc.fontSize(9).fillColor(TEXT_ON_BEIGE);
    doc.text('#', 65, bestY + 30, { width: 25 });
    doc.text('Producto', 95, bestY + 30, { width: 200 });
    doc.text('Vendidos', 300, bestY + 30, { width: 60, align: 'center' });
    doc.text('Total', 370, bestY + 30, { width: 70, align: 'center' });
    doc.text('Ganancia', 450, bestY + 30, { width: 70, align: 'center' });

    let by = bestY + 51;
    best.forEach(([nombre, data], i) => {
      if (i % 2 === 0) doc.roundedRect(50, by, 500, 22, 4).fill(BEIGE_LIGHT);
      doc.fontSize(8).fillColor(TEXT_DARK);
      const medals = ['1.', '2.', '3.', '4.', '5.'];
      doc.text(medals[i] || `${i + 1}.`, 65, by + 5, { width: 25 });
      doc.text(nombre, 95, by + 5, { width: 200 });
      doc.text(String(data.cantidad), 300, by + 5, { width: 60, align: 'center' });
      doc.text(formatCurrency(data.total), 370, by + 5, { width: 70, align: 'center' });
      doc.text(formatCurrency(data.ganancia), 450, by + 5, { width: 70, align: 'center' });
      by += 24;
    });

    doc.rect(0, 740, doc.page.width, 60).fill(BEIGE);
    doc.fontSize(10).fillColor(TEXT_ON_BEIGE).opacity(0.9);
    doc.text('Gracias por tu preferencia! Te deseamos mucho exito en tus ventas', 50, 755, { align: 'center' });
    doc.text(`Generado el ${new Date().toLocaleString('es-MX')} · Inventario Compartido`, 50, 772, { align: 'center', fontSize: 8 });
    doc.opacity(1);
    doc.end();
  } catch (err) {
    console.error('PDF sales error:', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// ====== TICKET PDF ======
router.get('/ticket/:id', async (req, res) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, usuario: req.user._id });
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    const BEIGE = '#E8D5B7';
    const BEIGE_DARK = '#C4A882';
    const BEIGE_LIGHT = '#F5EDE0';
    const TEXT_DARK = '#3D2C2E';
    const TEXT_ON_BEIGE = '#4A3728';

    const doc = new PDFDocument({ margin: 30, size: [255, 420] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ticket_${req.params.id.slice(-6)}.pdf`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#FFF8FA');

    doc.rect(0, 0, doc.page.width, 95).fill(BEIGE);
    doc.rect(0, 95, doc.page.width, 3).fill(BEIGE_DARK);

    doc.fontSize(12).fillColor(TEXT_ON_BEIGE).text('Ticket de Venta', 30, 25, { align: 'center' });
    doc.fontSize(8).fillColor(TEXT_ON_BEIGE).opacity(0.9).text(`${req.user.rol === 'fleure' ? 'Fleure Joyería' : 'Maquillaje'}`, 30, 48, { align: 'center' });
    doc.opacity(1);

    const folio = `V-${sale._id.toString().slice(-6).toUpperCase()}`;
    const fecha = new Date(sale.fecha).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' });

    doc.fontSize(7).fillColor(BEIGE_DARK).text(fecha, 30, 108, { align: 'center' });
    doc.fontSize(7).fillColor(BEIGE_DARK).text(`Folio: ${folio}`, 30, 120, { align: 'center' });

    let y = 142;
    doc.roundedRect(30, y, 195, 1, 0).fillColor(BEIGE).fill();
    y += 8;

    doc.fontSize(7).fillColor(TEXT_DARK);
    sale.items.forEach(item => {
      doc.roundedRect(30, y, 195, 34, 4).fill(BEIGE_LIGHT);
      doc.fontSize(7).fillColor(TEXT_DARK).text(`${item.cantidad}x ${item.nombreProducto}`, 38, y + 3, { width: 180 });
      doc.fontSize(6).fillColor(BEIGE_DARK).text(`${formatCurrency(item.precioVenta)} c/u`, 38, y + 18, { width: 80 });
      doc.fontSize(8).fillColor(TEXT_DARK).text(`= ${formatCurrency(item.total)}`, 130, y + 16, { width: 85, align: 'right' });
      y += 38;
    });

    doc.roundedRect(30, y, 195, 1, 0).fillColor(BEIGE).fill();
    y += 10;

    doc.roundedRect(30, y, 195, 52, 6).fill(BEIGE_LIGHT);
    doc.fontSize(10).fillColor(BEIGE_DARK).text(`Total:  ${formatCurrency(sale.total)}`, 38, y + 6, { width: 180 });
    y += 40;

    if (sale.cliente) {
      doc.fontSize(6).fillColor(TEXT_DARK).text(`Cliente: ${sale.cliente.nombre}`, 38, y);
      y += 14;
    }
    if (sale.notas) {
      doc.fontSize(6).fillColor(BEIGE_DARK).text(`Notas: ${sale.notas}`, 38, y);
      y += 14;
    }

    y += 8;
    doc.roundedRect(30, y, 195, 1, 0).fillColor(BEIGE).fill();
    y += 12;

    doc.fontSize(9).fillColor(BEIGE_DARK).text('~ ¡Gracias por tu compra! ~', 30, y, { align: 'center' });
    y += 14;
    doc.fontSize(7).fillColor(BEIGE_DARK).opacity(0.7).text('Te esperamos pronto', 30, y, { align: 'center' });
    doc.opacity(1);

    doc.rect(0, doc.page.height - 20, doc.page.width, 20).fill(BEIGE);
    doc.fontSize(5).fillColor(TEXT_ON_BEIGE).opacity(0.8).text('Inventario Compartido · Gracias por tu preferencia', 30, doc.page.height - 14, { align: 'center' });
    doc.opacity(1);
    doc.end();
  } catch (err) {
    console.error('Ticket PDF error:', err);
    res.status(500).json({ error: 'Error al generar ticket' });
  }
});

// ====== CSV (mantener existentes) ======
router.get('/productos', async (req, res) => {
  try {
    const products = await Product.find({ usuario: req.user._id }).sort({ createdAt: -1 });
    const headers = ['Nombre', 'Proveedor', 'Cantidad', 'Categoría', 'Color', 'Material', 'Precio Compra', 'Precio Venta', 'Ganancia Und', 'Margen %', 'Fecha Compra', 'URL', 'Notas', 'Activo'];
    const rows = products.map(p => {
      const ganancia = p.precioVenta - p.precioCompra;
      const margen = p.precioCompra > 0 ? ((ganancia / p.precioCompra) * 100).toFixed(1) : 0;
      return [p.nombre, p.proveedor, p.cantidad, p.categoria || '', p.color || '', p.material || '',
        p.precioCompra, p.precioVenta, ganancia.toFixed(2), margen,
        p.fechaCompra ? new Date(p.fechaCompra).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '', p.url || '', p.notas || '', p.activo ? 'Sí' : 'No'];
    });
    const csv = toCSV(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=inventario_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('Export products error:', err);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

router.get('/ventas', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const filter = { usuario: req.user._id };
    if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = new Date(desde);
      if (hasta) filter.fecha.$lte = new Date(hasta);
    }
    const sales = await Sale.find(filter).sort({ fecha: -1 });
    const headers = ['Folio', 'Fecha', 'Cliente', 'Producto', 'Proveedor', 'Cantidad', 'Precio Venta', 'Total Item', 'Costo Item', 'Ganancia Item', 'Total Venta', 'Costo Total', 'Ganancia Total', 'Notas'];
    const rows = [];
    sales.forEach((sale, idx) => {
      const folio = `V-${String(idx + 1).padStart(4, '0')}`;
      const fecha = new Date(sale.fecha).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
      const cliente = sale.cliente ? sale.cliente.nombre : '—';
      sale.items.forEach(item => {
        rows.push([folio, fecha, cliente, item.nombreProducto, item.proveedor,
          item.cantidad, item.precioVenta, item.total.toFixed(2), item.costoTotal.toFixed(2), item.ganancia.toFixed(2),
          sale.total.toFixed(2), sale.costoTotal.toFixed(2), sale.gananciaTotal.toFixed(2), sale.notas || '']);
      });
    });
    const csv = toCSV(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ventas_${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('Export sales error:', err);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

module.exports = router;
