import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `${match.index}_${token.slice(0, 8)}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-slate-900 dark:text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="font-mono text-[0.85em] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const safeHref = /^(https?:\/\/|mailto:|\/|#)/i.test(href.trim()) ? href.trim() : '#';
        parts.push(
          <a
            key={key}
            href={safeHref}
            target={safeHref.startsWith('http') ? '_blank' : undefined}
            rel={safeHref.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-teal-600 dark:text-teal-400 underline underline-offset-2 hover:text-teal-700"
          >
            {label}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content || !content.trim()) {
    return <p className="text-sm text-slate-400 italic">Empty content</p>;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={`pre_${i}`}
          className="my-2.5 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('#### ')) {
      elements.push(
        <h4
          key={`h4_${i}`}
          className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-3 mb-1"
        >
          {renderInline(line.slice(5))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3_${i}`}
          className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-3 mb-1.5"
        >
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2
          key={`h2_${i}`}
          className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-4 mb-1.5"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={`h1_${i}`}
          className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-3 mb-2"
        >
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // Unordered or task list
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const rawItem = lines[i].replace(/^\s*[-*]\s+/, '');
        const checkboxMatch = rawItem.match(/^\[( |x|X)\]\s+(.*)$/);
        if (checkboxMatch) {
          const checked = checkboxMatch[1].toLowerCase() === 'x';
          listItems.push(
            <li key={`li_${i}`} className="flex items-start gap-2 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={checked}
                readOnly
                aria-label={checkboxMatch[2]}
                className="mt-1 rounded border-slate-300 text-teal-600 focus:ring-0"
              />
              <span className={checked ? 'line-through text-slate-400' : ''}>
                {renderInline(checkboxMatch[2])}
              </span>
            </li>
          );
        } else {
          listItems.push(
            <li key={`li_${i}`} className="text-sm leading-relaxed ml-4 list-disc">
              {renderInline(rawItem)}
            </li>
          );
        }
        i++;
      }
      elements.push(
        <ul key={`ul_${i}`} className="my-2 space-y-1 text-slate-700 dark:text-slate-300">
          {listItems}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const rawItem = lines[i].replace(/^\s*\d+\.\s+/, '');
        listItems.push(
          <li key={`oli_${i}`} className="text-sm leading-relaxed ml-4 list-decimal">
            {renderInline(rawItem)}
          </li>
        );
        i++;
      }
      elements.push(
        <ol key={`ol_${i}`} className="my-2 space-y-1 text-slate-700 dark:text-slate-300">
          {listItems}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`bq_${i}`}
          className="my-2 px-3 py-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 text-sm italic text-slate-600 dark:text-slate-300"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p_${i}`} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 my-1.5">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
