import { global } from '@storybook/global';
import { converter, parse as parseCssColor } from 'culori';
import type { ImpactValue, Result, NodeResult } from 'axe-core';

const { document } = global;

const DEFAULT_APCA_OPTIONS: Required<ApcaOptions> = {
  level: 'bronze',
  useCase: 'body',
  iconSelectors: [],
};

const APCA_LC_STEPS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125];
const APCA_MAX_CONTRAST_LC = 90;
const toRgb = converter('rgb');

type ApcaConformanceLevel = 'bronze' | 'silver' | 'gold';
type ApcaUseCase = 'body' | 'fluent' | 'sub-fluent' | 'non-fluent';
type ImpactLevel = Exclude<ImpactValue, null>;

interface ApcaOptions {
  level?: ApcaConformanceLevel;
  useCase?: ApcaUseCase;
  iconSelectors?: string[] | string;
}

interface APCAViolation {
  element: Element;
  foreground: string;
  foregrounds?: string[];
  background: string;
  contrastValue: number;
  fontSize: number;
  fontWeight: number;
  threshold: number | null;
  maxContrast?: number;
  useCase: ApcaUseCase;
  level: ApcaConformanceLevel;
  minFontSize?: number;
  note?: string;
  kind?: 'text' | 'icon';
  colorCount?: number;
}

interface NonTextViolation {
  element: Element;
  foregrounds: string[];
  background: string;
  contrastRatio: number;
  minContrast: number;
  colorCount: number;
}

interface IncompleteContrast {
  element: Element;
  reason: string;
  rule: 'apca-contrast' | 'non-text-contrast';
}

/**
 * Get computed color for an element
 */
function getComputedColor(element: Element, property: 'color' | 'backgroundColor'): string {
  const computed = global.getComputedStyle(element);
  return computed[property] || '';
}

/**
 * Get the effective background color by traversing up the DOM
 */
function getEffectiveBackgroundColor(
  element: Element,
  options: { ignoreSelfBackground?: boolean } = {}
): string {
  let current: Element | null = options.ignoreSelfBackground ? element.parentElement : element;

  while (current) {
    const bgColor = getComputedColor(current, 'backgroundColor');
    // Check if background is not transparent
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return bgColor;
    }
    if (current === document.body) {
      break;
    }
    current = current.parentElement;
  }

  const htmlBg = document.documentElement
    ? getComputedColor(document.documentElement, 'backgroundColor')
    : '';
  if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
    return htmlBg;
  }

  // Default to white if no background found
  return 'rgb(255, 255, 255)';
}

