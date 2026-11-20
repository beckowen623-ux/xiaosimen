# 生成一段原创轻音乐背景（纯程序合成，无版权问题）：C-G-Am-F 和弦铺底 + 钢琴感拨弦旋律，96 BPM。
import sys, wave, numpy as np
SR = 44100; BPM = 96; beat = 60 / BPM
dur = float(sys.argv[2]) if len(sys.argv) > 2 else 36
n = int(SR * dur); out = np.zeros(n)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def pluck(t0, midi, length, amp):
    i0 = int(t0 * SR); L = int(length * SR); t = np.arange(L) / SR
    env = np.exp(-t * 3.2) * np.minimum(1, t * 200)
    f = hz(midi); sig = (np.sin(2*np.pi*f*t) + 0.35*np.sin(4*np.pi*f*t) + 0.12*np.sin(6*np.pi*f*t)) * env * amp
    e = min(n, i0 + L)
    if e > i0: out[i0:e] += sig[:e - i0]
def pad(t0, notes, length, amp):
    i0 = int(t0 * SR); L = int(length * SR); t = np.arange(L) / SR
    env = np.minimum(1, t / 0.6) * np.minimum(1, (length - t) / 0.6)
    sig = sum(np.sin(2*np.pi*hz(m)*t) + 0.5*np.sin(2*np.pi*hz(m)*1.003*t) for m in notes) * env * amp
    e = min(n, i0 + L)
    if e > i0: out[i0:e] += sig[:e - i0]
chords = [[48, 55, 64], [43, 50, 59], [45, 52, 60], [41, 48, 57]]   # C G Am F
melody = [[72, 76, 79, 76], [71, 74, 79, 74], [72, 76, 81, 76], [72, 77, 81, 77]]
bar = 4 * beat; t = 0.0; k = 0
while t < dur:
    c = chords[k % 4]; pad(t, c, bar + 0.3, 0.035); pluck(t, c[0] - 12, bar, 0.12)
    for j, m in enumerate(melody[k % 4]):
        pluck(t + j * beat, m, 1.6, 0.07)
        if k % 2: pluck(t + j * beat + beat / 2, m - 5 if j % 2 else m + 3, 1.0, 0.035)
    t += bar; k += 1
fade = int(1.5 * SR); out[-fade:] *= np.linspace(1, 0, fade); out[:int(0.3*SR)] *= np.linspace(0, 1, int(0.3*SR))
out = out / np.max(np.abs(out)) * 0.6
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
