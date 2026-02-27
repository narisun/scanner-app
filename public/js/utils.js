export function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

export function drawFrameToCanvas(video, canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { context, width: canvas.width, height: canvas.height };
}

export function drawSnippetToCanvas(video, overlay) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
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
}

export function captureSnippet(video, overlay) {
    const { canvas } = drawSnippetToCanvas(video, overlay);
    return canvas.toDataURL('image/jpeg', 0.6); 
}

/**
 * Calculates image sharpness using the Variance of Laplacian method.
 * A higher variance indicates a wider spread of edge responses (sharper image).
 */
export function calculateSharpness(video, overlay) {
    const { context, width, height } = drawSnippetToCanvas(video, overlay);
    const imageData = context.getImageData(0, 0, width, height);
    const gray = new Uint8ClampedArray(width * height);
    
    // Convert RGB to Grayscale
    for (let i = 0; i < imageData.data.length; i += 4) {
        gray[i / 4] = 0.299 * imageData.data[i] + 0.587 * imageData.data[i+1] + 0.114 * imageData.data[i+2];
    }
    
    // Apply 3x3 Laplacian filter
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
    
    // Calculate variance
    const mean = sum / n;
    return (sumSq / n) - (mean * mean);
}

/**
 * Heuristic parsing to clean OCR output for standard US addresses.
 */
export function parseUSAddress(text) {
    const lines = text.split('\n')
        .map(line => line.replace(/[^a-zA-Z0-9\s\-#.,\/]/g, '').trim())
        .filter(line => line.length > 1);
        
    if (lines.length === 0) return { name: '', address: 'Could not read.' };
    
    // If the first line starts with a number, it likely missed the name field entirely
    if (/^\d/.test(lines[0])) return { name: '', address: lines.join('\n') }; 
    
    return { name: lines[0] || '', address: lines.slice(1).join('\n') || '' };
}