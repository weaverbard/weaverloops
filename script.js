let audioContext;
let audioBuffer;
let loopBuffer;
let sourceNode;
let isPlaying = false;
let previewIsPlaying = false;
let playhead = 0;
let previewPlayhead = 0;
let selection = { start: 0, end: 0 };
let startTime = 0;
let animationFrameId;

const audioFile = document.getElementById('audioFile');
const waveformCanvas = document.getElementById('waveformCanvas');
const previewWaveformCanvas = document.getElementById('previewWaveformCanvas');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const cropBtn = document.getElementById('cropBtn');
const previewBtn = document.getElementById('previewBtn');
const previewPlayBtn = document.getElementById('previewPlayBtn');
const previewPauseBtn = document.getElementById('previewPauseBtn');
const downloadBtn = document.getElementById('downloadBtn');
const crossfadeSelect = document.getElementById('crossfadeSelect');
const playheadSlider = document.getElementById('playheadSlider');
const previewPlayheadSlider = document.getElementById('previewPlayheadSlider');
const playheadTime = document.getElementById('playheadTime');
const previewPlayheadTime = document.getElementById('previewPlayheadTime');
const selectionStart = document.getElementById('selectionStart');
const selectionEnd = document.getElementById('selectionEnd');
const errorDiv = document.getElementById('error');
const progressDiv = document.getElementById('progress');

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function clearError() {
    errorDiv.textContent = '';
    errorDiv.classList.add('hidden');
}

function showProgress(message) {
    progressDiv.textContent = message;
    progressDiv.classList.remove('hidden');
}

function hideProgress() {
    progressDiv.classList.add('hidden');
}

function resizeCanvases() {
    waveformCanvas.width = waveformCanvas.offsetWidth * 2;
    waveformCanvas.height = waveformCanvas.offsetHeight * 2;
    previewWaveformCanvas.width = previewWaveformCanvas.offsetWidth * 2;
    previewWaveformCanvas.height = previewWaveformCanvas.offsetHeight * 2;
    if (audioBuffer) drawWaveform();
    if (loopBuffer) drawPreviewWaveform();
}

function drawWaveform() {
    const ctx = waveformCanvas.getContext('2d');
    ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);

    if (!audioBuffer) return;

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / waveformCanvas.width);
    const amp = waveformCanvas.height / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    for (let i = 0; i < waveformCanvas.width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j] || 0;
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    if (selection.start !== selection.end) {
        const startX = (selection.start / audioBuffer.duration) * waveformCanvas.width;
        const endX = (selection.end / audioBuffer.duration) * waveformCanvas.width;
        ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
        ctx.fillRect(startX, 0, endX - startX, waveformCanvas.height);

        ctx.fillStyle = 'rgba(255, 165, 0, 0.7)';
        ctx.fillRect(startX - 2, 0, 4, waveformCanvas.height);
        ctx.fillRect(endX - 2, 0, 4, waveformCanvas.height);
    }

    const playheadX = (playhead / audioBuffer.duration) * waveformCanvas.width;
    ctx.beginPath();
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, waveformCanvas.height);
    ctx.stroke();
}

function drawPreviewWaveform() {
    const ctx = previewWaveformCanvas.getContext('2d');
    ctx.clearRect(0, 0, previewWaveformCanvas.width, previewWaveformCanvas.height);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 0, previewWaveformCanvas.width, previewWaveformCanvas.height);

    if (!loopBuffer) return;

    const data = loopBuffer.getChannelData(0);
    const step = Math.ceil(data.length / previewWaveformCanvas.width);
    const amp = previewWaveformCanvas.height / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    for (let i = 0; i < previewWaveformCanvas.width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j] || 0;
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    const playheadX = (previewPlayhead / loopBuffer.duration) * previewWaveformCanvas.width;
    ctx.beginPath();
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, previewWaveformCanvas.height);
    ctx.stroke();
}

audioFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
        showError('No file selected.');
        return;
    }

    // Validate file type
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/aiff', 'audio/x-aiff', 'audio/mp4'];
    const validExtensions = ['.wav', '.mp3', '.aif', '.aiff', '.m4a'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt)) {
        showError('Unsupported file format. Please select a WAV, MP3, AIF, or M4A file.');
        return;
    }

    showProgress('Loading audio...');
    try {
        // Ensure AudioContext is created and resumed
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (audioBuffer.duration < 0.2) {
            showError('Audio file is too short.');
            audioBuffer = null;
            hideProgress();
            return;
        }
        selection = { start: 0, end: audioBuffer.duration };
        playheadSlider.max = audioBuffer.duration;
        playheadSlider.value = 0;
        playheadTime.textContent = '0.00s';
        document.getElementById('cropStep').classList.remove('hidden');
        // Force canvas resize and redraw
        resizeCanvases();
        drawWaveform();
        hideProgress();
        clearError();
    } catch (err) {
        console.error('Audio loading error:', err);
        showError(`Failed to load audio: ${err.message || 'Unknown error'}`);
        hideProgress();
    }
});

