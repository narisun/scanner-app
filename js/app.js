window.addEventListener('load', () => {
    
    const App = {
        config: {
            localStorageKey: 'labelMappings',
            sharpnessThreshold: 40,
            stabilityThreshold: 4, 
            ocrConfidenceThreshold: 65,
            states: {
                IDLE: 'idle',
                SCANNING_ADDRESS: 'scanning_address',
                SCANNING_QR: 'scanning_qr',
                VALIDATING: 'validating'
            }
        },

        state: {
            allRecords: [],
            currentRecord: {},
            captureState: 'idle',
            autoCaptureEnabled: false,
            stream: null,
            scanInterval: null,
            tesseractWorker: null,
        },

        ui: {
            startBtn: document.getElementById('start-new-record-button'),
            autoCaptureToggle: document.getElementById('auto-capture-toggle'),
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
        },

        async init() {
            this.ui.startBtn.disabled = true;
            this.ui.startBtn.textContent = 'Loading Engine...';
            this.store.load();
            this.bindEvents();
            this.state.tesseractWorker = await Tesseract.createWorker();
            await this.state.tesseractWorker.loadLanguage('eng');
            await this.state.tesseractWorker.initialize('eng');
            this.ui.startBtn.disabled = false;
            this.ui.startBtn.textContent = '➕ Start New Record';
        },

        bindEvents() {
            this.ui.startBtn.addEventListener('click', () => this.workflows.startNewRecord());
            this.ui.autoCaptureToggle.addEventListener('change', (e) => this.state.autoCaptureEnabled = e.target.checked);
            this.ui.cancelBtn.addEventListener('click', () => this.workflows.closeModal());
            this.ui.captureBtn.addEventListener('click', () => this.workflows.handleManualAddressCapture());
            this.ui.saveBtn.addEventListener('click', () => this.store.saveRecord());
            this.ui.copyBtn.addEventListener('click', () => this.utils.copyTableToClipboard());
            this.ui.retryScanButton.addEventListener('click', () => this.workflows.handleRetry());
            this.ui.acceptScanButton.addEventListener('click', () => this.workflows.handleAccept());
            this.ui.tableBody.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-icon')) {
                    this.store.deleteRecord(parseInt(e.target.dataset.index, 10));
                }
            });
            this.ui.tableBody.addEventListener('blur', (e) => this.store.handleTableEdit(e), true);
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

                App.state.scanInterval = setInterval(async () => {
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
                        // ** THE FIX IS HERE **
                        App.state.currentRecord.qrUrl = code.data;
                        App.state.currentRecord.qrImageSrc = App.utils.captureSnippet(); // Capture the QR image
                        App.workflows.showValidation();
                    }
                }, 200);
            }
        },
        
        store: {
            load() {
                const stored = JSON.parse(localStorage.getItem(App.config.localStorageKey));
                if (stored && stored.records) {
                    App.state.allRecords = stored.records;
                    this.renderTable();
                }
            },
            save() {
                localStorage.setItem(App.config.localStorageKey, JSON.stringify({ records: App.state.allRecords }));
            },
            saveRecord() {
                const [name, ...addressParts] = App.ui.nameAddressInput.value.split('\n');
                App.state.currentRecord.name = name.trim();
                App.state.currentRecord.address = addressParts.join('\n').trim();
                App.state.currentRecord.qrUrl = App.ui.qrUrlInput.value.trim();
                App.state.allRecords.push(App.state.currentRecord);
                this.save();
                this.renderTable();
                App.workflows.closeModal();
            },
            deleteRecord(index) {
                if (confirm('Are you sure you want to delete this record?')) {
                    App.state.allRecords.splice(index, 1);
                    this.save();
                    this.renderTable();
                }
            },
            handleTableEdit(e) {
                if (e.target.classList.contains('editable-cell')) {
                    const index = parseInt(e.target.dataset.index, 10);
                    const content = e.target.innerHTML.replace(/<br\s*[\/]?>/gi, "\n"); 
                    const [name, ...addressParts] = content.split('\n');
                    App.state.allRecords[index].name = name.trim();
                    App.state.allRecords[index].address = addressParts.join('\n').trim();
                    this.save();
                }
            },
            renderTable() {
                App.ui.tableBody.innerHTML = '';
                App.state.allRecords.forEach((record, index) => {
                    const row = App.ui.tableBody.insertRow();
                    row.innerHTML = `
                        <td><a href="${record.qrUrl || '#'}" target="_blank">${record.qrUrl || 'N/A'}</a></td>
                        <td class="editable-cell" contenteditable="true" data-index="${index}">${record.name}<br>${record.address.replace(/\n/g, '<br>')}</td>
                        <td>
                            <div class="image-cell">
                                <img src="${record.addressImageSrc || ''}" alt="Address Snippet">
                                <img src="${record.qrImageSrc || ''}" alt="QR Code Snippet">
                            </div>
                        </td>
                        <td><span class="delete-icon" data-index="${index}">🗑️</span></td>
                    `;
                });
            }
        },

        utils: {
            updateOverlay(type) {
                const { overlay, statusMessage } = App.ui;
                switch (type) {
                    case 'address':
                        statusMessage.textContent = '1. Scan Name & Address';
                        overlay.style.width = '90%';
                        overlay.style.height = '40%';
                        break;
                    case 'qr':
                        statusMessage.textContent = '2. Scan QR Code';
                        overlay.style.width = '65%';
                        overlay.style.height = '50%';
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
                return canvas.toDataURL('image/jpeg', 0.7);
            },
            parseUSAddress(text) {
                const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 2);
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