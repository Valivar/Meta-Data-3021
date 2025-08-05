// record.js - Handles invoice and PO records functionality

document.addEventListener('DOMContentLoaded', function() {
    let invoicesTable = null;
    let currentInvoiceId = null;
    let currentPdfFile = null;
    let currentInvoiceData = null;
    const gstRate = 18; // Default GST rate

    // Initialize DataTable with updated columns for PO/invoice distinction
    function initializeDataTable() {
        invoicesTable = $('#invoices-table').DataTable({
            ajax: {
                url: '/api/invoices',
                dataSrc: 'data'
            },
            columns: [
                { 
                    data: 'invoice_number',
                    render: function(data, type, row) {
                        return row.document_type === 'PO' ? `PO-${data || 'N/A'}` : data || 'N/A';
                    }
                },
                { data: 'po_number' },
                { 
                    data: 'invoice_date',
                    render: function(data) {
                        return data ? moment(data).format('MMM D, YYYY') : 'N/A';
                    }
                },
                { 
                    data: 'created_at',
                    render: function(data) {
                        return data ? moment(data).format('MMM D, YYYY h:mm A') : 'N/A';
                    }
                },
                { 
                    data: 'vendor_info',
                    render: function(data) {
                        return data ? data.split('\n')[0] : 'N/A';
                    }
                },
                { 
                    data: 'document_type',
                    render: function(data) {
                        return data || 'Document';
                    }
                },
                { 
                    data: 'total_amount',
                    render: function(data) {
                        return data ? data : '$0.00';
                    }
                },
                { 
                    data: 'status',
                    render: function(data, type, row) {
                        let statusClass = 'status-pending';
                        let statusText = 'Pending';
                        
                        if (data === 'approved') {
                            statusClass = 'status-approved';
                            statusText = 'Approved';
                        } else if (data === 'rejected') {
                            statusClass = 'status-rejected';
                            statusText = 'Rejected';
                        } else if (data === 'on_hold') {
                            statusClass = 'status-hold';
                            statusText = 'On Hold';
                        }
                        
                        return `<span class="status-badge ${statusClass}">${statusText}</span>`;
                    }
                },
                {
                    data: 'id',
                    render: function(data, type, row) {
                        return `
                            <div class="action-buttons">
                                <button class="btn-action view-invoice" data-id="${data}">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-action delete-invoice" data-id="${data}">
                                    <i class="fas fa-trash"></i>
                                </button>
                                ${row.status === 'pending' ? `
                                <button class="btn-action edit-invoice" data-id="${data}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                ` : ''}
                            </div>
                        `;
                    },
                    orderable: false
                }
            ],
            order: [[3, 'desc']],
            responsive: true
        });
    }

    // Load invoices from server
    function loadInvoices() {
        showLoading(true);
        fetch('/api/invoices')
            .then(response => response.json())
            .then(data => {
                if (invoicesTable) {
                    invoicesTable.clear();
                    invoicesTable.rows.add(data.data);
                    invoicesTable.draw();
                }
            })
            .catch(error => {
                console.error('Error loading invoices:', error);
                showStatus('Error loading invoices', 'error');
            })
            .finally(() => showLoading(false));
    }

    // View document details
    function viewDocumentDetails(docId) {
        currentInvoiceId = docId;
        showLoading(true);
        
        fetch(`/api/invoices/${docId}`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) throw new Error(data.error || 'Failed to load details');
                
                currentInvoiceData = data.data;
                showModal();
                
                // Load document if available
                if (data.data.document_url) {
                    loadDocumentForModal(data.data.document_url);
                } else {
                    document.querySelector('.modal-tab[data-tab="details"]').click();
                }

                // Show attachments if they exist
                if (data.data.attachments) {
                    displayAttachments(data.data.attachments);
                }
            })
            .catch(error => {
                console.error('Error loading details:', error);
                showStatus('Error loading document details', 'error');
            })
            .finally(() => showLoading(false));
    }

    // Display attachments in modal
    function displayAttachments(attachments) {
        try {
            const attachmentsList = typeof attachments === 'string' ? 
                JSON.parse(attachments) : attachments;
            
            if (!attachmentsList || !attachmentsList.length) return;

            const container = document.createElement('div');
            container.className = 'attachments-container';
            container.innerHTML = `
                <h5>Attachments</h5>
                <ul class="attachments-list">
                    ${attachmentsList.map(att => `
                        <li>
                            <a href="${att}" target="_blank" download>
                                <i class="fas fa-paperclip"></i> 
                                ${att.split('/').pop()}
                            </a>
                        </li>
                    `).join('')}
                </ul>
            `;
            
            document.getElementById('details-tab').appendChild(container);
        } catch (e) {
            console.error('Error displaying attachments:', e);
        }
    }

    // Show modal with document details
    function showModal() {
        const modal = document.getElementById('invoice-detail-modal');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        populateDocumentDetails();
        document.querySelector('.modal-tab[data-tab="document"]').click();
    }

    // Close modal
    function closeModal() {
        document.getElementById('invoice-detail-modal').style.display = 'none';
        document.body.style.overflow = 'auto';
        currentPdfFile = null;
    }

    // Load document for modal viewer
    function loadDocumentForModal(documentUrl) {
        showLoading(true);
        document.getElementById('modal-pdf-viewer').innerHTML = '<div class="pdf-loading">Loading document...</div>';
        
        // Handle relative URLs
        const fullUrl = documentUrl.startsWith('/') ? documentUrl : `/${documentUrl}`;
        
        pdfjsLib.getDocument(fullUrl).promise
            .then(pdf => {
                currentPdfFile = pdf;
                renderModalPage(1);
                updateModalPageInfo();
            })
            .catch(error => {
                console.error('Error loading document:', error);
                document.getElementById('modal-pdf-viewer').innerHTML = 
                    '<div class="pdf-error">Error loading document</div>';
                document.querySelector('.modal-tab[data-tab="details"]').click();
            })
            .finally(() => showLoading(false));
    }

    // Render page in modal
    function renderModalPage(pageNum) {
        if (!currentPdfFile) return;
        
        currentPdfFile.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            document.getElementById('modal-pdf-viewer').innerHTML = '';
            document.getElementById('modal-pdf-viewer').appendChild(canvas);
            
            page.render({
                canvasContext: context,
                viewport: viewport
            });
        }).catch(error => {
            console.error('Error rendering page:', error);
            document.getElementById('modal-pdf-viewer').innerHTML = 
                '<div class="pdf-error">Error rendering page</div>';
        });
    }

    // Update modal page info
    function updateModalPageInfo() {
        if (currentPdfFile) {
            document.getElementById('modal-page-info').textContent = 
                `Page ${modalCurrentPage} of ${currentPdfFile.numPages}`;
        }
    }

    // Populate document details in the modal
    function populateDocumentDetails() {
        if (!currentInvoiceData) return;
        
        const docType = currentInvoiceData.document_type || 'Document';
        
        // Basic info
        document.getElementById('invoice-number-display').textContent = 
            `${docType === 'PO' ? 'PO' : 'Invoice'} #${currentInvoiceData.invoice_number || currentInvoiceData.po_number || 'N/A'}`;
        
        document.getElementById('invoice-date-display').textContent = currentInvoiceData.invoice_date ? 
            moment(currentInvoiceData.invoice_date).format('MMMM D, YYYY') : 'N/A';
        
        document.getElementById('created-at-display').textContent = currentInvoiceData.created_at ? 
            `Created: ${moment(currentInvoiceData.created_at).format('MMMM D, YYYY h:mm A')}` : 'N/A';
        
        document.getElementById('document-type-display').textContent = docType;
        
        // Status display
        updateStatusDisplay();
        
        // Vendor info
        document.getElementById('vendor-info-display').innerHTML = currentInvoiceData.vendor_info ? 
            currentInvoiceData.vendor_info.replace(/\n/g, '<br>') : 'N/A';
        
        // Other fields
        document.getElementById('payment-terms-display').textContent = currentInvoiceData.payment_terms || 'Not specified';
        document.getElementById('po-number-display').textContent = currentInvoiceData.po_number || 'Not specified';
        document.getElementById('invoice-total-amount').textContent = currentInvoiceData.total_amount ? 
            formatCurrency(currentInvoiceData.total_amount) : '$0.00';
        
        // Items
        displayItems();
        
        // Amount details
        updateModalAmountDetails();
        
        // Custom fields
        displayCustomFields();
    }

    // Update status display in modal
    function updateStatusDisplay() {
        const statusDisplay = document.getElementById('invoice-status-display');
        statusDisplay.innerHTML = '';
        
        let statusClass = 'status-pending';
        let statusText = 'Pending Approval';
        
        if (currentInvoiceData.status === 'approved') {
            statusClass = 'status-approved';
            statusText = 'Approved';
        } else if (currentInvoiceData.status === 'rejected') {
            statusClass = 'status-rejected';
            statusText = 'Rejected';
        } else if (currentInvoiceData.status === 'on_hold') {
            statusClass = 'status-hold';
            statusText = 'On Hold';
        }
        
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${statusClass}`;
        statusBadge.textContent = statusText;
        statusDisplay.appendChild(statusBadge);
        
        if (currentInvoiceData.status_notes) {
            const notes = document.createElement('p');
            notes.className = 'status-notes';
            notes.textContent = `Notes: ${currentInvoiceData.status_notes}`;
            statusDisplay.appendChild(notes);
        }
    }

    // Display items in modal
    function displayItems() {
        const itemsContainer = document.getElementById('invoice-items-display');
        itemsContainer.innerHTML = '';
        
        if (currentInvoiceData.items && currentInvoiceData.items.length > 0) {
            itemsContainer.innerHTML = `
                <h4>Items</h4>
                <table class="invoice-items-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${currentInvoiceData.items.map(item => `
                            <tr>
                                <td>${item.description || 'N/A'}</td>
                                <td>${item.quantity || 'N/A'}</td>
                                <td>${item.unit_price ? formatCurrency(item.unit_price) : 'N/A'}</td>
                                <td>${item.total ? formatCurrency(item.total) : 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    // Update amount details in modal
    function updateModalAmountDetails() {
        const totalAmount = parseCurrency(currentInvoiceData.total_amount);
        
        if (isNaN(totalAmount)) {
            resetAmountDisplay();
            return;
        }

        const subtotal = totalAmount / (1 + (gstRate/100));
        const gstAmount = totalAmount - subtotal;
        const cgstAmount = gstAmount / 2;
        const sgstAmount = gstAmount / 2;

        document.getElementById('modal-subtotal-amount').textContent = formatCurrency(subtotal);
        document.getElementById('modal-cgst-amount').textContent = formatCurrency(cgstAmount);
        document.getElementById('modal-sgst-amount').textContent = formatCurrency(sgstAmount);
        document.getElementById('modal-gst-amount').textContent = `${formatCurrency(gstAmount)} (${gstRate}%)`;
        document.getElementById('modal-grand-total-amount').textContent = formatCurrency(totalAmount);
    }

    function resetAmountDisplay() {
        document.getElementById('modal-subtotal-amount').textContent = '$0.00';
        document.getElementById('modal-cgst-amount').textContent = '$0.00';
        document.getElementById('modal-sgst-amount').textContent = '$0.00';
        document.getElementById('modal-gst-amount').textContent = '$0.00';
        document.getElementById('modal-grand-total-amount').textContent = '$0.00';
    }

    // Display custom fields in modal
    function displayCustomFields() {
        const container = document.getElementById('custom-fields-display');
        container.innerHTML = '';
        
        if (currentInvoiceData.custom_fields) {
            try {
                const fields = typeof currentInvoiceData.custom_fields === 'string' 
                    ? JSON.parse(currentInvoiceData.custom_fields) 
                    : currentInvoiceData.custom_fields;
                
                if (fields && Object.keys(fields).length > 0) {
                    container.innerHTML = `
                        <h5>Additional Information</h5>
                        <div class="custom-fields-container">
                            ${Object.entries(fields).map(([name, value]) => `
                                <div class="custom-field">
                                    <span class="custom-field-name">${name}:</span>
                                    <span class="custom-field-value">${value || 'N/A'}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error parsing custom fields:', e);
            }
        }
    }

    // Delete document
    function deleteDocument(docId) {
        if (confirm('Are you sure you want to delete this document?')) {
            showLoading(true);
            fetch(`/api/invoices/${docId}`, { method: 'DELETE' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showStatus('Document deleted successfully', 'success');
                        loadInvoices();
                    } else {
                        throw new Error(data.error || 'Failed to delete document');
                    }
                })
                .catch(error => {
                    console.error('Error deleting document:', error);
                    showStatus('Error deleting document', 'error');
                })
                .finally(() => showLoading(false));
        }
    }

    // Edit document (for pending documents)
    function editDocument(docId) {
        // Implementation depends on your edit functionality
        console.log('Edit document:', docId);
        // You would typically redirect to an edit page or show an edit modal
    }

    // Format currency
    function formatCurrency(value) {
        if (typeof value === 'string') {
            if (/[a-zA-Z$€£¥₹]/.test(value)) return value;
            value = parseFloat(value.replace(/[^0-9.-]/g, ''));
        }
        return isNaN(value) ? '$0.00' : 
            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    // Parse currency string to number
    function parseCurrency(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? 0 : num;
    }

    // Show status message
    function showStatus(message, type, element) {
        const statusElement = element || document.getElementById('form-status');
        statusElement.textContent = message;
        statusElement.className = 'status-message ' + type;
        
        if (type === 'success') {
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.className = 'status-message';
            }, 5000);
        }
    }
    
    // Show/hide loading spinner
    function showLoading(show) {
        document.getElementById('loading-spinner').style.display = show ? 'flex' : 'none';
    }

    // Set up event listeners
    function setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-invoices').addEventListener('click', loadInvoices);
        
        // Search input
        document.getElementById('invoice-search').addEventListener('input', function() {
            invoicesTable.search(this.value).draw();
        });
        
        // Document actions
        document.addEventListener('click', function(e) {
            if (e.target.closest('.view-invoice')) {
                const docId = e.target.closest('.view-invoice').getAttribute('data-id');
                viewDocumentDetails(docId);
            }
            
            if (e.target.closest('.delete-invoice')) {
                const docId = e.target.closest('.delete-invoice').getAttribute('data-id');
                deleteDocument(docId);
            }
            
            if (e.target.closest('.edit-invoice')) {
                const docId = e.target.closest('.edit-invoice').getAttribute('data-id');
                editDocument(docId);
            }
        });

        // Modal navigation
        document.getElementById('modal-prev-page').addEventListener('click', function() {
            if (modalCurrentPage > 1) {
                modalCurrentPage--;
                renderModalPage(modalCurrentPage);
                updateModalPageInfo();
            }
        });

        document.getElementById('modal-next-page').addEventListener('click', function() {
            if (currentPdfFile && modalCurrentPage < currentPdfFile.numPages) {
                modalCurrentPage++;
                renderModalPage(modalCurrentPage);
                updateModalPageInfo();
            }
        });

        // Modal tabs
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
                
                this.classList.add('active');
                document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
            });
        });

        // Modal close
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });
    }

    // Initialize
    setupEventListeners();
    initializeDataTable();
    loadInvoices();
});