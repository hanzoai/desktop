import { getNodeStorageLocation as getNodeStorageLocationApi } from "@hanzo_network/hanzo-message-ts/api/general/index";

import { type GetNodeStorageLocationInput } from "./types";

export const getNodeStorageLocation = async ({
  nodeAddress,
  token,
}: GetNodeStorageLocationInput) => {
  const storageLocation = await getNodeStorageLocationApi(nodeAddress, token);
  return storageLocation.storage_location;
};
