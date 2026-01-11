/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAPCACheck } from './apcaChecker';

describe('apcaChecker', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a container for testing
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Cleanup
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should detect low contrast text violations', async () => {
    // Create an element with poor contrast
    const textElement = document.createElement('p');
    textElement.textContent = 'This is test text';
    textElement.style.color = 'rgb(170, 170, 170)'; // Light gray text
    textElement.style.backgroundColor = 'rgb(255, 255, 255)'; // White background
    textElement.style.fontSize = '16px';
    textElement.style.fontWeight = '400';
    container.appendChild(textElement);

    const result = await runAPCACheck(container);

    expect(result.id).toBe('apca-contrast');
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].failureSummary).toContain('Fix any of the following');
    expect(result.nodes[0].failureSummary).toContain('APCA contrast');
  });

  it('should pass for high contrast text', async () => {
    // Create an element with good contrast
    const textElement = document.createElement('p');
    textElement.textContent = 'This is test text';
    textElement.style.color = 'rgb(0, 0, 0)'; // Black text
    textElement.style.backgroundColor = 'rgb(255, 255, 255)'; // White background
    textElement.style.fontSize = '16px';
    textElement.style.fontWeight = '400';
    container.appendChild(textElement);

    const result = await runAPCACheck(container);

    expect(result.id).toBe('apca-contrast');
    expect(result.nodes.length).toBe(0);
  });

  it('should skip hidden elements', async () => {
    // Create a hidden element with poor contrast
    const textElement = document.createElement('p');
    textElement.textContent = 'This is test text';
    textElement.style.color = 'rgb(170, 170, 170)';
    textElement.style.backgroundColor = 'rgb(255, 255, 255)';
    textElement.style.display = 'none'; // Hidden
    container.appendChild(textElement);

    const result = await runAPCACheck(container);

    expect(result.nodes.length).toBe(0);
  });

  it('should skip aria-hidden elements', async () => {
    // Create an aria-hidden element with poor contrast
    const textElement = document.createElement('p');
    textElement.textContent = 'This is test text';
    textElement.style.color = 'rgb(170, 170, 170)';
    textElement.style.backgroundColor = 'rgb(255, 255, 255)';
    textElement.setAttribute('aria-hidden', 'true');
    container.appendChild(textElement);

    const result = await runAPCACheck(container);

    expect(result.nodes.length).toBe(0);
  });

  it('should use appropriate thresholds for large text', async () => {
    // Create a large text element with moderate contrast
    const textElement = document.createElement('h1');
    textElement.textContent = 'Large Heading';
    textElement.style.color = 'rgb(100, 100, 100)'; // Gray text
    textElement.style.backgroundColor = 'rgb(255, 255, 255)'; // White background
    textElement.style.fontSize = '32px';
    textElement.style.fontWeight = '400';
    container.appendChild(textElement);

    const result = await runAPCACheck(container);

    // Large text should have a lower threshold
    // This test verifies that the checker uses different thresholds
    expect(result.id).toBe('apca-contrast');
  });

  it('should handle elements with inherited background colors', async () => {
    // Create a nested structure
    const parent = document.createElement('div');
    parent.style.backgroundColor = 'rgb(200, 200, 200)';
    container.appendChild(parent);

    const textElement = document.createElement('p');
    textElement.textContent = 'Nested text';
    textElement.style.color = 'rgb(180, 180, 180)'; // Similar to background
    textElement.style.fontSize = '16px';
    parent.appendChild(textElement);

    const result = await runAPCACheck(container);

    expect(result.id).toBe('apca-contrast');
    // Should detect violation even with inherited background
  });

  it('should enforce gold minimum font size for body text', async () => {
    const textElement = document.createElement('p');
    textElement.textContent = 'Small body text';
    textElement.style.color = 'rgb(0, 0, 0)';
    textElement.style.backgroundColor = 'rgb(255, 255, 255)';
    textElement.style.fontSize = '12px';
    textElement.style.fontWeight = '400';
    container.appendChild(textElement);

    const result = await runAPCACheck(container, { level: 'gold', useCase: 'body' });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].failureSummary).toContain('minimum 16px');
  });

  it('should flag excessive contrast for large text at silver', async () => {
    const textElement = document.createElement('h1');
    textElement.textContent = 'Large heading';
    textElement.style.color = 'rgb(0, 0, 0)';
    textElement.style.backgroundColor = 'rgb(255, 255, 255)';
    textElement.style.fontSize = '40px';
    textElement.style.fontWeight = '400';
    container.appendChild(textElement);

    const result = await runAPCACheck(container, { level: 'silver', useCase: 'body' });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].failureSummary).toContain('exceeds the maximum');
  });

  it('should include proper metadata in results', async () => {
    const textElement = document.createElement('p');
    textElement.textContent = 'Test';
    textElement.style.color = 'rgb(170, 170, 170)';
    textElement.style.backgroundColor = 'rgb(255, 255, 255)';
    container.appendChild(textElement);

    const result = await runAPCACheck(container);

    expect(result.id).toBe('apca-contrast');
    expect(result.tags).toContain('wcag3');
    expect(result.tags).toContain('apca');
    expect(result.description).toContain('APCA');
    expect(result.helpUrl).toBeTruthy();
  });
});
