import { sanitizeHTML } from './utils.js';

export const elements = {}; 

export function initUI(callbacks) {
    elements.loginContainer = document.getElementById('login-container');
    elements.mainContainer = document.getElementById('main-container');
    elements.loginForm = document.getElementById('login-form');
    elements.usernameInput = document.getElementById('username');
    elements.passwordInput = document.getElementById('password');
    elements.loginError = document.getElementById('login-error');
    elements.logoutLink = document.getElementById('logout-link');
    elements.startBtn = document.getElementById('start-new-record-button');

    elements.cardsContainer = document.getElementById('cards-container');
    
    elements.captureModal = document.getElementById('capture-modal');
    elements.scannerView = document.getElementById('scanner-view');
    elements.validationView = document.getElementById('validation-view');
    elements.confidenceModal = document.getElementById('confidence-modal');
    elements.imageModal = document.getElementById('image-modal');
    elements.viewerImage = document.getElementById('viewer-image');
    
    elements.videoFeed = document.getElementById('video-feed');
    elements.overlay = document.getElementById('overlay');
    elements.statusMessage = document.getElementById('status-message');
    elements.loader = document.getElementById('loader');
    
    elements.captureBtn = document.getElementById('capture-btn');
    elements.cancelBtn = document.getElementById('cancel-button');
    elements.saveBtn = document.getElementById('save-button');
    elements.retryScanBtn = document.getElementById('retry-scan-button');
    elements.acceptScanBtn = document.getElementById('accept-scan-button');
    elements.closeImageBtn = document.getElementById('close-image-btn');

    elements.qrUrlInput = document.getElementById('qr-url');
    elements.nameAddressInput = document.getElementById('name-address');
    elements.notesInput = document.getElementById('record-notes');
    elements.confidenceTitle = document.getElementById('confidence-title');
    elements.confidenceTextPreview = document.getElementById('confidence-text-preview');

    elements.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        callbacks.onLogin(elements.usernameInput.value, elements.passwordInput.value);
    });
    elements.logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        callbacks.onLogout();
    });
    elements.startBtn.addEventListener('click', callbacks.onStartScan);

    elements.cancelBtn.addEventListener('click', callbacks.onCancelScan);
    elements.captureBtn.addEventListener('click', callbacks.onCaptureAddress);
    elements.retryScanBtn.addEventListener('click', callbacks.onRetryScan);
    elements.acceptScanBtn.addEventListener('click', callbacks.onAcceptScan);
    elements.saveBtn.addEventListener('click', callbacks.onSaveRecord);
    
    elements.closeImageBtn.addEventListener('click', () => {
        elements.imageModal.classList.add('hidden');
    });
}

export function showMainApp() {
    elements.loginContainer.classList.add('hidden');
    elements.mainContainer.classList.remove('hidden');
    elements.loginError.classList.add('hidden');
}

export function showLogin(errorMessage = null) {
    elements.loginContainer.classList.remove('hidden');
    elements.mainContainer.classList.add('hidden');
    elements.loginForm.reset();
    if (errorMessage) {
        elements.loginError.textContent = errorMessage;
        elements.loginError.classList.remove('hidden');
    }
}

export function setStartButtonReady() {
    elements.startBtn.disabled = false;
    elements.startBtn.textContent = '➕ Start New Record';
}

export function renderRecords(records, callbacks) {
    elements.cardsContainer.innerHTML = '';
    
    if (records.length === 0) {
        elements.cardsContainer.innerHTML = '<p style="text-align: center; color: var(--dark-gray); padding: 40px 20px;">No records scanned yet.</p>';
        return;
    }

    records.forEach((record) => {
        const safeUrl = sanitizeHTML(record.qr_url || '#');
        const displayUrl = sanitizeHTML(record.qr_url || 'N/A');
        const safeAddress = sanitizeHTML(record.address_text || '');
        
        const updatedBy = sanitizeHTML(record.mod_user || 'System');
        const lastUpdated = record.mod_date ? new Date(record.mod_date).toLocaleString() : 'N/A';
        const status = sanitizeHTML(record.status || 'PENDING');
        const notes = sanitizeHTML(record.notes || '');
        
        const card = document.createElement('div');
        card.className = 'record-card';
        
        card.innerHTML = `
            <div class="card-images-section">
                ${record.address_image_src ? `
                    <div class="card-large-thumb-wrapper address-thumb-wrapper" title="Tap to expand Address scan">
                        <img src="${sanitizeHTML(record.address_image_src)}" alt="Address Scan Source">
                    </div>
                ` : ''}
                ${record.qr_image_src ? `
                    <div class="card-large-thumb-wrapper qr-thumb-wrapper" title="Tap to expand QR scan">
                        <img src="${sanitizeHTML(record.qr_image_src)}" alt="QR Code Scan Source">
                    </div>
                ` : ''}
            </div>

            <div class="card-data-section">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                    <div style="flex: 1;">
                        <span class="card-label">Extracted Address</span>
                        <div class="card-address">${safeAddress.replace(/\n/g, '<br>')}</div>
                    </div>
                    <span class="status-badge status-${status}">${status}</span>
                </div>
                
                <hr class="card-separator">
                
                <div class="card-url-wrapper">
                    <span class="card-label">Extracted URL/ID</span>
                    <div class="card-url"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${displayUrl}</a></div>
                </div>

                ${notes ? `<div class="card-notes">📝 ${notes}</div>` : ''}
                
                <div class="card-metadata-actions">
                    <div class="card-metadata">
                        <span class="metadata-item" title="Last Updated By">👤 ${updatedBy}</span>
                        <span class="metadata-item" title="Last Updated Timestamp">📅 ${lastUpdated}</span>
                    </div>

                    <div class="card-actions">
                        <button class="icon-btn edit-btn" title="Edit Record"><span class="btn-icon">✏️</span> Edit</button>
                        <button class="icon-btn delete-btn" title="Delete Record"><span class="btn-icon">🗑️</span> Delete</button>
                    </div>
                </div>
            </div>
        `;

        const addressImg = card.querySelector('.address-thumb-wrapper img');
        if (addressImg) {
            addressImg.addEventListener('click', () => callbacks.onViewImage(record.address_image_src));
        }

        const qrImg = card.querySelector('.qr-thumb-wrapper img');
        if (qrImg) {
            qrImg.addEventListener('click', () => callbacks.onViewImage(record.qr_image_src));
        }

        card.querySelector('.edit-btn').addEventListener('click', () => callbacks.onEditRecord(record));
        card.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this record?')) {
                callbacks.onDeleteRecord(record.id);
            }
        });

        elements.cardsContainer.appendChild(card);
    });
}

export function setScannerOverlay(type) {
    if (type === 'address') {
        elements.statusMessage.textContent = '1. Scan Name & Address';
        elements.overlay.style.width = '90%';
        elements.overlay.style.height = '40%';
        elements.captureBtn.classList.remove('hidden');
    } else if (type === 'qr') {
        elements.statusMessage.textContent = '2. Scan QR Code';
        elements.overlay.style.width = '65%';
        elements.overlay.style.height = '50%';
        elements.captureBtn.classList.add('hidden');
    }
}

export function setFocusState(isFocused) {
    if (isFocused) {
        elements.overlay.classList.add('in-focus');
    } else {
        elements.overlay.classList.remove('in-focus');
    }
}

export function showLoader(show) {
    if (show) {
        elements.loader.classList.remove('hidden');
        elements.captureBtn.classList.add('hidden');
    } else {
        elements.loader.classList.add('hidden');
    }
}