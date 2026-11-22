import { useMemo, useState } from 'react';
import { Check, Code2, Copy, Eye } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getFileVisual } from './file-style';

const MARKDOWN_RE = /\.(md|mdx|markdown)$/i;

function languageForPath(filePath: string): string {
  const name = (filePath.split('/').pop() ?? '').toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'docker';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  if (name === 'cargo.lock' || name.endsWith('.toml')) return 'toml';
  if (name.endsWith('.tsx')) return 'tsx';
  if (name.endsWith('.ts') || name.endsWith('.mts') || name.endsWith('.cts')) return 'typescript';
  if (name.endsWith('.jsx')) return 'jsx';
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return 'javascript';
  if (name.endsWith('.rs')) return 'rust';
  if (name.endsWith('.swift')) return 'swift';
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.go')) return 'go';
  if (name.endsWith('.json') || name.endsWith('.jsonc')) return 'json';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.sh') || name.endsWith('.zsh') || name.endsWith('.bash')) return 'bash';
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.scss') || name.endsWith('.sass')) return 'scss';
  if (name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.xml') || name.endsWith('.plist') || name.endsWith('.svg')) return 'markup';
  if (name.endsWith('.sql')) return 'sql';
  if (name.endsWith('.diff') || name.endsWith('.patch')) return 'diff';
  if (MARKDOWN_RE.test(name)) return 'markdown';
  if (name.endsWith('.c') || name.endsWith('.h')) return 'c';
  if (name.endsWith('.cpp') || name.endsWith('.cc') || name.endsWith('.hpp') || name.endsWith('.mm')) return 'cpp';
  if (name.endsWith('.java')) return 'java';
  if (name.endsWith('.rb')) return 'ruby';
  return 'text';
}

const ZEN_CODE_THEME: Record<string, React.CSSProperties> = {
  ...oneDark,
  'code[class*="language-"]': {
    ...(oneDark['code[class*="language-"]'] ?? {}),
    background: 'transparent',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.6',
    textShadow: 'none',
  },
  'pre[class*="language-"]': {
    ...(oneDark['pre[class*="language-"]'] ?? {}),
    background: '#050505',
    margin: 0,
    padding: '12px 14px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.6',
    textShadow: 'none',
  },
};

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="hz-md-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      parts.push(
        <strong key={key++} className="hz-md-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[')) {
      parts.push(
        <span key={key++} className="hz-md-link" title={match[3]}>
          {match[2]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const out: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      const fence = line.match(/^```([\w+-]*)/);
      if (fence) {
        const lang = fence[1] || 'text';
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing fence
        out.push(
          <div key={key++} className="hz-md-code-block">
            <SyntaxHighlighter
              language={lang}
              style={ZEN_CODE_THEME}
              customStyle={{ margin: 0, padding: '10px 12px', background: '#0c0c0e', borderRadius: 8 }}
              wrapLongLines={false}
            >
              {codeLines.join('\n')}
            </SyntaxHighlighter>
          </div>,
        );
        continue;
      }

      // GFM Table
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
        const parseCells = (row: string) =>
          row
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
        const headers = parseCells(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
          rows.push(parseCells(lines[i]));
          i++;
        }
        out.push(
          <div key={key++} className="hz-md-table-wrap">
            <table className="hz-md-table">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi}>{renderInlineMarkdown(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci}>{renderInlineMarkdown(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      // Heading
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        const cls = `hz-md-h hz-md-h${level}`;
        out.push(
          <div key={key++} className={cls}>
            {renderInlineMarkdown(heading[2])}
          </div>,
        );
        i++;
        continue;
      }

      // Horizontal rule
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        out.push(<hr key={key++} className="hz-md-hr" />);
        i++;
        continue;
      }

      // Blockquote
      if (line.trimStart().startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trimStart().startsWith('>')) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push(
          <blockquote key={key++} className="hz-md-quote">
            {renderInlineMarkdown(quoteLines.join(' '))}
          </blockquote>,
        );
        continue;
      }

      // Bullet / ordered list
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
          i++;
        }
        out.push(
          <ul key={key++} className="hz-md-list">
            {items.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      // Blank line
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Paragraph
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].startsWith('#') &&
        !lines[i].startsWith('```') &&
        !lines[i].trimStart().startsWith('>') &&
        !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push(
        <p key={key++} className="hz-md-p">
          {renderInlineMarkdown(para.join(' '))}
        </p>,
      );
    }

    return out;
  }, [content]);

  return <div className="hz-md-preview">{blocks}</div>;
}

export function CodeFileViewer({
  filePath,
  content,
  onBack,
  backLabel = 'Back',
}: {
  filePath: string;
  content: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const fileName = filePath.split('/').pop() ?? filePath;
  const isMarkdown = MARKDOWN_RE.test(fileName);
  const [mode, setMode] = useState<'preview' | 'code'>(isMarkdown ? 'preview' : 'code');
  const [copied, setCopied] = useState(false);
  const { Icon, color, nameColor } = getFileVisual(fileName, false);
  const lang = languageForPath(filePath);
  const slice = content.slice(0, 80000);

  const copy = () => {
    void navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="hz-file-viewer">
      <div className="hz-file-viewer-head">
        <div className="hz-file-viewer-title">
          <Icon size={14} strokeWidth={1.85} style={{ color, flexShrink: 0 }} />
          <span className="hz-file-name" style={{ color: nameColor }}>
            {fileName}
          </span>
        </div>
        <div className="hz-file-viewer-actions">
          {isMarkdown ? (
            <button
              type="button"
              className="hz-pill-btn"
              onClick={() => setMode((m) => (m === 'preview' ? 'code' : 'preview'))}
              title={mode === 'preview' ? 'Show syntax-highlighted Markdown' : 'Show rendered Markdown'}
            >
              {mode === 'preview' ? <Code2 size={12} /> : <Eye size={12} />}
              {mode === 'preview' ? 'Code' : 'Preview'}
            </button>
          ) : null}
          <button type="button" className="hz-pill-btn" onClick={copy} title="Copy file contents">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button type="button" className="hz-pill-btn" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </div>

      <div className="hz-file-viewer-body">
        {isMarkdown && mode === 'preview' ? (
          <MarkdownPreview content={slice} />
        ) : (
          <SyntaxHighlighter
            language={lang}
            style={ZEN_CODE_THEME}
            showLineNumbers
            lineNumberStyle={{
              minWidth: '2.5em',
              paddingRight: '12px',
              color: 'rgba(148, 163, 184, 0.35)',
              userSelect: 'none',
            }}
            wrapLongLines={false}
          >
            {slice}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}
