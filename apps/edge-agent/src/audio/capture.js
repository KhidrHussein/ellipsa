import { desktopCapturer, app } from 'electron';
import fs from 'fs-extra';
const { ensureDir, writeFile } = fs;
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { whisperASR } from './asr.js';
import { audioPreprocessor } from './audioPreprocessor.js';
// Get the audio directory path
const getAudioDir = () => {
    return join(app.getPath('userData'), 'recordings');
};
// Segment duration in milliseconds (30 seconds)
const SEGMENT_DURATION = 30 * 1000;
// Audio state
let audioRecorder = null;
let audioStream = null;
let audioChunks = [];
let recordingStartTime = null;
export async function startAudioCapture(mainWindow, onAudioProcessed) {
    try {
        await ensureDir(getAudioDir());
        // Get screen sources with audio
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 0, height: 0 }
        });
        if (sources.length === 0) {
            throw new Error('No audio sources available');
        }
        // Configure audio constraints with proper typing
        const constraints = {
            audio: {
                // Type assertion for Chrome-specific constraints
                ...(process.versions.electron ? {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sources[0].id
                    }
                } : {}),
                // Standard constraints
                autoGainControl: true,
                echoCancellation: true,
                noiseSuppression: true
            }
        };
        // Get user media
        audioStream = await navigator.mediaDevices.getUserMedia(constraints);
        const recorder = new MediaRecorder(audioStream);
        audioRecorder = recorder;
        recordingStartTime = Date.now();
        // Handle data availability
        audioRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                // Process the segment if duration is reached
                if (Date.now() - (recordingStartTime || 0) >= SEGMENT_DURATION) {
                    const chunksToProcess = [...audioChunks];
                    audioChunks = [];
                    recordingStartTime = Date.now();
                    try {
                        const result = await processAudioSegment(chunksToProcess, mainWindow);
                        // If a processor callback is provided, call it with the processed data
                        if (onAudioProcessed) {
                            const audioData = await chunksToProcess[0].arrayBuffer();
                            await onAudioProcessed(audioData, {
                                timestamp: new Date().toISOString(),
                                duration: SEGMENT_DURATION / 1000,
                                sampleRate: 16000, // Default, adjust based on actual configuration
                                format: 'wav',
                                source: 'microphone'
                            });
                        }
                    }
                    catch (error) {
                        console.error('Error processing audio segment:', error);
                        mainWindow?.webContents.send('audio-error', {
                            message: 'Failed to process audio',
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }
        };
        // Handle recording stop
        audioRecorder.onstop = async () => {
            try {
                if (audioChunks.length > 0) {
                    await processAudioSegment(audioChunks, mainWindow);
                }
            }
            catch (error) {
                console.error('Error in final audio segment processing:', error);
            }
            finally {
                cleanupAudio(mainWindow);
            }
        };
        // Start recording with 1-second timeslices
        audioRecorder.start(1000);
        // Notify renderer that recording has started
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('recording-state', { isRecording: true });
        }
        return true;
    }
    catch (error) {
        console.error('Error starting audio capture:', error);
        cleanupAudio(mainWindow);
        return false;
    }
}
/**
 * Stops the current audio capture if one is in progress
 * @param mainWindow The main browser window for sending IPC messages
 */
export function stopAudioCapture(mainWindow) {
    if (audioRecorder && audioRecorder.state !== 'inactive') {
        audioRecorder.stop();
    }
    else {
        cleanupAudio(mainWindow);
    }
}
/**
 * Processes an audio segment and saves it to disk
 * @param chunks Array of audio data chunks
 * @param mainWindow The main browser window for sending IPC messages
 */
async function processAudioSegment(chunks, mainWindow) {
    if (chunks.length === 0)
        return;
    const audioBlob = new Blob(chunks, { type: 'audio/webm' });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const segmentId = uuidv4();
    const filename = `${segmentId}.webm`;
    const filePath = join(getAudioDir(), filename);
    try {
        await ensureDir(getAudioDir());
        await writeFile(filePath, buffer);
        const ingest = {
            agent_id: 'edge-agent',
            session_id: 'current-session',
            segment_ts: new Date().toISOString(),
            audio_ref: filePath,
            meta: {
                duration: chunks.length * 1000,
                format: 'webm',
                sampleRate: 44100,
                channels: 2,
                bitDepth: 16
            }
        };
        // Preprocess the audio before ASR
        const processedAudio = await audioPreprocessor.process(buffer);
        try {
            // Transcribe the audio
            const transcription = await whisperASR.transcribe(processedAudio);
            console.log('Transcription:', transcription.text);
            // Add transcription to the ingest data
            const enhancedIngest = {
                ...ingest,
                transcription: {
                    text: transcription.text,
                    language: transcription.language,
                    segments: transcription.segments.map((segment) => ({
                        start: segment.start,
                        end: segment.end,
                        text: segment.text,
                        confidence: 1 - segment.noSpeechProb // Higher is better
                    }))
                }
            };
            // Send to processor service with transcription
            await axios.post('http://localhost:3001/ingest', enhancedIngest);
            console.log(`Processed and transcribed audio segment: ${filePath}`);
        }
        catch (error) {
            console.error('ASR failed, sending without transcription:', error);
            // Fallback to sending without transcription if ASR fails
            await axios.post('http://localhost:3001/ingest', ingest);
        }
        // Notify renderer if window is available
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('audio-segment-processed', {
                filePath,
                duration: chunks.length,
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        console.error('Error processing audio segment:', error);
        // Notify renderer of error if window is available
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('audio-error', {
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
        // Re-throw to allow caller to handle the error
        throw error;
    }
}
/**
 * Cleans up audio resources and notifies the renderer
 * @param mainWindow The main browser window for sending IPC messages
 */
function cleanupAudio(mainWindow) {
    try {
        // Stop all tracks in the audio stream
        if (audioStream) {
            audioStream.getTracks().forEach(track => {
                try {
                    track.stop();
                    audioStream?.removeTrack(track);
                }
                catch (error) {
                    console.error('Error stopping track:', error);
                }
            });
            audioStream = null;
        }
        // Stop the media recorder if active
        if (audioRecorder && audioRecorder.state !== 'inactive') {
            try {
                audioRecorder.stop();
            }
            catch (error) {
                console.error('Error stopping MediaRecorder:', error);
            }
        }
        audioRecorder = null;
        audioChunks = [];
        recordingStartTime = null;
        // Notify renderer that recording has stopped
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('recording-state', {
                isRecording: false,
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        console.error('Error in cleanupAudio:', error);
    }
}
//# sourceMappingURL=capture.js.map