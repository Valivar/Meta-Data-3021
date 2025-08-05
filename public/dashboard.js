document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard when the dashboard section is clicked in the sidebar
    document.querySelector('a[href="#dashboard-section"]').addEventListener('click', function(e) {
        e.preventDefault(); 
        showSection('#dashboard-section'); 
        initializeDashboard(); 
    });
    
    // Back to overview button click handler
    document.getElementById('back-to-overview').addEventListener('click', function() {
        // Hide the detail view and show the overview components
        document.getElementById('detail-view').style.display = 'none';
        document.querySelector('.dashboard-overview').style.display = 'grid';
        document.querySelector('.dashboard-recent').style.display = 'block';
        document.querySelector('.dashboard-charts').style.display = 'grid';
    });
    
    // Refresh dashboard button click handler
    document.getElementById('refresh-dashboard').addEventListener('click', function() {
        // Get current status from the detail title and reload data
        const status = document.getElementById('detail-title').textContent.replace(' Invoices', '').toLowerCase();
        loadStatusDetails(status);
    });
    
    // Add click handlers to all overview cards
    document.querySelectorAll('.overview-card').forEach(card => {
        card.addEventListener('click', function() {
            // Extract status from card ID (e.g., "approved-card" -> "approved")
            const status = this.id.replace('-card', '');
            showStatusDetails(status); // Show details for this status
        });
    });
});

// Global variables for chart instances and DataTable
let statusChart, weeklyChart;
let dashboardTable = null;


function initializeDashboard() {
    if ($.fn.DataTable.isDataTable('#dashboard-table')) {
        dashboardTable.destroy();
        $('#dashboard-table').empty(); // Clear the table
    }

    // Initialize DataTable for the detailed invoice view
    dashboardTable = $('#dashboard-table').DataTable({
        ajax: {
            url: '/api/invoices', 
            dataSrc: 'data' 
        },
        columns: [
            { data: 'invoice_number' }, 
            { data: 'po_number' }, 
            { 
                data: 'invoice_date', 
                render: function(data) {
                    // Format date using Moment.js
                    return data ? moment(data).format('MMM D, YYYY') : 'N/A';
                }
            },
            { 
                data: 'created_at', // Created at timestamp
                render: function(data) {
                    // Format timestamp using Moment.js
                    return data ? moment(data).format('MMM D, YYYY h:mm A') : 'N/A';
                }
            },
            { 
                data: 'vendor_info', // Vendor information
                render: function(data) {
                    // Show only the first line of vendor info
                    return data ? data.split('\n')[0] : 'N/A';
                }
            },
            { data: 'document_type' }, 
            { 
                data: 'total_amount', 
                render: function(data) {
                    // Show formatted currency or default
                    return data ? data : '$0.00';
                }
            },
            { 
                data: 'status', // Status column
                render: function(data, type, row) {
                    // Determine CSS class and display text based on status
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
                    
                    // Return the status badge HTML
                    return `<span class="status-badge ${statusClass}">${statusText}</span>`;
                }
            },
            {
                data: 'id', // Action column
                render: function(data, type, row) {
                    // Return view button HTML with invoice ID
                    return `
                        <div class="action-buttons">
                            <button class="btn-action view-invoice" data-id="${data}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    `;
                },
                orderable: false // Disable sorting for action column
            }
        ],
        order: [[3, 'desc']], 
        responsive: true 
    });
    
    // Add click handler for view invoice buttons in the table
    document.getElementById('dashboard-table').addEventListener('click', function(e) {
        if (e.target.closest('.view-invoice')) {
            const invoiceId = e.target.closest('.view-invoice').getAttribute('data-id');
            viewInvoiceDetails(invoiceId); // Show invoice details
        }
    });
    
    // Add input handler for search box
    document.getElementById('dashboard-search').addEventListener('input', function() {
        dashboardTable.search(this.value).draw(); 
    });
    
    // Load initial dashboard data and setup charts
    loadDashboardData();
    setupCharts();
}

