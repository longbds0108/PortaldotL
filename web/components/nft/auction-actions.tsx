"use client";

import { AlertTriangle, CheckCircle2, Download, Gavel, Loader2, Lock, Trophy, Undo2, Upload, Wallet } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { zeroAddress, zeroHash, type Hex } from "viem";
import { useAccount } from "wagmi";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { randomBytes32 } from "@/lib/commitment";
import { TOKEN_DECIMALS, formatNativeAmount, formatTokenFloor, isValidAmountInput, parseTokenAmount, shortAddress } from "@/lib/format";
import { AuctionState, nftAuctionAddress, type AuctionBid, type AuctionRow } from "@/lib/nft-auction";
import { computeNftCommitment, verifyNftCommitment } from "@/lib/nft-commitment";
import { nftAuctionEnabled, useMyAuctionBid, useNftTx, useWithdrawable } from "@/lib/nft-hooks";
import { getNftEntry, nftEntrySecrets, parseNftBackup, saveNftEntries, toNftBackupJson, type NftVaultEntry } from "@/lib/nft-vault";
import { downloadTextFile } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

/*
 * Right-hand action panel of an auction. Which panel shows depends on the on-chain state and the viewer's role,
 * mirroring the rules in contracts/src/interfaces/ISealedNFTAuction.sol. In preview mode every button is disabled.
 */

const PREVIEW_HINT = "Transactions open once the auction contract is deployed.";

export function AuctionActions({ row, onChange }: { row: AuctionRow; onChange: () => void }) {
  const { address } = useAccount();
  const myBid = useMyAuctionBid(row.id);
  const withdrawable = useWithdrawable(row.id);
  const isSeller = !!address && address.toLowerCase() === row.auction.seller.toLowerCase();
  const bid = myBid.data as AuctionBid | undefined;
  const hasBid = !!bid && bid.commitment !== zeroHash;
  const refresh = () => {
    void myBid.refetch();
    void withdrawable.refetch();
    onChange();
  };

  let main: ReactNode;
  switch (row.state) {
    case AuctionState.Open:
      main = isSeller ? <SellerOpenPanel row={row} onDone={refresh} /> : <BidPanel row={row} existing={hasBid ? bid : undefined} onDone={refresh} />;
      break;
    case AuctionState.Reveal:
      main = hasBid || !nftAuctionEnabled ? <RevealPanel row={row} bid={bid} onDone={refresh} /> : <Notice icon={<Lock />} title="Bidding has closed">Bidders are revealing their prices. Revealed bids appear in the list as they come in.</Notice>;
      break;
    case AuctionState.Settlement:
    case AuctionState.NoSale:
      main = row.auction.settled ? <OutcomePanel row={row} /> : <SettlePanel row={row} onDone={refresh} />;
      break;
    default:
      main = <OutcomePanel row={row} />;
  }

  const owed = (withdrawable.data as bigint | undefined) ?? 0n;
  return (
    <div className="space-y-4">
      {main}
      {owed > 0n && <WithdrawPanel row={row} amount={owed} isSeller={isSeller} bid={bid} onDone={refresh} />}
    </div>
  );
}

// ───────────────────────── Open: place / update a sealed bid ─────────────────────────

type Prepared = { entry: NftVaultEntry; commitment: Hex };

