import { API } from './api.js';
import { ScannerService } from './scanner.js';
import { captureSnippet, parseUSAddress } from './utils.js';
import { 
    elements, initUI, showMainApp, showLogin, 
    setStartButtonReady, renderRecords, setScannerOverlay, 
    setFocusState, showLoader 
} from './ui.js';

const appState = {
    records: [],
    currentRecord: {}
};

const scanner = new ScannerService();

document.addEventListener('DOMContentLoaded', async () => {
    initUI({
        onLogin: handleLogin,
        onLogout: handleLogout,
        onStartScan: startNewRecord,
        onCancelScan: closeModal,
        onCaptureAddress: handleAddressCapture,
        onRetryScan: handleRetryScan,
        onAcceptScan: handleAcceptScan,
        onSaveRecord: saveRecord,
        onDeleteRecord: handleDeleteRecord,
        onEditRecord: handleEditRecord,
        onViewImage: handleViewImage
    });

    if (sessionStorage.getItem('jwt_token')) {
        showMainApp();
        await loadInitialData();
    } else {
        showLogin();
    }
});

async function handleLogin(username, password) {
    try {
        const data = await API.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        sessionStorage.setItem('jwt_token', data.token);
        sessionStorage.setItem('orgname', data.orgname || 'Unknown Organization');
        sessionStorage.setItem('username', data.username || 'User');
        
        showMainApp();
        await loadInitialData();
    } catch (error) {
        alert(error.message);
    }
}

function handleLogout() {
    sessionStorage.removeItem('jwt_token');
    sessionStorage.removeItem('orgname');
    sessionStorage.removeItem('username');
    showLogin();
}

async function loadInitialData() {
    try {
        await scanner.initTesseract(); 
        setStartButtonReady();

        const orgHeader = document.getElementById('org-header');
        if (orgHeader) {
            orgHeader.textContent = sessionStorage.getItem('orgname');
        }

        const usernameDisplay = document.getElementById('logged-in-username');
        if (usernameDisplay) {
            usernameDisplay.textContent = `👤 ${sessionStorage.getItem('username')}`;
        }

        appState.records = await API.request('/scans');
        renderRecords(appState.records, {
            onDeleteRecord: handleDeleteRecord,
            onEditRecord: handleEditRecord,
            onViewImage: handleViewImage
        }); 
    } catch (error) {
        console.error("Failed to load initial data:", error);
    }
}

async function startNewRecord() {
    appState.currentRecord = {};
    elements.captureModal.classList.remove('hidden');
    elements.scannerView.classList.remove('hidden');
    elements.validationView.classList.add('hidden');
    
    await scanner.startCamera(elements.videoFeed);
    startAddressPhase();
}

function startAddressPhase() {
    setScannerOverlay('address');
    showLoader(false);
    
    scanner.startAddressScan(elements.videoFeed, elements.overlay, {
        onFocusChange: (isFocused) => setFocusState(isFocused)
    });
}

async function handleAddressCapture() {
    scanner.stopScanInterval();
    elements.videoFeed.pause();
    showLoader(true);

    const imageSrc = captureSnippet(elements.videoFeed, elements.overlay);
    appState.currentRecord.addressImageSrc = imageSrc;

    try {
        const data = await scanner.processAddressScan(imageSrc);
        
        if (data.confidence < 65) {
            appState.currentRecord.ocrResult = data;
            showLoader(false);
            elements.confidenceTitle.textContent = `Low Scan Quality (${Math.round(data.confidence)}% Confidence)`;
            elements.confidenceTextPreview.textContent = data.text;
            elements.confidenceModal.classList.remove('hidden');
        } else {
            acceptParsedText(data.text);
        }
    } catch (err) {
        alert('Error processing scan. Please try again.');
        handleRetryScan();
    }
}

function handleRetryScan() {
    elements.confidenceModal.classList.add('hidden');
    appState.currentRecord.ocrResult = null;
    elements.videoFeed.play();
    startAddressPhase();
}

function handleAcceptScan() {
    elements.confidenceModal.classList.add('hidden');
    acceptParsedText(appState.currentRecord.ocrResult.text);
}

function acceptParsedText(text) {
    const { name, address } = parseUSAddress(text);
    appState.currentRecord.name = name;
    appState.currentRecord.address = address;
    appState.currentRecord.ocrResult = null;
    
    elements.videoFeed.play();
    startQRPhase();
}

function startQRPhase() {
    setScannerOverlay('qr');
    showLoader(false);

    scanner.startQRScan(elements.videoFeed, {
        onQRDetected: (qrUrl) => {
            appState.currentRecord.qrUrl = qrUrl;
            appState.currentRecord.qrImageSrc = captureSnippet(elements.videoFeed, elements.overlay);
            showValidationView();
        }
    });
}

function showValidationView() {
    scanner.stopCamera();
    elements.scannerView.classList.add('hidden');
    elements.validationView.classList.remove('hidden');
    
    elements.qrUrlInput.value = appState.currentRecord.qrUrl || '';
    elements.nameAddressInput.value = `${appState.currentRecord.name || ''}\n${appState.currentRecord.address || ''}`.trim();
    elements.notesInput.value = appState.currentRecord.notes || '';
}

function handleEditRecord(record) {
    appState.currentRecord = { ...record };
    
    elements.qrUrlInput.value = record.qr_url || '';
    elements.nameAddressInput.value = record.address_text || '';
    elements.notesInput.value = record.notes || '';
    
    elements.scannerView.classList.add('hidden');
    elements.validationView.classList.remove('hidden');
    elements.captureModal.classList.remove('hidden');
}

function handleViewImage(imageSrc) {
    elements.viewerImage.src = imageSrc;
    elements.imageModal.classList.remove('hidden');
}

async function saveRecord() {
    const [name, ...addressParts] = elements.nameAddressInput.value.split('\n');
    const rawUrl = elements.qrUrlInput.value.trim();
    const notesText = elements.notesInput.value.trim();
    
    const isEdit = !!appState.currentRecord.id;
    const method = isEdit ? 'PUT' : 'POST';
    const endpoint = isEdit ? `/scans/${appState.currentRecord.id}` : '/scans';
    
    const payload = {
        qr_url: rawUrl,
        address_text: `${name.trim()}\n${addressParts.join('\n').trim()}`,
        notes: notesText,
        ...(isEdit && { status: appState.currentRecord.status }), 
        qr_image_src: appState.currentRecord.qr_image_src || appState.currentRecord.qrImageSrc,
        address_image_src: appState.currentRecord.address_image_src || appState.currentRecord.addressImageSrc
    };

    try {
        await API.request(endpoint, {
            method: method,
            body: JSON.stringify(payload)
        });
        
        closeModal();
        appState.records = await API.request('/scans');
        
        renderRecords(appState.records, {
            onDeleteRecord: handleDeleteRecord,
            onEditRecord: handleEditRecord,
            onViewImage: handleViewImage
        });
    } catch (err) {
        alert("Error saving to database: " + err.message);
    }
}

function closeModal() {
    scanner.stopCamera();
    elements.captureModal.classList.add('hidden');
    elements.confidenceModal.classList.add('hidden');
}

async function handleDeleteRecord(id) {
    try {
        await API.request(`/scans/${id}`, { method: 'DELETE' });
        appState.records = appState.records.filter(record => record.id !== id);
        renderRecords(appState.records, {
            onDeleteRecord: handleDeleteRecord,
            onEditRecord: handleEditRecord,
            onViewImage: handleViewImage
        });
    } catch (error) {
        alert('Failed to delete record: ' + error.message);
    }
}

window.addEventListener('auth-expired', handleLogout);