/**
 * Convert RGB/RGBA string to array of numbers
 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function parseColor(color: string): [number, number, number] | null {
  if (!color) return null;
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  }

  const parsed = parseCssColor(color);
  if (!parsed) return null;
  const rgb = toRgb(parsed);
  if (!rgb) return null;
  if (rgb.alpha !== undefined && rgb.alpha <= 0) return null;

  return [
    Math.round(clamp01(rgb.r) * 255),
    Math.round(clamp01(rgb.g) * 255),
    Math.round(clamp01(rgb.b) * 255),
  ];
}

function areColorsEqual(
  first: [number, number, number] | null,
  second: [number, number, number] | null
): boolean {
  if (!first || !second) return false;
  return first[0] === second[0] && first[1] === second[1] && first[2] === second[2];
}

function normalizeUseCase(value: string | null, fallback: ApcaUseCase): ApcaUseCase {
  if (!value) return fallback;
  const normalized = value.toLowerCase().replace(/\s+/g, '-');
  if (normalized.includes('body')) return 'body';
  if (normalized.includes('sub') || normalized.includes('logo')) return 'sub-fluent';
  if (normalized.includes('non') || normalized.includes('incidental') || normalized.includes('spot')) {
    return 'non-fluent';
  }
  if (normalized.includes('fluent')) return 'fluent';
  return fallback;
}

function getUseCaseForElement(element: Element, fallback: ApcaUseCase): ApcaUseCase {
  const attr =
    element.getAttribute('data-apca-usecase') ??
    element.getAttribute('data-apca-use-case') ??
    element.getAttribute('data-apca-usage');
  return normalizeUseCase(attr, fallback);
}

function normalizeWeightBucket(fontWeight: number): number {
  const weight = Number.isFinite(fontWeight) ? fontWeight : 400;
  const clamped = Math.max(100, Math.min(900, weight));
  return Math.round(clamped / 100) * 100;
}

function getBronzeThreshold(
  useCase: ApcaUseCase,
  fontSize: number
): { threshold: number; preferred?: number } | null {
  if (useCase === 'body') {
    return { threshold: 75, preferred: 90 };
  }

  if (useCase === 'fluent') {
    if (fontSize > 32) {
      return { threshold: 45 };
    }
    if (fontSize >= 16) {
      return { threshold: 60 };
    }
    return { threshold: 75 };
  }

  return null;
}

function getMinFontSize(level: ApcaConformanceLevel, useCase: ApcaUseCase): number | undefined {
  if (level === 'bronze') return undefined;
  if (useCase === 'sub-fluent') {
    return level === 'gold' ? 12 : 10;
  }
  if (useCase === 'fluent' || useCase === 'body') {
    return level === 'gold' ? 16 : 14;
  }
  return undefined;
}

function getMaxContrast(
  level: ApcaConformanceLevel,
  useCase: ApcaUseCase,
  fontSize: number,
  fontWeight: number
): number | undefined {
  if (level === 'bronze') {
    if (useCase === 'fluent' && fontSize > 32 && fontWeight >= 700) {
      return APCA_MAX_CONTRAST_LC;
    }
    return undefined;
  }

  if ((useCase === 'body' || useCase === 'fluent') && fontSize > 36) {
    return APCA_MAX_CONTRAST_LC;
  }

  return undefined;
}

function getBaseThresholdFromLookup(
  fontSize: number,
  fontWeight: number,
  allowNonContent: boolean,
  fontLookupAPCA: (contrast: number, places?: number) => Array<string | number>
): number | null {
  const weightBucket = normalizeWeightBucket(fontWeight);
  const weightIndex = Math.round(weightBucket / 100);

  for (const lc of APCA_LC_STEPS) {
    const row = fontLookupAPCA(lc, 2);
    const requiredSize = Number(row[weightIndex]);

    if (!Number.isFinite(requiredSize)) continue;
    if (requiredSize === 999) continue;
    if (requiredSize === 777 && !allowNonContent) continue;

    const minSize = requiredSize === 777 ? 0 : requiredSize;
    if (fontSize >= minSize) {
      return lc;
    }
  }

  return null;
}

function getApcaThreshold(
  level: ApcaConformanceLevel,
  useCase: ApcaUseCase,
  fontSize: number,
  fontWeight: number,
  fontLookupAPCA: (contrast: number, places?: number) => Array<string | number>
): {
  threshold: number | null;
  minFontSize?: number;
  maxContrast?: number;
  note?: string;
  skip?: boolean;
} {
  if (level === 'bronze') {
    const bronzeThreshold = getBronzeThreshold(useCase, fontSize);
    if (!bronzeThreshold) {
      return { threshold: null, skip: true };
    }
    return {
      threshold: bronzeThreshold.threshold,
      maxContrast: getMaxContrast(level, useCase, fontSize, fontWeight),
    };
  }

  const minFontSize = getMinFontSize(level, useCase);
  const baseThreshold = getBaseThresholdFromLookup(
    fontSize,
    fontWeight,
    useCase === 'non-fluent',
    fontLookupAPCA
  );

  if (baseThreshold === null) {
    return {
      threshold: null,
      minFontSize,
      note: 'Font size/weight is below the minimums in the APCA lookup table for this use case.',
    };
  }

  let threshold = baseThreshold;

  if (useCase === 'sub-fluent') {
    threshold = Math.max(threshold - 15, level === 'silver' ? 40 : 45);
  } else if (useCase === 'non-fluent') {
    threshold = Math.max(threshold - (level === 'silver' ? 30 : 20), 30);
  }

  if (useCase === 'body' && level === 'gold' && threshold < 75) {
    threshold += 15;
  }

  return {
    threshold,
    minFontSize,
    maxContrast: getMaxContrast(level, useCase, fontSize, fontWeight),
  };
}

const TEXT_ELEMENT_SELECTOR =
  'p, span, div, h1, h2, h3, h4, h5, h6, a, button, label, td, th, li, input, textarea';

const ICON_SELECTOR_LIST = [
  'svg',
  '.iconify',
  '.iconify-color',
  '[data-icon]',
  '[class*="icon-"]',
  '[class*="icon_"]',
];

const ICON_ELEMENT_SELECTOR = ICON_SELECTOR_LIST.join(', ');

const SVG_SHAPE_SELECTOR =
  'path, circle, rect, line, polyline, polygon, ellipse, text, use';

const DEFAULT_NON_TEXT_MIN_CONTRAST = 3;
const MAX_ICON_DIMENSION = 128;

/**
 * Check if element contains readable text
 */
