export class HanzoNameError extends Error {
  constructor(public type: 'InvalidFormat' | 'ReceiverNotFound') {
    super(`Hanzo Name Error: ${type}`);
    this.name = 'HanzoNameError';
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
  }
}

export const isHanzoIdentityLocalhost = (
  hanzoIdentity: string,
): boolean => {
  return (
    hanzoIdentity.includes('localhost.arb-sep-hanzo') ||
    hanzoIdentity.includes('localhost.sep-hanzo') ||
    hanzoIdentity.includes('localhost.hanzo')
  );
};

export const extractJobIdFromInbox = (deserializedId: string): string => {
  const parts: string[] = deserializedId.split('::');
  if (parts.length < 3 || !isJobInbox(deserializedId)) {
    throw new HanzoNameError('InvalidFormat');
  }

  const jobId = parts[1];
  return jobId;
};

export const isJobInbox = (inboxId: string): boolean => {
  const parts: string[] = inboxId.split('::');
  if (parts.length < 3) {
    throw new HanzoNameError('InvalidFormat');
  }
  return parts[0] === 'job_inbox';
};

export const buildInboxIdFromJobId = (jobId: string): string => {
  // TODO: job_inbox, false is hardcoded
  return `job_inbox::${jobId}::false`;
};
