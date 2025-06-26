const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3002;

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  exposedHeaders: ['Content-Length']
}));

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));

// Ensure documents directory exists
if (!fs.existsSync(path.join(__dirname, 'documents'))) {
  fs.mkdirSync(path.join(__dirname, 'documents'));
}

// Database setup with error handling
const db = new sqlite3.Database('./invoices.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database');

  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) console.error('Error enabling foreign keys:', err.message);
  });

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      po_number TEXT,
      invoice_date TEXT,
      payment_terms TEXT,
      total_amount TEXT,
      vendor_info TEXT,
      document_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT,
      quantity REAL,
      unit_price REAL,
      total REAL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )`);

    db.get("SELECT COUNT(*) as count FROM invoices", (err, result) => {
      if (err) return console.error(err.message);
      if (result.count === 0) {
        const sampleInvoices = [
          ['INV-1001', 'PO-2023-001', '2023-01-15', 'Net 30', '$1,250.75', 'Vendor A\n123 Business St\nCity, State', '/documents/inv-1001.pdf'],
          ['INV-1002', 'PO-2023-002', '2023-02-20', 'Net 15', 'A$899.99', 'Vendor B\n456 Commerce Ave\nCity, State', '/documents/inv-1002.pdf']
        ];

        sampleInvoices.forEach(invoice => {
          db.run(
            `INSERT INTO invoices (invoice_number, po_number, invoice_date, payment_terms, total_amount, vendor_info, document_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            invoice,
            function(err) {
              if (err) return console.error(err.message);

              const sampleItems = [
                [this.lastID, 'Web Design Services', 10, 100.00, 1000.00],
                [this.lastID, 'Hosting Fee', 1, 250.75, 250.75]
              ];

              sampleItems.forEach(item => {
                db.run(
                  `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) 
                   VALUES (?, ?, ?, ?, ?)`,
                  item,
                  (err) => {
                    if (err) console.error(err.message);
                  }
                );
              });
            }
          );
        });
        console.log('Added sample invoice data');
      }
    });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// API to save invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { invoiceNumber, poNumber, invoiceDate, paymentTerms, totalAmount, vendorInfo, items, documentData } = req.body;

    if (!invoiceNumber || !totalAmount) {
      return res.status(400).json({
        success: false,
        error: 'Invoice number and total amount are required fields'
      });
    }

    // Save document if provided
    let documentUrl = null;
    if (documentData) {
      const fileName = `invoice_${Date.now()}.pdf`;
      const filePath = path.join(__dirname, 'documents', fileName);
      const fileBuffer = Buffer.from(documentData, 'base64');
      
      await fs.promises.writeFile(filePath, fileBuffer);
      documentUrl = `/documents/${fileName}`;
    }

    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const invoiceId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO invoices (
          invoice_number, po_number, invoice_date, 
          payment_terms, total_amount, vendor_info, document_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoiceNumber, poNumber, invoiceDate, paymentTerms, totalAmount, vendorInfo, documentUrl],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    if (items && items.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO invoice_items (
          invoice_id, description, quantity, 
          unit_price, total
        ) VALUES (?, ?, ?, ?, ?)`
      );

      for (const item of items) {
        await new Promise((resolve, reject) => {
          stmt.run(
            [invoiceId, item.description, item.quantity, item.unitPrice, item.total],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      await new Promise((resolve, reject) => {
        stmt.finalize((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    await new Promise((resolve, reject) => {
      db.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      success: true,
      invoiceId,
      message: 'Invoice saved successfully'
    });

  } catch (error) {
    await new Promise((resolve) => {
      db.run('ROLLBACK', () => resolve());
    });

    console.error('Database error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to save invoice',
      details: error.message
    });
  }
});

// API to fetch all invoices (DataTables compatible)
app.get('/api/invoices', (req, res) => {
  const { draw = 1, start = 0, length = 10, search = {} } = req.query;
  const page = (start / length) + 1;
  const limit = length;
  const offset = start;
  const searchValue = search.value || '';

  let query = `SELECT * FROM invoices`;
  let countQuery = 'SELECT COUNT(*) as total FROM invoices';
  let params = [];

  if (searchValue) {
    const searchTerm = `%${searchValue}%`;
    query += ` WHERE invoice_number LIKE ? OR po_number LIKE ? OR vendor_info LIKE ?`;
    countQuery += ` WHERE invoice_number LIKE ? OR po_number LIKE ? OR vendor_info LIKE ?`;
    params = [searchTerm, searchTerm, searchTerm];
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.serialize(() => {
    db.get(countQuery, params.slice(0, searchValue ? 3 : 0), (err, countResult) => {
      if (err) {
        console.error('Count error:', err.message);
        return res.status(500).json({ error: 'Database error', details: err.message });
      }

      db.all(query, params, (err, invoices) => {
        if (err) {
          console.error('Query error:', err.message);
          return res.status(500).json({ error: 'Database error', details: err.message });
        }

        res.json({
          draw: parseInt(draw),
          recordsTotal: countResult.total,
          recordsFiltered: searchValue ? invoices.length : countResult.total,
          data: invoices
        });
      });
    });
  });
});

// Get one invoice and items
app.get('/api/invoices/:id', (req, res) => {
  const invoiceId = req.params.id;

  if (!invoiceId || isNaN(invoiceId)) {
    return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
  }

  db.serialize(() => {
    db.get(`SELECT * FROM invoices WHERE id = ?`, [invoiceId], (err, invoice) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error', details: err.message });
      if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

      db.all(
        `SELECT id, description, quantity, unit_price, total FROM invoice_items WHERE invoice_id = ?`,
        [invoiceId],
        (err, items) => {
          if (err) return res.status(500).json({ success: false, error: 'Database error', details: err.message });
          res.json({ success: true, data: { ...invoice, items: items || [] } });
        }
      );
    });
  });
});

// Update invoice total
app.patch('/api/invoices/:id/total', (req, res) => {
  const invoiceId = req.params.id;
  const { totalAmount } = req.body;

  if (!invoiceId || isNaN(invoiceId)) {
    return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
  }

  if (!totalAmount) {
    return res.status(400).json({ success: false, error: 'Total amount is required' });
  }

  db.run(
    `UPDATE invoices SET total_amount = ? WHERE id = ?`,
    [totalAmount, invoiceId],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error', details: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }
      res.json({ success: true, message: 'Total amount updated successfully' });
    }
  );
});

// Delete invoice
app.delete('/api/invoices/:id', async (req, res) => {
  const invoiceId = req.params.id;

  if (!invoiceId || isNaN(invoiceId)) {
    return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
  }

  try {
    await new Promise((resolve, reject) => db.run('BEGIN TRANSACTION', err => err ? reject(err) : resolve()));

    // First get the document URL to delete the file
    const invoice = await new Promise((resolve, reject) => {
      db.get(`SELECT document_url FROM invoices WHERE id = ?`, [invoiceId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (invoice && invoice.document_url) {
      const filePath = path.join(__dirname, invoice.document_url);
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        console.error('Error deleting document file:', err.message);
      }
    }

    const result = await new Promise((resolve, reject) => {
      db.run(`DELETE FROM invoices WHERE id = ?`, [invoiceId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    if (result === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    await new Promise((resolve, reject) => db.run('COMMIT', err => err ? reject(err) : resolve()));

    res.json({ success: true, message: 'Invoice deleted successfully' });

  } catch (error) {
    await new Promise(resolve => db.run('ROLLBACK', () => resolve()));
    res.status(500).json({ success: false, error: 'Failed to delete invoice', details: error.message });
  }
});

// Error & 404
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('Server error:', error.message);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      }
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        process.exit(1);
      }
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});