function hasReadableText(element: Element): boolean {
  const text = element.textContent?.trim() || '';
  // Ignore elements with no text or very short text (like icons)
  return text.length > 0;
}

function hasDirectTextNode(element: Element): boolean {
  return Array.from(element.childNodes).some((node) =>
    node.nodeType === Node.TEXT_NODE && (node.textContent?.trim()?.length ?? 0) > 0
  );
}

/**
 * Check if element is visible
 */
function isVisible(element: Element): boolean {
  const computed = global.getComputedStyle(element);
  return (
    computed.display !== 'none' &&
    computed.visibility !== 'hidden' &&
    computed.opacity !== '0'
  );
}

function isTransparentColorValue(value: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'transparent' ||
    normalized === 'none' ||
    normalized === 'rgba(0, 0, 0, 0)' ||
    normalized === 'rgba(0,0,0,0)'
  );
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function extractCssUrls(value: string): string[] {
  const urls: string[] = [];
  const regex = /url\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    urls.push(stripQuotes(match[1].trim()));
  }
  return urls;
}

function decodeSvgDataUri(dataUri: string): string | null {
  const match = dataUri.match(/^data:image\/svg\+xml(?:;charset=[^,]+)?(;base64)?,(.*)$/i);
  if (!match) return null;
  const isBase64 = Boolean(match[1]);
  const payload = match[2] ?? '';
  try {
    if (isBase64) {
      if (typeof globalThis.atob === 'function') {
        return globalThis.atob(payload);
      }
      return Buffer.from(payload, 'base64').toString('utf-8');
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function resolveSvgMarkupFromCssValue(
  value: string,
  computed: CSSStyleDeclaration
): { markup: string | null; reason?: string } {
  if (!value || value === 'none') return { markup: null };
  let resolved = value.trim();

  if (resolved.includes('var(')) {
    const svgVar = computed.getPropertyValue('--svg').trim();
    if (svgVar) {
      resolved = resolved.replace(/var\(--svg\)/g, svgVar);
    }
  }

  if (resolved.includes('var(')) {
    return { markup: null, reason: 'uses unresolved CSS variables' };
  }

  const urls = extractCssUrls(resolved);
  const candidates = urls.length > 0 ? urls : [resolved];

  for (const candidate of candidates) {
    if (candidate.startsWith('data:image/svg+xml')) {
      const decoded = decodeSvgDataUri(candidate);
      if (decoded) {
        return { markup: decoded };
      }
      return { markup: null, reason: 'contains unreadable SVG data' };
    }
  }

  return { markup: null, reason: 'does not reference inline SVG data' };
}

function parsePaintValue(
  value: string | null,
  fallbackColor: string | null
): { colors: string[]; unresolved: string[] } {
  if (!value) return { colors: [], unresolved: [] };
  const normalized = value.trim();
  if (isTransparentColorValue(normalized)) return { colors: [], unresolved: [] };
  const lower = normalized.toLowerCase();
  if (lower === 'currentcolor') {
    return fallbackColor ? { colors: [fallbackColor], unresolved: [] } : { colors: [], unresolved: ['currentColor'] };
  }
  if (lower.startsWith('url(')) {
    return { colors: [], unresolved: [normalized] };
  }
  if (lower.startsWith('var(')) {
    return { colors: [], unresolved: [normalized] };
  }
  if (lower === 'inherit' || lower === 'context-fill' || lower === 'context-stroke') {
    return { colors: [], unresolved: [normalized] };
  }
  return { colors: [normalized], unresolved: [] };
}

function extractPaintFromStyle(style: string | null, property: 'fill' | 'stroke'): string | null {
  if (!style) return null;
  const match = style.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
}

function extractPaintValuesFromSvgElement(
  svg: SVGElement,
  fallbackColor: string | null,
  useComputedStyle: boolean
): { colors: string[]; unresolved: string[] } {
  const colors: string[] = [];
  const unresolved: string[] = [];
  const shapes = Array.from(svg.querySelectorAll(SVG_SHAPE_SELECTOR));
  const targets = shapes.length > 0 ? shapes : [svg];

  targets.forEach((shape) => {
    (['fill', 'stroke'] as const).forEach((property) => {
      let value = shape.getAttribute(property);
      if (!value) {
        value = extractPaintFromStyle(shape.getAttribute('style'), property);
      }
      if (!value && useComputedStyle) {
        const computed = global.getComputedStyle(shape);
        value = computed.getPropertyValue(property) || (computed as any)[property];
        if (value === 'none' || value === 'transparent') {
          value = null;
        }
      }

      const parsed = parsePaintValue(value, fallbackColor);
      colors.push(...parsed.colors);
      unresolved.push(...parsed.unresolved);
    });
  });

  return { colors, unresolved };
}

function getNonTextImpact(contrastRatio: number): ImpactLevel {
  if (contrastRatio < 1.5) return 'critical';
  if (contrastRatio < 2) return 'serious';
  if (contrastRatio < 2.5) return 'moderate';
  return 'minor';
}

function extractPaintValuesFromSvgMarkup(
  markup: string,
  fallbackColor: string | null
): { colors: string[]; unresolved: string[] } {
  if (typeof DOMParser === 'undefined') {
    return { colors: [], unresolved: ['SVG parsing not available'] };
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(markup, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) {
    return { colors: [], unresolved: ['SVG markup missing root element'] };
  }
  return extractPaintValuesFromSvgElement(svg, fallbackColor, false);
}

function parseColorList(values: string[]): { rgb: [number, number, number]; value: string }[] {
  const parsed: { rgb: [number, number, number]; value: string }[] = [];
  values.forEach((value) => {
    const rgb = parseColor(value);
    if (rgb) {
      parsed.push({ rgb, value });
    }
  });
  return parsed;
}

function getContrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const l1 = 0.2126 * toLinear(fg[0]) + 0.7152 * toLinear(fg[1]) + 0.0722 * toLinear(fg[2]);
  const l2 = 0.2126 * toLinear(bg[0]) + 0.7152 * toLinear(bg[1]) + 0.0722 * toLinear(bg[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getIconSize(element: Element, computed: CSSStyleDeclaration): number {
  const rect = element.getBoundingClientRect?.();
  const rectSize = rect ? Math.max(rect.width, rect.height) : 0;
  const width = parseFloat(computed.width);
  const height = parseFloat(computed.height);
  const fontSize = parseFloat(computed.fontSize);
  const sizeCandidates = [rectSize, width, height, fontSize].filter((value) =>
    Number.isFinite(value) && value > 0
  );
  if (sizeCandidates.length === 0) return 16;
  return Math.max(...sizeCandidates);
}

function isIconCandidate(element: Element, computed: CSSStyleDeclaration): boolean {
  if (element.classList.contains('iconify') || element.classList.contains('iconify-color')) {
    return true;
  }
  if (element.hasAttribute('data-icon')) {
    return true;
  }
  const className =
    typeof (element as HTMLElement).className === 'string'
      ? (element as HTMLElement).className
      : element.getAttribute('class') ?? '';
  if (/icon[-_]/i.test(className)) {
    return true;
  }
  if (element instanceof SVGElement) {
    const size = getIconSize(element, computed);
    if (size <= MAX_ICON_DIMENSION) return true;
  }
  const maskImage = computed.getPropertyValue('mask-image') || computed.getPropertyValue('-webkit-mask-image');
  if (maskImage && maskImage !== 'none') return true;
  const backgroundImage = computed.getPropertyValue('background-image');
  if (backgroundImage && backgroundImage.includes('svg')) return true;
  const svgVar = computed.getPropertyValue('--svg');
  if (svgVar && svgVar.includes('svg')) return true;
  return false;
}

function normalizeSelectorList(value?: string[] | string): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Run APCA contrast checks on the document
 */
export interface ContrastCheckResults {
  apcaResult: Result;
  nonTextResult: Result | null;
  apcaIncompleteResult: Result | null;
  nonTextIncompleteResult: Result | null;
}

export async function runAPCACheck(
  context: Element | Document = document,
  options: ApcaOptions = DEFAULT_APCA_OPTIONS,
  excludeSelectors: string[] = []
): Promise<ContrastCheckResults> {
  // Dynamic import of APCA library
  const { APCAcontrast, sRGBtoY, fontLookupAPCA } = await import('apca-w3');

  const apcaOptions = { ...DEFAULT_APCA_OPTIONS, ...options };

  const apcaViolations: APCAViolation[] = [];
  const nonTextViolations: NonTextViolation[] = [];
  const incompletes: IncompleteContrast[] = [];
  let iconTargets = 0;
  const root = context instanceof Document ? context.body : context;
  const customIconSelectors = normalizeSelectorList(apcaOptions.iconSelectors);
  const iconSelectorList = [...ICON_SELECTOR_LIST, ...customIconSelectors];

  const isExcludedElement = (element: Element) => {
    if (excludeSelectors.length === 0) return false;
    return excludeSelectors.some((selector) => {
      try {
        return element.closest(selector) !== null;
      } catch {
        return false;
      }
    });
  };

  // Get all text-containing elements
  const textElements = root.querySelectorAll(TEXT_ELEMENT_SELECTOR);

  textElements.forEach((element) => {
    if (isExcludedElement(element)) return;

    // Skip if not visible or has no text
    if (!isVisible(element) || !hasReadableText(element)) {
      return;
    }

    // Avoid reporting container elements when a descendant already represents the text
    if (!hasDirectTextNode(element) && element.querySelector(TEXT_ELEMENT_SELECTOR)) {
      return;
    }

    // Get colors
    const foreground = getComputedColor(element, 'color');
    const background = getEffectiveBackgroundColor(element);

    // Parse colors
    const fgColor = parseColor(foreground);
    const bgColor = parseColor(background);

    if (!fgColor || !bgColor) {
      return;
    }

    // Get font properties
    const computed = global.getComputedStyle(element);
    const fontSize = parseFloat(computed.fontSize);
    const fontWeight = parseInt(computed.fontWeight, 10);

    try {
      // Calculate APCA contrast
      const fgLuminance = sRGBtoY(fgColor);
      const bgLuminance = sRGBtoY(bgColor);
      const contrastValue = Math.abs(APCAcontrast(fgLuminance, bgLuminance));

      const useCase = getUseCaseForElement(element, apcaOptions.useCase);
      const level = apcaOptions.level;

      // Get appropriate threshold
      const { threshold, minFontSize, maxContrast, note, skip } = getApcaThreshold(
        level,
        useCase,
        fontSize,
        fontWeight,
        fontLookupAPCA
      );

      if (skip) {
        return;
      }

      const messages: string[] = [];
      if (threshold === null) {
        if (note) messages.push(note);
      } else {
        if (contrastValue < threshold) {
          messages.push(
            `APCA contrast of ${contrastValue.toFixed(1)} Lc is below the minimum of ${threshold} Lc for ${level} ${useCase} text.`
          );
        }
        if (maxContrast !== undefined && contrastValue > maxContrast) {
          messages.push(
            `APCA contrast of ${contrastValue.toFixed(1)} Lc exceeds the maximum of ${maxContrast} Lc for ${level} ${useCase} text at ${fontSize.toFixed(
              1
            )}px.`
          );
        }
      }

      if (minFontSize && fontSize < minFontSize) {
        messages.push(
          `Font size ${fontSize.toFixed(1)}px is below the minimum ${minFontSize}px for ${level} ${useCase} text.`
        );
      }

      // Check if contrast is sufficient
      if (messages.length > 0) {
        apcaViolations.push({
          element,
          foreground,
          background,
          contrastValue,
          fontSize,
          fontWeight,
          threshold,
          maxContrast,
          useCase,
          level,
          minFontSize,
          note,
          kind: 'text',
          colorCount: 1,
        });
      }
    } catch (error) {
      // Skip elements that cause calculation errors
      console.warn('APCA calculation error:', error);
    }
  });

  const iconElementsSet = new Set<Element>();
  iconSelectorList.forEach((selector) => {
    try {
      root.querySelectorAll(selector).forEach((element) => iconElementsSet.add(element));
    } catch (error) {
      console.warn('Invalid icon selector:', selector, error);
    }
  });
  const iconElements = Array.from(iconElementsSet);

  iconElements.forEach((element) => {
    if (isExcludedElement(element)) return;
    if (!isVisible(element)) return;
    const computed = global.getComputedStyle(element);
    const isCustomMatch =
      customIconSelectors.length > 0 &&
      customIconSelectors.some((selector) => {
        try {
          return element.matches(selector);
        } catch {
          return false;
        }
      });
    if (!isCustomMatch && !isIconCandidate(element, computed)) return;

    iconTargets += 1;

    const maskImage =
      computed.getPropertyValue('mask-image') ||
      computed.getPropertyValue('-webkit-mask-image') ||
      (computed as any).maskImage ||
      (computed as any).webkitMaskImage;
    const isMask = Boolean(maskImage && maskImage !== 'none');
    const effectiveBackground = getEffectiveBackgroundColor(element, {
      ignoreSelfBackground: true,
    });

    const fallbackColor = getComputedColor(element, 'color');
    let foregroundCandidates: string[] = [];
    let unresolved: string[] = [];

    if (element instanceof SVGElement) {
      const svgColors = extractPaintValuesFromSvgElement(element, fallbackColor, true);
      foregroundCandidates = foregroundCandidates.concat(svgColors.colors);
      unresolved = unresolved.concat(svgColors.unresolved);
    } else if (isMask) {
      const bgValue = computed.getPropertyValue('background-color') || computed.backgroundColor;
      const bgParsed = parseColor(bgValue);
      const effectiveParsed = parseColor(effectiveBackground);
      const useBackgroundColor =
        bgParsed !== null && (!effectiveParsed || !areColorsEqual(bgParsed, effectiveParsed));
      if (!isTransparentColorValue(bgValue) && useBackgroundColor) {
        foregroundCandidates.push(bgValue);
      } else if (!isTransparentColorValue(fallbackColor)) {
        foregroundCandidates.push(fallbackColor);
      } else {
        unresolved.push('mask color is not resolved');
      }
    } else {
      const backgroundImage =
        computed.getPropertyValue('background-image') || computed.backgroundImage;
      const svgSource =
        backgroundImage && backgroundImage !== 'none'
          ? backgroundImage
          : computed.getPropertyValue('mask-image') ||
            computed.getPropertyValue('-webkit-mask-image') ||
            '';
      const { markup, reason } = resolveSvgMarkupFromCssValue(svgSource, computed);
      if (markup) {
        const svgColors = extractPaintValuesFromSvgMarkup(markup, fallbackColor);
        foregroundCandidates = foregroundCandidates.concat(svgColors.colors);
        unresolved = unresolved.concat(svgColors.unresolved);
      } else if (reason) {
        unresolved.push(reason);
      }
    }

    const uniqueForegrounds = Array.from(
      new Set(foregroundCandidates.map((value) => value.trim()).filter(Boolean))
    );
    const parsedForegrounds = parseColorList(uniqueForegrounds);
    if (parsedForegrounds.length < uniqueForegrounds.length) {
      unresolved.push('icon colors could not be parsed');
    }

    const background = getEffectiveBackgroundColor(element, {
      ignoreSelfBackground: isMask,
    });
    const bgColor = parseColor(background);
    if (!bgColor) {
      unresolved.push('background color could not be parsed');
    }

    if (unresolved.length > 0) {
      const reasonText = Array.from(new Set(unresolved)).join('; ');
      incompletes.push({
        element,
        reason: `Warning: Unable to compute icon contrast because ${reasonText}.`,
        rule: 'apca-contrast',
      });
      incompletes.push({
        element,
        reason: `Warning: Unable to compute icon contrast because ${reasonText}.`,
        rule: 'non-text-contrast',
      });
    }

    if (parsedForegrounds.length === 0 || !bgColor) {
      return;
    }

    const fontSize = getIconSize(element, computed);
    const fontWeight = parseInt(computed.fontWeight, 10) || 400;
    const useCase = getUseCaseForElement(element, apcaOptions.useCase);
    const level = apcaOptions.level;

    const contrastValues = parsedForegrounds.map(({ rgb }) =>
      Math.abs(APCAcontrast(sRGBtoY(rgb), sRGBtoY(bgColor)))
    );
    const minContrast = Math.min(...contrastValues);
    const maxContrastValue = Math.max(...contrastValues);
    const minIndex = contrastValues.indexOf(minContrast);

    const { threshold, minFontSize, maxContrast, note, skip } = getApcaThreshold(
      level,
      useCase,
      fontSize,
      fontWeight,
      fontLookupAPCA
    );

    if (!skip) {
      const messages: string[] = [];
      const colorSuffix =
        parsedForegrounds.length > 1 ? ` (min across ${parsedForegrounds.length} icon colors)` : '';

      if (threshold === null) {
        if (note) messages.push(note);
      } else {
        if (minContrast < threshold) {
          messages.push(
            `APCA contrast of ${minContrast.toFixed(1)} Lc is below the minimum of ${threshold} Lc for ${level} ${useCase} icon${colorSuffix}.`
          );
        }
        if (maxContrast !== undefined && maxContrastValue > maxContrast) {
          messages.push(
            `APCA contrast of ${maxContrastValue.toFixed(1)} Lc exceeds the maximum of ${maxContrast} Lc for ${level} ${useCase} icon at ${fontSize.toFixed(
              1
            )}px.`
          );
        }
      }

      if (minFontSize && fontSize < minFontSize) {
        messages.push(
          `Icon size ${fontSize.toFixed(1)}px is below the minimum ${minFontSize}px for ${level} ${useCase} use case.`
        );
      }

      if (messages.length > 0) {
        apcaViolations.push({
          element,
          foreground: parsedForegrounds[minIndex]?.value ?? fallbackColor,
          foregrounds: uniqueForegrounds,
          background,
          contrastValue: minContrast,
          fontSize,
          fontWeight,
          threshold,
          maxContrast,
          useCase,
          level,
          minFontSize,
          note,
          kind: 'icon',
          colorCount: parsedForegrounds.length,
        });
      }
    }

    const ratios = parsedForegrounds.map(({ rgb }) => getContrastRatio(rgb, bgColor));
    const minRatio = Math.min(...ratios);
    if (minRatio < DEFAULT_NON_TEXT_MIN_CONTRAST) {
      nonTextViolations.push({
        element,
        foregrounds: uniqueForegrounds,
        background,
        contrastRatio: minRatio,
        minContrast: DEFAULT_NON_TEXT_MIN_CONTRAST,
        colorCount: parsedForegrounds.length,
      });
    }
  });

  // Convert violations to axe-core compatible format
  const nodes: NodeResult[] = apcaViolations.map((violation) => {
    const impact = getImpact(violation.contrastValue, violation.threshold, violation.maxContrast);
    const messages: string[] = [];
    const targetLabel = violation.kind === 'icon' ? 'icon' : 'text';
    const colorSuffix =
      violation.kind === 'icon' && violation.colorCount && violation.colorCount > 1
        ? ` (min across ${violation.colorCount} icon colors)`
        : '';

    if (violation.note) {
      messages.push(violation.note);
    } else if (violation.threshold !== null && violation.contrastValue < violation.threshold) {
      messages.push(
        `APCA contrast of ${violation.contrastValue.toFixed(1)} Lc is below the minimum of ${violation.threshold} Lc for ${violation.level} ${violation.useCase} ${targetLabel}${colorSuffix}.`
      );
    }

    if (
      violation.maxContrast !== undefined &&
      violation.contrastValue > violation.maxContrast
    ) {
      messages.push(
        `APCA contrast of ${violation.contrastValue.toFixed(1)} Lc exceeds the maximum of ${violation.maxContrast} Lc for ${violation.level} ${violation.useCase} ${targetLabel} at ${violation.fontSize.toFixed(
          1
        )}px.`
      );
    }

    if (violation.minFontSize && violation.fontSize < violation.minFontSize) {
      messages.push(
        `${targetLabel === 'icon' ? 'Icon size' : 'Font size'} ${violation.fontSize.toFixed(1)}px is below the minimum ${violation.minFontSize}px for ${violation.level} ${violation.useCase} ${targetLabel}.`
      );
    }

    const rules = messages.map((message) => ({
      id: 'apca-contrast',
      impact,
      message,
      data: null,
      relatedNodes: [],
    }));
    const failureSummary = `Fix any of the following:\n  ${messages.join('\n  ')}`;
    return {
      html: violation.element.outerHTML,
      target: [getSelector(violation.element)],
      any: rules,
      all: [],
      none: [],
      impact,
      failureSummary,
    };
  });

  const apcaResult: Result = {
    id: 'apca-contrast',
    impact: nodes.length > 0 ? 'serious' : null,
    tags: ['wcag3', 'wcag30', 'apca', 'contrast'],
    description: 'Ensures text and iconography have sufficient contrast using APCA (WCAG 3.0 method)',
    help: 'Elements must have sufficient color contrast using APCA',
    helpUrl: 'https://git.apcacontrast.com/',
    nodes,
  };

  const nonTextNodes: NodeResult[] = nonTextViolations.map((violation) => {
    const impact = getNonTextImpact(violation.contrastRatio);
    const colorSuffix =
      violation.colorCount > 1 ? ` (min across ${violation.colorCount} icon colors)` : '';
    const message = `Non-text contrast ratio of ${violation.contrastRatio.toFixed(2)}:1 is below the minimum ${violation.minContrast}:1 required for icons${colorSuffix}.`;
    const rules: NodeResult['any'] = [
      {
        id: 'non-text-contrast',
        impact,
        message,
        data: null,
        relatedNodes: [],
      },
    ];
    return {
      html: violation.element.outerHTML,
      target: [getSelector(violation.element)],
      any: rules,
      all: [],
      none: [],
      impact,
      failureSummary: `Fix any of the following:\n  ${message}`,
    };
  });

  const incompleteNodes = incompletes.map((entry) => {
    const impact: ImpactLevel = 'minor';
    const message = entry.reason;
    const rules: NodeResult['any'] = [
      {
        id: entry.rule,
        impact,
        message,
        data: null,
        relatedNodes: [],
      },
    ];
    return {
      html: entry.element.outerHTML,
      target: [getSelector(entry.element)],
      any: rules,
      all: [],
      none: [],
      impact,
      failureSummary: `Fix any of the following:\n  ${message}`,
    };
  });

  const nonTextResult: Result | null =
    iconTargets > 0
      ? {
          id: 'non-text-contrast',
          impact: nonTextNodes.length > 0 ? 'serious' : null,
          tags: ['wcag2aa', 'wcag21aa', 'wcag1411', 'contrast', 'non-text'],
          description: 'Ensures icons and graphical objects meet WCAG 2.1 non-text contrast thresholds',
          help: 'Icons and UI components must have sufficient contrast against adjacent colors',
          helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html',
          nodes: nonTextNodes,
        }
      : null;

  const apcaIncompleteResult: Result | null = incompleteNodes.length
    ? {
        id: 'apca-contrast',
        impact: null,
        tags: ['wcag3', 'wcag30', 'apca', 'contrast'],
        description: 'APCA contrast checks could not be completed for some icons',
        help: 'Some icons use fills that cannot be resolved automatically',
        helpUrl: 'https://git.apcacontrast.com/',
        nodes: incompleteNodes.filter((node) => node.any[0].id === 'apca-contrast'),
      }
    : null;

  const nonTextIncompleteResult: Result | null = incompleteNodes.length
    ? {
        id: 'non-text-contrast',
        impact: null,
        tags: ['wcag2aa', 'wcag21aa', 'wcag1411', 'contrast', 'non-text'],
        description: 'Non-text contrast checks could not be completed for some icons',
        help: 'Some icons use fills that cannot be resolved automatically',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html',
        nodes: incompleteNodes.filter((node) => node.any[0].id === 'non-text-contrast'),
      }
    : null;

  return {
    apcaResult,
    nonTextResult,
    apcaIncompleteResult:
      apcaIncompleteResult && apcaIncompleteResult.nodes.length > 0 ? apcaIncompleteResult : null,
    nonTextIncompleteResult:
      nonTextIncompleteResult && nonTextIncompleteResult.nodes.length > 0
        ? nonTextIncompleteResult
        : null,
  };
}

/**
 * Generate a CSS selector for an element
 */
function getSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.className) {
      const classes = current.className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        selector += `.${classes[0]}`;
      }
    }

    // Add nth-child for specificity
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(' > ');
}

/**
 * Determine impact level based on how far below threshold
 */
function getImpact(
  contrastValue: number,
  threshold: number | null,
  maxContrast?: number
): 'minor' | 'moderate' | 'serious' | 'critical' {
  if (threshold === null && maxContrast === undefined) {
    return 'serious';
  }

  const difference =
    maxContrast !== undefined && contrastValue > maxContrast
      ? contrastValue - maxContrast
      : (threshold ?? 0) - contrastValue;

  if (difference > 30) {
    return 'critical';
  } else if (difference > 20) {
    return 'serious';
  } else if (difference > 10) {
    return 'moderate';
  }
  return 'minor';
}
