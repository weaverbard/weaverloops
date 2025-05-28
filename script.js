window.addEventListener('DOMContentLoaded', () => {
    let audioContext = null;
    let audioBuffer = null;
    let loopBuffer = null;
    let source = null;
    let selection = { start: 0, end: 0 };
    let isDragging = false;
    let dragHandle = null;
    let playhead = 0;
    let isPlaying = false;
    let previewPlayhead = 0;
    let previewIsPlaying = false;

    const canvas = document.getElementById('waveform');
    const ctx = canvas.getContext('2d');
    const previewCanvas = document.getElementById('previewWaveform');
    const previewCtx = previewCanvas.getContext('2d');
    const audioInput = document.getElementById('audioInput');
    const uploadButton = document.getElementById('uploadButton');
    const playheadSlider = document.getElementById('playheadSlider');
    const playheadTime = document.getElementById('playheadTime');
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const startBtn = document.getElementById('startBtn');
    const endBtn = document.getElementById('endBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const crossfadeSelect = document.getElementById('crossfadeSelect');
    const previewBtn = document.getElementById('previewBtn');
    const previewPlayheadSlider = document.getElementById('previewPlayheadSlider');
    const previewPlayheadTime = document.getElementById('previewPlayheadTime');
    const previewPlayBtn = document.getElementById('previewPlayBtn');
    const previewPauseBtn = document.getElementById('previewPauseBtn');
    const previewLoopBtn = document.getElementById('previewLoopBtn');
    const exportBtn = document.getElementById('exportBtn');
    const error = document.getElementById('error');
    const progress = document.getElementById('progress');
    const progressMessage = document.getElementById('progressMessage');

    // Check for missing elements
    const elements = [canvas, previewCanvas, audioInput, uploadButton, playheadSlider, playheadTime, 
                     playBtn, pauseBtn, startBtn, endBtn, deleteBtn, crossfadeSelect, previewBtn, 
                     previewPlayheadSlider, previewPlayheadTime, previewPlayBtn, previewPauseBtn, 
                     previewLoopBtn, exportBtn, error, progress, progressMessage];
    if (elements.some(el => !el)) {
        showError('Initialization error: One or more UI elements are missing.');
        return;
    }

    function showError(message) {
        error.textContent = message;
        error.classList.remove('hidden');
        console.error(message);
    }

    function clearError() {
        error.textContent = '';
        error.classList.add('hidden');
    }

    function showProgress(message) {
        progressMessage.textContent = message;
        progress.classList.remove('hidden');
    }

    function hideProgress() {
        progress.classList.add('hidden');
    }

    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(err => {
                showError('Failed to resume audio context: ' + err.message);
            });
        }
    }

    function resizeCanvases() {
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        previewCanvas.width = previewCanvas.offsetWidth * window.devicePixelRatio;
        previewCanvas.height = previewCanvas.offsetHeight * window.devicePixelRatio;
        drawWaveform();
        drawPreviewWaveform();
    }

    window.addEventListener('resize', resizeCanvases);

    audioInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadButton.disabled = false;
        } else {
            uploadButton.disabled = true;
        }
    });

    uploadButton.addEventListener('click', async () => {
        const file = audioInput.files[0];
        if (!file) {
            showError('No file selected.');
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            showError('File too large. Maximum size is 100MB.');
            return;
        }

        showProgress('Loading audio...');
        try {
            // Initialize or resume AudioContext
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            resumeAudioContext();

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
            document.getElementById('editStep').classList.remove('hidden');
            resizeCanvases();
            clearError();
            hideProgress();
        } catch (err) {
            showError('Failed to load audio: ' + err.message);
            console.error('Audio loading error:', err);
            hideProgress();
        }
    });

    function drawWaveform() {
        if (!audioBuffer || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        ctx.beginPath();
        ctx.strokeStyle = '#00FFFF';
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0, max = -1.0;
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
            const startX = (selection.start / audioBuffer.duration) * canvas.width;
            const endX = (selection.end / audioBuffer.duration) * canvas.width;
            ctx.fillStyle = 'rgba(255, 165, 0, 0.5)';
            ctx.fillRect(startX, 0, endX - startX, canvas.height);
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(startX - 2, 0, 4, canvas.height);
            ctx.fillRect(endX - 2, 0, 4, canvas.height);
        }

        const playheadX = (playhead / audioBuffer.duration) * canvas.width;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, canvas.height);
        ctx.stroke();
    }

    function drawPreviewWaveform() {
        if (!loopBuffer || !previewCtx) return;
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.fillStyle = '#333';
        previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        const data = loopBuffer.getChannelData(0);
        const step = Math.ceil(data.length / previewCanvas.width);
        const amp = previewCanvas.height / 2;
        previewCtx.beginPath();
        previewCtx.strokeStyle = '#00FFFF';
        for (let i = 0; i < previewCanvas.width; i++) {
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j] || 0;
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            previewCtx.moveTo(i, (1 + min) * amp);
            previewCtx.lineTo(i, (1 + max) * amp);
        }
        previewCtx.stroke();

        const playheadX = (previewPlayhead / loopBuffer.duration) * previewCanvas.width;
        previewCtx.strokeStyle = '#fff';
        previewCtx.beginPath();
        previewCtx.moveTo(playheadX, 0);
        previewCtx.lineTo(playheadX, previewCanvas.height);
        previewCtx.stroke();
    }

    canvas.addEventListener('mousedown', handleWaveformInteraction);
    canvas.addEventListener('touchstart', handleWaveformInteraction);

    canvas.addEventListener('mousemove', (e) => handleDrag(e));
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        handleDrag(e.touches[0]);
    });

    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('touchend', () => isDragging = false);

    function getCanvasX(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * window.devicePixelRatio;
        return Math.max(0, Math.min(x, canvas.width));
    }

    function handleWaveformInteraction(e) {
        e.preventDefault();
        resumeAudioContext();
        const x = getCanvasX(e);
        const duration = audioBuffer ? audioBuffer.duration : 0;
        const time = (x / canvas.width) * duration;

        const startX = (selection.start / duration) * canvas.width;
        const endX = (selection.end / duration) * canvas.width;

        if (Math.abs(x - startX) < 15) {
            isDragging = true;
            dragHandle = 'start';
        } else if (Math.abs(x - endX) < 15) {
            isDragging = true;
            dragHandle = 'end';
        } else if (x >= startX && x <= endX && selection.start !== selection.end) {
            isDragging = true;
            dragHandle = 'move';
        } else {
            selection.start = time;
            selection.end = time;
            isDragging = true;
            dragHandle = 'end';
        }
        drawWaveform();
    }

    function handleDrag(e) {
        if (!isDragging || !audioBuffer) return;
        const x = getCanvasX(e);
        const time = Math.max(0, Math.min((x / canvas.width) * audioBuffer.duration, audioBuffer.duration));

        if (dragHandle === 'start') {
            selection.start = Math.min(time, selection.end);
        } else if (dragHandle === 'end') {
            selection.end = Math.max(time, selection.start);
        } else if (dragHandle === 'move') {
            const delta = time - selection.start;
            selection.start = Math.max(0, selection.start + delta);
            selection.end = Math.min(audioBuffer.duration, selection.end + delta);
        }
        drawWaveform();
    }

    playheadSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        playhead = parseFloat(playheadSlider.value);
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (source) {
            source.stop();
            source = null;
            isPlaying = false;
        }
        drawWaveform();
    });

    playBtn.addEventListener('click', () => {
        if (!audioBuffer || isPlaying) return;
        resumeAudioContext();
        if (!source) {
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
        }
        source.start(0, playhead);
        isPlaying = true;
        const startTime = audioContext.currentTime;
        const initialPlayhead = playhead;
        const interval = setInterval(() => {
            if (!isPlaying) {
                clearInterval(interval);
                return;
            }
            playhead = initialPlayhead + (audioContext.currentTime - startTime);
            playheadSlider.value = playhead;
            playheadTime.textContent = playhead.toFixed(2) + 's';
            if (playhead >= audioBuffer.duration) {
                playhead = audioBuffer.duration;
                source.stop();
                source = null;
                isPlaying = false;
                clearInterval(interval);
            }
            drawWaveform();
        }, 50);
    });

    pauseBtn.addEventListener('click', () => {
        if (source) {
            source.stop();
            source = null;
            isPlaying = false;
            drawWaveform();
        }
    });

    startBtn.addEventListener('click', () => {
        if (!audioBuffer) return;
        playhead = selection.start;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (source) {
            source.stop();
            source = null;
            isPlaying = false;
        }
        drawWaveform();
    });

    endBtn.addEventListener('click', () => {
        if (!audioBuffer) return;
        playhead = selection.end;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (source) {
            source.stop();
            source = null;
            isPlaying = false;
        }
        drawWaveform();
    });

    deleteBtn.addEventListener('click', async () => {
        if (!audioBuffer || selection.start === selection.end) {
            showError('Please select a region to keep.');
            return;
        }
        showProgress('Cropping loop...');
        const startSample = Math.floor(selection.start * audioBuffer.sampleRate);
        const endSample = Math.floor(selection.end * audioBuffer.sampleRate);
        const newLength = endSample - startSample;
        if (newLength < 0.2 * audioBuffer.sampleRate) {
            showError('Selected region is too short.');
            hideProgress();
            return;
        }
        const newBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            newLength,
            audioBuffer.sampleRate
        );
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const oldData = audioBuffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);
            for (let i = 0; i < newLength; i++) {
                newData[i] = oldData[startSample + i];
            }
        }
        audioBuffer = newBuffer;
        selection = { start: 0, end: audioBuffer.duration };
        playhead = Math.min(playhead - selection.start, audioBuffer.duration);
        playheadSlider.max = audioBuffer.duration;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        drawWaveform();
        document.getElementById('crossfadeStep').classList.remove('hidden');
        hideProgress();
    });

    previewBtn.addEventListener('click', async () => {
        if (!audioBuffer) return;
        resumeAudioContext();
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
        resizeCanvases();
        document.getElementById('previewStep').classList.remove('hidden');
        previewPlayhead = 0;
        previewIsPlaying = false;
        hideProgress();
        document.getElementById('downloadStep').classList.remove('hidden');
    });

    previewPlayheadSlider.addEventListener('input', () => {
        if (!loopBuffer) return;
        previewPlayhead = parseFloat(previewPlayheadSlider.value);
        previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
        if (source) {
            source.stop();
            source = null;
            previewIsPlaying = false;
        }
        drawPreviewWaveform();
    });

    previewPlayBtn.addEventListener('click', () => {
        if (!loopBuffer || previewIsPlaying) return;
        resumeAudioContext();
        if (!source) {
            source = audioContext.createBufferSource();
            source.buffer = loopBuffer;
            source.connect(audioContext.destination);
            source.loop = true;
        }
        source.start(0, previewPlayhead);
        previewIsPlaying = true;
        const startTime = audioContext.currentTime;
        const initialPlayhead = previewPlayhead;
        const interval = setInterval(() => {
            if (!previewIsPlaying) {
                clearInterval(interval);
                return;
            }
            previewPlayhead = (initialPlayhead + (audioContext.currentTime - startTime)) % loopBuffer.duration;
            previewPlayheadSlider.value = previewPlayhead;
            previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
            drawPreviewWaveform();
        }, 50);
    });

    previewPauseBtn.addEventListener('click', () => {
        if (source) {
            source.stop();
            source = null;
            previewIsPlaying = false;
            drawPreviewWaveform();
        }
    });

    previewLoopBtn.addEventListener('click', () => {
        if (!loopBuffer) return;
        resumeAudioContext();
        if (source) {
            source.stop();
            source = null;
            previewIsPlaying = false;
        }
        const crossfadeDuration = parseFloat(crossfadeSelect.value);
        const previewStart = Math.max(0, loopBuffer.duration - crossfadeDuration - 5);
        previewPlayhead = previewStart;
        previewPlayheadSlider.value = previewPlayhead;
        previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
        source = audioContext.createBufferSource();
        source.buffer = loopBuffer;
        source.connect(audioContext.destination);
        source.loop = true;
        source.start(0, previewPlayhead);
        previewIsPlaying = true;
        const startTime = audioContext.currentTime;
        const initialPlayhead = previewPlayhead;
        const interval = setInterval(() => {
            if (!previewIsPlaying) {
                clearInterval(interval);
                return;
            }
            previewPlayhead = (initialPlayhead + (audioContext.currentTime - startTime)) % loopBuffer.duration;
            previewPlayheadSlider.value = previewPlayhead;
            previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
            drawPreviewWaveform();
        }, 50);
        drawPreviewWaveform();
    });

    async function createLoopBuffer(crossfadeDuration) {
        const sampleRate = audioBuffer.sampleRate;
        const crossfadeSamples = Math.floor(crossfadeDuration * sampleRate);
        const newLength = audioBuffer.length - crossfadeSamples;
        if (newLength <= 0) {
            showError('Crossfade duration is too long for the audio length.');
            return null;
        }
        const loopBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            newLength,
            sampleRate
        );

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = loopBuffer.getChannelData(channel);
            for (let i = 0; i < newLength; i++) {
                outputData[i] = inputData[i + crossfadeSamples];
            }
            for (let i = 0; i < crossfadeSamples; i++) {
                const fadeIn = i / crossfadeSamples;
                const fadeOut = 1 - (i / crossfadeSamples);
                outputData[newLength - crossfadeSamples + i] =
                    inputData[i] * fadeIn + inputData[audioBuffer.length - crossfadeSamples + i] * fadeOut;
            }
        }
        return loopBuffer;
    }

    exportBtn.addEventListener('click', async () => {
        if (!audioBuffer) return;
        resumeAudioContext();
        const crossfadeDuration = parseFloat(crossfadeSelect.value);
        if (crossfadeDuration > audioBuffer.duration / 2) {
            showError('Crossfade duration cannot exceed half the audio length.');
            return;
        }
        showProgress('Exporting loop...');
        const loopBuffer = await createLoopBuffer(crossfadeDuration);
        if (!loopBuffer) {
            showError('Failed to export loop.');
            hideProgress();
            return;
        }
        const wavBlob = bufferToWav(loopBuffer);
        const fileName = audioInput.files[0].name.replace(/\.[^/.]+$/, '') + '_LOOP.wav';
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'WAV Audio',
                        accept: { 'audio/wav': ['.wav'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(wavBlob);
                await writable.close();
            } else {
                const url = URL.createObjectURL(wavBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            showError('Failed to save file. Using default download.');
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
        hideProgress();
    });

    function bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const length = buffer.length * numChannels * 2 + 44;
        const arrayBuffer = new ArrayBuffer(length);
        const view = new DataView(arrayBuffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, buffer.length * numChannels * 2, true);

        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(44 + (i * numChannels + channel) * 2, sample * 0x7FFF, true);
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    if (!window.AudioContext && !window.webkitAudioContext) {
        showError('Your browser does not support Web Audio API.');
    }

    // Initialize
    resizeCanvases();
    uploadButton.disabled = true;
});
