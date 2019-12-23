import { TimingObject } from 'timing-object';
import { TimingProvider } from 'timing-provider';

const $bpmInput = document.getElementById('bpm');
const $connectingMessageSpan = document.getElementById('connecting-message');
const $metronomeButton = document.getElementById('metronome');

// eslint-disable-next-line padding-line-between-statements
const convertBpmToVelocity = (value) => value / 60;

// eslint-disable-next-line padding-line-between-statements
const createAudioBuffer = (bufferDuration, sampleRate, soundDuration) => {
    const numberOfFrames = sampleRate * soundDuration;
    const amplitudeOffset = 1 / numberOfFrames;
    const audioBuffer = new AudioBuffer({ length: sampleRate * bufferDuration, sampleRate });
    const channelData = new Float32Array(numberOfFrames);
    const frequency = 330;
    const twoPi = Math.PI * 2;
    const phaseOffset = twoPi * frequency / sampleRate;

    let amplitude = 1;
    let phase = 0;

    for (let i = 0; i < numberOfFrames; i += 1) {
        channelData[i] = Math.sin(phase) * amplitude;

        amplitude -= amplitudeOffset;
        phase += phaseOffset;

        if (phase > twoPi) {
            phase -= twoPi;
        }
    }

    audioBuffer.copyToChannel(channelData, 0, 0);

    return audioBuffer;
};

// eslint-disable-next-line padding-line-between-statements
const startAudioBufferSourceNode = (audioBuffer, audioContext, loopState, soundDuration, vector) => {
    const { currentTime, position, velocity } = translateVector(audioContext, vector);
    const loopEnd = 1 / velocity;
    const startTime = currentTime + ((1 - (position % 1)) * loopEnd);

    if (loopState !== null) {
        stopAudioBufferSourceNode(audioContext, currentTime, loopState, soundDuration);
    }

    const audioBufferSourceNode = new AudioBufferSourceNode(audioContext, { buffer: audioBuffer, loop: true, loopEnd });

    audioBufferSourceNode.connect(audioContext.destination);
    audioBufferSourceNode.start(startTime);

    return { audioBufferSourceNode, loopEnd, startTime };
};

// eslint-disable-next-line padding-line-between-statements
const stopAudioBufferSourceNode = (audioContext, currentTime, { audioBufferSourceNode, loopEnd, startTime }, soundDuration) => {
    audioBufferSourceNode.stop(startTime + (loopEnd * (Math.floor((currentTime - startTime) / loopEnd))) + soundDuration);

    const disconnectAudioBufferSourceNode = () => {
        audioBufferSourceNode.removeEventListener('ended', disconnectAudioBufferSourceNode);
        audioBufferSourceNode.disconnect(audioContext.destination);
    };

    audioBufferSourceNode.addEventListener('ended', disconnectAudioBufferSourceNode);
};

// eslint-disable-next-line padding-line-between-statements
const translateVector = (audioContext, { acceleration, position, timestamp, velocity }) => {
    if (acceleration !== 0) {
        throw new Error('An acceleration other than zero is not yet supported.');
    }

    const { contextTime, performanceTime } = audioContext.getOutputTimestamp();
    const { currentTime } = audioContext;
    const delta = currentTime - (timestamp - ((performanceTime / 1000) - contextTime));

    return {
        currentTime,
        position: position + (velocity * delta),
        velocity
    };
};

// eslint-disable-next-line padding-line-between-statements
const waitForConnection = () => new Promise((resolve) => {
    const timingObject = new TimingObject(new TimingProvider('abcdefghijklmno56789'));
    const resolvePromiseWhenOpen = () => {
        timingObject.removeEventListener('readystatechange', resolvePromiseWhenOpen);

        if (timingObject.readyState === 'open') {
            resolve(timingObject);
        }
    };

    timingObject.addEventListener('readystatechange', resolvePromiseWhenOpen);
});

waitForConnection()
    .then((timingObject) => {
        $bpmInput.disabled = false;
        $connectingMessageSpan.style.display = 'none';
        $metronomeButton.disabled = false;

        const audioContext = new AudioContext();
        const sampleRate = audioContext.sampleRate;
        const bufferDuration = 2;
        const soundDuration = 0.02;
        const audioBuffer = createAudioBuffer(bufferDuration, sampleRate, soundDuration);
        const min = parseInt($bpmInput.min, 10);
        const max = parseInt($bpmInput.max, 10);

        // eslint-disable-next-line padding-line-between-statements
        const getBpm = () => Math.min(max, Math.max(min, Math.round(parseFloat($bpmInput.value))));

        // eslint-disable-next-line padding-line-between-statements
        const isTimingObjectMoving = () => {
            const { velocity } = timingObject.query();

            return velocity !== 0;
        };

        // eslint-disable-next-line padding-line-between-statements
        const restartTimer = () => {
            clearInterval(intervalId);
            startTimer();
        };

        // eslint-disable-next-line padding-line-between-statements
        const setBpm = (value) => {
            bpm = value;
            $bpmInput.value = value;
        };

        // eslint-disable-next-line padding-line-between-statements
        const startTimer = () => {
            loopState = startAudioBufferSourceNode(audioBuffer, audioContext, loopState, soundDuration, timingObject.query());

            intervalId = setInterval(() => {
                loopState = startAudioBufferSourceNode(audioBuffer, audioContext, loopState, soundDuration, timingObject.query());
            }, 1000 + (Math.random() * 1000));
        };

        // eslint-disable-next-line padding-line-between-statements
        const stopTimer = () => {
            clearInterval(intervalId);
            stopAudioBufferSourceNode(audioContext, audioContext.currentTime, loopState, soundDuration);

            intervalId = null;
            loopState = null;
        };

        // eslint-disable-next-line padding-line-between-statements
        const updateVelocity = (value) => timingObject.update({ velocity: convertBpmToVelocity(value) });

        let bpm = getBpm();
        let intervalId = null;
        let loopState = null;

        $bpmInput.addEventListener('change', () => {
            const value = getBpm();

            setBpm(value);

            if (isTimingObjectMoving()) {
                updateVelocity(value);
            }

            if (intervalId !== null) {
                restartTimer();
            }
        });

        $metronomeButton.addEventListener('click', () => {
            if (intervalId === null) {
                $metronomeButton.textContent = 'mute metronome';

                if (!isTimingObjectMoving()) {
                    updateVelocity(bpm);
                }

                if (audioContext.state === 'suspended') {
                    audioContext.resume().catch();
                }

                startTimer();
            } else {
                $metronomeButton.textContent = 'unmute metronome';

                stopTimer();
            }
        });

        timingObject.addEventListener('change', () => {
            const { velocity } = timingObject.query();

            if (velocity === 0) {
                $metronomeButton.textContent = 'start metronome';

                if (intervalId !== null) {
                    stopTimer();
                }
            } else {
                setBpm(Math.round(velocity * 60));

                if (intervalId === null) {
                    $metronomeButton.textContent = 'unmute metronome';
                } else {
                    restartTimer();
                }
            }
        });
    });