function BidPanel({ row, existing, onDone }: { row: AuctionRow; existing?: AuctionBid; onDone: () => void }) {
  const { id, auction } = row;
  const { address } = useAccount();
  const tx = useNftTx();
  const [amountInput, setAmountInput] = useState("");
  const [depositInput, setDepositInput] = useState("");
  const [prepared, setPrepared] = useState<Prepared>();
  const [backedUp, setBackedUp] = useState(false);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const amount18 = isValidAmountInput(amountInput) ? parseTokenAmount(amountInput) : undefined;
  const deposit18 = isValidAmountInput(depositInput) ? parseTokenAmount(depositInput) : undefined;
  const current = existing?.deposit ?? 0n;
  const topUp = deposit18 !== undefined && deposit18 > current ? deposit18 - current : 0n;
  const belowReserve = amount18 !== undefined && amount18 > 0n && amount18 < auction.reservePrice;
  const overDeposit = amount18 !== undefined && deposit18 !== undefined && amount18 > deposit18;
  const exactDeposit = amount18 !== undefined && deposit18 !== undefined && amount18 === deposit18;

  function reset() {
    setPrepared(undefined);
    setBackedUp(false);
    setAck(false);
    tx.reset();
  }

  function suggest(factor: number) {
    if (!amount18) return;
    const value = (amount18 * BigInt(Math.round(factor * 100))) / 100n;
    const max = value > current ? value : current;
    setDepositInput(formatTokenFloor(max, TOKEN_DECIMALS, TOKEN_DECIMALS, 2));
    reset();
  }

  function seal() {
    setError(undefined);
    if (!amount18) return setError("Enter your price in tPOTv3 (max 18 decimals).");
    if (deposit18 === undefined || deposit18 === 0n) return setError("Enter the deposit to lock.");
    if (deposit18 < current) return setError(`Your deposit cannot go below the ${formatNativeAmount(current)} already locked.`);
    if (overDeposit) return setError("Your price is above your deposit, so it would not count. Raise the deposit.");
    if (!address || !nftAuctionAddress) return;
    const salt = randomBytes32();
    const entry: NftVaultEntry = {
      v: 1,
      chainId: chain.id,
      contract: nftAuctionAddress,
      auctionId: id.toString(),
      bidder: address,
      amount18: amount18.toString(),
      deposit18: deposit18.toString(),
      salt,
      createdAt: Date.now(),
    };
    saveNftEntries([entry]);
    setPrepared({ entry, commitment: computeNftCommitment({ auctionId: id, bidder: address, amount18, salt }) });
  }

  function backup() {
    if (!prepared || !address) return;
    downloadTextFile(`plinths-nft-auction-${id}-${shortAddress(address).replace("…", "-")}.json`, toNftBackupJson([prepared.entry]));
    setBackedUp(true);
  }

  async function submit() {
    if (!prepared) return;
    const receipt = existing
      ? await tx.send("updateBid", [id, prepared.commitment], topUp)
      : await tx.send("placeBid", [id, prepared.commitment], deposit18);
    if (receipt) {
      setDone(true);
      onDone();
    }
  }

  if (done) {
    return (
      <Notice icon={<CheckCircle2 className="text-success" />} title={existing ? "Sealed bid updated" : "Sealed bid placed"}>
        Keep your backup file. When bidding ends, come back here to reveal your price.
        <TxStatus status={tx.status} hash={tx.hash} />
      </Notice>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="size-4" /> {existing ? "Update your sealed bid" : "Place a sealed bid"}
        </CardTitle>
        <CardDescription>
          {existing
            ? `You have ${formatNativeAmount(existing.deposit)} locked. A new price replaces the old one; you can add to the deposit but not withdraw from it.`
            : "Your price is hashed in this browser. Only the hash and your deposit go on-chain."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AmountField id="price" label="Your price" value={amountInput} onChange={(v) => { setAmountInput(v); reset(); }} placeholder={auction.reservePrice > 0n ? `At least ${formatNativeAmount(auction.reservePrice)}` : "Your price"} />
        {belowReserve && <p className="text-xs text-warning">Below the reserve — this bid would not count.</p>}

        <div className="space-y-2">
          <AmountField id="deposit" label="Deposit to lock" value={depositInput} onChange={(v) => { setDepositInput(v); reset(); }} placeholder="More than your price" />
          <div className="flex flex-wrap gap-1.5">
            {[
              ["+25%", 1.25],
              ["+50%", 1.5],
              ["×2", 2],
            ].map(([label, f]) => (
              <button
                key={label}
                type="button"
                disabled={!amount18}
                onClick={() => suggest(f as number)}
                className="rounded-full border border-overlay/10 px-3 py-1 text-[0.7rem] text-foreground-soft transition-colors hover:text-foreground disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            The deposit is public; your price is not. Lock more than your price so others cannot read it from the deposit.
            Losing bidders get it all back; the winner gets back the difference.
          </p>
          {exactDeposit && <p className="text-xs text-warning">Deposit equals your price, so anyone can read your bid from it.</p>}
        </div>

        <FieldError>{error}</FieldError>
        {!prepared ? (
          <Button className="w-full" onClick={seal} disabled={!nftAuctionEnabled || !amount18 || !deposit18}>
            <Lock /> Seal bid
          </Button>
        ) : (
          <div className="space-y-3 rounded-[14px] border border-overlay/[0.08] p-3">
            <Button className="w-full" variant={backedUp ? "outline" : "default"} onClick={backup}>
              <Download /> {backedUp ? "Download backup again" : "Download backup file (required)"}
            </Button>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="mt-0.5" checked={ack} disabled={!backedUp} onChange={(e) => setAck(e.target.checked)} />
              I stored the backup. Without it I cannot reveal, my bid is excluded and part of my deposit is forfeited.
            </label>
            <Button className="w-full" size="lg" disabled={!backedUp || !ack || tx.busy} onClick={submit}>
              {tx.busy && <Loader2 className="animate-spin" />}
              {existing ? `Update bid${topUp > 0n ? ` + ${formatNativeAmount(topUp)}` : ""}` : `Bid · lock ${deposit18 !== undefined ? formatNativeAmount(deposit18) : ""}`}
            </Button>
            <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
          </div>
        )}
        {!nftAuctionEnabled && <p className="text-xs text-muted-foreground">{PREVIEW_HINT}</p>}
      </CardContent>
    </Card>
  );
}

function SellerOpenPanel({ row, onDone }: { row: AuctionRow; onDone: () => void }) {
  const tx = useNftTx();
  const canCancel = row.auction.bidCount === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your auction</CardTitle>
        <CardDescription>
          {canCancel
            ? "No bids yet. You can still cancel and get the NFT back."
            : `${row.auction.bidCount} sealed bid${row.auction.bidCount === 1 ? "" : "s"}. The auction can no longer be cancelled.`}
        </CardDescription>
      </CardHeader>
      {canCancel && (
        <CardContent className="space-y-3">
          <Button variant="outline" disabled={tx.busy} onClick={async () => (await tx.send("cancel", [row.id])) && onDone()}>
            {tx.busy ? <Loader2 className="animate-spin" /> : <Undo2 />} Cancel and return NFT
          </Button>
          <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        </CardContent>
      )}
    </Card>
  );
}

// ───────────────────────── Reveal ─────────────────────────

function RevealPanel({ row, bid, onDone }: { row: AuctionRow; bid?: AuctionBid; onDone: () => void }) {
  const { id, auction } = row;
  const { address } = useAccount();
  const tx = useNftTx();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<NftVaultEntry>();
  const [error, setError] = useState<string>();

  const stored = address && nftAuctionAddress ? getNftEntry({ chainId: chain.id, contract: nftAuctionAddress, auctionId: id, bidder: address }) : undefined;
  const entry = imported ?? stored;
  const secrets = entry ? nftEntrySecrets(entry) : undefined;
  const matches = !!secrets && !!bid && !!address && verifyNftCommitment({ auctionId: id, bidder: address, ...secrets }, bid.commitment);
  const counts = !!secrets && !!bid && secrets.amount18 >= auction.reservePrice && secrets.amount18 <= bid.deposit;

  if (bid?.revealed) {
    const counted = bid.amount >= auction.reservePrice && bid.amount <= bid.deposit;
    return (
      <Notice icon={<CheckCircle2 className="text-success" />} title={`Revealed: ${formatNativeAmount(bid.amount)}`}>
        {counted
          ? auction.highestBidder.toLowerCase() === address?.toLowerCase()
            ? "Your bid is currently the highest."
            : "Your bid counts. The highest counted price wins when the reveal window closes."
          : "Your bid does not count (below the reserve or above your deposit). You will get your full deposit back."}
      </Notice>
    );
  }

  async function importFile(file: File) {
    setError(undefined);
    try {
      const all = parseNftBackup(await file.text());
      const match = all.find((e) => e.auctionId === id.toString() && (!address || e.bidder.toLowerCase() === address.toLowerCase()));
      if (!match) throw new Error(`This backup has no bid for auction #${id}${address ? ` from ${shortAddress(address)}` : ""}.`);
      saveNftEntries([match]);
      setImported(match);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the backup file.");
    }
  }

  async function reveal() {
    if (!secrets) return;
    if (await tx.send("revealBid", [id, secrets.amount18, secrets.salt])) onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" /> Reveal your bid
        </CardTitle>
        <CardDescription>
          Bidding has closed. Reveal before the deadline: unrevealed bids are excluded and lose part of their deposit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entry && secrets ? (
          <div className="grid gap-2 rounded-[14px] border border-overlay/[0.08] p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Your price</span><b className="font-medium">{formatNativeAmount(secrets.amount18)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span>{formatNativeAmount(bid?.deposit ?? BigInt(entry.deposit18))}</span></div>
            <p className={cn("flex items-center gap-1.5 text-xs", matches ? "text-success-fg" : "text-destructive")}>
              {matches ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              {matches ? "Matches your sealed commitment" : "Does not match the commitment on-chain — check you imported the latest backup"}
            </p>
            {matches && !counts && <p className="text-xs text-warning">This bid will not count, but revealing still returns your full deposit.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No saved secrets for this bid in this browser. Import your backup file.</p>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Import backup file
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        </div>
        <FieldError>{error}</FieldError>
        <Button className="w-full" size="lg" disabled={!nftAuctionEnabled || !matches || tx.busy} onClick={reveal}>
          {tx.busy && <Loader2 className="animate-spin" />} Reveal bid
        </Button>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        {!nftAuctionEnabled && <p className="text-xs text-muted-foreground">{PREVIEW_HINT}</p>}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── Settle / outcome / withdraw ─────────────────────────

function SettlePanel({ row, onDone }: { row: AuctionRow; onDone: () => void }) {
  const tx = useNftTx();
  const sale = row.auction.highestBidder !== zeroAddress;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4" /> {sale ? "Ready to settle" : "No valid bid"}
        </CardTitle>
        <CardDescription>
          {sale
            ? `${shortAddress(row.auction.highestBidder)} won with ${formatNativeAmount(row.auction.highestBid)}. Anyone can settle: the NFT goes to the winner and the price to the seller.`
            : "No revealed bid met the reserve. Settling returns the NFT to the seller."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" disabled={!nftAuctionEnabled || tx.busy} onClick={async () => (await tx.send("settle", [row.id])) && onDone()}>
          {tx.busy && <Loader2 className="animate-spin" />} {sale ? "Settle: deliver NFT" : "Settle: return NFT"}
        </Button>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
        {!nftAuctionEnabled && <p className="text-xs text-muted-foreground">{PREVIEW_HINT}</p>}
      </CardContent>
    </Card>
  );
}

function OutcomePanel({ row }: { row: AuctionRow }) {
  const { auction, state } = row;
  if (state === AuctionState.Cancelled) {
    return <Notice icon={<Undo2 />} title="Cancelled">The seller cancelled before any bid; the NFT went back to them.</Notice>;
  }
  if (auction.highestBidder === zeroAddress) {
    return <Notice icon={<Undo2 />} title="No sale">No revealed bid met the reserve. The NFT was returned to the seller.</Notice>;
  }
  return (
    <Notice icon={<Trophy className="text-success" />} title={`Sold for ${formatNativeAmount(auction.highestBid)}`}>
      Won by {shortAddress(auction.highestBidder)}. Every revealed amount below can be re-checked against its sealed commitment.
    </Notice>
  );
}

function WithdrawPanel({ row, amount, isSeller, bid, onDone }: { row: AuctionRow; amount: bigint; isSeller: boolean; bid?: AuctionBid; onDone: () => void }) {
  const tx = useNftTx();
  const { address } = useAccount();
  const winner = !!address && address.toLowerCase() === row.auction.highestBidder.toLowerCase();
  const reason = isSeller
    ? "Proceeds from the sale."
    : winner
      ? "The part of your deposit above your winning price."
      : bid && !bid.revealed
        ? "Your deposit minus the penalty for not revealing."
        : "Your full deposit.";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4" /> {formatNativeAmount(amount)} to withdraw
        </CardTitle>
        <CardDescription>{reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" disabled={tx.busy} onClick={async () => (await tx.send("withdraw", [row.id])) && onDone()}>
          {tx.busy && <Loader2 className="animate-spin" />} Withdraw
        </Button>
        <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
      </CardContent>
    </Card>
  );
}

// ───────────────────────── bits ─────────────────────────

function AmountField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="pr-20" />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">tPOTv3</span>
      </div>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Alert variant="default" className="flex-col gap-2 sm:flex-row">
      {icon}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <div className="space-y-2 text-muted-foreground">{children}</div>
      </div>
    </Alert>
  );
}
