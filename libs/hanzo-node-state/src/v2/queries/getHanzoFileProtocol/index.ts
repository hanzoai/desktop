import { getHanzoFileProtocol as getHanzoFileProtocolApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { generateFilePreview } from '../../utils/file-preview';
import  {
  type GetHanzoFileProtocolInput,
  type GetHanzoFilesProtocolInput,
} from './types';

export const getHanzoFileProtocol = async ({
  nodeAddress,
  token,
  file,
}: GetHanzoFileProtocolInput) => {
  const result = await getHanzoFileProtocolApi(nodeAddress, token, {
    file,
  });
  return result;
};

export const getHanzoFilesProtocol = async ({
  nodeAddress,
  token,
  files,
}: GetHanzoFilesProtocolInput) => {
  const results = await Promise.all(
    files.map(async (file) => {
      const result = await getHanzoFileProtocolApi(nodeAddress, token, {
        file,
      });
      return generateFilePreview(file, result);
    }),
  );

  return results;
};
