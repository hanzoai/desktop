import { toolMetadataImplementation as createToolMetadataApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';
import { CodeLanguage } from '@hanzo_network/hanzo-message-ts/api/tools/types';

import { type CreateToolMetadataInput, type CreateToolMetadataOutput } from './types';

export const createToolMetadata = async ({
  nodeAddress,
  token,
  jobId,
  tools,
  xHanzoToolId,
}: CreateToolMetadataInput): Promise<CreateToolMetadataOutput> => {
  const response = await createToolMetadataApi(nodeAddress, token, {
    job_id: jobId,
    language: CodeLanguage.Typescript,
    tools,
    x_hanzo_tool_id: xHanzoToolId,
  });
  return response;
};
