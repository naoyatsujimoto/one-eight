/**
 * useSound — 効果音再生フック
 * モジュールロード時に AudioContext + BufferSource でデコード済みバッファをキャッシュ。
 * 初回ユーザーインタラクション後に AudioContext を resume してディレイゼロで再生。
 * iPhone Safari を含む環境でも安全に動作するよう resume を適切に処理。
 * バッファ準備失敗はゲーム操作を妨げないよう握り潰す。
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
loadBuffer('position', '/sounds/position-place.wav');
loadBuffer('asset',    '/sounds/asset-place.wav');
// 既存音源は未使用のまま残す（削除禁止）
// loadBuffer('symbol', '/sounds/Symbol.mp3');
// loadBuffer('assetset', '/sounds/Assetset.mp3');

async function playBuffer(key: string): Promise<void> {
  try {
    const c = getCtx();
    // iOS Safari: ユーザー操作後に resume が必要
    if (c.state === 'suspended') {
      await c.resume();
    }
    const buf = buffers[key];
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch { /* ignore — バッファ失敗はゲーム操作を妨げない */ }
}

export function useSound() {
  return {
    /** Position駒を盤面に置く音 */
    playSymbol: () => { void playBuffer('position'); },
    /** AssetがSlotへはまる音 */
    playAsset:  () => { void playBuffer('asset'); },
  };
}