playBtn.addEventListener('click', () => {
    if (!audioBuffer || isPlaying) return;
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(startPlayback);
    } else {
        startPlayback();
    }
});

function startPlayback() {
    if (sourceNode) sourceNode.stop();
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContext.destination);
    sourceNode.start(0, playhead);
    startTime = audioContext.currentTime - playhead;
    isPlaying = true;
    updatePlayhead();
}

function updatePlayhead() {
    if (!isPlaying) return;
    playhead = audioContext.currentTime - startTime;
    if (playhead >= audioBuffer.duration) {
        playhead = 0;
        isPlaying = false;
        sourceNode.stop();
        cancelAnimationFrame(animationFrameId);
    } else {
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        drawWaveform();
        animationFrameId = requestAnimationFrame(updatePlayhead);
    }
}

pauseBtn.addEventListener('click', () => {
    if (!isPlaying) return;
    sourceNode.stop();
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);
});

playheadSlider.addEventListener('input', () => {
    playhead = parseFloat(playheadSlider.value);
    playheadTime.textContent = playhead.toFixed(2) + 's';
    drawWaveform();
    if (isPlaying) {
        sourceNode.stop();
        startPlayback();
    }
});

startBtn.addEventListener('click', () => {
    selection.start = playhead;
    selectionStart.textContent = selection.start.toFixed(2);
    drawWaveform();
});

endBtn.addEventListener('click', () => {
    selection.end = playhead;
    selectionEnd.textContent = selection.end.toFixed(2);
    drawWaveform();
});

cropBtn.addEventListener('click', () => {
    if (selection.start >= selection.end) {
        showError('Invalid selection: start must be before end.');
        return;
    }
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(selection.start * sampleRate);
    const endSample = Math.floor(selection.end * sampleRate);
    const newLength = endSample - startSample;
    const newBuffer = audioContext.createBuffer(audioBuffer.numberOfChannels, newLength, sampleRate);
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const oldData = audioBuffer.getChannelData(channel);
        const newData = newBuffer.getChannelData(channel);
        for (let i = 0; i < newLength; i++) {
            newData[i] = oldData[startSample + i];
        }
    }
    audioBuffer = newBuffer;
    selection = { start: 0, end: audioBuffer.duration };
    playhead = 0;
    playheadSlider.max = audioBuffer.duration;
    playheadSlider.value = 0;
    playheadTime.textContent = '0.00s';
    selectionStart.textContent = '0.00';
    selectionEnd.textContent = audioBuffer.duration.toFixed(2);
    drawWaveform();
    clearError();
});

previewBtn.addEventListener('click', async () => {
    if (!audioBuffer) return;
    const crossfadeDuration = parseFloat(crossfadeSelect.value);
    if (crossfadeDuration > audioBuffer.duration / 2) {
        showError('Crossfade duration cannot exceed half the audio length.');
        return;
    }
    showProgress('Generating preview...');
    loopBuffer = await createLoopBuffer(crossfadeDuration);
    if (!loopBuffer) {
        showError('Failed to generate loop buffer.');
        hideProgress();
        return;
    }
    previewPlayheadSlider.max = loopBuffer.duration;
    previewPlayheadSlider.value = 0;
    previewPlayheadTime.textContent = '0.00s';
    document.getElementById('previewStep').classList.remove('hidden');
    // Force canvas resize and redraw for preview waveform
    setTimeout(() => {
        resizeCanvases();
        drawPreviewWaveform();
    }, 100);
    previewPlayhead = 0;
    previewIsPlaying = false;
    hideProgress();
    document.getElementById('downloadStep').classList.remove('hidden');
    clearError();
});

async function createLoopBuffer(crossfadeDuration) {
    try {
        const sampleRate = audioBuffer.sampleRate;
        const totalSamples = Math.floor(audioBuffer.duration * sampleRate);
        const crossfadeSamples = Math.floor(crossfadeDuration * sampleRate);
        const newLength = totalSamples + crossfadeSamples;
        const newBuffer = audioContext.createBuffer(audioBuffer.numberOfChannels, newLength, sampleRate);

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const oldData = audioBuffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);
            for (let i = 0; i < totalSamples; i++) {
                newData[i] = oldData[i];
            }
            for (let i = 0; i < crossfadeSamples; i++) {
                const fadeOut = 1 - (i / crossfadeSamples);
                const fadeIn = i / crossfadeSamples;
                newData[totalSamples + i] = oldData[i] * fadeIn + oldData[totalSamples - crossfadeSamples + i] * fadeOut;
            }
        }
        return newBuffer;
    } catch (err) {
        console.error('Create loop buffer error:', err);
        return null;
    }
}

