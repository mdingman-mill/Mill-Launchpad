import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedOutput } from '../components/FormattedOutput';

export function renderMarkdownToHtml(markdown: string): string {
  return renderToStaticMarkup(React.createElement(FormattedOutput, { content: markdown }));
}

export async function copyFormattedOutput(markdown: string): Promise<void> {
  const htmlBody = renderMarkdownToHtml(markdown);

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlBody], { type: 'text/html' }),
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return;
    } catch {
      // Fallback if the environment restricts multi-MIME ClipboardItem writes
    }
  }

  await navigator.clipboard.writeText(markdown);
}
