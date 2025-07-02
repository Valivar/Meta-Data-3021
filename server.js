const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3002;

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  exposedHeaders: ['Content-Length']
}));

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'valivarfernandes@gmail.com', // Your full Gmail address
    pass: 'zxpqplttygqiaouf' // The app password you generated
  }
});

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, 'documents'))) {
  fs.mkdirSync(path.join(__dirname, 'documents'));
}

// Database setup
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
      subtotal TEXT,
      gst_amount TEXT,
      gst_rate REAL,
      vendor_info TEXT,
      custom_fields TEXT,
      document_url TEXT,
      status TEXT DEFAULT 'pending',
      status_notes TEXT,
      approver_email TEXT,
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

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_type TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert default approvers if none exist
    db.get("SELECT COUNT(*) as count FROM settings WHERE setting_type = 'approver_email'", (err, result) => {
      if (err) return console.error(err.message);
      if (result.count === 0) {
        const defaultApprovers = [
          ['approver_email', 'approver1@example.com'],
          ['approver_email', 'approver2@example.com']
        ];
        
        const stmt = db.prepare("INSERT INTO settings (setting_type, setting_value) VALUES (?, ?)");
        defaultApprovers.forEach(approver => {
          stmt.run(approver, (err) => {
            if (err) console.error(err.message);
          });
        });
        stmt.finalize();
        console.log('Added default approver emails');
      }
    });

    // Insert sample invoices if none exist
    db.get("SELECT COUNT(*) as count FROM invoices", (err, result) => {
      if (err) return console.error(err.message);
      if (result.count === 0) {
        const sampleInvoices = [
          ['INV-1001', 'PO-2023-001', '2023-01-15', 'Net 30', '$1,250.75', '$1,060.00', '$190.75', 18, 'Vendor A\n123 Business St\nCity, State', JSON.stringify({ "Project": "Website Redesign", "Due Date": "2023-02-15" }), '/documents/inv-1001.pdf', 'approved', 'Approved by finance team', 'approver1@example.com'],
          ['INV-1002', 'PO-2023-002', '2023-02-20', 'Net 15', 'A$899.99', '$762.70', '$137.29', 18, 'Vendor B\n456 Commerce Ave\nCity, State', JSON.stringify({ "Project": "Marketing Campaign", "Contact": "John Smith" }), '/documents/inv-1002.pdf', 'rejected', 'Incorrect amount', 'approver2@example.com']
        ];

        sampleInvoices.forEach(invoice => {
          db.run(
            `INSERT INTO invoices (
              invoice_number, po_number, invoice_date, payment_terms, 
              total_amount, subtotal, gst_amount, gst_rate, 
              vendor_info, custom_fields, document_url, status, status_notes, approver_email
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

// Helper function to send approval email
async function sendApprovalEmail(invoiceData, approverEmails, actionUrl) {
  try {
    const mailOptions = {
      from: '"Invoice Processing System" <noreply@example.com>',
      to: approverEmails.join(','),
      subject: `Invoice Approval Required: ${invoiceData.invoice_number}`,
      html: `
        <h2>Invoice Approval Request</h2>
        <p>Please review the following invoice and take appropriate action:</p>
        
        <h3>Invoice Details</h3>
        <table border="1" cellpadding="5" cellspacing="0">
          <tr><th>Invoice Number</th><td>${invoiceData.invoice_number}</td></tr>
          <tr><th>PO Number</th><td>${invoiceData.po_number || 'N/A'}</td></tr>
          <tr><th>Invoice Date</th><td>${invoiceData.invoice_date || 'N/A'}</td></tr>
          <tr><th>Vendor</th><td>${invoiceData.vendor_info ? invoiceData.vendor_info.replace(/\n/g, '<br>') : 'N/A'}</td></tr>
          <tr><th>Total Amount</th><td>${invoiceData.total_amount || '$0.00'}</td></tr>
        </table>
        
        <h3>Take Action</h3>
        <p>
          <a href="${actionUrl}?action=approve&id=${invoiceData.id}" style="background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">Approve</a>
          <a href="${actionUrl}?action=reject&id=${invoiceData.id}" style="background-color: #f44336; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">Reject</a>
          <a href="${actionUrl}?action=hold&id=${invoiceData.id}" style="background-color: #FFC107; color: black; padding: 10px 15px; text-decoration: none; border-radius: 4px;">Hold</a>
        </p>
        
        <p>Or reply to this email with your decision and comments.</p>
        
        <p>Thank you,<br>Invoice Processing System</p>
      `
    };

    if (invoiceData.document_url) {
      mailOptions.attachments = [{
        filename: `invoice_${invoiceData.invoice_number}.pdf`,
        path: path.join(__dirname, invoiceData.document_url)
      }];
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('Approval email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending approval email:', error);
    return false;
  }
}

// API to get settings
app.get('/api/settings', (req, res) => {
  db.all("SELECT * FROM settings ORDER BY setting_type, created_at", (err, settings) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Database error', details: err.message });
    }
    res.json({ success: true, data: settings });
  });
});

// API to add a setting
app.post('/api/settings', (req, res) => {
  const { setting_type, setting_value } = req.body;
  
  if (!setting_type || !setting_value) {
    return res.status(400).json({ success: false, error: 'Setting type and value are required' });
  }

  db.run(
    "INSERT INTO settings (setting_type, setting_value) VALUES (?, ?)",
    [setting_type, setting_value],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error', details: err.message });
      }
      res.json({ 
        success: true, 
        settingId: this.lastID,
        message: 'Setting added successfully'
      });
    }
  );
});

// API to delete a setting
app.delete('/api/settings/:id', (req, res) => {
  const settingId = req.params.id;

  if (!settingId || isNaN(settingId)) {
    return res.status(400).json({ success: false, error: 'Invalid setting ID' });
  }

  db.run(
    "DELETE FROM settings WHERE id = ?",
    [settingId],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error', details: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Setting not found' });
      }
      res.json({ success: true, message: 'Setting deleted successfully' });
    }
  );
});

// API to save invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { invoiceNumber, poNumber, invoiceDate, paymentTerms, totalAmount, vendorInfo, items, customFields, documentData } = req.body;

    if (!invoiceNumber || !totalAmount) {
      return res.status(400).json({
        success: false,
        error: 'Invoice number and total amount are required fields'
      });
    }

    // Get approver emails
    const approverEmails = await new Promise((resolve, reject) => {
      db.all("SELECT setting_value FROM settings WHERE setting_type = 'approver_email'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.setting_value));
      });
    });

    if (approverEmails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No approvers configured in system'
      });
    }

    // Calculate GST and subtotal if not provided
    const gstRate = parseFloat(req.body.gstRate) || 18;
    const totalAmountNum = parseFloat(totalAmount.replace(/[^0-9.-]/g, ''));
    const gstAmount = totalAmountNum * (gstRate / 100);
    const subtotal = totalAmountNum - gstAmount;

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
          payment_terms, total_amount, subtotal,
          gst_amount, gst_rate, vendor_info, 
          custom_fields, document_url, status,
          approver_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber, 
          poNumber, 
          invoiceDate, 
          paymentTerms, 
          totalAmount,
          formatCurrency(subtotal),
          formatCurrency(gstAmount),
          gstRate,
          vendorInfo,
          customFields ? JSON.stringify(customFields) : null,
          documentUrl,
          'pending',
          approverEmails[0] // Assign to first approver
        ],
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

    // Get the full invoice data for email
    const invoiceData = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM invoices WHERE id = ?`,
        [invoiceId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // Send approval email
    const actionUrl = `http://localhost:${PORT}/api/invoices/approve`;
    const emailSent = await sendApprovalEmail(invoiceData, approverEmails, actionUrl);

    if (!emailSent) {
      console.warn('Failed to send approval email for invoice:', invoiceId);
    }

    res.json({
      success: true,
      invoiceId,
      message: 'Invoice saved successfully and sent for approval'
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

// API to handle approval actions
app.get('/api/invoices/approve', async (req, res) => {
  const { action, id } = req.query;
  const validActions = ['approve', 'reject', 'hold'];
  
  if (!action || !validActions.includes(action) || !id || isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid action or invoice ID' });
  }

  try {
    // Get the current invoice data
    const invoice = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM invoices WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    let status, statusNotes, statusColor;
    switch (action) {
      case 'approve':
        status = 'approved';
        statusNotes = 'Approved via email';
        statusColor = 'green';
        break;
      case 'reject':
        status = 'rejected';
        statusNotes = 'Rejected via email';
        statusColor = 'red';
        break;
      case 'hold':
        status = 'on_hold';
        statusNotes = 'Put on hold via email';
        statusColor = 'yellow';
        break;
    }

    // Update invoice status
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE invoices SET status = ?, status_notes = ? WHERE id = ?",
        [status, statusNotes, id],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Send confirmation email to original submitter (if we had their email)
    // For now just log the action
    console.log(`Invoice ${id} ${status} by approver`);

    res.json({
      success: true,
      message: `Invoice ${status} successfully`,
      status,
      statusColor
    });

  } catch (error) {
    console.error('Error processing approval:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process approval',
      details: error.message
    });
  }
});

// API to update invoice status (for UI)
app.patch('/api/invoices/:id/status', async (req, res) => {
  const invoiceId = req.params.id;
  const { status, notes } = req.body;
  const validStatuses = ['pending', 'approved', 'rejected', 'on_hold'];
  
  if (!invoiceId || isNaN(invoiceId)) {
    return res.status(400).json({ success: false, error: 'Invalid invoice ID' });
  }

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value' });
  }

  try {
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE invoices SET status = ?, status_notes = ? WHERE id = ?",
        [status, notes || '', invoiceId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      success: true,
      message: 'Invoice status updated successfully'
    });

  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice status',
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
    query += ` WHERE invoice_number LIKE ? OR po_number LIKE ? OR vendor_info LIKE ? OR status LIKE ?`;
    countQuery += ` WHERE invoice_number LIKE ? OR po_number LIKE ? OR vendor_info LIKE ? OR status LIKE ?`;
    params = [searchTerm, searchTerm, searchTerm, searchTerm];
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.serialize(() => {
    db.get(countQuery, params.slice(0, searchValue ? 4 : 0), (err, countResult) => {
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
          
          // Parse custom fields if they exist
          let customFields = {};
          try {
            if (invoice.custom_fields) {
              customFields = JSON.parse(invoice.custom_fields);
            }
          } catch (e) {
            console.error('Error parsing custom fields:', e);
          }
          
          res.json({ 
            success: true, 
            data: { 
              ...invoice, 
              items: items || [],
              custom_fields: customFields
            } 
          });
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

  // Calculate new GST and subtotal
  const gstRate = 18; // Default rate or fetch from DB if needed
  const totalAmountNum = parseFloat(totalAmount.replace(/[^0-9.-]/g, ''));
  const gstAmount = totalAmountNum * (gstRate / 100);
  const subtotal = totalAmountNum - gstAmount;

  db.run(
    `UPDATE invoices SET 
      total_amount = ?,
      subtotal = ?,
      gst_amount = ?,
      status = 'pending' // Reset status when amount changes
    WHERE id = ?`,
    [totalAmount, formatCurrency(subtotal), formatCurrency(gstAmount), invoiceId],
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

// Helper function to format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

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