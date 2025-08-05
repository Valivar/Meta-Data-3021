// Shared utility functions with enhanced security and features

/**
 * Format currency value with localization support
 * @param {number|string} value - The value to format
 * @param {string} [currency='USD'] - Currency code (e.g., 'USD', 'EUR', 'INR')
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, currency = 'USD') {
    if (typeof value === 'string') {
        // If it's already formatted with a currency symbol, return as is
        if (/[a-zA-Z$€£¥₹]/.test(value)) {
            return value;
        }
        
        // Otherwise parse as number
        value = parseFloat(value.replace(/[^0-9.-]/g, ''));
    }
    
    // Handle NaN cases
    if (isNaN(value)) value = 0;
    
    return new Intl.NumberFormat(navigator.language || 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value || 0);
}

/**
 * Parse currency string to number with strict validation
 * @param {string} value - The currency string to parse
 * @returns {number} Parsed number
 */
function parseCurrency(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    
    // Remove all non-numeric characters except decimal point and minus sign
    const parsedValue = parseFloat(value.replace(/[^\d.-]/g, ''));
    
    // Validate the parsed number
    if (isNaN(parsedValue)) {
        console.warn('Invalid currency value:', value);
        return 0;
    }
    
    return parsedValue;
}

/**
 * Show status message with improved styling and auto-dismiss
 * @param {string} message - The message to display
 * @param {string} type - Type of message (success, error, warning, info)
 * @param {HTMLElement} element - The element to show the message in
 * @param {number} [timeout=5000] - Timeout in ms for auto-dismiss (0 for no auto-dismiss)
 */
function showStatus(message, type, element, timeout = 5000) {
    if (!element || !message) return;
    
    // Clear existing messages and classes
    element.innerHTML = '';
    element.className = 'status-message';
    
    // Create message content with optional icon
    const iconMap = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    
    const icon = iconMap[type] ? `<i class="fas fa-${iconMap[type]}"></i> ` : '';
    element.innerHTML = `${icon}${message}`;
    element.classList.add(type);
    
    // Auto-dismiss for success messages
    if (timeout > 0 && (type === 'success' || type === 'info')) {
        setTimeout(() => {
            element.innerHTML = '';
            element.className = 'status-message';
        }, timeout);
    }
}

/**
 * Enhanced document type detection with fuzzy matching
 * @param {string} text - The text to analyze
 * @param {Array} docTypes - Array of document types with keywords
 * @param {number} [threshold=2] - Minimum keyword matches required
 * @returns {string} Detected document type name
 */
function detectDocumentType(text, docTypes, threshold = 2) {
    if (!text || !docTypes || docTypes.length === 0) return 'Invoice';
    
    let detectedType = 'Invoice';
    let highestScore = 0;
    
    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    docTypes.forEach(type => {
        const keywords = type.keywords.split(',').map(k => k.trim().toLowerCase());
        let score = 0;
        
        keywords.forEach(keyword => {
            // Fuzzy match with word boundaries
            const regex = new RegExp(`\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
            if (regex.test(normalizedText)) {
                score++;
            }
        });
        
        if (score >= threshold && score > highestScore) {
            highestScore = score;
            detectedType = type.name;
        }
    });
    
    return detectedType;
}

/**
 * Robust date normalization with timezone support
 * @param {string} dateStr - The date string to normalize
 * @param {string} [outputFormat='YYYY-MM-DD'] - Output format
 * @returns {string} Normalized date string
 */
function normalizeDate(dateStr, outputFormat = 'YYYY-MM-DD') {
    if (!dateStr) return '';
    
    // Try common formats with timezone awareness
    const formats = [
        'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY',
        'MM/DD/YYYY', 'MM-DD-YYYY', 'MM.DD.YYYY',
        'YYYY/MM/DD', 'YYYY-MM-DD', 'YYYY.MM.DD',
        'DD MMM YYYY', 'DD MMMM YYYY', 'MMM DD, YYYY',
        'MMMM DD, YYYY', 'DD-MMM-YYYY', 'DD/MMM/YYYY',
        'YYYYMMDD', 'DDMMYYYY', 'MMDDYYYY',
        'YYYY-MM-DDTHH:mm:ssZ', 'YYYY-MM-DDTHH:mm:ss.SSSZ' // ISO formats
    ];
    
    const date = moment(dateStr, formats, true);
    if (date.isValid()) {
        return date.format(outputFormat);
    }
    
    // Fallback to more aggressive parsing
    const cleanedStr = dateStr.replace(/[^\d\/\-.,\sA-Za-z]/g, '');
    const fallbackDate = moment(cleanedStr);
    if (fallbackDate.isValid()) {
        return fallbackDate.format(outputFormat);
    }
    
    console.warn('Unable to normalize date:', dateStr);
    return dateStr;
}

/**
 * Show/hide loading spinner with progress indication
 * @param {boolean|number} show - Whether to show spinner or percentage (0-100)
 * @param {string} [message='Loading...'] - Optional loading message
 */
function showLoading(show, message = 'Loading...') {
    const spinner = document.getElementById('loading-spinner');
    if (!spinner) return;
    
    if (typeof show === 'number') {
        // Show with progress percentage
        spinner.style.display = 'flex';
        spinner.innerHTML = `
            <div class="spinner-container">
                <div class="spinner"></div>
                <div class="progress-text">${message} (${Math.min(100, Math.max(0, show))}%)</div>
            </div>
        `;
    } else if (show) {
        // Show with default message
        spinner.style.display = 'flex';
        spinner.innerHTML = `
            <div class="spinner-container">
                <div class="spinner"></div>
                <div class="progress-text">${message}</div>
            </div>
        `;
    } else {
        // Hide
        spinner.style.display = 'none';
    }
}

/**
 * Get authentication headers for API requests
 * @returns {Object} Headers object with authorization token
 */
function getAuthHeaders() {
    const token = sessionStorage.getItem('authToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

/**
 * Safe JSON parsing with error handling
 * @param {string} jsonString - The JSON string to parse
 * @param {*} [defaultValue={}] - Default value if parsing fails
 * @returns {*} Parsed object or defaultValue
 */
function safeJsonParse(jsonString, defaultValue = {}) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON parse error:', e);
        return defaultValue;
    }
}

/**
 * Debounce function to limit rapid calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Sanitize HTML string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export {
    formatCurrency,
    parseCurrency,
    showStatus,
    detectDocumentType,
    normalizeDate,
    showLoading,
    getAuthHeaders,
    safeJsonParse,
    debounce,
    sanitizeHtml
};