// Dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard when the section is shown
    document.querySelector('a[href="#dashboard-section"]').addEventListener('click', function() {
        initializeDashboard();
    });
    
    // Back to overview button
    document.getElementById('back-to-overview').addEventListener('click', function() {
        document.getElementById('detail-view').style.display = 'none';
        document.querySelector('.dashboard-overview').style.display = 'grid';
        document.querySelector('.dashboard-recent').style.display = 'block';
        document.querySelector('.dashboard-charts').style.display = 'grid';
    });
    
    // Refresh dashboard button
    document.getElementById('refresh-dashboard').addEventListener('click', function() {
        const status = document.getElementById('detail-title').textContent.replace(' Invoices', '').toLowerCase();
        loadStatusDetails(status);
    });
    
    // Overview card click handlers
    document.querySelectorAll('.overview-card').forEach(card => {
        card.addEventListener('click', function() {
            const status = this.id.replace('-card', '');
            showStatusDetails(status);
        });
    });
});

let statusChart, weeklyChart;
let dashboardTable;

function initializeDashboard() {
    loadDashboardData();
    setupCharts();
    
    // Initialize DataTable for detailed view
    dashboardTable = $('#dashboard-table').DataTable({
        columns: [
            { data: 'invoice_number' },
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
            { data: 'document_type' },
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
                        </div>
                    `;
                },
                orderable: false
            }
        ],
        order: [[3, 'desc']],
        responsive: true
    });
    
    // Search functionality
    document.getElementById('dashboard-search').addEventListener('input', function() {
        dashboardTable.search(this.value).draw();
    });
}

function loadDashboardData() {
    showLoading(true);
    
    // Load counts
    fetch('/api/invoices/status-counts')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateCounts(data.data);
            }
        })
        .catch(error => {
            console.error('Error loading status counts:', error);
        });
    
    // Load recent activity
    fetch('/api/approval-logs?limit=5')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateRecentActivity(data.data);
            }
        })
        .catch(error => {
            console.error('Error loading recent activity:', error);
        });
    
    // Load weekly data for chart
    fetch('/api/invoices/weekly-stats')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateWeeklyChart(data.data);
            }
        })
        .catch(error => {
            console.error('Error loading weekly stats:', error);
        })
        .finally(() => {
            showLoading(false);
        });
}

function updateCounts(counts) {
    document.getElementById('total-count').textContent = counts.total || 0;
    document.getElementById('approved-count').textContent = counts.approved || 0;
    document.getElementById('pending-count').textContent = counts.pending || 0;
    document.getElementById('rejected-count').textContent = counts.rejected || 0;
    document.getElementById('hold-count').textContent = counts.on_hold || 0;
    
    // Update pie chart
    if (statusChart) {
        statusChart.data.datasets[0].data = [
            counts.approved || 0,
            counts.pending || 0,
            counts.rejected || 0,
            counts.on_hold || 0
        ];
        statusChart.update();
    }
}

function updateRecentActivity(activities) {
    const container = document.getElementById('recent-activity');
    container.innerHTML = '';
    
    if (activities.length === 0) {
        container.innerHTML = '<div class="no-activity">No recent activity found</div>';
        return;
    }
    
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
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
        
        container.appendChild(activityItem);
    });
}

function formatAction(action) {
    // Convert action to readable format
    if (action.includes('approved')) {
        return 'Approved';
    } else if (action.includes('rejected')) {
        return 'Rejected';
    } else if (action.includes('hold')) {
        return 'Put On Hold';
    }
    return action.replace(/_/g, ' ').replace('level', 'Level ');
}

function setupCharts() {
    const statusCtx = document.getElementById('status-chart').getContext('2d');
    const weeklyCtx = document.getElementById('weekly-chart').getContext('2d');
    
    // Status Distribution Chart (Pie)
    statusChart = new Chart(statusCtx, {
        type: 'pie',
        data: {
            labels: ['Approved', 'Pending', 'Rejected', 'On Hold'],
            datasets: [{
                data: [0, 0, 0, 0], // Initial data, will be updated
                backgroundColor: [
                    'rgba(40, 167, 69, 0.8)',
                    'rgba(23, 162, 184, 0.8)',
                    'rgba(220, 53, 69, 0.8)',
                    'rgba(255, 193, 7, 0.8)'
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
    
    // Weekly Processing Chart (Line)
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
                        precision: 0
                    }
                }
            }
        }
    });
}

function updateWeeklyChart(data) {
    if (weeklyChart && data) {
        weeklyChart.data.labels = data.labels || weeklyChart.data.labels;
        
        if (data.datasets) {
            weeklyChart.data.datasets[0].data = data.datasets.approved || weeklyChart.data.datasets[0].data;
            weeklyChart.data.datasets[1].data = data.datasets.rejected || weeklyChart.data.datasets[1].data;
        }
        
        weeklyChart.update();
    }
}

function showStatusDetails(status) {
    // Hide overview elements
    document.querySelector('.dashboard-overview').style.display = 'none';
    document.querySelector('.dashboard-recent').style.display = 'none';
    document.querySelector('.dashboard-charts').style.display = 'none';
    
    // Show detail view
    document.getElementById('detail-view').style.display = 'block';
    
    // Set title based on status
    const titleMap = {
        'total': 'All Invoices',
        'approved': 'Approved Invoices',
        'pending': 'Pending Invoices',
        'rejected': 'Rejected Invoices',
        'hold': 'On Hold Invoices'
    };
    
    document.getElementById('detail-title').textContent = titleMap[status] || 'Invoices';
    
    // Load data for this status
    loadStatusDetails(status);
}

function loadStatusDetails(status) {
    showLoading(true);
    
    let url = '/api/invoices';
    if (status !== 'total') {
        url += `?status=${status === 'hold' ? 'on_hold' : status}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                dashboardTable.clear().rows.add(data.data).draw();
            } else {
                throw new Error(data.error || 'Failed to load invoices');
            }
        })
        .catch(error => {
            console.error('Error loading invoices:', error);
            showStatus('Error loading invoices', 'error');
        })
        .finally(() => {
            showLoading(false);
        });
}