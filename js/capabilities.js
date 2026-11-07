// Feature probes for the device check. Everything runs locally; nothing is sent anywhere.

// Minimal module using a v128 SIMD instruction (same probe as wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

/** Probes WebGPU adapter availability and shader-f16 support.
 * @returns {Promise<{available: boolean, f16: boolean, maxBufferMB: number, error: string|null}>}
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

/** Checks WebAssembly and WebAssembly SIMD support.
 * @returns {{wasm: boolean, wasmSimd: boolean}}
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

/** Uses coarse browser signals to identify a likely mobile device.
 * @returns {boolean} True for mobile-oriented user agents.
 */
function isMobile() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }
  // iPadOS reports a desktop UA, so also check for touch + coarse pointer.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches);
}

/** Reads browser storage estimates and converts free bytes to megabytes.
 * @returns {Promise<number|null>} Free megabytes, or null when unavailable.
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

/** Collects all device, browser, GPU, memory and storage capability signals.
 * @returns {Promise<object>} Capability object consumed by model recommendation and incompatibility checks.
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
