window.addEventListener('DOMContentLoaded', () => {
    const App = {
        config: {
            apiUrl: '/api', // Relative path because it's served by the same Node server
            sharpnessThreshold: 40,
            stabilityThreshold: 4, 
            ocrConfidenceThreshold: 65,
            states: {
                IDLE: 'idle', SCANNING_ADDRESS: 'scanning_address', SCANNING_QR: 'scanning_qr', VALIDATING: 'validating'
            }
        },

        state: {
            allRecords: [], currentRecord: {}, captureState: 'idle', autoCaptureEnabled: true, stream: null, scanInterval: null, tesseractWorker: null,
        },

        ui: {
            startBtn: document.getElementById('start-new-record-button'),
            copyBtn: document.getElementById('copy-table-button'),
            tableBody: document.querySelector('#data-table tbody'),
            modal: document.getElementById('capture-modal'),
            video: document.getElementById('video-feed'),
            frameCanvas: document.getElementById('frame-canvas'),
            overlay: document.getElementById('overlay'),
            statusMessage: document.getElementById('status-message'),
            loader: document.getElementById('loader'),
            captureBtn: document.getElementById('capture-btn'),
            saveBtn: document.getElementById('save-button'),
            cancelBtn: document.getElementById('cancel-button'),
            scannerView: document.getElementById('scanner-view'),
            validationView: document.getElementById('validation-view'),
            qrUrlInput: document.getElementById('qr-url'),
            nameAddressInput: document.getElementById('name-address'),
            confidenceModal: document.getElementById('confidence-modal'),
            confidenceTitle: document.getElementById('confidence-title'),
            confidenceTextPreview: document.getElementById('confidence-text-preview'),
            retryScanButton: document.getElementById('retry-scan-button'),
            acceptScanButton: document.getElementById('accept-scan-button'),
            deleteAllLink: document.getElementById('delete-all-link'),
            loginForm: document.getElementById('login-form'),
            logoutLink: document.getElementById('logout-link')
        },

        async init() {
            this.bindEvents();
            if (this.auth.token) {
                document.getElementById('login-container').classList.add('hidden');
                document.getElementById('main-container').classList.remove('hidden');
                await this.loadEnginesAndData();
            }
        },
        
        async loadEnginesAndData() {
            try {
                await this.store.load();
                if(!this.state.tesseractWorker) {
                    this.state.tesseractWorker = await Tesseract.createWorker('eng');
                }
                this.ui.startBtn.disabled = false;
                this.ui.startBtn.textContent = '➕ Start New Record';
            } catch (error) {
                console.error("Initialization failed:", error);
            }
        },

        auth: {
            token: sessionStorage.getItem('jwt_token') || null,
            
            async login(username, password) {
                try {
                    const res = await fetch(`${App.config.apiUrl}/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await res.json();
                    
                    if (!res.ok) throw new Error(data.error);
                    
                    this.token = data.token;
                    sessionStorage.setItem('jwt_token', this.token);
                    
                    document.getElementById('login-container').classList.add('hidden');
                    document.getElementById('main-container').classList.remove('hidden');
                    await App.loadEnginesAndData();
                } catch (err) {
                    const errorEl = document.getElementById('login-error');
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
            },
            
            logout() {
                this.token = null;
                sessionStorage.removeItem('jwt_token');
                document.getElementById('login-container').classList.remove('hidden');
                document.getElementById('main-container').classList.add('hidden');
                document.getElementById('login-error').classList.add('hidden');
                App.ui.loginForm.reset();
            },

            getHeaders() {
                return {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                };
            }
        },

        bindEvents() {
            this.ui.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.auth.login(document.getElementById('username').value, document.getElementById('password').value);
            });
            this.ui.logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.auth.logout();
            });
            this.ui.startBtn.addEventListener('click', () => this.workflows.startNewRecord());
            this.ui.cancelBtn.addEventListener('click', () => this.workflows.closeModal());
            this.ui.captureBtn.addEventListener('click', () => this.workflows.handleManualAddressCapture());
            this.ui.saveBtn.addEventListener('click', () => this.store.saveRecord());
            this.ui.copyBtn.addEventListener('click', () => this.utils.copyTableToClipboard());
            this.ui.retryScanButton.addEventListener('click', () => this.workflows.handleRetry());
            this.ui.acceptScanButton.addEventListener('click', () => this.workflows.handleAccept());
            this.ui.deleteAllLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.store.deleteAllRecords();
            });
            this.ui.tableBody.addEventListener('click', (e) => {
                const target = e.target.closest('.delete-icon');
                if (target) {
                    const id = Number(target.dataset.id);
                    this.store.deleteRecord(id);
                }
            });
        },

        workflows: {
            startNewRecord() {
                App.state.currentRecord = {};
                App.ui.modal.classList.remove('hidden');
                App.scanner.startCamera(App.config.states.SCANNING_ADDRESS);
            },
            closeModal() {
                App.scanner.stopCamera();
                App.ui.modal.classList.add('hidden');
                App.state.captureState = App.config.states.IDLE;
            },
            async handleManualAddressCapture() {
                if (App.state.scanInterval) clearInterval(App.state.scanInterval);
                App.ui.loader.classList.remove('hidden');
                App.ui.captureBtn.classList.add('hidden');
                App.ui.video.pause();
                
                const imageSrc = App.utils.captureSnippet();
                App.state.currentRecord.addressImageSrc = imageSrc;

                try {
                    const { data } = await App.state.tesseractWorker.recognize(imageSrc);
                    if (data.confidence < App.config.ocrConfidenceThreshold) {
                        App.state.currentRecord.ocrResult = data;
                        App.ui.loader.classList.add('hidden');
                        App.ui.confidenceTitle.textContent = `Low Scan Quality (${Math.round(data.confidence)}% Confidence)`;
                        App.ui.confidenceTextPreview.textContent = data.text;
                        App.ui.confidenceModal.classList.remove('hidden');
                    } else {
                        const { name, address } = App.utils.parseUSAddress(data.text);
                        App.state.currentRecord.name = name;
                        App.state.currentRecord.address = address;
                        App.scanner.startCamera(App.config.states.SCANNING_QR);
                    }
                } catch (error) {
                    console.error("OCR Error:", error);
                    alert('Error during OCR processing. Please try again.');
                    this.handleRetry();
                }
            },
            handleRetry() {
                App.ui.confidenceModal.classList.add('hidden');
                App.state.currentRecord.ocrResult = null;
                App.scanner.startCamera(App.config.states.SCANNING_ADDRESS);
            },
            handleAccept() {
                App.ui.confidenceModal.classList.add('hidden');
                const { name, address } = App.utils.parseUSAddress(App.state.currentRecord.ocrResult.text);
                App.state.currentRecord.name = name;
                App.state.currentRecord.address = address;
                App.state.currentRecord.ocrResult = null;
                App.scanner.startCamera(App.config.states.SCANNING_QR);
            },
            showValidation() {
                App.state.captureState = App.config.states.VALIDATING;
                App.scanner.stopCamera();
                App.ui.scannerView.classList.add('hidden');
                App.ui.validationView.classList.remove('hidden');
                App.ui.qrUrlInput.value = App.state.currentRecord.qrUrl || '';
                App.ui.nameAddressInput.value = `${App.state.currentRecord.name || ''}\n${App.state.currentRecord.address || ''}`.trim();
            }
        },

        scanner: {
            async startCamera(newState) {
                App.state.captureState = newState;
                App.ui.validationView.classList.add('hidden');
                App.ui.scannerView.classList.remove('hidden');
                App.ui.loader.classList.add('hidden');

                if (!App.state.stream) {
                    try {
                        App.state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                        App.ui.video.srcObject = App.state.stream;
                        await App.ui.video.play();
                    } catch (err) {
                        console.error("Camera access denied:", err);
                        alert("Could not access camera. Please grant permission.");
                        return App.workflows.closeModal();
                    }
                } else if (App.ui.video.paused) {
                    await App.ui.video.play();
                }

                if (newState === App.config.states.SCANNING_ADDRESS) {
                    this.startAddressScan();
                } else if (newState === App.config.states.SCANNING_QR) {
                    this.startQRScan();
                }
            },
            stopCamera() {
                if (App.state.stream) {
                    App.state.stream.getTracks().forEach(track => track.stop());
                }
                if (App.state.scanInterval) {
                    clearInterval(App.state.scanInterval);
                }
                App.state.stream = null;
                App.state.scanInterval = null;
            },
            startAddressScan() {
                App.utils.updateOverlay('address');
                App.ui.captureBtn.classList.remove('hidden');
                App.state.stabilityCounter = 0;
                if (App.state.autoCaptureEnabled) App.ui.statusMessage.textContent = 'Looking for clear text...';

                App.state.scanInterval = setInterval(() => {
                    if (!App.state.stream || App.ui.video.paused) return;
                    const sharpness = App.utils.calculateSharpness();
                    if (sharpness > App.config.sharpnessThreshold) {
                        App.ui.overlay.classList.add('in-focus');
                        App.state.stabilityCounter++;
                        if (App.state.autoCaptureEnabled && App.state.stabilityCounter >= App.config.stabilityThreshold) {
                            App.workflows.handleManualAddressCapture();
                        }
                    } else {
                        App.ui.overlay.classList.remove('in-focus');
                        App.state.stabilityCounter = 0;
                    }
                }, 200);
            },
            startQRScan() {
                App.utils.updateOverlay('qr');
                App.ui.captureBtn.classList.add('hidden');

                App.state.scanInterval = setInterval(() => {
                    if (!App.state.stream || App.ui.video.paused) return;

                    const { context, width, height } = App.utils.drawFrameToCanvas();
                    const imageData = context.getImageData(0, 0, width, height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code) {
                        App.state.currentRecord.qrUrl = code.data;
                        App.state.currentRecord.qrImageSrc = App.utils.captureSnippet();
                        App.workflows.showValidation();
                    }
                }, 200);
            }
        },
        
        store: {
            async load() {
                try {
                    const res = await fetch(`${App.config.apiUrl}/scans`, { headers: App.auth.getHeaders() });
                    if (res.status === 401 || res.status === 403) return App.auth.logout();
                    App.state.allRecords = await res.json();
                    this.renderTable();
                } catch (err) {
                    console.error("Failed to load records:", err);
                }
            },
            async saveRecord() {
                const [name, ...addressParts] = App.ui.nameAddressInput.value.split('\n');
                const rawUrl = App.ui.qrUrlInput.value.trim();
                const generatedId = rawUrl.split('/').pop() || `QR-${Date.now()}`; 

                const payload = {
                    qr_code_id: generatedId,
                    qr_url: rawUrl,
                    address_text: `${name.trim()}\n${addressParts.join('\n').trim()}`,
                    qr_image_src: App.state.currentRecord.qrImageSrc,
                    address_image_src: App.state.currentRecord.addressImageSrc
                };

                try {
                    const res = await fetch(`${App.config.apiUrl}/scans`, {
                        method: 'POST',
                        headers: App.auth.getHeaders(),
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) {
                        await this.load(); 
                        App.workflows.closeModal();
                    }
                } catch (err) {
                    console.error("Failed to save:", err);
                    alert("Error saving to database.");
                }
            },
            async deleteRecord(id) {
                if (!confirm('Are you sure you want to delete this record?')) return;
                try {
                    await fetch(`${App.config.apiUrl}/scans/${id}`, {
                        method: 'DELETE',
                        headers: App.auth.getHeaders()
                    });
                    await this.load();
                } catch (err) {
                    console.error("Failed to delete:", err);
                }
            },
            async deleteAllRecords() {
                if (!confirm('Are you sure you want to delete all records?')) return;
                try {
                    await fetch(`${App.config.apiUrl}/scans`, {
                        method: 'DELETE',
                        headers: App.auth.getHeaders()
                    });
                    await this.load();
                } catch (err) {
                    console.error("Failed to clear data:", err);
                }
            },
            renderTable() {
                App.ui.tableBody.innerHTML = '';
                App.state.allRecords.forEach((record) => {
                    const row = App.ui.tableBody.insertRow();
                    const safeUrl = App.utils.sanitizeHTML(record.qr_url || '#');
                    const displayUrl = App.utils.sanitizeHTML(record.qr_url || 'N/A');
                    const safeAddress = App.utils.sanitizeHTML(record.address_text || '').replace(/\n/g, '<br>');
                    
                    row.innerHTML = `
                        <td>
                            <div class="image-cell">
                                ${record.qr_image_src ? `<img src="${App.utils.sanitizeHTML(record.qr_image_src)}" alt="QR Code Snippet">` : ''}
                            </div>
                        </td>
                        <td>${safeAddress}</td>
                        <td><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${displayUrl}</a></td>
                        <td><span class="delete-icon" data-id="${record.id}" title="Delete Record">🗑️</span></td>
                    `;
                });
            }
        },

        utils: {
            sanitizeHTML(str) {
                const temp = document.createElement('div');
                temp.textContent = str;
                return temp.innerHTML;
            },
            updateOverlay(type) {
                const { overlay, statusMessage } = App.ui;
                switch (type) {
                    case 'address':
                        statusMessage.textContent = '1. Scan Name & Address';
                        overlay.style.width = '90%'; overlay.style.height = '40%';
                        break;
                    case 'qr':
                        statusMessage.textContent = '2. Scan QR Code';
                        overlay.style.width = '65%'; overlay.style.height = '50%';
                        break;
                }
            },
            calculateSharpness() {
                const { context, width, height } = this.drawSnippetToCanvas();
                const imageData = context.getImageData(0, 0, width, height);
                const gray = new Uint8ClampedArray(width * height);
                for (let i = 0; i < imageData.data.length; i += 4) {
                    gray[i / 4] = 0.299 * imageData.data[i] + 0.587 * imageData.data[i+1] + 0.114 * imageData.data[i+2];
                }
                let sum = 0, sumSq = 0;
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const i = y * width + x;
                        const laplace = gray[i] * 4 - (gray[i-1] + gray[i+1] + gray[i-width] + gray[i+width]);
                        sum += laplace;
                        sumSq += laplace * laplace;
                    }
                }
                const n = (width - 2) * (height - 2);
                if (n === 0) return 0;
                const mean = sum / n;
                return (sumSq / n) - (mean * mean);
            },
            drawFrameToCanvas() {
                const { video, frameCanvas } = App.ui;
                const context = frameCanvas.getContext('2d', { willReadFrequently: true });
                frameCanvas.width = video.videoWidth;
                frameCanvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
                return { context, width: frameCanvas.width, height: frameCanvas.height };
            },
            drawSnippetToCanvas() {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                const { video, overlay } = App.ui;
                const videoRect = video.getBoundingClientRect();
                const overlayRect = overlay.getBoundingClientRect();
                const scaleX = video.videoWidth / videoRect.width;
                const scaleY = video.videoHeight / videoRect.height;
                const sWidth = overlayRect.width * scaleX;
                const sHeight = overlayRect.height * scaleY;
                const sx = (overlayRect.left - videoRect.left) * scaleX;
                const sy = (overlayRect.top - videoRect.top) * scaleY;
                canvas.width = sWidth;
                canvas.height = sHeight;
                context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
                return { canvas, context, width: sWidth, height: sHeight };
            },
            captureSnippet() {
                const { canvas } = this.drawSnippetToCanvas();
                return canvas.toDataURL('image/jpeg', 0.6); 
            },
            parseUSAddress(text) {
                const lines = text.split('\n').map(line => line.replace(/[^a-zA-Z0-9\s\-#.,\/]/g, '').trim()).filter(line => line.length > 1);
                if (lines.length === 0) return { name: '', address: 'Could not read.' };
                if (/^\d/.test(lines[0])) return { name: '', address: lines.join('\n') };
                return { name: lines[0] || '', address: lines.slice(1).join('\n') || '' };
            },
            copyTableToClipboard() {
                if (App.state.allRecords.length === 0) return alert("Table is empty.");
                const table = App.ui.tableBody.parentElement.cloneNode(true);
                table.querySelector('thead tr').lastElementChild.remove();
                table.querySelectorAll('tbody tr').forEach(row => row.lastElementChild.remove());
                table.setAttribute('style', 'border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 14px;');
                table.querySelectorAll('th, td').forEach(cell => cell.setAttribute('style', 'border: 1px solid #ddd; text-align: left; padding: 8px; vertical-align: middle;'));
                table.querySelectorAll('th').forEach(th => th.setAttribute('style', 'border: 1px solid #ddd; text-align: left; padding: 8px; background-color: #f2f2f2;'));
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(table);
                document.body.appendChild(tempDiv);
                const range = document.createRange();
                range.selectNode(tempDiv);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                try {
                    document.execCommand('copy');
                    alert('Table copied successfully!');
                } catch (err) {
                    alert('Error copying table.');
                }
                document.body.removeChild(tempDiv);
                window.getSelection().removeAllRanges();
            }
        }
    };
    
    App.init();
});