previewPlayBtn.addEventListener('click', () => {
    if (!loopBuffer || previewIsPlaying) return;
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(startPreviewPlayback);
    } else {
        startPreviewPlayback();
    }
});

function startPreviewPlayback() {
    if (sourceNode) sourceNode.stop();
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = loopBuffer;
    sourceNode.connect(audioContext.destination);
    sourceNode.loop = true;
    const startOffset = Math.max(0, loopBuffer.duration - 15); // Start 15s before end
    sourceNode.start(0, startOffset);
    startTime = audioContext.currentTime - startOffset;
    previewIsPlaying = true;
    updatePreviewPlayhead();
}

function updatePreviewPlayhead() {
    if (!previewIsPlaying) return;
    previewPlayhead = (audioContext.currentTime - startTime) % loopBuffer.duration;
    previewPlayheadSlider.value = previewPlayhead;
    previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
    drawPreviewWaveform();
    animationFrameId = requestAnimationFrame(updatePreviewPlayhead);
}

previewPauseBtn.addEventListener('click', () => {
    if (!previewIsPlaying) return;
    sourceNode.stop();
    previewIsPlaying = false;
    cancelAnimationFrame(animationFrameId);
});

previewPlayheadSlider.addEventListener('input', () => {
    previewPlayhead = parseFloat(previewPlayheadSlider.value);
    previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
    drawPreviewWaveform();
    if (previewIsPlaying) {
        sourceNode.stop();
        startPreviewPlayback();
    }
});

downloadBtn.addEventListener('click', async () => {
    if (!loopBuffer) return;
    showProgress('Preparing download...');
    try {
        const wavBlob = await bufferToWave(loopBuffer);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = audioFile.files[0].name.replace(/\.[^/.]+$/, '') + '_LOOP.wav';
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: a.download,
                types: [{ description: 'WAV Audio', accept: { 'audio/wav': ['.wav'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(wavBlob);
            await writable.close();
        } else {
            a.click();
        }
        URL.revokeObjectURL(url);
        hideProgress();
        clearError();
    } catch (err) {
        console.error('Download error:', err);
        showError('Failed to download loop.');
        hideProgress();
    }
});

async function bufferToWave(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numOfChan * 2, true);
    view.setUint16(32, numOfChan * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * numOfChan * 2, true);

    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
            view.setInt16(44 + (i * numOfChan + channel) * 2, sample * 0x7FFF, true);
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

let isDragging = false;
let dragStartX = 0;
let dragEndX = 0;

waveformCanvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = waveformCanvas.getBoundingClientRect();
    dragStartX = (e.clientX - rect.left) / rect.width * audioBuffer.duration;
    dragEndX = dragStartX;
    selection.start = dragStartX;
    selection.end = dragEndX;
    drawWaveform();
});

waveformCanvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = waveformCanvas.getBoundingClientRect();
    dragEndX = (e.clientX - rect.left) / rect.width * audioBuffer.duration;
    selection.start = Math.min(dragStartX, dragEndX);
    selection.end = Math.max(dragStartX, dragEndX);
    selectionStart.textContent = selection.start.toFixed(2);
    selectionEnd.textContent = selection.end.toFixed(2);
    drawWaveform();
});

waveformCanvas.addEventListener('mouseup', () => {
    isDragging = false;
});

waveformCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
    const rect = waveformCanvas.getBoundingClientRect();
    dragStartX = (e.touches[0].clientX - rect.left) / rect.width * audioBuffer.duration;
    dragEndX = dragStartX;
    selection.start = dragStartX;
    selection.end = dragEndX;
    drawWaveform();
});

waveformCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDragging) return;
    const rect = waveformCanvas.getBoundingClientRect();
    dragEndX = (e.touches[0].clientX - rect.left) / rect.width * audioBuffer.duration;
    selection.start = Math.min(dragStartX, dragEndX);
    selection.end = Math.max(dragStartX, dragEndX);
    selectionStart.textContent = selection.start.toFixed(2);
    selectionEnd.textContent = selection.end.toFixed(2);
    drawWaveform();
});

waveformCanvas.addEventListener('touchend', () => {
    isDragging = false;
});

window.addEventListener('resize', resizeCanvases);
resizeCanvases();
