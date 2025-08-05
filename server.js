const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3021;


// Middleware setup
// Middleware setup
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  exposedHeaders: ['Content-Length']
}));

// Add rate limiting right here
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false // Disable legacy headers
});

app.use('/api/login', limiter);

// Then continue with other middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));

// Email and DB setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'valivarfernandes@gmail.com', pass: 'zxpqplttygqiaouf' }
});

if (!fs.existsSync(path.join(__dirname, 'documents'))) {
  fs.mkdirSync(path.join(__dirname, 'documents'));
}

const db = new sqlite3.Database('./invoices.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
  
  db.run('PRAGMA foreign_keys = ON');
  
  db.serialize(() => {
    // Create tables
    const tables = [
      `CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        invoice_number TEXT, 
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
        attachments TEXT,
        status TEXT DEFAULT 'pending',
        status_notes TEXT, 
        approver_email TEXT, 
        document_type TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        current_approval_level INTEGER DEFAULT 1, 
        approval_type TEXT DEFAULT 'hierarchy'
      )`,
      `CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        invoice_id INTEGER NOT NULL, 
        description TEXT,
        quantity REAL, 
        unit_price REAL, 
        total REAL, 
        FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        setting_type TEXT NOT NULL, 
        setting_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS approval_hierarchy (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        level INTEGER NOT NULL, 
        approver_id INTEGER NOT NULL,
        FOREIGN KEY(approver_id) REFERENCES authorization_team(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS hierarchy_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        skip_middle_approver BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS approval_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        invoice_id INTEGER NOT NULL, 
        invoice_number TEXT NOT NULL,
        action TEXT NOT NULL, 
        action_by TEXT NOT NULL, 
        notes TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS department_approvers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department TEXT NOT NULL,
        approver_id INTEGER NOT NULL,
        FOREIGN KEY(approver_id) REFERENCES authorization_team(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id TEXT UNIQUE NOT NULL,
        vendor_name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS vendor_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        vendor_type TEXT,
        street TEXT,
        city TEXT,
        state TEXT,
        country TEXT,
        postal_code TEXT,
        contact_person TEXT,
        contact_number TEXT,
        alternate_number TEXT,
        pan_number TEXT,
        gstin TEXT,
        tds_applicable TEXT DEFAULT 'no',
        tds_section TEXT,
        tds_rate REAL,
        msme_registered TEXT DEFAULT 'no',
        msme_number TEXT,
        bank_name TEXT,
        account_number TEXT,
        account_holder TEXT,
        ifsc_code TEXT,
        payment_terms TEXT,
        currency TEXT,
        payment_method TEXT,
        additional_notes TEXT,
        FOREIGN KEY(vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS authorization_team (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL CHECK(department IN ('AP', 'CFO', 'Manager')),
        password TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS document_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        attempts INTEGER DEFAULT 1,
        last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
        locked_until DATETIME
      )`
    ];
    
    tables.forEach(sql => db.run(sql));
    
    // Insert default data
    const checkAndInsert = (table, countQuery, data, insertQuery) => {
      db.get(countQuery, (err, result) => {
        if (!err && result.count === 0) {
          const stmt = db.prepare(insertQuery);
          data.forEach(item => stmt.run(item));
          stmt.finalize();
          console.log(`Added default ${table} data`);
        }
      });
    };
    
    checkAndInsert('authorization_team', "SELECT COUNT(*) as count FROM authorization_team", [
      ['AP Manager', 'ap@example.com', 'AP', bcrypt.hashSync('password123', 10)],
      ['CFO', 'cfo@example.com', 'CFO', bcrypt.hashSync('password123', 10)],
      ['Finance Manager', 'manager@example.com', 'Manager', bcrypt.hashSync('password123', 10)]
    ], "INSERT INTO authorization_team (name, email, department, password) VALUES (?, ?, ?, ?)");
    
    checkAndInsert('hierarchy_settings', "SELECT COUNT(*) as count FROM hierarchy_settings", 
      [[0]], "INSERT INTO hierarchy_settings (skip_middle_approver) VALUES (?)");
    
    checkAndInsert('document_types', "SELECT COUNT(*) as count FROM document_types", 
      [['Invoice'], ['PO']], "INSERT INTO document_types (name) VALUES (?)");
    
    checkAndInsert('invoices', "SELECT COUNT(*) as count FROM invoices", [
      ['INV-1001', 'PO-2023-001', '2023-01-15', 'Net 30', '$1,250.75', '$1,060.00', '$190.75', 18, 
       'Vendor A\n123 Business St\nCity, State', JSON.stringify({ "Project": "Website Redesign", "Due Date": "2023-02-15" }), 
       '/documents/inv-1001.pdf', null, 'approved', 'Approved by finance team', 'ap@example.com', 'Invoice', 3, 'hierarchy'],
      ['INV-1002', 'PO-2023-002', '2023-02-20', 'Net 15', 'A$899.99', '$762.70', '$137.29', 18, 
       'Vendor B\n456 Commerce Ave\nCity, State', JSON.stringify({ "Project": "Marketing Campaign", "Contact": "John Smith" }), 
       '/documents/inv-1002.pdf', null, 'rejected', 'Incorrect amount', 'ap@example.com', 'Invoice', 1, 'single'],
      [null, 'PO-2023-003', '2023-03-10', 'Net 30', '$2,150.00', '$1,822.03', '$327.97', 18, 
       'Vendor C\n789 Industry Blvd\nCity, State', JSON.stringify({ "Project": "Product Development", "Department": "R&D" }), 
       '/documents/po-2023-003.pdf', null, 'pending', 'Awaiting approval', 'ap@example.com', 'PO', 1, 'department'],
      [null, 'PO-2023-004', '2023-03-15', 'Net 15', '$750.50', '$636.02', '$114.48', 18, 
       'Vendor D\n101 Tech Park\nCity, State', JSON.stringify({ "Project": "IT Infrastructure", "Priority": "High" }), 
       '/documents/po-2023-004.pdf', null, 'on_hold', 'Waiting for clarification', 'ap@example.com', 'PO', 2, 'hierarchy']
    ], `INSERT INTO invoices (
      invoice_number, po_number, invoice_date, payment_terms, total_amount, subtotal, gst_amount, gst_rate, 
      vendor_info, custom_fields, document_url, attachments, status, status_notes, approver_email, document_type, current_approval_level, approval_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  });
});

// Helper functions
async function sendApprovalEmail(invoiceData, approverEmails, currentLevel = null) {
  try {
    const approvers = await dbAll(
      "SELECT * FROM authorization_team WHERE email IN (?)", 
      [approverEmails.join(',')]
    );
    
    if (approvers.length === 0) return false;

    const mailOptions = {
      from: '"Invoice Processing System" <noreply@example.com>',
      to: approverEmails.join(','),
      subject: `${currentLevel ? `[Level ${currentLevel} Approval] ` : ''}${invoiceData.document_type} Approval Required: ${invoiceData.invoice_number || invoiceData.po_number}`,
      html: `
        <h2>${invoiceData.document_type} Approval Request</h2>
        ${currentLevel ? `<p><strong>Approval Level:</strong> ${currentLevel}</p>` : ''}
        <p>Please review the following ${invoiceData.document_type.toLowerCase()}:</p>
        <table border="1" cellpadding="5" cellspacing="0">
          ${invoiceData.invoice_number ? `<tr><th>Invoice Number</th><td>${invoiceData.invoice_number}</td></tr>` : ''}
          ${invoiceData.po_number ? `<tr><th>PO Number</th><td>${invoiceData.po_number}</td></tr>` : ''}
          <tr><th>Vendor</th><td>${invoiceData.vendor_info ? invoiceData.vendor_info.replace(/\n/g, '<br>') : 'N/A'}</td></tr>
          <tr><th>Total Amount</th><td>${invoiceData.total_amount || '$0.00'}</td></tr>
        </table>
        <p>
          <a href="http://localhost:${PORT}/api/invoices/approve?action=approve&id=${invoiceData.id}" style="background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">Approve</a>
          <a href="http://localhost:${PORT}/api/invoices/approve?action=reject&id=${invoiceData.id}" style="background-color: #f44336; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">Reject</a>
          <a href="http://localhost:${PORT}/api/invoices/approve?action=hold&id=${invoiceData.id}" style="background-color: #FFC107; color: black; padding: 10px 15px; text-decoration: none; border-radius: 4px;">Hold</a>
        </p>
        <p style="margin-top: 20px;">
          Or review and approve through the <a href="http://localhost:${PORT}/approval.html">Approval Portal</a>
        </p>
        <p><strong>Login Credentials:</strong> Use your registered email and password</p>
      `
    };

    // Attach main document
    if (invoiceData.document_url) {
      mailOptions.attachments = [{
        filename: `${invoiceData.document_type.toLowerCase()}_${invoiceData.invoice_number || invoiceData.po_number}.pdf`,
        path: path.join(__dirname, invoiceData.document_url)
      }];
    }

    // Attach additional files for invoices
    if (invoiceData.document_type === 'Invoice' && invoiceData.attachments) {
      const attachments = JSON.parse(invoiceData.attachments);
      attachments.forEach(attachment => {
        mailOptions.attachments.push({
          filename: `attachment_${path.basename(attachment)}`,
          path: path.join(__dirname, attachment)
        });
      });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('Approval email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending approval email:', error);
    return false;
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

async function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function dbGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function dbAll(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Authentication middleware with admin support
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ success: false, error: 'Forbidden' });
    
    // Special case for admin user
    if (user.email === 'admin' && user.department === 'Admin') {
      req.user = user;
      return next();
    }
    
    // For regular users, verify they exist in the database
    db.get("SELECT id FROM authorization_team WHERE id = ? AND is_active = 1", [user.id], (err, row) => {
      if (err || !row) return res.status(403).json({ success: false, error: 'Forbidden' });
      req.user = user;
      next();
    });
  });
}

// Login API with admin support and brute force protection
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Admin login check (hashed password in production)
  if (email === 'admin') {
    if (password === 'admin1234') {
      const token = jwt.sign(
        { id: 0, email: 'admin', department: 'Admin', isAdmin: true },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '8h' }
      );
      
      return res.json({ 
        success: true, 
        token,
        user: {
          id: 0,
          name: 'Admin',
          email: 'admin',
          role: 'Administrator',
          isAdmin: true
        }
      });
    }
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  // Regular user login
  try {
    const user = await dbGet(
      "SELECT id, name, email, department, password, is_active FROM authorization_team WHERE email = ?", 
      [email]
    );
    
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, department: user.department },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.department === 'AP' ? 'AP Team' : 
              user.department === 'CFO' ? 'CFO' : 
              user.department === 'Manager' ? 'Manager' : 'User'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Login failed', details: err.message });
  }
});

// Validate Token API
app.get('/api/validate-token', authenticateToken, async (req, res) => {
  try {
    if (req.user.email === 'admin' && req.user.department === 'Admin') {
      return res.json({ 
        success: true, 
        user: {
          id: 0,
          name: 'Admin',
          email: 'admin',
          department: 'Admin',
          isAdmin: true
        }
      });
    }
    
    const user = await dbGet(
      "SELECT id, name, email, department FROM authorization_team WHERE id = ? AND is_active = 1",
      [req.user.id]
    );
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found or inactive' });
    }
    
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Token validation failed', details: err.message });
  }
});

// Logout API
app.post('/api/logout', authenticateToken, (req, res) => {
  // In a real application, you might want to implement token blacklisting
  res.json({ success: true, message: 'Logged out successfully' });
});

// User Management APIs
// Updated Users API Endpoint
// In server.js, update the /api/users endpoint to include inactive users:
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Only admin can access all users
    if (req.user.department !== 'Admin' && !req.user.isAdmin) {
      return res.status(403).json({ 
        data: [],
        error: 'Forbidden - Admin access required'
      });
    }

    const users = await dbAll(`
      SELECT id, name, email, department as role, is_active 
      FROM authorization_team 
      ORDER BY department, name
    `);
    
    res.json({
      data: users,
      draw: req.query.draw || 1,
      recordsTotal: users.length,
      recordsFiltered: users.length
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ 
      data: [],
      error: 'Database error',
      details: err.message 
    });
  }
});

// In server.js, update the POST /api/users endpoint:
app.post('/api/users', authenticateToken, async (req, res) => {
  // Only admin can create users
  if (req.user.department !== 'Admin' && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden - Admin access required' });
  }

  const { name, email, role, password } = req.body;
  
  // Validate required fields
  if (!name || !email || !role || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validate department/role
  const validDepartments = ['AP', 'CFO', 'Manager', 'Admin'];
  if (!validDepartments.includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified' });
  }

  try {
    // Check if email already exists
    const existingUser = await dbGet("SELECT id FROM authorization_team WHERE email = ?", [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbRun(
      "INSERT INTO authorization_team (name, email, department, password) VALUES (?, ?, ?, ?)",
      [name, email, role, hashedPassword]
    );
    
    // Return the newly created user data
    const newUser = await dbGet(`
      SELECT id, name, email, department as role, is_active 
      FROM authorization_team 
      WHERE id = ?`, 
      [result.lastID]
    );

    // Send welcome email with credentials
    try {
      const roleNames = {
        'AP': 'AP Team',
        'CFO': 'CFO',
        'Manager': 'Manager',
        'Admin': 'Administrator'
      };

      const mailOptions = {
        from: '"Invoice Processing System" <noreply@example.com>',
        to: email,
        subject: 'Your New Account Has Been Created',
        html: `
          <h2>Welcome to the Invoice Processing System</h2>
          <p>Your account has been successfully created by the administrator.</p>
          <p><strong>Account Details:</strong></p>
          <ul>
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Role:</strong> ${roleNames[role] || role}</li>
            <li><strong>Temporary Password:</strong> ${password}</li>
          </ul>
          <p>Please log in using your email and the temporary password provided above. 
          You will be prompted to change your password after first login.</p>
          <p><a href="http://localhost:${PORT}/login.html">Login to the System</a></p>
          <p>If you did not request this account, please contact the system administrator immediately.</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the request if email fails
    }
    
    res.status(201).json(newUser);
  } catch (err) {
    console.error('Error creating user:', err);
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Database error', details: err.message });
    }
  }
});