function loadDashboardData() {
    showLoading(true); // Show loading spinner
    
    // Load status counts
    fetch('/api/invoices/status-counts')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                updateCounts(data.data); 
            } else {
                throw new Error(data.error || 'Failed to load status counts');
            }
        })
        .catch(error => {
            console.error('Error loading status counts:', error);
            showStatus('Error loading dashboard data', 'error');
        });
    
    // Load recent activity
    fetch('/api/approval-logs?limit=5')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                updateRecentActivity(data.data); 
            } else {
                throw new Error(data.error || 'Failed to load recent activity');
            }
        })
        .catch(error => {
            console.error('Error loading recent activity:', error);
            showStatus('Error loading recent activity', 'error');
        });
    
    // Load weekly stats for chart
    fetch('/api/invoices/weekly-stats')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                updateWeeklyChart(data.data); 
            } else {
                throw new Error(data.error || 'Failed to load weekly stats');
            }
        })
        .catch(error => {
            console.error('Error loading weekly stats:', error);
            showStatus('Error loading weekly statistics', 'error');
        })
        .finally(() => {
            showLoading(false); 
        });
}


function setupCharts() {
    const statusCtx = document.getElementById('status-chart').getContext('2d');
    const weeklyCtx = document.getElementById('weekly-chart').getContext('2d');
    
    // Status Distribution Pie Chart
    statusChart = new Chart(statusCtx, {
        type: 'pie',
        data: {
            labels: ['Approved', 'Pending', 'Rejected', 'On Hold'],
            datasets: [{
                data: [0, 0, 0, 0], // Initial empty data
                backgroundColor: [
                    'rgba(40, 167, 69, 0.8)', // Green
                    'rgba(23, 162, 184, 0.8)', // Blue
                    'rgba(220, 53, 69, 0.8)',  // Red
                    'rgba(255, 193, 7, 0.8)'   // Yellow
                ],
                borderColor: [
                    'rgba(40, 167, 69, 1)',
                    'rgba(23, 162, 184, 1)',
                    'rgba(220, 53, 69, 1)',
                    'rgba(255, 193, 7, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            // Show count and percentage in tooltip
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    
    // Weekly Processing Line Chart
    weeklyChart = new Chart(weeklyCtx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [
                {
                    label: 'Approved',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(40, 167, 69, 0.2)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 2,
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'Rejected',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 2,
                    tension: 0.1,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0 // No decimal places
                    }
                }
            }
        }
    });
}

/**
 * Update the status counts display
 * @param {Object} counts - Object containing status counts
 */
function updateCounts(counts) {
    if (!counts) return;
    
    // Update the count displays
    document.getElementById('total-count').textContent = counts.total || 0;
    document.getElementById('approved-count').textContent = counts.approved || 0;
    document.getElementById('pending-count').textContent = counts.pending || 0;
    document.getElementById('rejected-count').textContent = counts.rejected || 0;
    document.getElementById('hold-count').textContent = counts.on_hold || 0;
    
    // Update the pie chart if it exists
    if (statusChart) {
        statusChart.data.datasets[0].data = [
            counts.approved || 0,
            counts.pending || 0,
            counts.rejected || 0,
            counts.on_hold || 0
        ];
        statusChart.update(); // Refresh the chart
    }
}

/**
 * Update the recent activity feed
 * @param {Array} activities - Array of activity objects
 */
function updateRecentActivity(activities) {
    const container = document.getElementById('recent-activity');
    if (!container) return;
    
    container.innerHTML = ''; // Clear existing content
    
    if (!activities || activities.length === 0) {
        container.innerHTML = '<div class="no-activity">No recent activity found</div>';
        return;
    }
    
    // Create an activity item for each activity
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        // Determine icon and color based on action type
        let icon = 'fa-clock';
        let color = 'var(--primary-color)';
        
        if (activity.action.includes('approved')) {
            icon = 'fa-check-circle';
            color = 'var(--success-color)';
        } else if (activity.action.includes('rejected')) {
            icon = 'fa-times-circle';
            color = 'var(--danger-color)';
        } else if (activity.action.includes('hold')) {
            icon = 'fa-pause-circle';
            color = 'var(--warning-color)';
        }
        
        // Create the activity item HTML
        activityItem.innerHTML = `
            <div class="activity-icon" style="color: ${color}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-header">
                    <span class="activity-action">${formatAction(activity.action)}</span>
                    <span class="activity-time">${moment(activity.created_at).fromNow()}</span>
                </div>
                <div class="activity-details">
                    <span class="activity-invoice">Invoice #${activity.invoice_number}</span>
                    <span class="activity-by">by ${activity.action_by}</span>
                </div>
                ${activity.notes ? `<div class="activity-notes">${activity.notes}</div>` : ''}
            </div>
        `;
        
        container.appendChild(activityItem); // Add to the container
    });
}

/**
 * Format an action string for display
 * @param {string} action - The action string to format
 * @returns {string} Formatted action text
 */
function formatAction(action) {
    if (!action) return '';
    
    // Convert action to more readable format
    if (action.includes('approved')) {
        return 'Approved';
    } else if (action.includes('rejected')) {
        return 'Rejected';
    } else if (action.includes('hold')) {
        return 'Put On Hold';
    }
    return action.replace(/_/g, ' ').replace('level', 'Level ');
}

/**
 * Update the weekly chart with new data
 * @param {Object} data - Chart data object
 */
function updateWeeklyChart(data) {
    if (weeklyChart && data) {
        // Update chart labels if provided
        weeklyChart.data.labels = data.labels || weeklyChart.data.labels;
        
        // Update dataset data if provided
        if (data.datasets) {
            weeklyChart.data.datasets[0].data = data.datasets.approved || weeklyChart.data.datasets[0].data;
            weeklyChart.data.datasets[1].data = data.datasets.rejected || weeklyChart.data.datasets[1].data;
        }
        
        weeklyChart.update(); // Refresh the chart
    }
}

/**
 * Show detailed view for a specific status
 * @param {string} status - The status to show details for
 */
function showStatusDetails(status) {
    if (!status) return;
    
    // Hide overview components
    document.querySelector('.dashboard-overview').style.display = 'none';
    document.querySelector('.dashboard-recent').style.display = 'none';
    document.querySelector('.dashboard-charts').style.display = 'none';
    
    // Show the detail view
    document.getElementById('detail-view').style.display = 'block';
    
    // Set the title based on status
    const titleMap = {
        'total': 'All Invoices',
        'approved': 'Approved Invoices',
        'pending': 'Pending Invoices',
        'rejected': 'Rejected Invoices',
        'hold': 'On Hold Invoices'
    };
    
    document.getElementById('detail-title').textContent = titleMap[status] || 'Invoices';
    
    // Load the invoices for this status
    loadStatusDetails(status);
}

/**
 * Load invoices for a specific status
 * @param {string} status - The status to load invoices for
 */
function loadStatusDetails(status) {
    showLoading(true); // Show loading spinner
    
    // Fetch invoices for the specified status
    fetch(`/api/invoices/by-status?status=${status}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Clear existing data and add new rows
                dashboardTable.clear();
                if (data.data && data.data.length > 0) {
                    dashboardTable.rows.add(data.data).draw();
                } else {
                    dashboardTable.clear().draw();
                }
            } else {
                throw new Error(data.error || 'Failed to load invoices');
            }
        })
        .catch(error => {
            console.error('Error loading invoices:', error);
            showStatus('Error loading invoices', 'error');
        })
        .finally(() => {
            showLoading(false); // Hide loading spinner
        });
}

/**
 * Show or hide the loading spinner
 * @param {boolean} show - Whether to show the spinner
 */
function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Show a status message
 * @param {string} message - The message to display
 * @param {string} type - The message type (success, error, etc.)
 * @param {HTMLElement} [element] - Optional element to show message in
 */
function showStatus(message, type, element = null) {
    const statusElement = element || document.getElementById('form-status');
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = 'status-message ' + type;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'status-message';
        }, 5000);
    }
}

/**
 * View details for a specific invoice
 * @param {string} invoiceId - The ID of the invoice to view
 */
function viewInvoiceDetails(invoiceId) {
    // You should implement this function based on your existing modal implementation
    console.log('View invoice:', invoiceId);
    // This should show your existing invoice detail modal
    // Example implementation:
    // const modal = document.getElementById('invoice-detail-modal');
    // modal.style.display = 'flex';
    // populateInvoiceDetails(invoiceId);
}

/**
 * Show a specific section in the UI
 * @param {string} sectionId - The ID of the section to show
 */
function showSection(sectionId) {
    // This function should be implemented in your main application code
    // It typically handles showing/hiding different sections of the UI
    console.log('Show section:', sectionId);
}