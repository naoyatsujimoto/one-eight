/**
 * useSound — 効果音再生フック
 * モジュールロード時に AudioContext + BufferSource でデコード済みバッファをキャッシュ。
 * 初回ユーザーインタラクション後に AudioContext を resume してディレイゼロで再生。
 */

let ctx: AudioContext | null = null;
const buffers: Record<string, AudioBuffer> = {};

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

async function loadBuffer(key: string, url: string): Promise<void> {
  if (buffers[key]) return;
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    buffers[key] = await getCtx().decodeAudioData(arr);
  } catch { /* ignore */ }
}

// モジュール読み込み時に即プリフェッチ開始
loadBuffer('symbol', '/sounds/Symbol.mp3');
loadBuffer('asset',  '/sounds/Assetset.mp3');

function playBuffer(key: string) {
  const c = getCtx();
  // iOS Safari: ユーザー操作後に resume が必要
  if (c.state === 'suspended') c.resume();
  const buf = buffers[key];
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

export function useSound() {
  return {
    playSymbol: () => playBuffer('symbol'),
    playAsset:  () => playBuffer('asset'),
  };
}
