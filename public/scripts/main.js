// Main application logic for invoice processing
document.addEventListener('DOMContentLoaded', function() {
    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

    // Global variables
    let pdfDocument = null;
    let currentPage = 1;
    let scale = 1.0;
    let extractedText = [];
    let documentTypes = [];
    let currentInvoiceId = null;

    // DOM elements
    const pdfUpload = document.getElementById('pdf-upload');
    const dropZone = document.getElementById('drop-zone');
    const documentTypeSelect = document.getElementById('document-type');
    const saveBtn = document.getElementById('save-btn');

    // Initialize
    loadDocumentTypes();
    setupEventListeners();

    function setupEventListeners() {
        // File upload handling
        pdfUpload.addEventListener('change', handleFileSelect);
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('drop', handleFileDrop);

        // Form submission
        saveBtn.addEventListener('click', saveInvoice);
    }

    function loadDocumentTypes() {
        fetch('/api/document-types')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    documentTypes = data.data;
                    updateDocumentTypeSelect();
                }
            })
            .catch(error => {
                console.error('Error loading document types:', error);
            });
    }

    function updateDocumentTypeSelect() {
        documentTypeSelect.innerHTML = '';
        documentTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.name;
            option.textContent = type.name;
            documentTypeSelect.appendChild(option);
        });
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        processPDFFile(file);
    }

    function handleDragOver(event) {
        event.preventDefault();
        dropZone.classList.add('dragover');
    }

    function handleFileDrop(event) {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        
        if (event.dataTransfer.files.length) {
            pdfUpload.files = event.dataTransfer.files;
            processPDFFile(event.dataTransfer.files[0]);
        }
    }

    function processPDFFile(file) {
        if (file.type !== 'application/pdf') {
            showStatus('Please upload a PDF file', 'error');
            return;
        }

        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            
            pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
                pdfDocument = pdf;
                currentPage = 1;
                scale = 1.0;
                
                renderPage(currentPage);
                extractTextFromPDF(pdf);
            }).catch(function(error) {
                showStatus('Error loading PDF: ' + error.message, 'error');
            });
        };
        fileReader.readAsArrayBuffer(file);
    }

    function renderPage(pageNum) {
        pdfDocument.getPage(pageNum).then(function(page) {
            const viewport = page.getViewport({ scale: scale });
            const canvas = document.getElementById('pdf-canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            page.render({
                canvasContext: context,
                viewport: viewport
            });
        });
    }

    function extractTextFromPDF(pdf) {
        extractedText = [];
        const numPages = pdf.numPages;
        
        for (let i = 1; i <= numPages; i++) {
            pdf.getPage(i).then(function(page) {
                return page.getTextContent();
            }).then(function(textContent) {
                let pageText = '';
                textContent.items.forEach(function(textItem) {
                    pageText += textItem.str + ' ';
                });
                extractedText.push(pageText);
                
                if (i === 1) { // Only detect on first page
                    detectDocumentType(pageText);
                    autoFillForm(pageText);
                }
            });
        }
    }

    function detectDocumentType(text) {
        let detectedType = 'Invoice'; // Default
        let highestScore = 0;
        
        documentTypes.forEach(type => {
            const keywords = type.keywords.split(',');
            let score = 0;
            
            keywords.forEach(keyword => {
                if (text.includes(keyword.trim())) {
                    score++;
                }
            });
            
            if (score > highestScore) {
                highestScore = score;
                detectedType = type.name;
            }
        });
        
        documentTypeSelect.value = detectedType;
    }

    function autoFillForm(text) {
        // Implement your field detection and auto-fill logic here
        // Example:
        const invoiceNumberMatch = text.match(/Invoice Number:\s*(\S+)/i);
        if (invoiceNumberMatch) {
            document.getElementById('invoice-number').value = invoiceNumberMatch[1];
        }
    }

    function saveInvoice() {
        const formData = {
            invoiceNumber: document.getElementById('invoice-number').value,
            documentType: documentTypeSelect.value,
            // Collect other form fields
        };

        fetch('/api/invoices', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus('Invoice saved successfully', 'success');
                resetForm();
            } else {
                throw new Error(data.error || 'Failed to save invoice');
            }
        })
        .catch(error => {
            showStatus('Error saving invoice: ' + error.message, 'error');
        });
    }

    function resetForm() {
        document.getElementById('invoice-form').reset();
        document.getElementById('pdf-canvas').getContext('2d').clearRect(0, 0, 
            document.getElementById('pdf-canvas').width, 
            document.getElementById('pdf-canvas').height);
        pdfDocument = null;
    }

    function showStatus(message, type) {
        const statusElement = document.getElementById('form-status');
        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;
    }
});