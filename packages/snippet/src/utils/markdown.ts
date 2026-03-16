/**
 * Converts markdown text to HTML
 * Supports: headers, bold, italic, links, lists, code blocks, inline code, blockquotes, and horizontal rules
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML characters first to prevent XSS
  html = escapeHtml(html);

  // Process code blocks first (to protect from other transformations)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);

  // Split into lines for block-level processing
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;
  let listType = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers (h1-h6)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      processedLines.push(`<h${level}>${processInlineMarkdown(content)}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      processedLines.push('<hr />');
      continue;
    }

    // Blockquote
    if (line.match(/^>\s+/)) {
      const content = line.replace(/^>\s+/, '');
      processedLines.push(`<blockquote>${processInlineMarkdown(content)}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) processedLines.push(`</${listType}>`);
        processedLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      processedLines.push(`<li>${processInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) processedLines.push(`</${listType}>`);
        processedLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      processedLines.push(`<li>${processInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    // Close list if we're no longer in one
    if (inList) {
      processedLines.push(`</${listType}>`);
      inList = false;
      listType = '';
    }

    // Empty line
    if (line.trim() === '') {
      processedLines.push('<br />');
      continue;
    }

    // Regular paragraph
    processedLines.push(`<p>${processInlineMarkdown(line)}</p>`);
  }

  // Close any open list
  if (inList) {
    processedLines.push(`</${listType}>`);
  }

  return processedLines.join('\n');
}

/**
 * Process inline markdown elements (bold, italic, links, inline code)
 */
function processInlineMarkdown(text: string): string {
  let result = text;

  // Inline code (before other inline elements)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold and italic (***text***)
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  result = result.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

  // Bold (**text** or __text__)
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return result;
}

/**
 * Escape HTML characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}