// Add this to server.js


app.patch('/api/users/:id/status', authenticateToken, async (req, res) => {
  // Only admin can change user status
  if (req.user.department !== 'Admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { is_active } = req.body;
  
  try {
    await dbRun(
      "UPDATE authorization_team SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: 'Status updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.patch('/api/users/:id/password', authenticateToken, async (req, res) => {
  const { password } = req.body;
  
  // Users can only change their own password unless admin
  if (req.user.id !== parseInt(req.params.id)) {
    if (req.user.department !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
  }

  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await dbRun(
      "UPDATE authorization_team SET password = ? WHERE id = ?",
      [hashedPassword, req.params.id]
    );
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

// Password Reset APIs
app.post('/api/request-password-reset', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  try {
    const user = await dbGet("SELECT * FROM authorization_team WHERE email = ?", [email]);
    if (!user) {
      return res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    // In a real application, you would send an email with this link
    const resetLink = `http://localhost:${PORT}/reset-password.html?token=${resetToken}`;

    try {
      const mailOptions = {
        from: '"Invoice Processing System" <noreply@example.com>',
        to: email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset</h2>
          <p>You requested to reset your password. Click the link below to proceed:</p>
          <p><a href="${resetLink}">Reset Password</a></p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>This link will expire in 1 hour.</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
    }

    res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to process request', details: err.message });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Token and new password are required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await dbRun(
      "UPDATE authorization_team SET password = ? WHERE email = ?",
      [hashedPassword, decoded.email]
    );
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.status(400).json({ success: false, error: 'Token expired' });
    } else if (err.name === 'JsonWebTokenError') {
      res.status(400).json({ success: false, error: 'Invalid token' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to reset password', details: err.message });
    }
  }
});

// Department Approvers APIs
app.get('/api/department-approvers', async (req, res) => {
  try {
    const invoiceApprovers = await dbAll(`
      SELECT da.id, da.department, at.name, at.email 
      FROM department_approvers da
      JOIN authorization_team at ON da.approver_id = at.id
      WHERE da.department = 'invoice'
    `);
    
    const poApprovers = await dbAll(`
      SELECT da.id, da.department, at.name, at.email 
      FROM department_approvers da
      JOIN authorization_team at ON da.approver_id = at.id
      WHERE da.department = 'po'
    `);
    
    res.json({ 
      success: true, 
      data: {
        invoice: invoiceApprovers,
        po: poApprovers
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.post('/api/department-approvers', async (req, res) => {
  const { department, approver_id } = req.body;
  
  if (!department || !approver_id) {
    return res.status(400).json({ success: false, error: 'Department and approver_id are required' });
  }
  
  try {
    // Verify the approver exists and is AP team or Manager
    const approver = await dbGet(
      "SELECT id FROM authorization_team WHERE id = ? AND department IN ('AP', 'Manager') AND is_active = 1",
      [approver_id]
    );
    
    if (!approver) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid approver - must be active AP team member or Manager' 
      });
    }

    const result = await dbRun(
      "INSERT INTO department_approvers (department, approver_id) VALUES (?, ?)",
      [department, approver_id]
    );
    
    res.json({ 
      success: true, 
      message: 'Approver added successfully',
      id: result.lastID
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ success: false, error: 'This approver is already assigned to this department' });
    } else {
      res.status(500).json({ success: false, error: 'Database error', details: err.message });
    }
  }
});

app.delete('/api/department-approvers/:department/:id', async (req, res) => {
  const { department, id } = req.params;
  
  try {
    await dbRun(
      "DELETE FROM department_approvers WHERE department = ? AND id = ?",
      [department, id]
    );
    
    res.json({ success: true, message: 'Approver deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

// Hierarchy APIs
app.get('/api/hierarchy-settings', async (req, res) => {
  try {
    const settings = await dbGet("SELECT * FROM hierarchy_settings ORDER BY id DESC LIMIT 1");
    res.json({ success: true, data: settings || { skip_middle_approver: false } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.post('/api/hierarchy-settings', async (req, res) => {
  const { skip_middle_approver } = req.body;
  try {
    await dbRun("INSERT INTO hierarchy_settings (skip_middle_approver) VALUES (?)", [skip_middle_approver ? 1 : 0]);
    res.json({ success: true, message: 'Hierarchy settings saved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

// Approval Hierarchy APIs
app.get('/api/approval-hierarchy', async (req, res) => {
  try {
    const hierarchy = await dbAll(`
      SELECT ah.id, ah.level, at.name, at.email, at.department 
      FROM approval_hierarchy ah
      JOIN authorization_team at ON ah.approver_id = at.id
      ORDER BY ah.level
    `);
    res.json({ success: true, data: hierarchy });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.post('/api/approval-hierarchy', async (req, res) => {
  const { levels } = req.body;
  
  if (!levels || !Array.isArray(levels)) {
    return res.status(400).json({ success: false, error: 'Invalid hierarchy data' });
  }

  try {
    await dbRun('BEGIN TRANSACTION');
    await dbRun("DELETE FROM approval_hierarchy");
    
    const stmt = db.prepare("INSERT INTO approval_hierarchy (level, approver_id) VALUES (?, ?)");
    for (const [index, approverId] of levels.entries()) {
      await stmt.run([index + 1, approverId]);
    }
    await stmt.finalize();
    
    // Add CFO as final approver
    const cfo = await dbGet("SELECT id FROM authorization_team WHERE department = 'CFO' AND is_active = 1 LIMIT 1");
    if (cfo) {
      await db.run("INSERT INTO approval_hierarchy (level, approver_id) VALUES (?, ?)", [levels.length + 1, cfo.id]);
    }
    
    await dbRun('COMMIT');
    res.json({ success: true, message: 'Approval hierarchy updated successfully' });
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ success: false, error: 'Failed to update hierarchy', details: error.message });
  }
});

// Document Types APIs
app.get('/api/document-types', async (req, res) => {
  try {
    const types = await dbAll("SELECT * FROM document_types ORDER BY name");
    res.json({ success: true, data: types });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.post('/api/document-types', async (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }

  try {
    const result = await dbRun(
      "INSERT INTO document_types (name) VALUES (?)",
      [name]
    );
    
    res.json({ 
      success: true, 
      message: 'Document type added successfully',
      id: result.lastID
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ success: false, error: 'Document type already exists' });
    } else {
      res.status(500).json({ success: false, error: 'Database error', details: err.message });
    }
  }
});

app.delete('/api/document-types/:id', async (req, res) => {
  try {
    const result = await dbRun(
      "DELETE FROM document_types WHERE id = ?",
      [req.params.id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Document type not found' });
    }
    
    res.json({ success: true, message: 'Document type deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

// Approval APIs
app.get('/api/approvals', authenticateToken, async (req, res) => {
  const { status } = req.query;
  
  try {
    let query = `
      SELECT i.* FROM invoices i
      JOIN approval_hierarchy ah ON i.current_approval_level = ah.level
      WHERE ah.approver_id = ? AND i.status = ?
      ORDER BY i.created_at DESC
    `;
    
    const approvals = await dbAll(query, [req.user.id, status === 'approved' ? 'approved' : 
      status === 'rejected' ? 'rejected' : 'pending']);
    
    res.json({ success: true, data: approvals });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

// Dashboard APIs
app.get('/api/invoices/status-counts', async (req, res) => {
  try {
    const [total, approved, pending, rejected, on_hold] = await Promise.all([
      dbGet("SELECT COUNT(*) as total FROM invoices"),
      dbGet("SELECT COUNT(*) as approved FROM invoices WHERE status = 'approved'"),
      dbGet("SELECT COUNT(*) as pending FROM invoices WHERE status = 'pending'"),
      dbGet("SELECT COUNT(*) as rejected FROM invoices WHERE status = 'rejected'"),
      dbGet("SELECT COUNT(*) as on_hold FROM invoices WHERE status = 'on_hold'")
    ]);
    
    res.json({ success: true, data: {
      total: total.total, approved: approved.approved, pending: pending.pending,
      rejected: rejected.rejected, on_hold: on_hold.on_hold
    }});
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.get('/api/invoices/by-status', async (req, res) => {
  const { status } = req.query;
  if (!status) return res.status(400).json({ success: false, error: 'Status parameter is required' });

  try {
    const invoices = status === 'total' 
      ? await dbAll("SELECT * FROM invoices ORDER BY created_at DESC")
      : await dbAll("SELECT * FROM invoices WHERE status = ? ORDER BY created_at DESC", 
          [status === 'hold' ? 'on_hold' : status]);
    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.get('/api/invoices/weekly-stats', async (req, res) => {
  const currentWeek = moment().isoWeek();
  const currentYear = moment().year();
  const weeks = Array.from({ length: 4 }, (_, i) => ({
    week: currentWeek - 3 + i > 0 ? currentWeek - 3 + i : 52 + currentWeek - 3 + i,
    year: currentWeek - 3 + i > 0 ? currentYear : currentYear - 1
  }));

  try {
    const results = { labels: weeks.map(w => `Week ${w.week}`), datasets: { approved: [], rejected: [] } };
    
    for (const [i, week] of weeks.entries()) {
      const [approved, rejected] = await Promise.all([
        dbGet(`SELECT COUNT(*) as count FROM invoices WHERE status = 'approved' 
               AND strftime('%W', created_at) = ? AND strftime('%Y', created_at) = ?`, 
             [week.week.toString().padStart(2, '0'), week.year.toString()]),
        dbGet(`SELECT COUNT(*) as count FROM invoices WHERE status = 'rejected' 
               AND strftime('%W', created_at) = ? AND strftime('%Y', created_at) = ?`, 
             [week.week.toString().padStart(2, '0'), week.year.toString()])
      ]);
      
      results.datasets.approved[i] = approved ? approved.count : 0;
      results.datasets.rejected[i] = rejected ? rejected.count : 0;
    }
    
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

// Invoice APIs
app.post('/api/invoices', async (req, res) => {
  try {
    const { invoiceNumber, poNumber, invoiceDate, paymentTerms, totalAmount, 
            vendorInfo, items, customFields, documentData, approvalType, 
            attachments, documentType } = req.body;

    // Validate required fields based on document type
    if (documentType === 'Invoice' && !invoiceNumber) {
      return res.status(400).json({ success: false, error: 'Invoice number is required' });
    }
    
    if (!totalAmount) {
      return res.status(400).json({ success: false, error: 'Total amount is required' });
    }

    const gstRate = 18; // Default GST rate
    const totalAmountNum = parseFloat(totalAmount.replace(/[^0-9.-]/g, ''));
    const gstAmount = totalAmountNum * (gstRate / 100);
    const subtotal = totalAmountNum - gstAmount;

    let documentUrl = null;
    if (documentData) {
      const fileName = `document_${Date.now()}.pdf`;
      const filePath = path.join(__dirname, 'documents', fileName);
      await fs.promises.writeFile(filePath, Buffer.from(documentData, 'base64'));
      documentUrl = `/documents/${fileName}`;
    }

    // Save attachments
    let attachmentUrls = [];
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const ext = attachment.type.split('/')[1] || 'dat';
        const fileName = `attachment_${uuidv4()}.${ext}`;
        const filePath = path.join(__dirname, 'documents', fileName);
        await fs.promises.writeFile(filePath, Buffer.from(attachment.data, 'base64'));
        attachmentUrls.push(`/documents/${fileName}`);
      }
    }

    await dbRun('BEGIN TRANSACTION');

    // Determine approver based on workflow type
    let approverEmail = null;
    let currentApprovalLevel = 1;
    let approverId = null;
    
    if (approvalType === 'hierarchy') {
      const level1Approver = await dbGet(`
        SELECT at.email, at.id 
        FROM approval_hierarchy ah
        JOIN authorization_team at ON ah.approver_id = at.id
        WHERE ah.level = 1
      `);
      if (!level1Approver) {
        return res.status(400).json({ success: false, error: 'No approvers configured in hierarchy' });
      }
      approverEmail = level1Approver.email;
      approverId = level1Approver.id;
    } 
    else if (approvalType === 'department') {
      // Get all approvers for this document type's department
      const approvers = await dbAll(`
        SELECT at.email, at.id 
        FROM department_approvers da
        JOIN authorization_team at ON da.approver_id = at.id
        WHERE da.department = ?
      `, [documentType.toLowerCase()]);
      
      if (approvers.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: `No approvers configured for ${documentType} department` 
        });
      }
      
      // For now, just use the first approver - you might want to implement round-robin
      approverEmail = approvers[0].email;
      approverId = approvers[0].id;
    }
    else if (approvalType === 'single') {
      const singleApprover = await dbGet("SELECT at.email, at.id FROM authorization_team at JOIN settings s ON at.email = s.setting_value WHERE s.setting_type = 'approver_email' AND at.is_active = 1 LIMIT 1");
      if (!singleApprover) {
        return res.status(400).json({ success: false, error: 'No single approver configured' });
      }
      approverEmail = singleApprover.email;
      approverId = singleApprover.id;
    }

    // Insert invoice/PO record
    const result = await dbRun(
      `INSERT INTO invoices (
        invoice_number, po_number, invoice_date, payment_terms, total_amount, 
        subtotal, gst_amount, gst_rate, vendor_info, custom_fields, 
        document_url, status, approver_email, document_type, 
        current_approval_level, approval_type, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber || null, 
        poNumber || null,
        invoiceDate || null,
        paymentTerms || null,
        totalAmount,
        formatCurrency(subtotal),
        formatCurrency(gstAmount),
        gstRate,
        vendorInfo || null,
        customFields ? JSON.stringify(customFields) : null,
        documentUrl,
        'pending',
        approverEmail,
        documentType || 'Invoice',
        currentApprovalLevel,
        approvalType || 'hierarchy',
        attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : null
      ]
    );

    // Insert items if they exist
    if (items && items.length > 0) {
      const stmt = db.prepare(
        "INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)"
      );
      
      for (const item of items) {
        await new Promise((resolve, reject) => {
          stmt.run([
            result.lastID,
            item.description,
            parseFloat(item.quantity) || 0,
            parseFloat(item.unitPrice) || 0,
            parseFloat(item.total) || 0
          ], err => err ? reject(err) : resolve());
        });
      }
      await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
    }

    await dbRun('COMMIT');

    // Send approval email
    const invoiceData = await dbGet("SELECT * FROM invoices WHERE id = ?", [result.lastID]);
    const actionUrl = `http://localhost:${PORT}/api/invoices/approve`;
    let emailSent = false;

    if (approverEmail) {
      emailSent = await sendApprovalEmail(
        invoiceData, 
        [approverEmail], 
        approvalType === 'hierarchy' ? 1 : null
      );
    }

    if (!emailSent) {
      console.warn('Failed to send approval email for document:', result.lastID);
    }

    res.json({ 
      success: true, 
      documentId: result.lastID,
      message: `${documentType} saved successfully and sent for approval`
    });

  } catch (error) {
    await dbRun('ROLLBACK');
    console.error('Error saving document:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save document', 
      details: error.message 
    });
  }
});

app.get('/api/invoices/approve', async (req, res) => {
  const { action, id } = req.query;
  const validActions = ['approve', 'reject', 'hold'];
  
  if (!action || !validActions.includes(action) || !id || isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid action or document ID' });
  }

  try {
    const invoice = await dbGet("SELECT * FROM invoices WHERE id = ?", [id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Document not found' });

    let status, statusNotes, statusColor;
    switch (action) {
      case 'approve':
        if (invoice.approval_type === 'hierarchy' && invoice.current_approval_level < 3) {
          const hierarchySettings = await dbGet("SELECT * FROM hierarchy_settings ORDER BY id DESC LIMIT 1") || { skip_middle_approver: false };
          let nextLevel = invoice.current_approval_level + 1;
          if (hierarchySettings.skip_middle_approver && invoice.current_approval_level === 1) nextLevel = 3;

          const nextApprover = await dbGet(`
            SELECT at.email, at.id 
            FROM approval_hierarchy ah
            JOIN authorization_team at ON ah.approver_id = at.id
            WHERE ah.level = ?
          `, [nextLevel]);
          
          if (nextApprover) {
            await dbRun(
              "UPDATE invoices SET current_approval_level = ?, approver_email = ?, status = 'pending' WHERE id = ?",
              [nextLevel, nextApprover.email, id]
            );

            await dbRun(
              "INSERT INTO approval_logs (invoice_id, invoice_number, action, action_by, notes) VALUES (?, ?, ?, ?, ?)",
              [id, invoice.invoice_number || invoice.po_number, `approved_level_${invoice.current_approval_level}`, 'Email Approver', 
               `Approved level ${invoice.current_approval_level}, moved to level ${nextLevel}`]
            );

            const emailSent = await sendApprovalEmail(
              { ...invoice, current_approval_level: nextLevel, approver_email: nextApprover.email },
              [nextApprover.email],
              nextLevel
            );

            if (!emailSent) console.warn('Failed to send approval email to next level approver');

            return res.json({
              success: true,
              message: `${invoice.document_type} approved at level ${invoice.current_approval_level}, sent to level ${nextLevel} approver`,
              status: 'pending',
              statusColor: 'blue'
            });
          }
        }
        status = 'approved'; statusNotes = 'Approved via email'; statusColor = 'green';
        break;
      case 'reject':
        status = 'rejected'; statusNotes = 'Rejected via email'; statusColor = 'red';
        break;
      case 'hold':
        status = 'on_hold'; statusNotes = 'Put on hold via email'; statusColor = 'yellow';
        break;
    }

    await dbRun("UPDATE invoices SET status = ?, status_notes = ? WHERE id = ?", [status, statusNotes, id]);

    const logAction = invoice.approval_type === 'hierarchy' ? `${status}_level_${invoice.current_approval_level}` : status;
    await dbRun(
      "INSERT INTO approval_logs (invoice_id, invoice_number, action, action_by, notes) VALUES (?, ?, ?, ?, ?)",
      [id, invoice.invoice_number || invoice.po_number, logAction, 'Email Approver', statusNotes]
    );

    res.json({ success: true, message: `${invoice.document_type} ${status} successfully`, status, statusColor });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to process approval', details: error.message });
  }
});

app.patch('/api/invoices/:id/status', authenticateToken, async (req, res) => {
  const invoiceId = req.params.id;
  const { status, notes } = req.body;
  const validStatuses = ['pending', 'approved', 'rejected', 'on_hold'];
  
  if (!invoiceId || isNaN(invoiceId)) return res.status(400).json({ success: false, error: 'Invalid document ID' });
  if (!status || !validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status value' });

  try {
    const invoice = await dbGet("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Document not found' });

    // Verify the current user is the approver for this level
    if (status === 'approved' || status === 'rejected' || status === 'on_hold') {
      const isApprover = await dbGet(`
        SELECT 1 FROM approval_hierarchy 
        WHERE level = ? AND approver_id = ?
      `, [invoice.current_approval_level, req.user.id]);
      
      if (!isApprover) {
        return res.status(403).json({ success: false, error: 'Not authorized to approve this document' });
      }
    }

    if (status === 'approved' && invoice.approval_type === 'hierarchy' && invoice.current_approval_level < 3) {
      const hierarchySettings = await dbGet("SELECT * FROM hierarchy_settings ORDER BY id DESC LIMIT 1") || { skip_middle_approver: false };
      let nextLevel = invoice.current_approval_level + 1;
      if (hierarchySettings.skip_middle_approver && invoice.current_approval_level === 1) nextLevel = 3;

      const nextApprover = await dbGet(`
        SELECT at.email, at.id 
        FROM approval_hierarchy ah
        JOIN authorization_team at ON ah.approver_id = at.id
        WHERE ah.level = ?
      `, [nextLevel]);
      
      if (nextApprover) {
        await dbRun(
          "UPDATE invoices SET current_approval_level = ?, approver_email = ?, status = 'pending' WHERE id = ?",
          [nextLevel, nextApprover.email, invoiceId]
        );

        await dbRun(
          "INSERT INTO approval_logs (invoice_id, invoice_number, action, action_by, notes) VALUES (?, ?, ?, ?, ?)",
          [invoiceId, invoice.invoice_number || invoice.po_number, `approved_level_${invoice.current_approval_level}`, req.user.email, 
           notes || `Approved level ${invoice.current_approval_level}, moved to level ${nextLevel}`]
        );

        const emailSent = await sendApprovalEmail(
          { ...invoice, current_approval_level: nextLevel, approver_email: nextApprover.email },
          [nextApprover.email],
          nextLevel
        );

        if (!emailSent) console.warn('Failed to send approval email to next level approver');

        return res.json({
          success: true,
          message: `Document approved at level ${invoice.current_approval_level}, sent to level ${nextLevel} approver`,
          status: 'pending'
        });
      }
    }

    await dbRun("UPDATE invoices SET status = ?, status_notes = ? WHERE id = ?", [status, notes || '', invoiceId]);

    const logAction = invoice.approval_type === 'hierarchy' ? `${status}_level_${invoice.current_approval_level}` : status;
    await dbRun(
      "INSERT INTO approval_logs (invoice_id, invoice_number, action, action_by, notes) VALUES (?, ?, ?, ?, ?)",
      [invoiceId, invoice.invoice_number || invoice.po_number, logAction, req.user.email, notes || 'Status changed via portal']
    );

    res.json({ success: true, message: 'Document status updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update document status', details: error.message });
  }
});

// Existing invoice APIs...
app.get('/api/approval-logs', async (req, res) => {
  const { action, startDate, endDate, search, limit } = req.query;
  
  let conditions = [], params = [];
  if (action) { conditions.push("action = ?"); params.push(action); }
  if (startDate) { conditions.push("created_at >= ?"); params.push(startDate); }
  if (endDate) { conditions.push("created_at <= ?"); params.push(endDate); }
  if (search) {
    const searchTerm = `%${search}%`;
    conditions.push("(invoice_number LIKE ? OR action_by LIKE ? OR notes LIKE ?)");
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  let query = `SELECT * FROM approval_logs ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC`;
  if (limit && !isNaN(limit)) { query += " LIMIT ?"; params.push(parseInt(limit)); }

  try {
    const logs = await dbAll(query, params);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  const { draw = 1, start = 0, length = 10, search = {} } = req.query;
  const searchValue = search.value || '';
  const limit = parseInt(length);
  const offset = parseInt(start);

  try {
    const countQuery = `SELECT COUNT(*) as total FROM invoices ${
      searchValue ? 'WHERE invoice_number LIKE ? OR po_number LIKE ? OR vendor_info LIKE ? OR status LIKE ? OR document_type LIKE ?' : ''
    }`;
    const countParams = searchValue ? Array(5).fill(`%${searchValue}%`) : [];
    const countResult = await dbGet(countQuery, countParams);

    const query = `SELECT * FROM invoices ${
      searchValue ? 'WHERE invoice_number LIKE ? OR po_number LIKE ? OR vendor_info LIKE ? OR status LIKE ? OR document_type LIKE ?' : ''
    } ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const queryParams = [...(searchValue ? Array(5).fill(`%${searchValue}%`) : []), limit, offset];

    const invoices = await dbAll(query, queryParams);
    
    res.json({
      draw: parseInt(draw),
      recordsTotal: countResult.total,
      recordsFiltered: searchValue ? invoices.length : countResult.total,
      data: invoices
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  const invoiceId = req.params.id;
  if (!invoiceId || isNaN(invoiceId)) {
    return res.status(400).json({ success: false, error: 'Invalid document ID' });
  }

  try {
    const invoice = await dbGet("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Document not found' });

    const items = await dbAll(
      "SELECT id, description, quantity, unit_price, total FROM invoice_items WHERE invoice_id = ?", 
      [invoiceId]
    );

    let customFields = {};
    try { if (invoice.custom_fields) customFields = JSON.parse(invoice.custom_fields); } 
    catch (e) { console.error('Error parsing custom fields:', e); }

    let attachments = [];
    try { if (invoice.attachments) attachments = JSON.parse(invoice.attachments); } 
    catch (e) { console.error('Error parsing attachments:', e); }
    
    res.json({ 
      success: true, 
      data: { 
        ...invoice, 
        items: items || [], 
        custom_fields: customFields,
        attachments: attachments 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.patch('/api/invoices/:id/total', async (req, res) => {
  const invoiceId = req.params.id;
  const { totalAmount } = req.body;
  
  if (!invoiceId || isNaN(invoiceId)) return res.status(400).json({ success: false, error: 'Invalid document ID' });
  if (!totalAmount) return res.status(400).json({ success: false, error: 'Total amount is required' });

  const gstRate = 18;
  const totalAmountNum = parseFloat(totalAmount.replace(/[^0-9.-]/g, ''));
  const gstAmount = totalAmountNum * (gstRate / 100);
  const subtotal = totalAmountNum - gstAmount;

  try {
    const result = await dbRun(
      `UPDATE invoices SET total_amount = ?, subtotal = ?, gst_amount = ?, status = 'pending' WHERE id = ?`,
      [totalAmount, formatCurrency(subtotal), formatCurrency(gstAmount), invoiceId]
    );
    
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, message: 'Total amount updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  const invoiceId = req.params.id;
  if (!invoiceId || isNaN(invoiceId)) {
    return res.status(400).json({ success: false, error: 'Invalid document ID' });
  }

  try {
    await dbRun('BEGIN TRANSACTION');
    const invoice = await dbGet("SELECT document_url, attachments FROM invoices WHERE id = ?", [invoiceId]);

    // Delete main document
    if (invoice && invoice.document_url) {
      try {
        await fs.promises.unlink(path.join(__dirname, invoice.document_url));
      } catch (err) {
        console.error('Error deleting document file:', err.message);
      }
    }

    // Delete attachments
    if (invoice && invoice.attachments) {
      try {
        const attachments = JSON.parse(invoice.attachments);
        for (const attachment of attachments) {
          try {
            await fs.promises.unlink(path.join(__dirname, attachment));
          } catch (err) {
            console.error('Error deleting attachment:', attachment, err.message);
          }
        }
      } catch (e) {
        console.error('Error parsing attachments:', e);
      }
    }

    const result = await dbRun("DELETE FROM invoices WHERE id = ?", [invoiceId]);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Document not found' });

    await dbRun('COMMIT');
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    await dbRun('ROLLBACK');
    res.status(500).json({ success: false, error: 'Failed to delete document', details: error.message });
  }
});

// Vendor APIs
app.get('/api/vendors', async (req, res) => {
  try {
    const vendors = await dbAll(`
      SELECT v.*, vd.* FROM vendors v
      LEFT JOIN vendor_details vd ON v.id = vd.vendor_id
      ORDER BY v.created_at DESC
    `);
    res.json({ success: true, data: vendors });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.get('/api/vendors/basic', async (req, res) => {
  try {
    const vendors = await dbAll("SELECT id, vendor_id, vendor_name FROM vendors ORDER BY vendor_name");
    res.json({ success: true, data: vendors });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.get('/api/vendors/:id', async (req, res) => {
  const vendorId = req.params.id;
  try {
    const vendor = await dbGet(`
      SELECT v.*, vd.* FROM vendors v
      LEFT JOIN vendor_details vd ON v.id = vd.vendor_id
      WHERE v.id = ?
    `, [vendorId]);
    
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    
    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error', details: err.message });
  }
});

app.post('/api/vendors', async (req, res) => {
  if (!req.is('application/json')) {
    return res.status(400).json({ 
      success: false, 
      error: 'Content-Type must be application/json'
    });
  }

  const { vendor_id, vendor_name, email } = req.body;
  
  // Trim whitespace from inputs
  const trimmedVendorId = vendor_id ? vendor_id.trim() : '';
  const trimmedVendorName = vendor_name ? vendor_name.trim() : '';
  const trimmedEmail = email ? email.trim() : '';
  
  if (!trimmedVendorId || !trimmedVendorName || !trimmedEmail) {
    return res.status(400).json({ 
      success: false, 
      error: 'Vendor ID, name and email are required',
      details: {
        received_data: req.body,
        missing_fields: {
          vendor_id: !trimmedVendorId,
          vendor_name: !trimmedVendorName,
          email: !trimmedEmail
        }
      }
    });
  }
  
  try {
    // Check if vendor ID already exists
    const existingById = await dbGet("SELECT id FROM vendors WHERE vendor_id = ?", [vendor_id]);
    if (existingById) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vendor ID already exists',
        details: { conflicting_vendor_id: vendor_id }
      });
    }

    // Check if email already exists
    const existingByEmail = await dbGet("SELECT id FROM vendors WHERE email = ?", [email]);
    if (existingByEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email already registered for another vendor',
        details: { conflicting_email: email }
      });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format',
        details: { invalid_email: email }
      });
    }

    await dbRun('BEGIN TRANSACTION');

    const result = await dbRun(
      "INSERT INTO vendors (vendor_id, vendor_name, email) VALUES (?, ?, ?)",
      [vendor_id, vendor_name, email]
    );
    
    // Send confirmation email
    try {
      const mailOptions = {
        from: '"Invoice Processing System" <noreply@example.com>',
        to: email,
        subject: `Vendor Registration Confirmation - ${vendor_id}`,
        html: `
          <h2>Vendor Registration Confirmation</h2>
          <p>Your vendor account has been successfully created in our system.</p>
          <p><strong>Vendor ID:</strong> ${vendor_id}</p>
          <p><strong>Vendor Name:</strong> ${vendor_name}</p>
          <p>You will receive further communications regarding invoices and payments to this email address.</p>
        `
      };
      
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Failed to send vendor confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    await dbRun('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Vendor created successfully',
      id: result.lastID,
      vendor_id,
      vendor_name,
      email
    });
  } catch (err) {
    await dbRun('ROLLBACK');
    console.error('Error creating vendor:', err);
    
    let errorMessage = 'Failed to create vendor';
    let errorDetails = { database_error: err.message };

    // Handle specific SQLite errors
    if (err.code === 'SQLITE_CONSTRAINT') {
      if (err.message.includes('vendor_id')) {
        errorMessage = 'Vendor ID already exists';
        errorDetails.constraint = 'vendor_id must be unique';
      } else if (err.message.includes('email')) {
        errorMessage = 'Email already registered';
        errorDetails.constraint = 'email must be unique';
      }
    }

    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: errorDetails
    });
  }
});

app.post('/api/vendors/:id/details', async (req, res) => {
  const vendorId = req.params.id;
  
  // Log incoming data for debugging
  console.log('Received vendor details:', req.body);
  
  try {
    // Check if vendor exists
    const vendor = await dbGet("SELECT vendor_id FROM vendors WHERE id = ?", [vendorId]);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    
    // Prepare data for insertion/update
    const vendorDetails = {
      vendor_id: vendorId,
      vendor_type: req.body.vendor_type || null,
      street: req.body.street || null,
      city: req.body.city || null,
      state: req.body.state || null,
      country: req.body.country || null,
      postal_code: req.body.postal_code || null,
      contact_person: req.body.contact_person || null,
      contact_number: req.body.contact_number || null,
      alternate_number: req.body.alternate_number || null,
      pan_number: req.body.pan_number || null,
      gstin: req.body.gstin || null,
      tds_applicable: req.body.tds_applicable || 'no',
      tds_section: req.body.tds_section || null,
      tds_rate: req.body.tds_rate || null,
      msme_registered: req.body.msme_registered || 'no',
      msme_number: req.body.msme_number || null,
      bank_name: req.body.bank_name || null,
      account_number: req.body.account_number || null,
      account_holder: req.body.account_holder || null,
      ifsc_code: req.body.ifsc_code || null,
      payment_terms: req.body.payment_terms || null,
      currency: req.body.currency || 'INR',
      payment_method: req.body.payment_method || null,
      additional_notes: req.body.additional_notes || null
    };

    // Check if details already exist
    const existingDetails = await dbGet("SELECT id FROM vendor_details WHERE vendor_id = ?", [vendorId]);
    
    if (existingDetails) {
      // Update existing details
      await dbRun(`
        UPDATE vendor_details SET
          vendor_type = ?, street = ?, city = ?, state = ?, country = ?, postal_code = ?,
          contact_person = ?, contact_number = ?, alternate_number = ?,
          pan_number = ?, gstin = ?, tds_applicable = ?, tds_section = ?, tds_rate = ?,
          msme_registered = ?, msme_number = ?, bank_name = ?, account_number = ?,
          account_holder = ?, ifsc_code = ?, payment_terms = ?, currency = ?,
          payment_method = ?, additional_notes = ?
        WHERE vendor_id = ?
      `, Object.values(vendorDetails).slice(1).concat(vendorId));
    } else {
      // Insert new details
      await dbRun(`
        INSERT INTO vendor_details (
          vendor_id, vendor_type, street, city, state, country, postal_code,
          contact_person, contact_number, alternate_number,
          pan_number, gstin, tds_applicable, tds_section, tds_rate,
          msme_registered, msme_number, bank_name, account_number,
          account_holder, ifsc_code, payment_terms, currency,
          payment_method, additional_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, Object.values(vendorDetails));
    }
    
    res.json({ 
      success: true, 
      message: 'Vendor details saved successfully',
      vendor_id: vendor.vendor_id
    });
  } catch (err) {
    console.error('Error saving vendor details:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save vendor details',
      details: err.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Serve login page by default
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Server setup
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}\nAccess the application at: http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use`);
  else console.error('Server error:', error.message);
  process.exit(1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close();
  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    else console.log('Database connection closed');
    process.exit(err ? 1 : 0);
  });
}