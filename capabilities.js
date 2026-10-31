// Feature probes for the device check. Everything runs locally; nothing is sent anywhere.

// Minimal module using a v128 SIMD instruction (same probe as wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

/**
 * Asks the browser for a high-performance WebGPU adapter and a device.
 * @returns {Promise<{available: boolean, f16: boolean, fallbackAdapter: boolean, vendor: string,
 *   architecture: string, maxBufferMB: number, error: string}>} `available` is false for software adapters.
 */
async function probeWebGPU() {
  const result = { available: false, f16: false, fallbackAdapter: false, vendor: '', architecture: '', maxBufferMB: 0, error: '' };
  if (!('gpu' in navigator)) {
    result.error = 'navigator.gpu is not available in this browser';
    return result;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      result.error = 'No WebGPU adapter (GPU blocklisted or disabled)';
      return result;
    }
    const info = adapter.info || {};
    result.vendor = info.vendor || '';
    result.architecture = info.architecture || '';
    result.fallbackAdapter = Boolean(info.isFallbackAdapter ?? adapter.isFallbackAdapter);
    result.f16 = adapter.features.has('shader-f16');
    result.maxBufferMB = Math.round(adapter.limits.maxBufferSize / (1024 * 1024));
    // Some adapters are listed but fail when a device is requested, so create (and free) one.
    const device = await adapter.requestDevice();
    device.destroy();
    result.available = !result.fallbackAdapter;
    if (result.fallbackAdapter) result.error = 'Only a software (fallback) adapter is available';
  } catch (err) {
    result.error = String(err?.message || err);
  }
  return result;
}

/**
 * Checks WebAssembly support and whether SIMD instructions validate (required by both engines).
 * @returns {{wasm: boolean, simd: boolean}}
 */
function probeWasm() {
  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  let simd = false;
  try {
    simd = wasm && WebAssembly.validate(SIMD_PROBE);
  } catch {
    simd = false;
  }
  return { wasm, simd };
}

/**
 * Best-effort phone/tablet detection, used to pick smaller models.
 * @returns {boolean}
 */
function isMobile() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }
  // iPadOS reports a desktop UA, so also check for touch + coarse pointer.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches);
}

/**
 * Estimates how much storage this site may still use for cached models.
 * @returns {Promise<number|null>} Free megabytes, or null if the browser does not say.
 */
async function probeFreeStorageMB() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    return Math.round((quota - usage) / (1024 * 1024));
  } catch {
    return null;
  }
}

/**
 * Runs all probes and returns the capability record used by models.js to recommend a setup.
 * @returns {Promise<object>} See the returned keys; `deviceMemoryGB` is null outside Chromium.
 */
export async function detectCapabilities() {
  const [webgpu, storageFreeMB] = await Promise.all([probeWebGPU(), probeFreeStorageMB()]);
  const { wasm, simd } = probeWasm();
  return {
    secureContext: window.isSecureContext,
    protocol: location.protocol,
    webgpu,
    wasm,
    wasmSimd: simd,
    threads: Boolean(window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'),
    cores: navigator.hardwareConcurrency || 2,
    // Chromium-only and capped at 8; null elsewhere.
    deviceMemoryGB: navigator.deviceMemory ?? null,
    mobile: isMobile(),
    storageFreeMB,
  };
}
