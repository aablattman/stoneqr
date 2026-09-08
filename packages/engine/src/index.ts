export * from './types.js';
export { encode, EncodeError, sizeForVersion, minimumVersion } from './encode.js';
export { renderSvg, matrixToPath, escapeXml, type SvgOptions } from './render/svg.js';
export { rasterize, type RasterOptions } from './raster.js';
export { verifyRaster, verifyRasterAsync, verifyImageData, type VerifyResult } from './verify.js';
export { paperColor, MODULE_MM_WARN, MODULE_MM_GOOD, CONTRAST_MIN, LOGO_WARN_COVER, LOGO_BLOCK_COVER, SCAN_SAFETY, moduleMm, maxScanDistanceM, minWidthMmForDistance, minWidthMmForModule, toMm, fromMm, parseColor, relativeLuminance, contrastRatio, isInverted, isReddish, formatMm, assess, statusFor, summary, type LengthUnit, type SizingInput, type SizingStatus } from './sizing.js';
export * from './payloads/index.js';
export { crc32, physChunk, setPngDpi, encodePng, exportPng, parseRgb, type PngExportOptions, type PngExportResult } from './export/png.js';
export { exportEps, mergedRuns, type EpsOptions, type ModuleRun } from './export/eps.js';
// PDF exports (pdf-lib) stay on the "./export/pdf" subpath so the core bundle stays small.
// Label sheets (pdf-lib) stay on the "./labels" subpath for the same reason.
export { renderHalftone, halftoneVersionFor, halftoneWithFallback, imagePlacement, prepareImage, DOT_SCALE_MIN, DOT_SCALE_MAX, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX, IMAGE_OFFSET_MAX, THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_DEFAULT, HALFTONE_MIN_MODULES, type HalftoneOptions, type HalftoneResult, type ImagePlacement } from './render/halftone.js';
