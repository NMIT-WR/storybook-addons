import { global } from '@storybook/global';
import { converter, parse as parseCssColor } from 'culori';
import type { Result, NodeResult } from 'axe-core';

const { document } = global;

const DEFAULT_APCA_OPTIONS: Required<ApcaOptions> = {
  level: 'bronze',
  useCase: 'body',
};

const APCA_LC_STEPS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125];
const APCA_MAX_CONTRAST_LC = 90;
const toRgb = converter('rgb');

type ApcaConformanceLevel = 'bronze' | 'silver' | 'gold';
type ApcaUseCase = 'body' | 'fluent' | 'sub-fluent' | 'non-fluent';

interface ApcaOptions {
  level?: ApcaConformanceLevel;
  useCase?: ApcaUseCase;
}

interface APCAViolation {
  element: Element;
  foreground: string;
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
function getEffectiveBackgroundColor(element: Element): string {
  let current: Element | null = element;

  while (current && current !== document.body) {
    const bgColor = getComputedColor(current, 'backgroundColor');
    // Check if background is not transparent
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return bgColor;
    }
    current = current.parentElement;
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

/**
 * Check if element contains readable text
 */
function hasReadableText(element: Element): boolean {
  const text = element.textContent?.trim() || '';
  // Ignore elements with no text or very short text (like icons)
  return text.length > 0 && !element.hasAttribute('aria-hidden');
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

/**
 * Run APCA contrast checks on the document
 */
export async function runAPCACheck(
  context: Element | Document = document,
  options: ApcaOptions = DEFAULT_APCA_OPTIONS,
  excludeSelectors: string[] = []
): Promise<Result> {
  // Dynamic import of APCA library
  const { APCAcontrast, sRGBtoY, fontLookupAPCA } = await import('apca-w3');

  const apcaOptions = { ...DEFAULT_APCA_OPTIONS, ...options };

  const violations: APCAViolation[] = [];
  const root = context instanceof Document ? context.body : context;

  // Get all text-containing elements
  const textElements = root.querySelectorAll(
    'p, span, div, h1, h2, h3, h4, h5, h6, a, button, label, td, th, li, input, textarea'
  );

  textElements.forEach((element) => {
    if (excludeSelectors.length > 0) {
      const isExcluded = excludeSelectors.some((selector) => {
        try {
          return element.closest(selector) !== null;
        } catch {
          return false;
        }
      });
      if (isExcluded) return;
    }

    // Skip if not visible or has no text
    if (!isVisible(element) || !hasReadableText(element)) {
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
        violations.push({
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
        });
      }
    } catch (error) {
      // Skip elements that cause calculation errors
      console.warn('APCA calculation error:', error);
    }
  });

  // Convert violations to axe-core compatible format
  const nodes: NodeResult[] = violations.map((violation) => {
    const impact = getImpact(violation.contrastValue, violation.threshold, violation.maxContrast);
    const messages: string[] = [];

    if (violation.note) {
      messages.push(violation.note);
    } else if (violation.threshold !== null && violation.contrastValue < violation.threshold) {
      messages.push(
        `APCA contrast of ${violation.contrastValue.toFixed(1)} Lc is below the minimum of ${violation.threshold} Lc for ${violation.level} ${violation.useCase} text.`
      );
    }

    if (
      violation.maxContrast !== undefined &&
      violation.contrastValue > violation.maxContrast
    ) {
      messages.push(
        `APCA contrast of ${violation.contrastValue.toFixed(1)} Lc exceeds the maximum of ${violation.maxContrast} Lc for ${violation.level} ${violation.useCase} text at ${violation.fontSize.toFixed(
          1
        )}px.`
      );
    }

    if (violation.minFontSize && violation.fontSize < violation.minFontSize) {
      messages.push(
        `Font size ${violation.fontSize.toFixed(1)}px is below the minimum ${violation.minFontSize}px for ${violation.level} ${violation.useCase} text.`
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

  return {
    id: 'apca-contrast',
    impact: nodes.length > 0 ? 'serious' : null,
    tags: ['wcag3', 'wcag30', 'apca', 'contrast'],
    description: 'Ensures text has sufficient contrast using APCA (WCAG 3.0 method)',
    help: 'Elements must have sufficient color contrast using APCA',
    helpUrl: 'https://git.apcacontrast.com/',
    nodes,
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
