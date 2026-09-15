import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CopyToClipboardIcon,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
  TextField,
} from '@hanzo/desktop-ui';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  EyeIcon,
  EyeOffIcon,
  FileText,
  KeyRound,
  MoreVertical,
  PlusIcon,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  Trash2,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  type Balance,
  type LuxAccount,
  type WalletType,
  chainById,
  comingSoonChains,
  evmChains,
  signInWithWallet,
  useLuxWallet,
  useWeb3Session,
} from '../lib/lux-wallet';
import { SimpleLayout } from './layout/simple-layout';

const WALLET_TYPE_LABEL: Record<WalletType, string> = {
  'local-hd-pq': 'Local HD + PQ',
  mpc: 'MPC (threshold)',
  safe: 'Safe smart-account',
};

const SecretRecoveryPhraseDisplay = ({ mnemonic }: { mnemonic: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Alert variant="warning" className="mb-3 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="mb-2 text-base font-medium">
          Never share your Secret Recovery Phrase
        </AlertTitle>
        <AlertDescription className="!pl-5 text-sm text-white">
          <ul className="list-disc space-y-1 text-sm">
            <li>
              Anyone with your Secret Recovery Phrase can take full control of
              your wallet and funds.
            </li>
            <li>Store it offline in a secure, private place.</li>
          </ul>
        </AlertDescription>
      </Alert>
      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1 rounded-lg border bg-white/5 p-4">
        {mnemonic.split(' ').map((word, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <span className="flex h-6 w-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-medium text-white">
              {idx + 1}
            </span>
            <span className="font-mono text-sm">{word}</span>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="md"
        className="w-full"
        onClick={() => {
          void navigator.clipboard.writeText(mnemonic);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Copy className="size-4" />
        )}
        {copied ? 'Copied' : 'Copy to Clipboard'}
      </Button>
    </div>
  );
};

type CreateView =
  | 'choose'
  | 'create-type'
  | 'created'
  | 'import-mnemonic'
  | 'import-key';

const CreateWalletDialog = ({ label }: { label: string }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CreateView>('choose');
  const [newMnemonic, setNewMnemonic] = useState('');
  const createWallet = useLuxWallet((s) => s.createWallet);
  const importMnemonic = useLuxWallet((s) => s.importMnemonic);
  const importPrivateKey = useLuxWallet((s) => s.importPrivateKey);

  const reset = () => {
    setView('choose');
    setNewMnemonic('');
  };

  const mnemonicForm = useForm<{ mnemonic: string }>({
    resolver: zodResolver(z.object({ mnemonic: z.string().min(1) })),
    defaultValues: { mnemonic: '' },
  });
  const keyForm = useForm<{ privateKey: string }>({
    resolver: zodResolver(z.object({ privateKey: z.string().min(1) })),
    defaultValues: { privateKey: '' },
  });
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [busy, setBusy] = useState(false);

  const doCreate = async (type: WalletType) => {
    setBusy(true);
    try {
      const { mnemonic } = await createWallet({ type });
      setNewMnemonic(mnemonic);
      setView('created');
    } catch (e) {
      toast.error('Could not create wallet', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const content = () => {
    switch (view) {
      case 'choose':
        return (
          <div>
            <DialogHeader>
              <DialogTitle className="text-center">
                Create / Connect Wallet
              </DialogTitle>
            </DialogHeader>
            <div className="mt-8 space-y-3">
              <OptionButton
                icon={<PlusIcon className="size-4 shrink-0" />}
                title="Create New"
                description="A new post-quantum HD wallet secured on this device."
                onClick={() => setView('create-type')}
              />
              <OptionButton
                icon={<FileText className="size-4 shrink-0" />}
                title="Import Secret Recovery Phrase"
                description="Restore an existing wallet from its 12/24 words."
                onClick={() => setView('import-mnemonic')}
              />
              <OptionButton
                icon={<Download className="size-4 shrink-0" />}
                title="Import Private Key"
                description="Import a single EVM account from its private key."
                onClick={() => setView('import-key')}
              />
            </div>
          </div>
        );
      case 'create-type':
        return (
          <div>
            <DialogHeader>
              <DialogTitle className="text-center">
                Choose Wallet Type
              </DialogTitle>
            </DialogHeader>
            <div className="mt-8 space-y-3">
              <OptionButton
                icon={<ShieldCheck className="size-4 shrink-0" />}
                title="Local HD + Post-Quantum"
                description="Seed on device. secp256k1 + ML-DSA-65 (FIPS-204). Recommended."
                disabled={busy}
                onClick={() => void doCreate('local-hd-pq')}
              />
              <OptionButton
                icon={<KeyRound className="size-4 shrink-0" />}
                title="MPC (threshold)"
                description="Key split across parties (luxfi/mpc). Coming soon."
                disabled
                onClick={() => undefined}
              />
              <OptionButton
                icon={<WalletIcon className="size-4 shrink-0" />}
                title="Safe smart-account"
                description="This device is an owner key of a Safe. Coming soon."
                disabled
                onClick={() => undefined}
              />
            </div>
          </div>
        );
      case 'created':
        return (
          <div>
            <DialogHeader className="mb-5">
              <DialogTitle className="text-center">
                Your Secret Recovery Phrase
              </DialogTitle>
            </DialogHeader>
            <SecretRecoveryPhraseDisplay mnemonic={newMnemonic} />
            <DialogFooter className="mt-4">
              <Button
                className="w-full"
                size="md"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                I&apos;ve saved it — Done
              </Button>
            </DialogFooter>
          </div>
        );
      case 'import-mnemonic':
        return (
          <Form {...mnemonicForm}>
            <form
              className="flex flex-col gap-6 pt-8"
              onSubmit={mnemonicForm.handleSubmit(async ({ mnemonic }) => {
                setBusy(true);
                try {
                  await importMnemonic(mnemonic);
                  setOpen(false);
                  reset();
                } catch (e) {
                  toast.error('Invalid recovery phrase', {
                    description: e instanceof Error ? e.message : String(e),
                  });
                } finally {
                  setBusy(false);
                }
              })}
            >
              <DialogHeader>
                <DialogTitle className="text-center">
                  Import Secret Phrase
                </DialogTitle>
              </DialogHeader>
              <FormField
                control={mnemonicForm.control}
                name="mnemonic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Recovery Phrase</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Textarea
                          className="!min-h-[120px] resize-none text-sm"
                          /*
                            A seed phrase must never reach a spell-check service
                            (Chrome's enhanced spell check uploads field text).
                            gui swallows the camelCase `spellCheck` — measured —
                            but forwards unknown lowercase DOM attributes, and
                            the lowercase spelling is what the platform reads.
                          */
                          {...({ spellcheck: 'false' } as object)}
                          style={
                            {
                              WebkitTextSecurity: showMnemonic
                                ? 'none'
                                : 'disc',
                            } as React.CSSProperties
                          }
                          {...field}
                        />
                      </FormControl>
                      <Button
                        className="absolute top-2 right-2"
                        onClick={() => setShowMnemonic(!showMnemonic)}
                        size="icon"
                        type="button"
                        variant="tertiary"
                      >
                        {showMnemonic ? (
                          <EyeOffIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" size="sm" isLoading={busy} disabled={busy}>
                Import
              </Button>
            </form>
          </Form>
        );
      case 'import-key':
        return (
          <Form {...keyForm}>
            <form
              className="flex flex-col gap-6 pt-8"
              onSubmit={keyForm.handleSubmit(async ({ privateKey }) => {
                setBusy(true);
                try {
                  await importPrivateKey(privateKey);
                  setOpen(false);
                  reset();
                } catch (e) {
                  toast.error('Invalid private key', {
                    description: e instanceof Error ? e.message : String(e),
                  });
                } finally {
                  setBusy(false);
                }
              })}
            >
              <DialogHeader>
                <DialogTitle className="text-center">
                  Import Private Key
                </DialogTitle>
              </DialogHeader>
              <FormField
                control={keyForm.control}
                name="privateKey"
                render={({ field }) => (
                  <TextField
                    field={field}
                    label="Private Key"
                    type="password"
                  />
                )}
              />
              <Button type="submit" size="sm" isLoading={busy} disabled={busy}>
                Import
              </Button>
            </form>
          </Form>
        );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(e: Event) => e.preventDefault()}
        showCloseButton={false}
      >
        {view !== 'choose' && view !== 'created' && (
          <Button
            className="absolute top-6 left-4"
            onClick={() => setView('choose')}
            size="icon"
            variant="tertiary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="px-2 pt-2.5">{content()}</div>
      </DialogContent>
    </Dialog>
  );
};

const OptionButton = ({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button
    className="flex h-[auto] w-full items-center justify-start gap-4 rounded-md px-5 py-2.5 text-left"
    onClick={onClick}
    disabled={disabled}
    variant="outline"
  >
    {icon}
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-text-secondary text-sm">{description}</div>
    </div>
  </Button>
);

const NetworkSelect = () => {
  const selectedChainId = useLuxWallet((s) => s.selectedChainId);
  const selectChain = useLuxWallet((s) => s.selectChain);
  const evm = useMemo(() => evmChains(), []);
  const soon = useMemo(() => comingSoonChains(), []);
  return (
    <Select
      value={String(selectedChainId)}
      onValueChange={(v) => selectChain(Number(v))}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Networks</SelectLabel>
          {evm.map((c) => (
            <SelectItem key={c.id} value={String(c.evmChainId)}>
              {c.name} ({c.nativeAsset.symbol})
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Coming soon</SelectLabel>
          {soon.map((c) => (
            <SelectItem key={c.id} value={`soon-${c.id}`} disabled>
              {c.name} — coming soon
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

const SendDialog = ({ account }: { account: LuxAccount }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedChainId = useLuxWallet((s) => s.selectedChainId);
  const sendEvm = useLuxWallet((s) => s.sendEvm);
  const form = useForm<{ to: string; amount: string }>({
    resolver: zodResolver(
      z.object({
        to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Enter a valid 0x address'),
        amount: z.string().regex(/^\d*\.?\d+$/, 'Enter a valid amount'),
      }),
    ),
    defaultValues: { to: '', amount: '' },
  });
  const chain = chainById(selectedChainId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <SendHorizontal className="size-4" />
          Send
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Send {chain?.nativeAsset.symbol ?? ''}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-5 pt-4"
            onSubmit={form.handleSubmit(async ({ to, amount }) => {
              setBusy(true);
              try {
                const { hash } = await sendEvm({
                  accountId: account.id,
                  chainId: selectedChainId,
                  to,
                  amountEther: amount,
                });
                toast.success('Transaction sent', { description: hash });
                setOpen(false);
                form.reset();
              } catch (e) {
                toast.error('Send failed', {
                  description: e instanceof Error ? e.message : String(e),
                });
              } finally {
                setBusy(false);
              }
            })}
          >
            <div className="text-text-secondary text-xs">
              Network: {chain?.name}
            </div>
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <TextField field={field} label="Recipient address" />
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <TextField
                  field={field}
                  label={`Amount (${chain?.nativeAsset.symbol ?? ''})`}
                />
              )}
            />
            <Button type="submit" size="sm" isLoading={busy} disabled={busy}>
              Send
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

const SignInWithWalletButton = ({ account }: { account: LuxAccount }) => {
  const [busy, setBusy] = useState(false);
  const setSession = useWeb3Session((s) => s.setSession);
  return (
    <Button
      size="sm"
      variant="outline"
      isLoading={busy}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await signInWithWallet({
            accountId: account.id,
            address: account.evmAddress,
          });
          if (res.ok && res.userId) {
            setSession({
              userId: res.userId,
              address: res.address,
              chain: 'evm',
              loggedInAt: Date.now(),
            });
            toast.success('Signed in with wallet', {
              description: `Identity ${res.userId}`,
            });
          } else {
            toast.error('Sign-in failed', { description: res.reason });
          }
        } catch (e) {
          toast.error('Sign-in failed', {
            description: e instanceof Error ? e.message : String(e),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <ShieldCheck className="size-4" />
      Sign in with Wallet
    </Button>
  );
};

const CryptoWalletPage = () => {
  const init = useLuxWallet((s) => s.init);
  const status = useLuxWallet((s) => s.status);
  const accounts = useLuxWallet((s) => s.accounts);
  const selectedAccountId = useLuxWallet((s) => s.selectedAccountId);
  const selectedChainId = useLuxWallet((s) => s.selectedChainId);
  const selectAccount = useLuxWallet((s) => s.selectAccount);
  const removeWallet = useLuxWallet((s) => s.removeWallet);
  const revealMnemonic = useLuxWallet((s) => s.revealMnemonic);
  const getBalance = useLuxWallet((s) => s.getBalance);
  const session = useWeb3Session((s) => s.session);

  const account = useMemo(
    () =>
      accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  );

  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [showPhrase, setShowPhrase] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const refreshBalance = useMemo(
    () => async () => {
      if (!account) return;
      setBalanceLoading(true);
      try {
        setBalance(await getBalance(selectedChainId, account.evmAddress));
      } finally {
        setBalanceLoading(false);
      }
    },
    [account, selectedChainId, getBalance],
  );

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  if (status === 'loading' && accounts.length === 0) {
    return (
      <SimpleLayout classname="container" title="Wallet">
        <div className="flex h-full items-center justify-center">
          <RefreshCw className="text-text-secondary size-6 animate-spin" />
        </div>
      </SimpleLayout>
    );
  }

  const walletExist = accounts.length > 0;

  return (
    <SimpleLayout
      classname="container"
      headerRightElement={
        walletExist ? (
          <div className="flex items-center gap-3">
            {account && <SignInWithWalletButton account={account} />}
            <CreateWalletDialog label="Add Wallet" />
          </div>
        ) : null
      }
      title={walletExist ? 'My Wallet' : 'Crypto Wallet'}
    >
      {!walletExist ? (
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-3 rounded-md p-6">
            <WalletIcon className="text-text-secondary size-10" />
            <div className="flex flex-col items-center text-center">
              <h2 className="text-lg font-medium">No wallet yet</h2>
              <p className="text-text-secondary max-w-sm text-sm">
                Create a native post-quantum wallet on this device, or import an
                existing one. Your keys never leave your machine.
              </p>
            </div>
            <CreateWalletDialog label="Set up Wallet" />
          </div>
        </div>
      ) : (
        account && (
          <div className="py-5">
            <div className="mx-auto max-w-2xl space-y-6">
              {accounts.length > 1 && (
                <Select
                  value={account.id}
                  onValueChange={(v) => selectAccount(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label} — {a.evmAddress.slice(0, 6)}…
                        {a.evmAddress.slice(-4)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium">
                        {account.label}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
                        {WALLET_TYPE_LABEL[account.type]}
                      </span>
                      {account.pqPublicKey && (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                          <ShieldCheck className="size-3" /> ML-DSA-65
                        </span>
                      )}
                    </div>
                    <DropdownMenu placement="bottom-end">
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {account.hasMnemonic && (
                          <DropdownMenuItem
                            onClick={async () => {
                              setPhrase(await revealMnemonic(account.id));
                              setShowPhrase(true);
                            }}
                          >
                            Reveal Secret Recovery Phrase
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-red-400"
                          onClick={() => void removeWallet(account.id)}
                        >
                          <Trash2 className="mr-2 size-4" /> Remove Wallet
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-2">
                    <div className="text-text-secondary text-sm font-medium">
                      Address
                    </div>
                    <div className="flex items-center gap-3">
                      <code className="font-mono text-sm break-all">
                        {account.evmAddress}
                      </code>
                      <CopyToClipboardIcon
                        string={account.evmAddress}
                        className="size-4"
                      />
                    </div>
                  </div>

                  {account.pqNodeId && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <div className="text-text-secondary text-sm font-medium">
                          Post-Quantum Identity (NodeID)
                        </div>
                        <code className="text-text-secondary font-mono text-xs break-all">
                          {account.pqNodeId}
                        </code>
                      </div>
                    </>
                  )}

                  <Separator />
                  <div className="space-y-2">
                    <div className="text-text-secondary text-sm font-medium">
                      Network
                    </div>
                    <NetworkSelect />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-medium">Balance</div>
                    <Button
                      className="h-8 w-auto"
                      disabled={balanceLoading}
                      isLoading={balanceLoading}
                      onClick={() => void refreshBalance()}
                      rounded="lg"
                      size="xs"
                      variant="outline"
                    >
                      {!balanceLoading && <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">
                      {balance?.formatted ?? '0'}
                    </span>
                    <span className="text-text-secondary">
                      {balance?.symbol ??
                        chainById(selectedChainId)?.nativeAsset.symbol}
                    </span>
                  </div>
                  {balance?.error && (
                    <div className="text-text-secondary text-xs">
                      RPC unavailable for this network right now.
                    </div>
                  )}
                  <div className="flex gap-3 pt-1">
                    <SendDialog account={account} />
                  </div>
                </CardContent>
              </Card>

              {session && (
                <Card>
                  <CardContent className="flex items-center gap-2 pt-5 text-sm">
                    <ShieldCheck className="size-4 text-emerald-400" />
                    Signed in as{' '}
                    <code className="font-mono">{session.userId}</code>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )
      )}

      <Dialog open={showPhrase} onOpenChange={setShowPhrase}>
        <DialogContent showCloseButton className="w-full p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-center">
              Secret Recovery Phrase
            </DialogTitle>
          </DialogHeader>
          {phrase ? (
            <SecretRecoveryPhraseDisplay mnemonic={phrase} />
          ) : (
            <p className="text-text-secondary text-center text-sm">
              No recovery phrase is stored for this wallet.
            </p>
          )}
          <DialogClose asChild>
            <Button
              className="mt-4 w-full"
              size="md"
              onClick={() => setShowPhrase(false)}
            >
              Done
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </SimpleLayout>
  );
};

export default CryptoWalletPage;
