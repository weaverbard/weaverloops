window.addEventListener('DOMContentLoaded', () => {
    let audioContext = null;
    let audioBuffer = null;
    let loopBuffer = null;
    let source = null;
    let selection = { start: 0, end: 0 };
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
    const selectionStartSlider = document.getElementById('selectionStartSlider');
    const selectionStartTime = document.getElementById('selectionStartTime');
    const selectionEndSlider = document.getElementById('selectionEndSlider');
    const selectionEndTime = document.getElementById('selectionEndTime');
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
                     selectionStartSlider, selectionStartTime, selectionEndSlider, selectionEndTime,
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
            selectionStartSlider.max = audioBuffer.duration;
            selectionStartSlider.value = 0;
            selectionStartTime.textContent = '0.00s';
            selectionEndSlider.max = audioBuffer.duration;
            selectionEndSlider.value = audioBuffer.duration;
            selectionEndTime.textContent = audioBuffer.duration.toFixed(2) + 's';
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

    selectionStartSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        selection.start = parseFloat(selectionStartSlider.value);
        if (selection.start > selection.end) {
            selection.start = selection.end;
            selectionStartSlider.value = selection.start;
        }
        selectionStartTime.textContent = selection.start.toFixed(2) + 's';
        drawWaveform();
    });

    selectionEndSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        selection.end = parseFloat(selectionEndSlider.value);
        if (selection.end < selection.start) {
            selection.end = selection.start;
            selectionEndSlider.value = selection.end;
        }
        selectionEndTime.textContent = selection.end.toFixed(2) + 's';
        drawWaveform();
    });

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
        selectionStartSlider.max = audioBuffer.duration;
        selectionStartSlider.value = 0;
        selectionStartTime.textContent = '0.00s';
        selectionEndSlider.max = audioBuffer.duration;
        selectionEndSlider.value = audioBuffer.duration;
        selectionEndTime.textContent = audioBuffer.duration.toFixed(2) + 's';
        draw
