import { calculateSharpness, drawFrameToCanvas } from './utils.js';

export class ScannerService {
    constructor() {
        this.stream = null;
        this.scanInterval = null;
        this.tesseractWorker = null;
    }

    /**
     * Initializes the Tesseract OCR engine with strict parameters 
     * optimized for US Shipping Labels.
     */
    async initTesseract() {
        if (!this.tesseractWorker) {
            this.tesseractWorker = await Tesseract.createWorker('eng');
            
            await this.tesseractWorker.setParameters({
                // PSM 6: Treat the image as a single uniform block of text. 
                // Prevents the engine from misinterpreting barcodes or logos.
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, 
                // Strict whitelist to prevent hallucinations of special characters
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.,# '
            });
        }
    }

    async startCamera(videoElement) {
        if (!this.stream) {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            videoElement.srcObject = this.stream;
        }
        await videoElement.play();
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.stopScanInterval();
    }

    stopScanInterval() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    /**
     * Monitors the video feed for image sharpness to provide focus feedback.
     */
    startAddressScan(videoElement, overlayElement, callbacks) {
        this.stopScanInterval();

        this.scanInterval = setInterval(() => {
            if (!this.stream || videoElement.paused) return;
            
            const sharpness = calculateSharpness(videoElement, overlayElement);
            
            // Suggest optimal capture time when Laplacian variance exceeds 40
            callbacks.onFocusChange(sharpness > 40);
        }, 200);
    }

    /**
     * Continuously scans the video feed for QR codes using jsQR.
     */
    startQRScan(videoElement, callbacks) {
        this.stopScanInterval();

        this.scanInterval = setInterval(() => {
            if (!this.stream || videoElement.paused) return;

            const canvas = document.createElement('canvas');
            const { context, width, height } = drawFrameToCanvas(videoElement, canvas);
            const imageData = context.getImageData(0, 0, width, height);
            
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                this.stopScanInterval();
                callbacks.onQRDetected(code.data);
            }
        }, 200);
    }

    async processAddressScan(imageSrc) {
        const { data } = await this.tesseractWorker.recognize(imageSrc);
        return data;
    }
}