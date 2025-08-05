$(document).ready(function() {
    // Initialize vendor tabs
    $('.vendor-tab-btn').on('click', function() {
        const tabId = $(this).data('tab');
        $('.vendor-tab-btn').removeClass('active');
        $(this).addClass('active');
        $('.vendor-tab-content').removeClass('active');
        $(`#${tabId}-tab`).addClass('active');
    });

    // Toggle TDS details based on selection
    $('input[name="tds-applicable"]').on('change', function() {
        if ($(this).val() === 'yes') {
            $('#tds-details').show();
        } else {
            $('#tds-details').hide();
        }
    });

    // Toggle MSME details based on selection
    $('input[name="msme-registered"]').on('change', function() {
        if ($(this).val() === 'yes') {
            $('#msme-details').show();
        } else {
            $('#msme-details').hide();
        }
    });

    // Set TDS rate based on section
    $('#tds-section').on('change', function() {
        const section = $(this).val();
        let rate = 0;
        switch(section) {
            case '192': rate = 5; break;
            case '193': rate = 10; break;
            case '194A': rate = 10; break;
            case '194C': rate = 2; break;
            case '194H': rate = 5; break;
            case '194I': rate = 10; break;
            case '194IA': rate = 1; break;
            default: rate = 0;
        }
        $('#tds-rate').val(rate);
    });

    // Initialize vendors table
    const vendorsTable = $('#vendors-table').DataTable({
        ajax: {
            url: '/api/vendors',
            dataSrc: 'data'
        },
        columns: [
            { 
                data: 'vendor_id',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'vendor_name',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'email',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'contact_number',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'vendor_type',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'pan_number',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'gstin',
                render: function(data) {
                    return data || 'N/A';
                }
            },
            { 
                data: 'created_at',
                render: function(data) {
                    return data ? moment(data).format('DD-MM-YYYY HH:mm') : 'N/A';
                }
            },
            {
                data: null,
                render: function(data, type, row) {
                    return `<button class="btn btn-sm btn-outline view-vendor-btn" data-id="${row.id}">
                                <i class="fas fa-eye"></i> View
                            </button>`;
                },
                orderable: false
            }
        ],
        responsive: true,
        order: [[7, 'desc']]
    });

    // View vendor details - Fixed version
    $(document).on('click', '.view-vendor-btn', function() {
        const vendorId = $(this).data('id');
        
        // Show loading state
        $('#vendor-detail-modal').show();
        $('#vendor-detail-modal .modal-body').html(`
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Loading vendor details...</p>
            </div>
        `);
        
        $.ajax({
            url: `/api/vendors/${vendorId}`,
            method: 'GET',
            success: function(response) {
                if (response.success && response.data) {
                    const vendor = response.data;
                    
                    // Create the detailed view HTML
                    const vendorDetailsHTML = `
                        <div class="vendor-detail-container">
                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Vendor ID:</span>
                                    <span class="detail-value">${vendor.vendor_id || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Vendor Name:</span>
                                    <span class="detail-value">${vendor.vendor_name || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Email:</span>
                                    <span class="detail-value">${vendor.email || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Vendor Type:</span>
                                    <span class="detail-value">${vendor.vendor_type || 'Not specified'}</span>
                                </div>
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-map-marker-alt"></i> Address Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Address:</span>
                                    <span class="detail-value">${vendor.street || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">City/State:</span>
                                    <span class="detail-value">${[vendor.city, vendor.state].filter(Boolean).join(', ') || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Country/Postal:</span>
                                    <span class="detail-value">${[vendor.country, vendor.postal_code].filter(Boolean).join(' - ') || 'Not provided'}</span>
                                </div>
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-phone"></i> Contact Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Contact Person:</span>
                                    <span class="detail-value">${vendor.contact_person || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Contact Number:</span>
                                    <span class="detail-value">${vendor.contact_number || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Alternate Number:</span>
                                    <span class="detail-value">${vendor.alternate_number || 'Not provided'}</span>
                                </div>
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-file-invoice-dollar"></i> Tax Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">PAN Number:</span>
                                    <span class="detail-value">${vendor.pan_number || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">GSTIN:</span>
                                    <span class="detail-value">${vendor.gstin || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">TDS Applicable:</span>
                                    <span class="detail-value">${vendor.tds_applicable === 'yes' ? 'Yes' : 'No'}</span>
                                </div>
                                ${vendor.tds_applicable === 'yes' ? `
                                <div class="detail-row">
                                    <span class="detail-label">TDS Section:</span>
                                    <span class="detail-value">${vendor.tds_section || 'Not specified'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">TDS Rate:</span>
                                    <span class="detail-value">${vendor.tds_rate ? vendor.tds_rate + '%' : 'Not specified'}</span>
                                </div>
                                ` : ''}
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-industry"></i> MSME Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">MSME Registered:</span>
                                    <span class="detail-value">${vendor.msme_registered === 'yes' ? 'Yes' : 'No'}</span>
                                </div>
                                ${vendor.msme_registered === 'yes' ? `
                                <div class="detail-row">
                                    <span class="detail-label">MSME Number:</span>
                                    <span class="detail-value">${vendor.msme_number || 'Not provided'}</span>
                                </div>
                                ` : ''}
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-university"></i> Bank Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Bank Name:</span>
                                    <span class="detail-value">${vendor.bank_name || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Account Number:</span>
                                    <span class="detail-value">${vendor.account_number || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Account Holder:</span>
                                    <span class="detail-value">${vendor.account_holder || 'Not provided'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">IFSC Code:</span>
                                    <span class="detail-value">${vendor.ifsc_code || 'Not provided'}</span>
                                </div>
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-money-bill-wave"></i> Payment Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Payment Terms:</span>
                                    <span class="detail-value">${vendor.payment_terms || 'Not specified'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Currency:</span>
                                    <span class="detail-value">${vendor.currency || 'INR'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Payment Method:</span>
                                    <span class="detail-value">${vendor.payment_method || 'Not specified'}</span>
                                </div>
                            </div>

                            <div class="vendor-detail-section">
                                <h4><i class="fas fa-sticky-note"></i> Additional Information</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Notes:</span>
                                    <span class="detail-value">${vendor.additional_notes || 'No additional notes'}</span>
                                </div>
                            </div>
                        </div>
                    `;

                    $('#vendor-detail-modal .modal-body').html(vendorDetailsHTML);
                } else {
                    $('#vendor-detail-modal .modal-body').html(`
                        <div class="error-message">
                            ${response.error || 'Failed to load vendor details'}
                        </div>
                    `);
                }
            },
            error: function(xhr) {
                $('#vendor-detail-modal .modal-body').html(`
                    <div class="error-message">
                        Failed to load vendor details: ${xhr.statusText}
                        ${xhr.responseJSON && xhr.responseJSON.error ? '<br>' + xhr.responseJSON.error : ''}
                    </div>
                `);
            }
        });
    });

   

    // Handle vendor basic form submission
    $('#vendor-basic-form').on('submit', function(e) {
        e.preventDefault();
        
        const vendorId = $('#vendor-id').val().trim();
        const vendorName = $('#vendor-name').val().trim();
        const vendorEmail = $('#vendor-email').val().trim();
        
        // Client-side validation
        if (!vendorId || !vendorName || !vendorEmail) {
            showStatusMessage('#vendor-basic-status', 'All fields are required', 'error');
            return;
        }

        // Show loading state
        const submitBtn = $(this).find('button[type="submit"]');
        submitBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Creating...');
        
        $.ajax({
            url: '/api/vendors',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                vendor_id: vendorId,
                vendor_name: vendorName,
                email: vendorEmail
            }),
            success: function(response) {
                if (response.success) {
                    showStatusMessage('#vendor-basic-status', 
                        `Vendor ${response.vendor_id} created successfully`, 
                        'success');
                    $('#vendor-basic-form')[0].reset();
                    loadVendorSelect();
                    vendorsTable.ajax.reload();
                    
                    // Switch to details tab for the new vendor
                    $('.vendor-tab-btn[data-tab="add-details"]').click();
                    $('#vendor-select').val(response.id).trigger('change');
                } else {
                    showStatusMessage('#vendor-basic-status', 
                        response.error || 'Failed to create vendor', 
                        'error');
                }
            },
            error: function(xhr) {
                let errorMessage = 'Failed to create vendor';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMessage = xhr.responseJSON.error;
                }
                showStatusMessage('#vendor-basic-status', errorMessage, 'error');
            },
            complete: function() {
                submitBtn.prop('disabled', false).html('<i class="fas fa-save"></i> Create Vendor');
            }
        });
    });

    // Handle vendor details form submission
    $('#vendor-details-form').on('submit', function(e) {
        e.preventDefault();
        
        const vendorId = $('#vendor-select').val();
        if (!vendorId) {
            showStatusMessage('#vendor-details-status', 'Please select a vendor first', 'error');
            return;
        }

        // Collect all form data
        const formData = {
            vendor_type: $('#vendor-type').val(),
            street: $('#street').val(),
            city: $('#city').val(),
            state: $('#state').val(),
            country: $('#country').val(),
            postal_code: $('#postal-code').val(),
            contact_person: $('#contact-person').val(),
            contact_number: $('#contact-number').val(),
            alternate_number: $('#alternate-number').val(),
            pan_number: $('#pan-number').val(),
            gstin: $('#gstin').val(),
            tds_applicable: $('input[name="tds-applicable"]:checked').val() || 'no',
            tds_section: $('#tds-section').val(),
            tds_rate: $('#tds-rate').val(),
            msme_registered: $('input[name="msme-registered"]:checked').val() || 'no',
            msme_number: $('#msme-number').val(),
            bank_name: $('#bank-name').val(),
            account_number: $('#account-number').val(),
            account_holder: $('#account-holder').val(),
            ifsc_code: $('#ifsc-code').val(),
            payment_terms: $('#payment-terms').val(),
            currency: $('#currency').val(),
            payment_method: $('#payment-method').val(),
            additional_notes: $('#additional-notes').val()
        };

        // Show loading state
        const submitBtn = $(this).find('button[type="submit"]');
        submitBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Saving...');
        
        $.ajax({
            url: `/api/vendors/${vendorId}/details`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(formData),
            success: function(response) {
                if (response.success) {
                    showStatusMessage('#vendor-details-status', 
                        'Vendor details saved successfully', 
                        'success');
                    vendorsTable.ajax.reload();
                } else {
                    showStatusMessage('#vendor-details-status', 
                        response.error || 'Failed to save vendor details', 
                        'error');
                }
            },
            error: function(xhr) {
                let errorMessage = 'Failed to save vendor details';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMessage = xhr.responseJSON.error;
                }
                showStatusMessage('#vendor-details-status', errorMessage, 'error');
            },
            complete: function() {
                submitBtn.prop('disabled', false).html('<i class="fas fa-save"></i> Save Vendor Details');
            }
        });
    });

    // Load vendors into select dropdown
    function loadVendorSelect() {
        $.ajax({
            url: '/api/vendors/basic',
            method: 'GET',
            success: function(response) {
                if (response.success) {
                    const select = $('#vendor-select');
                    select.empty();
                    select.append('<option value="">-- Select Vendor --</option>');
                    
                    response.data.forEach(vendor => {
                        select.append(`<option value="${vendor.id}">${vendor.vendor_id} - ${vendor.vendor_name}</option>`);
                    });
                }
            },
            error: function(xhr) {
                console.error('Failed to load vendors:', xhr.responseText);
            }
        });
    }

    // Initialize vendor select on details tab click
    $('.vendor-tab-btn[data-tab="add-details"]').on('click', function() {
        loadVendorSelect();
    });

    // Close modal
    $('.modal-close, .modal .btn-primary').on('click', function() {
        $(this).closest('.modal').hide();
    });

    // Show status message
    function showStatusMessage(selector, message, type) {
        const element = $(selector);
        element.text(message).removeClass('success error').addClass(type).show();
        setTimeout(() => element.fadeOut(), 5000);
    }

    // Initialize vendor master section
    loadVendorSelect();
    vendorsTable.ajax.reload();
});