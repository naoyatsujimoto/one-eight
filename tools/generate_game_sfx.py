"""
generate_game_sfx.py
ONE EIGHT Web MVP — オリジナル効果音生成スクリプト

使用ライブラリ: wave / math / random / struct (標準ライブラリのみ)
"""

import wave
import math
import random
import struct
import os

SAMPLE_RATE = 44100
CHANNELS = 1
BIT_DEPTH = 16
MAX_AMP = 32767  # 16-bit signed max

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds')


def clamp(v: float) -> float:
    return max(-1.0, min(1.0, v))


def save_wav(filename: str, samples: list[float]) -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, filename)
    with wave.open(path, 'w') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(BIT_DEPTH // 8)
        wf.setframerate(SAMPLE_RATE)
        packed = b''.join(
            struct.pack('<h', int(clamp(s) * MAX_AMP)) for s in samples
        )
        wf.writeframes(packed)
    print(f'Saved: {path}')


def analyze(samples: list[float], label: str) -> None:
    peak = max(abs(s) for s in samples)
    duration_ms = len(samples) / SAMPLE_RATE * 1000
    peak_dbfs = 20 * math.log10(peak) if peak > 0 else -float('inf')
    print(f'--- {label} ---')
    print(f'  Sample rate : {SAMPLE_RATE} Hz')
    print(f'  Channels    : {CHANNELS}')
    print(f'  Bit depth   : {BIT_DEPTH} bit')
    print(f'  Duration    : {duration_ms:.1f} ms')
    print(f'  Peak        : {peak_dbfs:.2f} dBFS')


# ─────────────────────────────────────────────────────────────────────────────
# 音源1: position-place.wav
# 「コッ」木製駒を硬い木盤へ置く音
# 短いノイズ成分 + 複数の減衰正弦波 → 木質ノック音
# ─────────────────────────────────────────────────────────────────────────────
def gen_position_place() -> list[float]:
    rng = random.Random(42)
    dur_ms = 100  # 100ms
    n = int(SAMPLE_RATE * dur_ms / 1000)
    samples = [0.0] * n

    # --- ノイズバースト (0〜8ms) で「コ」の初撃 ---
    noise_dur = int(SAMPLE_RATE * 0.008)
    for i in range(min(noise_dur, n)):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 180)  # 急速減衰
        noise = rng.uniform(-1.0, 1.0)
        samples[i] += noise * env * 0.35

    # --- 低域正弦波成分: 木の胴鳴り (180 Hz) ---
    f1, tau1, amp1 = 180.0, 0.030, 0.60
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t / tau1)
        samples[i] += math.sin(2 * math.pi * f1 * t) * env * amp1

    # --- 中域成分: 木板の響き (420 Hz) ---
    f2, tau2, amp2 = 420.0, 0.018, 0.30
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t / tau2)
        samples[i] += math.sin(2 * math.pi * f2 * t) * env * amp2

    # --- 高域成分: 木の固さ (900 Hz) ---
    f3, tau3, amp3 = 900.0, 0.008, 0.15
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t / tau3)
        samples[i] += math.sin(2 * math.pi * f3 * t) * env * amp3

    # DCオフセット除去
    mean = sum(samples) / len(samples)
    samples = [s - mean for s in samples]

    # 末尾フェード (最後10ms)
    fade_len = int(SAMPLE_RATE * 0.010)
    for i in range(fade_len):
        idx = n - fade_len + i
        samples[idx] *= (fade_len - i) / fade_len

    # ノーマライズ → peak = -5 dBFS
    target_peak = 10 ** (-5.0 / 20)
    current_peak = max(abs(s) for s in samples)
    if current_peak > 0:
        gain = target_peak / current_peak
        samples = [s * gain for s in samples]

    return samples


# ─────────────────────────────────────────────────────────────────────────────
# 音源2: asset-place.wav
# 「パチッ」AssetがSlotへはまる鋭く軽いクリック音
# 高域寄りのノイズバースト + 極短い減衰成分
# ─────────────────────────────────────────────────────────────────────────────
def gen_asset_place() -> list[float]:
    rng = random.Random(99)
    dur_ms = 50  # 50ms
    n = int(SAMPLE_RATE * dur_ms / 1000)
    samples = [0.0] * n

    # --- 高域ノイズバースト (0〜5ms): 「パ」の硬い打撃 ---
    noise_dur = int(SAMPLE_RATE * 0.005)
    for i in range(min(noise_dur, n)):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 600)  # 超急速減衰
        noise = rng.uniform(-1.0, 1.0)
        samples[i] += noise * env * 0.55

    # --- 高域クリック正弦波成分 (1200 Hz): プラスチック的なはまり感 ---
    f1, tau1, amp1 = 1200.0, 0.006, 0.45
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t / tau1)
        samples[i] += math.sin(2 * math.pi * f1 * t) * env * amp1

    # --- 超高域 (2800 Hz): 鋭さの輝き ---
    f2, tau2, amp2 = 2800.0, 0.003, 0.20
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t / tau2)
        samples[i] += math.sin(2 * math.pi * f2 * t) * env * amp2

    # --- 軽い低域成分 (350 Hz): わずかな重さ ---
    f3, tau3, amp3 = 350.0, 0.008, 0.10
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t / tau3)
        samples[i] += math.sin(2 * math.pi * f3 * t) * env * amp3

    # DCオフセット除去
    mean = sum(samples) / len(samples)
    samples = [s - mean for s in samples]

    # 末尾フェード (最後5ms)
    fade_len = int(SAMPLE_RATE * 0.005)
    for i in range(fade_len):
        idx = n - fade_len + i
        samples[idx] *= (fade_len - i) / fade_len

    # ノーマライズ → peak = -5 dBFS
    target_peak = 10 ** (-5.0 / 20)
    current_peak = max(abs(s) for s in samples)
    if current_peak > 0:
        gain = target_peak / current_peak
        samples = [s * gain for s in samples]

    return samples


if __name__ == '__main__':
    print('=== ONE EIGHT SFX Generator ===\n')

    pos_samples = gen_position_place()
    save_wav('position-place.wav', pos_samples)
    analyze(pos_samples, 'position-place.wav')

    print()

    asset_samples = gen_asset_place()
    save_wav('asset-place.wav', asset_samples)
    analyze(asset_samples, 'asset-place.wav')

    print('\nDone.')
