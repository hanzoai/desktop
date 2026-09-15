import 'prism-react-editor/prism/languages/typescript';
import 'prism-react-editor/prism/languages/python';
import 'prism-react-editor/prism/languages/json';
import 'prism-react-editor/prism/languages/yaml';
import 'prism-react-editor/languages/typoscript';
import 'prism-react-editor/languages/json';
import 'prism-react-editor/languages/yaml';
import 'prism-react-editor/layout.css';
import 'prism-react-editor/code-folding.css';
import 'prism-react-editor/autocomplete.css';
import 'prism-react-editor/themes/github-dark.css';
import 'prism-react-editor/search.css';

import { Editor, type EditorProps, type PrismEditor } from 'prism-react-editor';
import {
  completeFromList,
  fuzzyFilter,
  registerCompletions,
  useAutoComplete,
} from 'prism-react-editor/autocomplete';
import {
  completeIdentifiers,
  completeKeywords,
  jsContext,
  jsDocCompletion,
  jsSnipets,
} from 'prism-react-editor/autocomplete/javascript';
import {
  useDefaultCommands,
  useEditHistory,
} from 'prism-react-editor/commands';
import { useCursorPosition } from 'prism-react-editor/cursor';
import { IndentGuides } from 'prism-react-editor/guides';
import { useHighlightBracketPairs } from 'prism-react-editor/highlight-brackets';
import { useBracketMatcher } from 'prism-react-editor/match-brackets';
import {
  useHighlightMatchingTags,
  useTagMatcher,
} from 'prism-react-editor/match-tags';
import {
  useHighlightSelectionMatches,
  useSearchWidget,
  useShowInvisibles,
} from 'prism-react-editor/search';
import React from 'react';

// prism-react-editor moved its extensions onto an `EditorContext` and stopped
// re-exporting that context from the package entry, so there is no supported way
// left to reach the editor from a child. The render-prop below is the shape the
// version this was written against published, and the two directives are what
// says so: they fail the build the day the upstream type admits it again.
const Extensions = ({ editor }: { editor: PrismEditor }) => {
  useBracketMatcher(editor);
  useHighlightBracketPairs(editor);
  useTagMatcher(editor);
  useHighlightMatchingTags(editor);
  useDefaultCommands(editor);
  useEditHistory(editor);
  useSearchWidget(editor);
  useHighlightSelectionMatches(editor);
  useCursorPosition(editor);
  useShowInvisibles(editor);
  useAutoComplete(editor, {
    filter: fuzzyFilter,
  });

  // @ts-expect-error prism-react-editor: IndentGuides is typed as taking no
  // props, and reads its editor from a context the package does not export.
  return <IndentGuides editor={editor} />;
};

registerCompletions(['javascript', 'js', 'jsx', 'tsx', 'typescript', 'ts'], {
  context: jsContext,
  sources: [
    completeIdentifiers(),
    completeKeywords,
    jsDocCompletion,
    completeFromList(jsSnipets),
  ],
});

const ToolCodeEditor = ({
  value,
  onUpdate,
  language,
  name,
  readOnly,
  style,
  ref,
}: {
  value: EditorProps['value'];
  onUpdate?: EditorProps['onUpdate'];
  language: EditorProps['language'];
  name?: string;
  readOnly?: boolean;
  style?: React.CSSProperties;
  ref?: React.RefObject<PrismEditor | null>;
}) => {
  const safeLanguage = language || 'plaintext';

  return (
    <Editor
      insertSpaces={true}
      language={safeLanguage}
      onUpdate={onUpdate}
      readOnly={readOnly}
      ref={ref}
      style={{
        fontSize: '0.75rem',
        lineHeight: '1.5',
        height: '100%',
        overflow: 'auto',
        //@ts-expect-error css variables
        '--editor__bg': 'var(--color-gray-1000)',
        '--padding-left': '32px',
        ...style,
      }}
      textareaProps={{ name: name ?? 'editor' }}
      value={value}
    >
      {
        // @ts-expect-error prism-react-editor: EditorProps.children is typed
        // ReactNode, and the render-prop form this needs is no longer in its
        // types even though the runtime still calls it.
        (editor: PrismEditor) => <Extensions editor={editor} />
      }
    </Editor>
  );
};

ToolCodeEditor.displayName = 'ToolCodeEditor';
export default ToolCodeEditor;
