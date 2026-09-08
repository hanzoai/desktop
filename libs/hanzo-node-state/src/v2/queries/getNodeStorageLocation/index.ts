import { getNodeStorageLocation as getNodeStorageLocationApi } from "@hanzo/desktop-message-ts/api/general/index";

import { type GetNodeStorageLocationInput } from "./types";

export const getNodeStorageLocation = async ({
  nodeAddress,
  token,
}: GetNodeStorageLocationInput) => {
  const storageLocation = await getNodeStorageLocationApi(nodeAddress, token);
  return storageLocation.storage_location;
};
