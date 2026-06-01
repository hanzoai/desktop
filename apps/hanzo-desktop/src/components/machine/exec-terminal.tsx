import { Button, ScrollArea } from '@hanzo_network/hanzo-ui';
import { runExec, type ExecHandle } from '../../machine-state';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Line {
  stream: 'stdout' | 'stderr' | 'system';
  data: string;
}

const SHELL_CMD = ['/bin/sh', '-l'];

export const ExecTerminal = ({ machineName }: { machineName: string }) => {
  const [lines, setLines] = useState<Line[]>([
    { stream: 'system', data: `Connected shell to ${machineName}\n` },
  ]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const handleRef = useRef<ExecHandle | undefined>(undefined);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (handleRef.current) void handleRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [lines]);

  const runOne = async (cmd: string[]) => {
    if (pending) return;
    setPending(true);
    setLines((prev) => [
      ...prev,
      { stream: 'system', data: `$ ${cmd.join(' ')}\n` },
    ]);
    try {
      handleRef.current = await runExec(machineName, cmd, {
        onChunk: ({ stream, data }) =>
          setLines((prev) => [...prev, { stream, data }]),
        onExit: (code) => {
          if (code !== 0) {
            setLines((prev) => [
              ...prev,
              { stream: 'system', data: `[exit ${code}]\n` },
            ]);
          }
          setPending(false);
        },
      });
    } catch (e) {
      setLines((prev) => [
        ...prev,
        {
          stream: 'stderr',
          data: e instanceof Error ? e.message : String(e),
        },
      ]);
      setPending(false);
    }
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInput('');
    void runOne([...SHELL_CMD, '-c', v]);
  };

  return (
    <div className="border-divider flex flex-col rounded-lg border bg-black/40">
      <ScrollArea className="h-[420px]">
        <div
          className="font-mono text-xs"
          ref={scrollerRef}
          style={{ padding: '12px' }}
        >
          {lines.map((l, i) => (
            <pre
              className={
                l.stream === 'stderr'
                  ? 'text-red-400 whitespace-pre-wrap'
                  : l.stream === 'system'
                  ? 'text-text-tertiary whitespace-pre-wrap'
                  : 'text-text-default whitespace-pre-wrap'
              }
              key={i}
            >
              {l.data}
            </pre>
          ))}
        </div>
      </ScrollArea>
      <form
        className="border-divider flex items-center gap-2 border-t px-2 py-2"
        onSubmit={submit}
      >
        <span className="text-text-tertiary font-mono text-xs">$</span>
        <input
          aria-label="Command input"
          className="text-text-default flex-1 bg-transparent font-mono text-xs focus:outline-none"
          disabled={pending}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? 'running...' : 'type a command and press Enter'}
          spellCheck={false}
          value={input}
        />
        <Button
          aria-label="Run command"
          disabled={pending || input.trim().length === 0}
          size="icon"
          type="submit"
          variant="tertiary"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
};

export default ExecTerminal;
