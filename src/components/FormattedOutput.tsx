import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface FormattedOutputProps {
  content: string;
  className?: string;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-6 mb-3 first:mt-0 leading-snug font-heading">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-6 mb-2.5 first:mt-0 leading-snug font-heading">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-4 mb-2 first:mt-0 leading-snug font-heading">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-bold text-slate-800 mt-3 mb-1.5 first:mt-0 leading-snug">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2.5 first:mt-0 last:mb-0 leading-relaxed text-slate-800">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="list-disc pl-6 my-3 space-y-1.5 text-slate-800">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 my-3 space-y-1.5 text-slate-800">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed pl-1 [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-[#e11d48] pl-4 my-4 py-1 text-slate-700 italic bg-rose-50/40 rounded-r-lg [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-0 border-t border-slate-200" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse border border-slate-200 text-xs sm:text-sm text-left">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-slate-200">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-slate-200 px-3 py-2 font-bold text-slate-900 align-top">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-200 px-3 py-2 text-slate-700 align-top">{children}</td>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#e11d48] underline hover:text-rose-700"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 p-3.5 rounded-xl bg-slate-900 text-slate-100 overflow-x-auto text-xs font-mono [&_code]:bg-transparent [&_code]:text-inherit [&_code]:p-0">
      {children}
    </pre>
  ),
};

export const FormattedOutput: React.FC<FormattedOutputProps> = ({ content, className = '' }) => {
  return (
    <div className={`text-sm text-slate-800 leading-relaxed font-sans ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
