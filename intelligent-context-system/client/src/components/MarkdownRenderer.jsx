import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import 'katex/dist/katex.min.css';

const MarkdownRenderer = ({ content }) => {
  const lineHeight = '2';

  // Custom syntax highlighting style without background
  const codeHighlightStyle = {
    'code[class*="language-"]': {
      color: '#000',
      background: 'transparent',
      textShadow: 'none',
    },
    'pre[class*="language-"]': {
      color: '#000',
      background: 'transparent',
      textShadow: 'none',
    },
    comment: {
      color: '#6a737d',
      fontStyle: 'italic',
    },
    keyword: {
      color: '#d73a49',
      fontWeight: 'bold',
    },
    string: {
      color: '#032f62',
    },
    function: {
      color: '#005cc5',
    },
    number: {
      color: '#005cc5',
    },
    boolean: {
      color: '#d73a49',
      fontWeight: 'bold',
    },
    operator: {
      color: '#d73a49',
    },
    punctuation: {
      color: '#24292e',
    },
    variable: {
      color: '#e36209',
    },
    className: {
      color: '#6f42c1',
      fontWeight: 'bold',
    },
    builtin: {
      color: '#005cc5',
    },
    property: {
      color: '#005cc5',
    },
    selector: {
      color: '#6f42c1',
    },
    attrName: {
      color: '#22863a',
    },
    attrValue: {
      color: '#032f62',
    },
  };

  // Preprocess content to convert LaTeX-style delimiters to $ delimiters
  const preprocessedContent = useMemo(() => {
    if (!content) return '';

    let processed = content;

    // Convert display math \[ ... \] to $$ ... $$
    // Use a more robust pattern that handles multiline content
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      // Trim whitespace but preserve newlines within the formula
      const trimmedFormula = formula.trim();
      return '\n$$\n' + trimmedFormula + '\n$$\n';
    });

    // Convert inline math \( ... \) to $ ... $
    processed = processed.replace(/\\\((.*?)\\\)/g, (match, formula) => {
      return '$' + formula.trim() + '$';
    });

    return processed;
  }, [content]);

  const markdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <div style={{
          margin: '12px 0',
          borderRadius: '6px',
          background: 'var(--bg-tertiary, #f3f4f6)',
          padding: '12px',
          fontSize: '13px',
          lineHeight: '1.5',
          fontFamily: 'monospace',
          overflowX: 'auto'
        }}>
          <SyntaxHighlighter
            style={codeHighlightStyle}
            language={match[1]}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: 0,
              background: 'transparent',
              fontSize: 'inherit',
              lineHeight: 'inherit'
            }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          className={className}
          style={{
            background: 'var(--bg-tertiary, #f3f4f6)',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '13px',
            fontFamily: 'monospace',
            color: 'var(--accent-blue, #0044FF)'
          }}
          {...props}
        >
          {children}
        </code>
      );
    },
    h1: ({ children }) => (
      <h1 style={{ marginTop: '20px', marginBottom: '12px', color: 'var(--text-primary, #000000)', fontSize: '24px', fontWeight: '600' }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 style={{ marginTop: '18px', marginBottom: '10px', color: 'var(--text-primary, #000000)', fontSize: '20px', fontWeight: '600' }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 style={{ marginTop: '16px', marginBottom: '8px', color: 'var(--text-primary, #000000)', fontSize: '18px', fontWeight: '600' }}>
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 style={{ marginTop: '14px', marginBottom: '6px', color: 'var(--text-primary, #000000)', fontSize: '16px', fontWeight: '600' }}>
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 style={{ marginTop: '12px', marginBottom: '4px', color: 'var(--text-primary, #000000)', fontSize: '14px', fontWeight: '600' }}>
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 style={{ marginTop: '10px', marginBottom: '2px', color: 'var(--text-primary, #000000)', fontSize: '12px', fontWeight: '600' }}>
        {children}
      </h6>
    ),
    p: ({ children }) => (
      <p style={{ marginTop: '8px', marginBottom: '8px', lineHeight, color: 'var(--text-primary, #000000)' }}>
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul style={{ marginTop: '8px', marginBottom: '8px', paddingLeft: '24px', color: 'var(--text-primary, #000000)', listStyleType: 'disc' }}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol style={{ marginTop: '8px', marginBottom: '8px', paddingLeft: '24px', color: 'var(--text-primary, #000000)', listStyleType: 'decimal' }}>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li style={{ marginTop: '4px', lineHeight }}>
        {children}
      </li>
    ),
    blockquote: ({ children }) => (
      <blockquote style={{
        margin: '12px 0',
        padding: '8px 16px',
        borderLeft: '4px solid var(--accent-blue, #0044FF)',
        background: 'var(--bg-tertiary, #f3f4f6)',
        borderRadius: '4px',
        color: 'var(--text-secondary, #6B7280)',
        lineHeight
      }}>
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'var(--accent-blue, #0044FF)',
          textDecoration: 'underline',
          cursor: 'pointer'
        }}
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginTop: '12px', marginBottom: '12px' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid var(--border-color, #e5e7eb)'
        }}>
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th style={{
        padding: '8px',
        background: 'var(--bg-tertiary, #f3f4f6)',
        border: '1px solid var(--border-color, #e5e7eb)',
        fontWeight: '600',
        textAlign: 'left'
      }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{
        padding: '8px',
        border: '1px solid var(--border-color, #e5e7eb)'
      }}>
        {children}
      </td>
    ),
    hr: () => (
      <hr style={{
        margin: '16px 0',
        border: 'none',
        borderTop: '1px solid var(--border-color, #e5e7eb)'
      }} />
    ),
    pre: ({ children }) => (
      <pre style={{
        margin: '12px 0',
        padding: '12px',
        borderRadius: '6px',
        background: 'var(--bg-tertiary, #f3f4f6)',
        fontSize: '13px',
        lineHeight: '1.5',
        fontFamily: 'monospace',
        overflowX: 'auto'
      }}>
        {children}
      </pre>
    )
  }), []);

  return (
    <ReactMarkdown
      remarkPlugins={[
        remarkGfm,
        [remarkMath, {
          singleDollarTextMath: true
        }]
      ]}
      rehypePlugins={[
        [rehypeKatex, {
          strict: false,
          throwOnError: false,
          trust: true,
          output: 'html',
          fleqn: false
        }],
        rehypeRaw
      ]}
      components={markdownComponents}
    >
      {preprocessedContent}
    </ReactMarkdown>
  );
};

export default MarkdownRenderer;