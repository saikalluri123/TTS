import wave
import math
import struct
import os

def create_sample_wav(filename):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    sample_rate = 16000
    duration = 3.44  # 3.44 seconds matching the screenshot
    num_samples = int(sample_rate * duration)
    
    # Generate multi-harmonic synthesized speech-like melody / tone
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        frames = bytearray()
        for i in range(num_samples):
            t = i / sample_rate
            # Base cadence frequency varying over time
            f0 = 140 + 20 * math.sin(2 * math.pi * 1.5 * t)
            # Formant simulation
            sample_val = 0.5 * math.sin(2 * math.pi * f0 * t) + \
                         0.3 * math.sin(2 * math.pi * f0 * 2 * t) + \
                         0.2 * math.sin(2 * math.pi * f0 * 3 * t)
            
            # Envelope to fade in and out with natural pauses
            envelope = math.sin(math.pi * (t / duration)) ** 0.5
            if 1.4 < t < 1.7:  # pause simulation
                envelope *= 0.1
                
            sample_int = int(sample_val * envelope * 20000)
            sample_int = max(-32768, min(32767, sample_int))
            frames.extend(struct.pack('<h', sample_int))
            
        wav_file.writeframes(frames)
    print(f"Generated sample wav: {filename}")

if __name__ == '__main__':
    create_sample_wav(r"c:\Users\Vineela\Downloads\TTS\test-portal\sample.wav")
