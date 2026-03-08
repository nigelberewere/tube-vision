import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg() {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  return ffmpeg;
}

export async function cutVideo(
  videoUrl: string, 
  startTimeStr: string, 
  endTimeStr: string, 
  onProgress?: (progress: number) => void
): Promise<string> {
  const ffmpegInstance = await initFFmpeg();
  
  // Convert MM:SS to seconds
  const parseTime = (timeStr: string) => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return parseInt(timeStr);
  };
  
  const startSec = parseTime(startTimeStr);
  const endSec = parseTime(endTimeStr);
  const duration = endSec - startSec;
  
  if (onProgress) {
    ffmpegInstance.on('progress', ({ progress, time }) => {
      onProgress(progress);
    });
  }

  // Fetch the video file
  const videoData = await fetchFile(videoUrl);
  
  // Write to ffmpeg FS
  const inputName = 'input.mp4';
  const outputName = 'output.mp4';
  await ffmpegInstance.writeFile(inputName, videoData);
  
  // Run ffmpeg command
  // -ss start time, -i input, -t duration
  // Add crop filter for 9:16 aspect ratio (YouTube Shorts), ensuring even dimensions
  await ffmpegInstance.exec([
    '-ss', startSec.toString(),
    '-i', inputName,
    '-t', duration.toString(),
    '-vf', "crop='trunc(ih*9/16/2)*2':ih",
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-c:a', 'aac',
    outputName
  ]);
  
  // Read output
  const outputData = await ffmpegInstance.readFile(outputName);
  
  // Cleanup
  await ffmpegInstance.deleteFile(inputName);
  await ffmpegInstance.deleteFile(outputName);
  
  // Create blob URL
  const blob = new Blob([outputData], { type: 'video/mp4' });
  return URL.createObjectURL(blob);
}
