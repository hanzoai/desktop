import './globals.css';

// The generated-code sandbox gets the component library as a scope object; the
// same library this window renders its own chrome from. One copy, one theme.
import * as hanzoUi from '@hanzo/desktop-ui';
import { DotPattern } from '@hanzo/desktop-ui';
import { Loader2 } from 'lucide-react';
import * as lucideReactIcons from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import * as recharts from 'recharts';

import { Gui } from '../../gui';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border bg-red-100 p-4 text-sm whitespace-pre-wrap text-red-700">
          <h3 className="font-medium">Runtime Error:</h3>
          <pre>{this.state.error?.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple JSX-to-JS transpiler using TypeScript compiler API (loaded from CDN)
// Replaces the heavy @babel/standalone dependency (~3MB → ~200KB)
//
// The type describes the CDN GLOBAL (`window.ts`, TypeScript 5.5.4), not the
// installed compiler: typescript@7 is the native Go build and ships no
// JS compiler API off its root export, so `typeof import('typescript')` names
// something that no longer has `transpileModule`. Declaring the four members
// this window actually calls keeps the annotation true to the thing at runtime.
type TsTranspiler = {
  transpileModule(
    input: string,
    options: {
      compilerOptions: {
        jsx: number;
        module: number;
        target: number;
        esModuleInterop: boolean;
      };
    },
  ): { outputText: string };
  JsxEmit: { React: number };
  ModuleKind: { None: number };
  ScriptTarget: { ES2020: number };
};

let tsModule: TsTranspiler | null = null;

async function loadTypeScript(): Promise<TsTranspiler> {
  if (tsModule) return tsModule;
  // Use the TypeScript compiler from CDN for runtime transpilation
  const script = document.createElement('script');
  script.src =
    'https://cdn.jsdelivr.net/npm/typescript@5.5.4/lib/typescript.min.js';
  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  tsModule = (window as any).ts;
  return tsModule!;
}

function rewriteImports(code: string, scope: Record<string, any>): string {
  // Rewrite import statements to scope variable lookups
  // import { X } from 'react' → const { X } = scope.React
  // import X from 'y' → const X = scope.X
  const lines = code.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const importMatch = line.match(
      /^\s*import\s+(.+?)\s+from\s+['"](.+?)['"]\s*;?\s*$/,
    );
    if (importMatch) {
      const [, imports, source] = importMatch;

      // Map module names to scope keys
      let scopeKey: string;
      if (source === 'react') {
        scopeKey = 'React';
      } else {
        // For other modules, use camelCase of the module name
        scopeKey = source.replace(/[^a-zA-Z]/g, '');
      }

      // default import: import X from 'y'
      const defaultMatch = imports.match(/^(\w+)$/);
      if (defaultMatch) {
        result.push(`const ${defaultMatch[1]} = scope.${defaultMatch[1]};`);
        continue;
      }

      // named imports: import { X, Y } from 'z'
      const namedMatch = imports.match(/^\{(.+)\}$/);
      if (namedMatch) {
        const names = namedMatch[1].split(',').map((n) => n.trim());
        for (const name of names) {
          const asMatch = name.match(/(\w+)\s+as\s+(\w+)/);
          if (asMatch) {
            result.push(
              `const ${asMatch[2]} = scope.${scopeKey}.${asMatch[1]};`,
            );
          } else {
            result.push(`const ${name} = scope.${scopeKey}.${name};`);
          }
        }
        continue;
      }

      // default + named: import X, { Y } from 'z'
      const mixedMatch = imports.match(/^(\w+)\s*,\s*\{(.+)\}$/);
      if (mixedMatch) {
        result.push(`const ${mixedMatch[1]} = scope.${mixedMatch[1]};`);
        const names = mixedMatch[2].split(',').map((n) => n.trim());
        for (const name of names) {
          result.push(`const ${name} = scope.${scopeKey}.${name};`);
        }
        continue;
      }

      // namespace import: import * as X from 'y'
      const namespaceMatch = imports.match(/^\*\s+as\s+(\w+)$/);
      if (namespaceMatch) {
        result.push(`const ${namespaceMatch[1]} = scope.${scopeKey};`);
        continue;
      }

      // Fallback: keep original (will likely error, but better than silently dropping)
      result.push(line);
    } else {
      // Rewrite export default
      const exportDefaultMatch = line.match(
        /^\s*export\s+default\s+(.+?)\s*;?\s*$/,
      );
      if (exportDefaultMatch) {
        result.push(`exports.default = ${exportDefaultMatch[1]};`);
      } else {
        result.push(line);
      }
    }
  }

  return result.join('\n');
}

export const getReactComponentFromCode = async (code: string) => {
  try {
    const ts = await loadTypeScript();

    // First rewrite imports/exports
    const rewrittenCode = rewriteImports(code, {});

    // Then transpile TSX → JS using TypeScript compiler
    const result = ts.transpileModule(rewrittenCode, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    });

    const transpiledCode = result.outputText;

    const scope: any = {
      React: {
        ...React,
        useState: React.useState,
        useEffect: React.useEffect,
      },
      ...hanzoUi,
      ...recharts,
      ...lucideReactIcons,
    };

    const fullCode = `
      const exports = {};
      ${transpiledCode}
      return exports.default;
    `;

    const evalCode = new Function('scope', fullCode);
    const ComponentToRender = evalCode(scope);

    return ComponentToRender;
  } catch (error) {
    console.error('Render Component: ' + error);
  }
};

const App = () => {
  const [code, setCode] = useState<string | null>(null);
  const [component, setComponent] = useState<React.ComponentType | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (code) {
      (async () => {
        try {
          const ComponentToRender = await getReactComponentFromCode(code);
          if (ComponentToRender) {
            setComponent(() => ComponentToRender);
          } else {
            throw new Error(
              'No valid React component found in the provided code',
            );
          }
        } catch {
          throw new Error('Error evaluating component code');
        }
      })();
    }
  }, [code]);

  useEffect(() => {
    window.parent.postMessage({ type: 'INIT_COMPLETE' }, '*');

    const handleMessage = (event: any) => {
      if (event?.data?.type === 'UPDATE_COMPONENT') {
        setCode(event?.data?.code ?? '');
      }
    };

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="min-h-full w-full" ref={contentRef}>
      {component ? (
        React.createElement(component)
      ) : (
        <div className="flex h-full items-center justify-center bg-white">
          <DotPattern className="[mask-image:linear-gradient(to_bottom_right,white,transparent,transparent)]" />
          <div className="flex items-center gap-1 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-gray-200" />
            <p className="text-gray-200">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <Gui>
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  </Gui>,
);
