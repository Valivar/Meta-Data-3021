document.addEventListener('DOMContentLoaded', function() {
    // Initialize DataTable with proper configuration
    const usersTable = $('#users-table').DataTable({
        processing: true,
        serverSide: false,
        ajax: {
            url: '/api/users',
            type: 'GET',
            headers: {
                'Authorization': 'Bearer ' + sessionStorage.getItem('authToken')
            },
            dataSrc: function(json) {
                // Handle different response formats
                if (json.data) {
                    return json.data; // Standard format
                } else if (Array.isArray(json)) {
                    return json; // Fallback for array response
                }
                return []; // Empty if no data
            },
            error: function(xhr, error, thrown) {
                console.error('DataTables AJAX error:', xhr, error, thrown);
                let errorMessage = 'Failed to load user data';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMessage = xhr.responseJSON.error;
                }
                $('#users-table_processing').html(
                    `<div class="alert alert-danger">${errorMessage}</div>`
                );
            }
        },
        columns: [
            { 
                data: 'name',
                defaultContent: '' // Handle empty data
            },
            { 
                data: 'email',
                defaultContent: '' 
            },
            { 
                data: 'role',
                defaultContent: '',
                render: function(data) {
                    // Map department codes to friendly names
                    const roleMap = {
                        'AP': 'AP Team',
                        'CFO': 'CFO',
                        'Manager': 'Manager',
                        'Admin': 'Administrator'
                    };
                    return roleMap[data] || data || 'N/A';
                }
            },
            { 
                data: 'is_active',
                render: function(data, type, row) {
                    if (type === 'display') {
                        const statusText = data ? 'Active' : 'Inactive';
                        const statusClass = data ? 'text-success' : 'text-danger';
                        return `<div class="d-flex align-items-center">
                            <label class="switch me-2">
                                <input type="checkbox" class="user-status" data-id="${row.id}" ${data ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                            <span class="${statusClass}">${statusText}</span>
                        </div>`;
                    }
                    return data;
                }
            },
            { 
                data: null,
                render: function(data, type, row) {
                    if (type === 'display') {
                        return `<button class="btn btn-sm btn-outline-primary reset-password-btn" data-id="${row.id}">
                            <i class="fas fa-key"></i> Reset Password
                        </button>`;
                    }
                    return null;
                },
                orderable: false
            }
        ],
        language: {
            processing: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
            zeroRecords: 'No users found',
            emptyTable: 'No users available in the system',
            info: 'Showing _START_ to _END_ of _TOTAL_ users',
            infoEmpty: 'No users to show',
            infoFiltered: '(filtered from _MAX_ total users)'
        },
        initComplete: function(settings, json) {
            // If no data, display message
            if (usersTable.data().count() === 0) {
                $('#users-table').append(
                    '<tr class="odd">' +
                    '<td valign="top" colspan="5" class="dataTables_empty">' +
                    'No user data available. Please add users or check your connection.' +
                    '</td></tr>'
                );
            }
        }
    });

    // Add manual refresh button handler
    $('#refresh-users').on('click', function() {
        reloadUserTable();
    });

    // Function to reload table with error handling
    function reloadUserTable() {
        usersTable.ajax.reload(function(json) {
            if (json.data && json.data.length === 0) {
                showStatus('User table is empty', 'info', $('#user-management-section'));
            }
        }, false);
    }

    // Status toggle handler
    $('#users-table').on('change', '.user-status', async function() {
        const userId = $(this).data('id');
        const isActive = $(this).is(':checked');
        const $row = $(this).closest('tr');
        const $statusText = $row.find('.text-success, .text-danger');

        // Update UI immediately for better responsiveness
        if (isActive) {
            $statusText.removeClass('text-danger').addClass('text-success').text('Active');
        } else {
            $statusText.removeClass('text-success').addClass('text-danger').text('Inactive');
        }

        try {
            const response = await fetch(`/api/users/${userId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + sessionStorage.getItem('authToken')
                },
                body: JSON.stringify({ is_active: isActive })
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            showStatus('User status updated successfully', 'success', $('#user-management-section'));
        } catch (error) {
            console.error('Error updating user status:', error);
            // Revert UI changes if API call fails
            $(this).prop('checked', !isActive);
            if (isActive) {
                $statusText.removeClass('text-success').addClass('text-danger').text('Inactive');
            } else {
                $statusText.removeClass('text-danger').addClass('text-success').text('Active');
            }
            showStatus('Failed to update user status', 'error', $('#user-management-section'));
        }
    });

    // Password reset handler
    $('#users-table').on('click', '.reset-password-btn', async function() {
        const userId = $(this).data('id');
        const userRow = $(this).closest('tr');
        const userName = userRow.find('td:first').text();
        
        // Create a custom dialog for password reset
        const dialogHtml = `
            <div class="password-reset-dialog">
                <h4>Reset Password for ${userName}</h4>
                <div class="form-group">
                    <label for="new-password">New Password</label>
                    <input type="password" id="new-password" class="form-control" placeholder="Enter new password" minlength="8" required>
                </div>
                <div class="form-group">
                    <label for="confirm-password">Confirm Password</label>
                    <input type="password" id="confirm-password" class="form-control" placeholder="Confirm new password" minlength="8" required>
                </div>
                <div id="password-reset-status" class="status-message"></div>
                <div class="dialog-buttons">
                    <button class="btn btn-outline cancel-reset">Cancel</button>
                    <button class="btn btn-primary confirm-reset">Reset Password</button>
                </div>
            </div>
        `;
        
        // Show the dialog
        const $dialog = $(dialogHtml).appendTo('body');
        $dialog.show();
        
        // Handle dialog events
        $dialog.on('click', '.cancel-reset', function() {
            $dialog.remove();
        });
        
        $dialog.on('click', '.confirm-reset', async function() {
            const newPassword = $('#new-password').val();
            const confirmPassword = $('#confirm-password').val();
            
            if (!newPassword || !confirmPassword) {
                showStatus('Both fields are required', 'error', $('#password-reset-status'));
                return;
            }
            
            if (newPassword.length < 8) {
                showStatus('Password must be at least 8 characters', 'error', $('#password-reset-status'));
                return;
            }
            
            if (newPassword !== confirmPassword) {
                showStatus('Passwords do not match', 'error', $('#password-reset-status'));
                return;
            }

            try {
                const response = await fetch(`/api/users/${userId}/password`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + sessionStorage.getItem('authToken')
                    },
                    body: JSON.stringify({ password: newPassword })
                });

                if (!response.ok) {
                    throw new Error(await response.text());
                }

                showStatus('Password reset successfully', 'success', $('#password-reset-status'));
                setTimeout(() => $dialog.remove(), 2000);
            } catch (error) {
                console.error('Error resetting password:', error);
                showStatus('Failed to reset password: ' + error.message, 'error', $('#password-reset-status'));
            }
        });
    });

    // Add user modal handler
    $('#add-user-btn').on('click', function() {
        $('#add-user-modal').css('display', 'flex');
        $('#user-status').empty();
        $('#user-form')[0].reset();
    });

    // Save new user handler
    $('#save-user-btn').on('click', async function() {
        const name = $('#user-name').val().trim();
        const email = $('#user-email').val().trim();
        const role = $('#user-role').val();
        const password = $('#user-password').val();
        const confirmPassword = $('#user-confirm-password').val();

        // Validation
        if (!name || !email || !role || !password || !confirmPassword) {
            showStatus('All fields are required', 'error', $('#user-status'));
            return;
        }

        if (password !== confirmPassword) {
            showStatus('Passwords do not match', 'error', $('#user-status'));
            return;
        }

        if (password.length < 8) {
            showStatus('Password must be at least 8 characters', 'error', $('#user-status'));
            return;
        }

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showStatus('Please enter a valid email address', 'error', $('#user-status'));
            return;
        }

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + sessionStorage.getItem('authToken')
                },
                body: JSON.stringify({
                    name,
                    email,
                    role,
                    password
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add user');
            }

            const newUser = await response.json();
            
            // Refresh the table
            reloadUserTable();
            
            // Clear the form
            $('#user-name, #user-email, #user-password, #user-confirm-password').val('');
            $('#user-role').val('');
            
            // Show success and close modal
            showStatus('User added successfully', 'success', $('#user-status'));
            setTimeout(() => $('#add-user-modal').hide(), 1500);
            
        } catch (error) {
            showStatus(error.message, 'error', $('#user-status'));
            console.error('Error:', error);
        }
    });

    // Status message helper function
    function showStatus(message, type, element) {
        const statusDiv = $(`<div class="status-message ${type}">${message}</div>`);
        element.find('.status-message').remove();
        element.append(statusDiv);
        
        if (type === 'success') {
            setTimeout(() => statusDiv.fadeOut(500, () => statusDiv.remove()), 5000);
        }
    }

    // Initial load
    reloadUserTable();

    // Add some CSS for the password reset dialog
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .password-reset-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 0 20px rgba(0,0,0,0.2);
                z-index: 1000;
                width: 400px;
                max-width: 90%;
            }
            .password-reset-dialog h4 {
                margin-top: 0;
                margin-bottom: 20px;
            }
            .password-reset-dialog .form-group {
                margin-bottom: 15px;
            }
            .password-reset-dialog .dialog-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
        `)
        .appendTo('head');
});