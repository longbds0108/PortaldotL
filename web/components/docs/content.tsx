import Link from "next/link";
import type { ReactNode } from "react";
import { BLINDBID_ADDRESS, EXPLORER_URL } from "@/lib/env";
import { NETWORK_NAME } from "@/lib/network";
import { B, Callout, Cards, Chips, Code, DocCard, H3, P, Pre, Steps, Table, Ul } from "./ui";

/*
 * Every statement here is grounded in the code: contracts/src/BlindBidMarket.sol, CommitmentLib.sol,
 * the web app (web/app, web/lib) and CLAUDE.md. Keep it in sync when behaviour changes.
 */

const COMMITMENT = `commitment = keccak256(abi.encode(
    tenderId,      // uint256
    bidder,        // address — msg.sender, so a copied hash cannot be reused
    amount,        // uint256, USDC with 6 decimals (7,500 USDC = 7_500_000_000)
    salt,          // bytes32, random (crypto.getRandomValues)
    keccak256(docKey)  // binds the encrypted proposal to the price
))`;

const contractLink = BLINDBID_ADDRESS ? (
  <a className="text-[#8fb4ff] underline-offset-4 hover:underline" href={`${EXPLORER_URL}/address/${BLINDBID_ADDRESS}`} target="_blank" rel="noreferrer">
    {BLINDBID_ADDRESS}
  </a>
) : (
  "not configured"
);

