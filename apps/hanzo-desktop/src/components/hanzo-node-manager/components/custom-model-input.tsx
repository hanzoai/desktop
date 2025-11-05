import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from '@hanzo_network/hanzo-i18n';
import {
  Alert,
  AlertDescription,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@hanzo_network/hanzo-ui';
import { Download, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useOllamaPullMutation } from '../../../lib/hanzo-node-manager/ollama-client';
import { useHanzoNodeGetOllamaApiUrlQuery } from '../../../lib/hanzo-node-manager/hanzo-node-manager-client';

const formSchema = z.object({
  modelName: z.string().min(1, 'Model name or URL is required'),
});

type FormSchema = z.infer<typeof formSchema>;

export const CustomModelInput = () => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: ollamaApiUrl } = useHanzoNodeGetOllamaApiUrlQuery();
  const ollamaConfig = { host: ollamaApiUrl || 'http://127.0.0.1:11435' };

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      modelName: '',
    },
  });

  const { mutateAsync: pullModel, isPending } = useOllamaPullMutation(ollamaConfig);

  const extractModelFromUrl = (input: string): string => {
    // Check if it's a HuggingFace URL
    const hfPattern = /huggingface\.co\/([^\/]+\/[^\/]+)/;
    const hfMatch = input.match(hfPattern);

    if (hfMatch) {
      // For HuggingFace, we'll use the repo name as model name
      // e.g., https://huggingface.co/zenlm/zen-agent-4b -> zen-agent-4b
      const repoPath = hfMatch[1];
      const modelName = repoPath.split('/')[1];
      return modelName || input;
    }

    // If it's not a URL, return as-is (likely an Ollama model name)
    return input;
  };

  const onSubmit = async (data: FormSchema) => {
    setError(null);
    setSuccess(null);

    try {
      const modelName = extractModelFromUrl(data.modelName);

      // Check if this looks like a HuggingFace model
      const isHuggingFace = data.modelName.includes('huggingface.co');

      if (isHuggingFace) {
        setError(
          `HuggingFace model detected: "${modelName}". ` +
          `Direct HuggingFace downloads are not yet supported. ` +
          `Please convert the model to GGUF format and use the Ollama model name instead.`
        );
        return;
      }

      // Pull the model using Ollama API
      await pullModel({
        model: modelName,
      });

      setSuccess(`Successfully started downloading model: ${modelName}`);
      form.reset();
    } catch (err: any) {
      setError(err?.message || 'Failed to download model');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Add Custom Model</h3>
        <p className="text-text-secondary text-sm">
          Enter an Ollama model name (e.g., "qwen3-vl:8b") or paste a HuggingFace URL
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="modelName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model Name or URL</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      placeholder="qwen3-vl:8b or https://huggingface.co/..."
                      {...field}
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      disabled={isPending || !field.value}
                      size="sm"
                      variant="outline"
                    >
                      {isPending ? (
                        <>
                          <Download className="mr-2 h-4 w-4 animate-bounce" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="text-text-secondary space-y-2 rounded-lg border border-gray-700 bg-gray-900 p-4 text-xs">
        <p className="font-semibold">Examples:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <code className="rounded bg-gray-800 px-1">qwen3-vl:8b</code> - Qwen3 vision-language model
          </li>
          <li>
            <code className="rounded bg-gray-800 px-1">deepseek-r1:8b</code> - DeepSeek reasoning model
          </li>
          <li>
            <code className="rounded bg-gray-800 px-1">llama3.3:70b</code> - Llama 3.3 large model
          </li>
        </ul>
      </div>
    </div>
  );
};
