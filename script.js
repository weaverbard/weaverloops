window.addEventListener('DOMContentLoaded', () => {
    let audioContext = null;
    let audioBuffer = null;
    let originalBuffer = null;
    let loopBuffer = null;
    let source = null;
    let selection = { start: 0, end: 0 };
    let playhead = 0;
    let isPlaying = false;
    let previewPlayhead = 0;
    let previewIsPlaying = false;
    let loopBlobUrl = null;

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
    const crossfadeTypeSelect = document.getElementById('crossfadeTypeSelect');
    const previewBtn = document.getElementById('previewBtn');
    const previewPlayheadSlider = document.getElementById('previewPlayheadSlider');
    const previewPlayheadTime = document.getElementById('previewPlayheadTime');
    const previewPlayBtn = document.getElementById('previewPlayBtn');
    const previewPauseBtn = document.getElementById('previewPauseBtn');
    const previewLoopBtn = document.getElementById('previewLoopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    const newAudioBtn = document.getElementById('newAudioBtn');
    const loopPlayer = document.getElementById('loopPlayer');
    const error = document.getElementById('error');
    const progress = document.getElementById('progress');
    const progressMessage = document.getElementById('progressMessage');

    // Check for missing elements
    const elements = [canvas, previewCanvas, audioInput, uploadButton, playheadSlider, playheadTime, 
                     selectionStartSlider, selectionStartTime, selectionEndSlider, selectionEndTime,
                     playBtn, pauseBtn, startBtn, endBtn, deleteBtn, crossfadeSelect, crossfadeTypeSelect,
                     previewBtn, previewPlayheadSlider, previewPlayheadTime, previewPlayBtn, 
                     previewPauseBtn, previewLoopBtn, resetBtn, downloadBtn, shareBtn, newAudioBtn,
                     loopPlayer, error, progress, progressMessage];
    if (elements.some(el => !el)) {
        showError('Initialization error: One or more UI elements are missing.');
        return;
    }

    // Initialize state
    audioInput.value = '';
    progress.style.display = 'none';
    loopPlayer.classList.add('hidden');
    console.log('WeaverLoops 1.17 initialized. User Agent:', navigator.userAgent);

    function showError(message) {
        error.textContent = message;
        error.classList.remove('hidden');
        console.error('Error:', message);
    }

    function clearError() {
        error.textContent = '';
        error.classList.add('hidden');
    }

    function showProgress(message) {
        console.log('showProgress:', message);
        progressMessage.textContent = message;
        progress.style.display = 'flex';
    }

    function hideProgress() {
        console.log('hideProgress called');
        progressMessage.textContent = '';
        progress.style.display = 'none';
    }

    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            return audioContext.resume().catch(err => {
                showError('Failed to resume audio context: ' + err.message);
                console.error('AudioContext resume error:', err);
            });
        }
        return Promise.resolve();
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

    function resetToEditState() {
        if (!originalBuffer) return;
        audioBuffer = audioContext.createBuffer(
            originalBuffer.numberOfChannels,
            originalBuffer.length,
            originalBuffer.sampleRate
        );
        for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
            audioBuffer.getChannelData(channel).set(originalBuffer.getChannelData(channel));
        }
        selection = { start: 0, end: audioBuffer.duration };
        playhead = 0;
        playheadSlider.max = audioBuffer.duration;
        playheadSlider.value = 0;
        playheadTime.textContent = '0.00s';
        selectionStartSlider.max = audioBuffer.duration;
        selectionStartSlider.min = 0;
        selectionStartSlider.value = 0;
        selectionStartTime.textContent = '0.00s';
        selectionEndSlider.max = audioBuffer.duration;
        selectionEndSlider.min = 0;
        selectionEndSlider.value = audioBuffer.duration;
        selectionEndTime.textContent = audioBuffer.duration.toFixed(2) + 's';
        crossfadeSelect.value = '1';
        document.getElementById('editStep').classList.remove('hidden');
        document.getElementById('crossfadeStep').classList.add('hidden');
        document.getElementById('previewStep').classList.add('hidden');
        document.getElementById('downloadStep').classList.add('hidden');
        loopPlayer.classList.add('hidden');
        loopPlayer.src = '';
        if (loopBlobUrl) {
            URL.revokeObjectURL(loopBlobUrl);
            loopBlobUrl = null;
        }
        loopBuffer = null;
        resizeCanvases();
        drawWaveform();
        clearError();
        hideProgress();
    }

    uploadButton.addEventListener('click', () => {
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
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    console.log('AudioContext created, sampleRate:', audioContext.sampleRate);
                }
                await resumeAudioContext();
                const arrayBuffer = e.target.result;

                // Add timeout for decodeAudioData
                const decodePromise = audioContext.decodeAudioData(arrayBuffer);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Audio decoding timed out after 10 seconds')), 10000);
                });
                audioBuffer = await Promise.race([decodePromise, timeoutPromise]).catch(err => {
                    throw new Error('decodeAudioData failed: ' + err.message);
                });

                if (audioBuffer.duration < 0.2) {
                    showError('Audio file is too short.');
                    audioBuffer = null;
                    hideProgress();
                    return;
                }
                originalBuffer = audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    audioBuffer.length,
                    audioBuffer.sampleRate
                );
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    originalBuffer.getChannelData(channel).set(audioBuffer.getChannelData(channel));
                }
                resetToEditState();
                hideProgress();
            } catch (err) {
                showError('Failed to load audio: ' + err.message);
                console.error('Audio loading error:', err);
                console.log('User Agent:', navigator.userAgent);
                console.log('File type:', file.type, 'Size:', file.size, 'Name:', file.name);
                hideProgress();
            }
        };
        reader.onerror = () => {
            showError('Error reading file.');
            console.error('FileReader error:', reader.error);
            console.log('User Agent:', navigator.userAgent);
            console.log('File type:', file.type, 'Size:', file.size, 'Name:', file.name);
            hideProgress();
        };
        reader.readAsArrayBuffer(file);
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
        ctx.strokeStyle = 'rgb(0,255,255)';
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
            ctx.fillRect(startX - 1, 0, 2, canvas.height);
            ctx.fillRect(endX - 1, 0, 2, canvas.height);
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
        previewCtx.strokeStyle = 'rgb(0,255,255)';
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

        const previewPlayheadX = (previewPlayhead / loopBuffer.duration) * previewCanvas.width;
        previewCtx.strokeStyle = '#fff';
        previewCtx.beginPath();
        previewCtx.moveTo(previewPlayheadX, 0);
        previewCtx.lineTo(previewPlayheadX, previewCanvas.height);
        previewCtx.stroke();
    }

    selectionStartSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        const value = parseFloat(selectionStartSlider.value);
        selection.start = Math.min(value, selection.end);
        selectionStartSlider.value = selection.start;
        selectionStartTime.textContent = selection.start.toFixed(2) + 's';
        drawWaveform();
    });

    selectionEndSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        const value = parseFloat(selectionEndSlider.value);
        selection.end = Math.max(value, selection.start);
        selectionEndSlider.value = selection.end;
        selectionEndTime.textContent = selection.end.toFixed(2) + 's';
        drawWaveform();
    });

    playheadSlider.addEventListener('input', () => {
        if (!audioBuffer) return;
        playhead = parseFloat(playheadSlider.value);
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (isPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0, playhead);
        }
        drawWaveform();
    });

    playBtn.addEventListener('click', async () => {
        if (!audioBuffer || isPlaying) return;
        await resumeAudioContext();
        if (playhead < selection.start || playhead > selection.end) {
            playhead = selection.start;
            playheadSlider.value = playhead;
            playheadTime.textContent = playhead.toFixed(2) + 's';
        }
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
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
            if (playhead >= selection.end) {
                const overshoot = playhead - selection.end;
                playhead = selection.start + overshoot;
                if (source) source.stop();
                source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                source.start(0, playhead);
            }
            playheadSlider.value = playhead;
            playheadTime.textContent = playhead.toFixed(2) + 's';
            drawWaveform();
        }, 50);
    });

    pauseBtn.addEventListener('click', () => {
        if (isPlaying) {
            if (source) source.stop();
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
        if (isPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0, playhead);
        }
        drawWaveform();
    });

    endBtn.addEventListener('click', () => {
        if (!audioBuffer) return;
        playhead = selection.end;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        if (isPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0, playhead);
        }
        drawWaveform();
    });

    deleteBtn.addEventListener('click', () => {
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
        playhead = Math.min(playhead, audioBuffer.duration);
        playheadSlider.max = audioBuffer.duration;
        playheadSlider.value = playhead;
        playheadTime.textContent = playhead.toFixed(2) + 's';
        selectionStartSlider.max = audioBuffer.duration;
        selectionStartSlider.min = 0;
        selectionStartSlider.value = 0;
        selectionStartTime.textContent = '0.00s';
        selectionEndSlider.max = audioBuffer.duration;
        selectionEndSlider.min = 0;
        selectionEndSlider.value = audioBuffer.duration;
        selectionEndTime.textContent = audioBuffer.duration.toFixed(2) + 's';
        drawWaveform();
        document.getElementById('crossfadeStep').classList.remove('hidden');
        hideProgress();
    });

    previewBtn.addEventListener('click', async () => {
        if (!audioBuffer) return;
        await resumeAudioContext();
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
        previewPlayhead = 0;
        previewIsPlaying = false;
        document.getElementById('previewStep').classList.remove('hidden');
        document.getElementById('downloadStep').classList.remove('hidden');
        const wavBlob = bufferToWav(loopBuffer);
        if (loopBlobUrl) URL.revokeObjectURL(loopBlobUrl);
        loopBlobUrl = URL.createObjectURL(wavBlob);
        loopPlayer.src = loopBlobUrl;
        loopPlayer.classList.remove('hidden');
        resizeCanvases();
        drawPreviewWaveform();
        hideProgress();
    });

    previewPlayheadSlider.addEventListener('input', () => {
        if (!loopBuffer) return;
        previewPlayhead = parseFloat(previewPlayheadSlider.value);
        previewPlayheadTime.textContent = previewPlayhead.toFixed(2) + 's';
        if (previewIsPlaying) {
            if (source) source.stop();
            source = audioContext.createBufferSource();
            source.buffer = loopBuffer;
            source.connect(audioContext.destination);
            source.loop = true;
            source.start(0, previewPlayhead);
        }
        drawPreviewWaveform();
    });

    previewPlayBtn.addEventListener('click', async () => {
        if (!loopBuffer || previewIsPlaying) return;
        await resumeAudioContext();
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
    });

    previewPauseBtn.addEventListener('click', () => {
        if (previewIsPlaying) {
            if (source) source.stop();
            source = null;
            previewIsPlaying = false;
            drawPreviewWaveform();
        }
    });

    previewLoopBtn.addEventListener('click', async () => {
        if (!loopBuffer) return;
        await resumeAudioContext();
        if (previewIsPlaying) {
            if (source) source.stop();
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

    resetBtn.addEventListener('click', () => {
        if (source) source.stop();
        source = null;
        isPlaying = false;
        previewIsPlaying = false;
        resetToEditState();
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
        const crossfadeType = crossfadeTypeSelect.value;

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = loopBuffer.getChannelData(channel);
            for (let i = 0; i < newLength; i++) {
                outputData[i] = inputData[i + crossfadeSamples];
            }
            for (let i = 0; i < crossfadeSamples; i++) {
                const t = i / crossfadeSamples;
                let fadeIn, fadeOut;
                if (crossfadeType === 'equalPower') {
                    fadeIn = Math.sqrt(t);
                    fadeOut = Math.sqrt(1 - t);
                } else {
                    fadeIn = t;
                    fadeOut = 1 - t;
                }
                outputData[newLength - crossfadeSamples + i] =
                    inputData[i] * fadeIn + inputData[audioBuffer.length - crossfadeSamples + i] * fadeOut;
            }
        }
        return loopBuffer;
    }

    downloadBtn.addEventListener('click', async () => {
        if (!audioBuffer) return;
        await resumeAudioContext();
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
        const fileName = audioInput.files[0].name.replace(/\.[^/.]+$/, '') + '_loop.wav';
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
            console.error('Export error:', err);
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
        hideProgress();
    });

    shareBtn.addEventListener('click', async () => {
        if (!loopBuffer) {
            showError('No loop available to share.');
            return;
        }
        showProgress('Preparing to share...');
        const wavBlob = bufferToWav(loopBuffer);
        const fileName = audioInput.files[0].name.replace(/\.[^/.]+$/, '') + '_loop.wav';
        const file = new File([wavBlob], fileName, { type: 'audio/wav' });
        try {
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'WeaverLoops Seamless Loop',
                    text: 'Share this audio loop created with WeaverLoops'
                });
            } else {
                showError('Sharing is not supported on this device. Try downloading instead.');
                console.warn('Web Share API not supported or cannot share files.');
            }
        } catch (err) {
            showError('Failed to share: ' + err.message);
            console.error('Share error:', err);
        }
        hideProgress();
    });

    newAudioBtn.addEventListener('click', () => {
        window.location.reload();
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
        console.error('Web Audio API not supported.');
        return;
    }

    // Initialize
    resizeCanvases();
    uploadButton.disabled = true;
});