export const DOC_CONTENT: Record<string, { eyebrow: string; title: string; body: ReactNode }> = {
  "": {
    eyebrow: "Hedgora · 01",
    title: "What is Hedgora?",
    body: (
      <>
        <P>
          Hedgora is a <B>public confidential bidding marketplace on {NETWORK_NAME}</B>. A buyer publishes a tender that
          any wallet can bid on, but every bid amount stays sealed until the submission deadline — not even the buyer can
          read it.
        </P>
        <P>
          Prices are hidden with cryptography rather than by the website: bidders post only a hash of their offer
          (commit), and open it after the deadline (reveal). Proposals are encrypted in the bidder&apos;s browser before
          upload. The smart contract enforces every deadline using block time.
        </P>
        <H3>What can you do on Hedgora?</H3>
        <Cards>
          <DocCard label="Publish a tender" tone="blue">
            Post a title, scope, category, eligibility notes, evaluation criteria, a public budget range, deadlines and an
            optional bid bond.
          </DocCard>
          <DocCard label="Submit a sealed bid" tone="teal">
            Enter your price and attach a proposal. Only a commitment hash goes on-chain; the proposal is encrypted
            (AES-256-GCM) before it is uploaded.
          </DocCard>
          <DocCard label="Reveal" tone="cream">
            After the submission deadline, open your bid. The contract checks it matches the hash you committed.
          </DocCard>
          <DocCard label="Evaluate & award" tone="blue">
            Once the reveal window closes, the buyer compares revealed bids, decrypts proposals and awards one revealed
            bidder with a public justification.
          </DocCard>
          <DocCard label="Verify" tone="teal">
            Anyone can open the results page and recompute every revealed bid&apos;s commitment in the browser.
          </DocCard>
        </Cards>
        <H3>Supported assets</H3>
        <Chips items={[{ label: "USDC", tone: "blue" }]} />
        <P>
          Budgets and bid amounts are USDC with 6 decimals. Bid bonds are paid in native USDC, Arc&apos;s gas token, which
          has 18 decimals — it is the same balance, shown in the app as a single USDC figure.
        </P>
      </>
    ),
  },

  "sealed-bidding": {
    eyebrow: "Overview · 02",
    title: "How sealed bidding works",
    body: (
      <>
        <P>
          Arc does not offer private execution yet (Arc Privacy Sector is on its roadmap), so all on-chain data is
          public. Hedgora therefore keeps prices secret with a <B>commit–reveal</B> scheme.
        </P>
        <H3>1 · Commit</H3>
        <P>
          Before the submission deadline a bidder sends only a 32-byte commitment. It is computed in the browser and is
          the same in the app and in the contract:
        </P>
        <Pre>{COMMITMENT}</Pre>
        <P>
          Without the random salt the hash cannot be reversed, so the price cannot be read from the chain. Because the
          bidder&apos;s address is inside the hash, copying someone else&apos;s commitment does not work: it fails at reveal.
        </P>
        <H3>2 · Reveal</H3>
        <P>
          During the reveal window the bidder calls <Code>revealBid(amount, salt, docKey)</Code>. The contract recomputes
          the hash and rejects the reveal if any value differs from what was committed. The published{" "}
          <Code>docKey</Code> lets the buyer decrypt the proposal.
        </P>
        <H3>3 · Award and proof</H3>
        <P>
          After the reveal window the buyer may award only a bidder who revealed. Because amount, salt and key are now
          public, anyone can recompute each commitment and check it was fixed before the deadline.
        </P>
        <Callout label="Trade-off" tone="amber">
          A bidder can choose not to reveal. That bid is excluded, and if the tender requires a bid bond, the bond goes to
          the Hedgora treasury — never to the buyer, so a buyer gains nothing when bidders miss the reveal window. See <Link className="text-[#8fb4ff] hover:underline" href="/docs/reveal-bonds">Revealing &amp; bonds</Link>.
        </Callout>
      </>
    ),
  },

  "create-tender": {
    eyebrow: "For buyers · 03",
    title: "Creating a tender",
    body: (
      <>
        <P>
          Open <B>Create Tender</B> with the wallet that will own the tender. The details are uploaded to IPFS as public
          metadata; the budget, deadlines and bond are stored on-chain.
        </P>
        <Table
          head={["Field", "Where it lives", "Notes"]}
          rows={[
            ["Title, category, scope", "IPFS metadata", "Categories: Technology, Construction, Services."],
            ["Eligibility", "IPFS metadata", "Not verified on-chain — you exclude ineligible bids during evaluation."],
            ["Evaluation criteria", "IPFS metadata", "Shown to bidders and on the evaluation page."],
            ["Budget min / max", "On-chain", "USDC, 6 decimals. Public. Minimum must not exceed maximum."],
            ["Submission deadline", "On-chain", "Must be in the future."],
            ["Reveal deadline", "On-chain", "At least 24 hours after the submission deadline."],
            ["Bid bond", "On-chain", "Optional, native USDC. Every bidder must send exactly this amount."],
          ]}
        />
        <H3>Rules enforced by the contract</H3>
        <Ul
          items={[
            "You cannot bid on your own tender.",
            <>You can cancel a tender only while it is Open <B>and has no bids</B>.</>,
            "Deadlines cannot be changed after publishing.",
          ]}
        />
        <Callout label="Your business name" tone="blue">
          If you set a business name in Profile &amp; Settings, it is added to the tender metadata you publish.
        </Callout>
      </>
    ),
  },

  "evaluate-award": {
    eyebrow: "For buyers · 04",
    title: "Evaluating & awarding",
    body: (
      <>
        <P>
          The Evaluation page opens only for the buyer, and only when the tender is in the <B>Evaluation</B> state: the
          reveal deadline has passed and at least one bid was revealed.
        </P>
        <Steps
          items={[
            { title: "Compare revealed bids", body: "Bids are sorted by price, with the lowest marked and each one tagged as below range, within budget or over budget." },
            { title: "Decrypt proposals", body: "Each proposal is decrypted in your browser with the key the bidder published at reveal, then downloaded." },
            { title: "Exclude non-revealed bids", body: "Bids that were not revealed are listed as excluded; their proposal keys were never published." },
            { title: "Award with a reason", body: "Pick a revealed bidder and write a justification (at least 10 characters). The reason is uploaded to IPFS and its link is stored on-chain with the winner." },
          ]}
        />
        <H3>What the contract checks</H3>
        <Ul
          items={[
            "Only the buyer can award.",
            "Only in the Evaluation state, and only once.",
            "The winner must have a revealed bid, and the reason link must not be empty.",
          ]}
        />
        <H3>If nobody revealed</H3>
        <P>
          When the reveal deadline passes with no revealed bid, the tender becomes <B>Failed</B> and cannot be awarded.
        </P>
        <H3>Forfeited bonds</H3>
        <P>
          Bonds of bids that were not revealed do <B>not</B> go to you. After the reveal deadline anyone can press{" "}
          <B>Send forfeited bonds to treasury</B> on the tender page, and the contract sends them to the fixed Hedgora
          treasury.
        </P>
      </>
    ),
  },

  "submit-bid": {
    eyebrow: "For bidders · 05",
    title: "Submitting a sealed bid",
    body: (
      <>
        <P>Bidding takes three steps on the tender&apos;s Submit Bid page, while the tender is Open.</P>
        <Steps
          items={[
            {
              title: "Seal your offer",
              body: (
                <>
                  Enter the amount in USDC and attach your technical proposal (max 20 MB). The app generates a random salt
                  and an AES-256 key, encrypts the file — including its name and type — uploads only the ciphertext, and
                  computes the commitment.
                </>
              ),
            },
            {
              title: "Download the backup file (required)",
              body: (
                <>
                  The JSON backup holds the tender id, your address, the amount, the salt and the document key. The submit
                  button stays disabled until you download it. A copy is also kept in this browser, but do not rely on it.
                </>
              ),
            },
            {
              title: "Submit",
              body: <>Confirm you stored the backup, then send the commitment — plus the bid bond, if the tender has one.</>,
            },
          ]}
        />
        <H3>Updating a bid</H3>
        <P>
          While the tender is Open you can submit again to replace your commitment. The bond is not charged twice. You must
          keep the <B>new</B> backup file — the old one will no longer match.
        </P>
        <Callout label="Losing the backup" tone="red">
          Without the amount, salt and key you cannot reveal. The bid is then excluded and any bond goes to the treasury.
        </Callout>
      </>
    ),
  },

  "reveal-bonds": {
    eyebrow: "For bidders · 06",
    title: "Revealing & bonds",
    body: (
      <>
        <P>
          The reveal window runs from the submission deadline to the reveal deadline. Reveal from <B>My Bids</B> or from
          the tender page.
        </P>
        <Steps
          items={[
            { title: "Load your secrets", body: "The app reads them from this browser, or you import your backup file." },
            { title: "Local check", body: "Before sending anything, the app recomputes your commitment and confirms it matches the one on-chain." },
            { title: "Reveal", body: "The transaction publishes amount, salt and key; the contract verifies them against your commitment." },
          ]}
        />
        <H3>Bid bonds</H3>
        <Table
          head={["Outcome", "What happens to the bond"]}
          rows={[
            ["You revealed", "Withdraw it any time after revealing (Withdraw bond)."],
            ["You did not reveal in time", "It is forfeited to the Hedgora treasury (never to the buyer) after the reveal deadline."],
            ["Tender has no bond", "Nothing to withdraw."],
          ]}
        />
        <Callout label="Note" tone="blue">
          Bonds are paid out by withdrawal (pull payment), never pushed automatically.
        </Callout>
      </>
    ),
  },

  lifecycle: {
    eyebrow: "Protocol · 07",
    title: "Tender lifecycle",
    body: (
      <>
        <P>
          The state is not stored; the contract computes it from <B>block time</B> on every call. The app only displays
          countdowns based on the latest block timestamp.
        </P>
        <Table
          head={["State", "When", "Allowed actions"]}
          rows={[
            ["Open", "Before the submission deadline", "Submit or update bids. Buyer may cancel if there are no bids."],
            ["Reveal", "From the submission deadline until the reveal deadline", "Bidders reveal. No new bids."],
            ["Evaluation", "After the reveal deadline, at least one revealed bid", "Buyer awards a revealed bidder."],
            ["Failed", "After the reveal deadline, no revealed bid", "None. Forfeited bonds can be sent to the treasury."],
            ["Awarded", "Buyer awarded", "Results and reasons are public permanently."],
            ["Cancelled", "Buyer cancelled while Open with no bids", "None."],
          ]}
        />
        <P>
          There is no deadline for the evaluation step: a tender stays in Evaluation until the buyer awards it.
        </P>
      </>
    ),
  },

  "proof-of-process": {
    eyebrow: "Protocol · 08",
    title: "Proof of process",
    body: (
      <>
        <P>Every tender has a results page that anyone can open, with or without a wallet.</P>
        <H3>Verify</H3>
        <P>For each revealed bid, Verify runs two checks in your browser:</P>
        <Ul
          items={[
            "The revealed amount, salt and document key hash to the commitment stored on-chain.",
            "The commitment was last set before the submission deadline.",
          ]}
        />
        <H3>On-chain timeline</H3>
        <P>
          The page lists the publish, bid, reveal and award events with their block, time and a link to the transaction on
          the explorer. The contract records the block of each step, so the app fetches each event directly.
        </P>
        <Callout label="Updated bids" tone="blue">
          For a bid that was updated, the timeline shows its latest commitment.
        </Callout>
      </>
    ),
  },

  security: {
    eyebrow: "Protocol · 09",
    title: "Security & privacy",
    body: (
      <>
        <H3>What is public, and when</H3>
        <Table
          head={["Data", "Before submission deadline", "After reveal"]}
          rows={[
            ["Tender details, budget, deadlines", "Public", "Public"],
            ["Bidder addresses and number of bids", "Public", "Public"],
            ["Commitment hash", "Public", "Public"],
            ["Bid amount", "Hidden", "Public (if revealed)"],
            ["Proposal", "Encrypted on IPFS", "Decryptable (if revealed)"],
            ["Winner and reason", "—", "Public"],
          ]}
        />
        <H3>What never leaves your browser before reveal</H3>
        <P>
          Your amount, salt and document key. They are not sent to the website&apos;s server, analytics or the RPC node;
          only the commitment and the encrypted proposal are.
        </P>
        <H3>Contract safeguards</H3>
        <Ul
          items={[
            "Every phase transition is checked against block time.",
            "Bond withdrawals use pull payments, checks-effects-interactions and a reentrancy guard.",
            "No event or view exposes an amount before it is revealed.",
            "Transactions are simulated before you sign, so most failures show a clear error without spending gas.",
          ]}
        />
        <Callout label="Limits to know" tone="amber">
          Bidder addresses, the number of bids and the size of each encrypted proposal are visible. Eligibility is not
          verified on-chain.
        </Callout>
      </>
    ),
  },

  "smart-contract": {
    eyebrow: "Protocol · 10",
    title: "Smart contract",
    body: (
      <>
        <Table
          head={["Item", "Value"]}
          rows={[
            ["Contract", "BlindBidMarket (source verified on the explorer)"],
            ["Address", contractLink],
            ["Network", NETWORK_NAME],
            ["Language", "Solidity 0.8.30, OpenZeppelin ReentrancyGuard"],
            ["Minimum reveal window", "24 hours"],
            ["Treasury", "Receives forfeited bonds; fixed at deployment, cannot be changed"],
          ]}
        />
        <H3>Functions</H3>
        <Table
          head={["Function", "Who", "Purpose"]}
          rows={[
            [<Code key="1">createTender</Code>, "Buyer", "Publish a tender."],
            [<Code key="2">cancel</Code>, "Buyer", "Cancel while Open with no bids."],
            [<Code key="3">submitBid</Code>, "Bidder", "Commit a bid (with the bond, if any)."],
            [<Code key="4">updateBid</Code>, "Bidder", "Replace the commitment while Open."],
            [<Code key="5">revealBid</Code>, "Bidder", "Open the bid during the reveal window."],
            [<Code key="6">award</Code>, "Buyer", "Pick a revealed winner with a reason link."],
            [<Code key="7">withdrawBond</Code>, "Bidder", "Withdraw the bond after revealing."],
            [<Code key="8">sweepForfeitedBonds</Code>, "Anyone", "Send bonds of unrevealed bids to the treasury."],
          ]}
        />
        <H3>Events</H3>
        <P>
          <Code>TenderCreated</Code>, <Code>BidSubmitted</Code>, <Code>BidUpdated</Code>, <Code>BidRevealed</Code>,{" "}
          <Code>TenderAwarded</Code>, <Code>TenderCancelled</Code>, <Code>BondWithdrawn</Code>,{" "}
          <Code>ForfeitedBondsSwept</Code>. Bid events carry the commitment, never the amount.
        </P>
      </>
    ),
  },

  faq: {
    eyebrow: "Resources · 11",
    title: "FAQ",
    body: (
      <>
        <H3>Can the buyer see bid amounts early?</H3>
        <P>No. Before the submission deadline only commitment hashes exist on-chain, and the app shows no amounts until Evaluation.</P>
        <H3>I lost my backup file. What now?</H3>
        <P>
          If this browser still has the copy, you can reveal from My Bids and export it again in Profile &amp; Settings.
          Otherwise the bid cannot be revealed: it is excluded and any bond goes to the treasury.
        </P>
        <H3>What if a tender is fake and the buyer wants my money?</H3>
        <P>
          The buyer cannot take a revealed bidder&apos;s bond, cannot stop you withdrawing it, cannot change deadlines and
          cannot cancel once bids exist. Bonds of bids that are not revealed go to the Hedgora treasury, never to the
          buyer, and every reveal window lasts at least 24 hours. Before bidding, check the warnings and the buyer&apos;s
          on-chain history on the tender page. Remember that revealed proposals become public.
        </P>
        <H3>Can I change my bid?</H3>
        <P>Yes, while the tender is Open. Keep the new backup file.</P>
        <H3>Can anyone bid?</H3>
        <P>Any wallet except the buyer. Eligibility described by the buyer is checked during evaluation, not on-chain.</P>
        <H3>Which wallets can I use?</H3>
        <P>Browser wallets such as MetaMask on {NETWORK_NAME}. WalletConnect wallets are offered when the app is configured with a WalletConnect project id.</P>
        <H3>What do I pay with?</H3>
        <P>
          USDC. On Arc it is also the gas token. This is a testnet build: tokens have no value, and you can get test USDC from
          the Circle faucet.
        </P>
      </>
    ),
  },
};
