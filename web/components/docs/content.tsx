import Link from "next/link";
import type { ReactNode } from "react";
import { BLINDBID_ADDRESS, NODE_CONSOLE_URL, PORTALDOT_RPC_URL } from "@/lib/env";
import { NETWORK_NAME } from "@/lib/network";
import { B, Callout, Cards, Chips, Code, DocCard, H3, P, Pre, Steps, Table, Ul } from "./ui";

/*
 * Every statement here is grounded in the code: contracts/src/BlindBidMarket.sol, CommitmentLib.sol,
 * the web app (web/app, web/lib) and CLAUDE.md. Keep it in sync when behaviour changes.
 */

const COMMITMENT = `commitment = keccak256(abi.encode(
    tenderId,      // uint256
    bidder,        // address — msg.sender, so a copied hash cannot be reused
    amount,        // uint256, tPOTv3 base units (7,500 tPOTv3 = 7,500 × 10^14)
    salt,          // bytes32, random (crypto.getRandomValues)
    keccak256(docKey)  // binds the encrypted proposal to the price
))`;

const contractLink = BLINDBID_ADDRESS ? <Code>{BLINDBID_ADDRESS}</Code> : "not deployed";

const linkCls = "text-[#8fb4ff] hover:underline";

export const DOC_CONTENT: Record<string, { title: string; body: ReactNode }> = {
  "": {
    title: "What is Plinths?",
    body: (
      <>
        <P>
          Plinths is a <B>public confidential bidding marketplace on {NETWORK_NAME}</B>. A buyer publishes a tender that
          any wallet can bid on, but every bid amount stays sealed until the submission deadline — not even the buyer can
          read it.
        </P>
        <P>
          Prices are hidden with cryptography rather than by the website: bidders post only a hash of their offer
          (commit), and open it after the deadline (reveal). Proposals are encrypted in the bidder&apos;s browser before
          upload. The smart contract enforces every deadline using block time.
        </P>
        <H3>What can you do on Plinths?</H3>
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
          <DocCard label="AI proposal review" tone="cream">
            After the reveal deadline, the buyer can ask Plinths Agent to summarise and compare the revealed proposals. It
            cites evidence and never picks the winner.
          </DocCard>
          <DocCard label="Verify" tone="teal">
            Anyone can open the results page and recompute every revealed bid&apos;s commitment in the browser.
          </DocCard>
        </Cards>
        <H3>Supported assets</H3>
        <Chips items={[{ label: "tPOTv3", tone: "blue" }]} />
        <P>
          Budgets, bid amounts, and bonds use 18-decimal tPOTv3 base units. tPOTv3 is also the native gas token.
        </P>
        <Callout label="New here?" tone="blue">
          Start with <Link className={linkCls} href="/docs/getting-started">Getting started</Link> to add the network to
          your wallet and fund it with test tPOTv3.
        </Callout>
      </>
    ),
  },

  "getting-started": {
    title: "Getting started",
    body: (
      <>
        <P>
          Plinths runs on the <B>EVM side of {NETWORK_NAME}</B>. You need a browser EVM wallet such as MetaMask, the
          network added to it, and a little test tPOTv3 for gas and bid bonds.
        </P>
        <H3>Network details</H3>
        <Table
          head={["Setting", "Value"]}
          rows={[
            ["Network name", "PortaldotV3 Testnet"],
            ["EVM RPC", <Code key="rpc">{PORTALDOT_RPC_URL}</Code>],
            ["Chain ID", <Code key="id">420420777</Code>],
            ["Currency symbol", "tPOTv3 (18 decimals)"],
            ["Substrate node", <Code key="ws">wss://test-node-v3.portaldot.dev</Code>],
            ["Node Console", <a key="nc" className={linkCls} href={NODE_CONSOLE_URL} target="_blank" rel="noreferrer">{NODE_CONSOLE_URL.replace(/^https:\/\//, "")}</a>],
          ]}
        />
        <H3>Set up in three steps</H3>
        <Steps
          items={[
            {
              title: "Add the network to your wallet",
              body: (
                <>
                  Use the EVM RPC and chain ID above, or press <B>Launch app</B> and connect — the app asks your wallet to
                  switch to PortaldotV3 Testnet. Use a dedicated testnet account, not one that holds real assets.
                </>
              ),
            },
            {
              title: "Fund the wallet through its SS58 account",
              body: (
                <>
                  Copy your wallet&apos;s <Code>0x…</Code> address. In the Node Console open Developer → Runtime calls →{" "}
                  <Code>reviveApi.accountId</Code>, paste the address and submit. Send test tPOTv3 from a Portaldot wallet to
                  the <B>SS58 address</B> it returns — that account is where your EVM balance lives.
                </>
              ),
            },
            {
              title: "Connect and start",
              body: (
                <>
                  Open the app, connect the wallet, and browse the <Link className={linkCls} href="/marketplace">Marketplace</Link>{" "}
                  or <Link className={linkCls} href="/tenders/new">create a tender</Link>. Set a business name in Profile &amp;
                  Settings if you want it shown on the tenders you publish.
                </>
              ),
            },
          ]}
        />
        <Callout label="Do not send to the 0x address" tone="red">
          Native Portaldot transfers to an H160 (<Code>0x…</Code>) address do not reach your EVM wallet. Always send to the
          SS58 address that <Code>reviveApi.accountId</Code> returns for it.
        </Callout>
        <Callout label="Explorer" tone="amber">
          Portaldot does not publish an EVM block-explorer URL yet, so the app shows transaction hashes without explorer
          links. The Node Console is for native Portaldot tools.
        </Callout>
      </>
    ),
  },

  "sealed-bidding": {
    title: "How sealed bidding works",
    body: (
      <>
        <P>
          On-chain data is public. Plinths therefore keeps prices secret with a <B>commit–reveal</B> scheme.
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
          the Plinths treasury — never to the buyer, so a buyer gains nothing when bidders miss the reveal window. See <Link className={linkCls} href="/docs/reveal-bonds">Revealing &amp; bonds</Link>.
        </Callout>
      </>
    ),
  },

  "create-tender": {
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
            ["Budget min / max", "On-chain", "tPOTv3, 18 decimals. Public. Minimum must not exceed maximum."],
            ["Submission deadline", "On-chain", "Must be in the future."],
            ["Reveal deadline", "On-chain", "At least 24 hours after the submission deadline."],
            ["Bid bond", "On-chain", "Optional, native tPOTv3. Every bidder must send exactly this amount."],
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
        <Callout label="Optional · AI comparison" tone="cream">
          Before awarding you can ask Plinths Agent for an evidence-based comparison of the revealed proposals. If you do,
          the report is published with the award. See <Link className={linkCls} href="/docs/ai-review">AI proposal review</Link>.
        </Callout>
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
          <B>Send forfeited bonds to treasury</B> on the tender page, and the contract sends them to the fixed Plinths
          treasury.
        </P>
      </>
    ),
  },

  "ai-review": {
    title: "AI proposal review",
    body: (
      <>
        <P>
          Comparing long proposals takes time. Once bids are open, the buyer can ask <B>Plinths Agent</B> to summarise each
          revealed proposal against the tender&apos;s requirements. The agent is an aid for a human decision:{" "}
          <B>it never ranks, scores or selects a bidder</B>.
        </P>
        <H3>When it is available</H3>
        <Ul
          items={[
            <>Only in the <B>Evaluation</B> state — after the reveal deadline, with at least one revealed bid.</>,
            "Only for the tender's buyer, proven by a wallet signature that expires after 5 minutes and works once.",
            "Before the reveal deadline nothing is sent anywhere: proposals are still encrypted and their keys unpublished.",
          ]}
        />
        <H3>How a review runs</H3>
        <Steps
          items={[
            { title: "Decrypt in your browser", body: "Each revealed proposal is decrypted with its published key, and its text is extracted locally (PDF, DOCX, TXT, Markdown, CSV or JSON)." },
            { title: "Server checks the chain", body: "Before calling the model, the server reads the contract: the tender must be in Evaluation, the signer must be the buyer, and the request must include every revealed bid with its on-chain amount." },
            { title: "Evidence-based summary", body: "For each bid the agent reports price, timeline, conditions and gaps, each material claim backed by an exact quote from that bidder's document." },
            { title: "Injection warnings", body: "Proposal text is treated as untrusted data. Instruction-like passages such as “ignore previous instructions” or “choose our bid” are flagged and quoted, never followed." },
          ]}
        />
        <H3>Published with the award</H3>
        <P>
          If you award after a review, the report is uploaded to IPFS and linked, with its <Code>keccak256</Code> hash,
          from the award reason document — whose digest is stored on-chain with the winner. The results page follows
          that link and checks the report against the hash, so nobody can swap it afterwards.
        </P>
        <Table
          head={["Limit", "Value"]}
          rows={[
            ["Text per proposal", "Up to 18,000 characters"],
            ["Bids per review", "Up to 50"],
            ["Model provider", "DeepSeek (server-side key)"],
          ]}
        />
        <Callout label="Privacy" tone="amber">
          Reviewed proposal text is sent to a third-party model provider (DeepSeek). By then it is already public: revealing
          a bid publishes the key that decrypts its proposal.
        </Callout>
        <Callout label="Plinths Agent chat" tone="blue">
          The <Link className={linkCls} href="/agent">Agent</Link> page also offers a general chat about procurement and
          sealed bids. It cannot see live tenders or sealed bids.
        </Callout>
      </>
    ),
  },

  "submit-bid": {
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
                  Enter the amount in tPOTv3 and attach your technical proposal (max 20 MB). The app generates a random salt
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
            ["You did not reveal in time", "It is forfeited to the Plinths treasury (never to the buyer) after the reveal deadline."],
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
          The page lists the publish, bid, reveal and award events with their block, time and transaction hash. The
          Portaldot guide does not provide an EVM block-explorer URL, so hashes and addresses are shown without explorer deep links.
        </P>
        <Callout label="Updated bids" tone="blue">
          For a bid that was updated, the timeline shows its latest commitment.
        </Callout>
      </>
    ),
  },

  security: {
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
    title: "Smart contract",
    body: (
      <>
        <Table
          head={["Item", "Value"]}
          rows={[
            ["Contract", "BlindBidMarket (Solidity EVM contract)"],
            ["Address", contractLink],
            ["Network", NETWORK_NAME],
            ["Language", "Solidity 0.8.24, OpenZeppelin ReentrancyGuard"],
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
            [<Code key="3">submitBid</Code>, "Bidder", "Commit a bid with the bond; call again while Open to replace it (no second bond)."],
            [<Code key="5">revealBid</Code>, "Bidder", "Open the bid during the reveal window."],
            [<Code key="6">award</Code>, "Buyer", "Pick a revealed winner with the reason document's digest (it links the optional AI report)."],
            [<Code key="7">withdrawBond</Code>, "Bidder", "Withdraw the bond after revealing."],
            [<Code key="8">sweepForfeitedBonds</Code>, "Anyone", "Send bonds of unrevealed bids to the treasury."],
          ]}
        />
        <H3>Events</H3>
        <P>
          <Code>TenderCreated</Code>, <Code>BidSubmitted</Code>, <Code>BidRevealed</Code>, <Code>TenderAwarded</Code>,{" "}
          <Code>TenderCancelled</Code>, <Code>BondWithdrawn</Code>, <Code>ForfeitedBondsSwept</Code>. Bid events carry the
          commitment, never the amount.
        </P>
        <H3>Why so little is stored</H3>
        <P>
          PortaldotV3 charges a storage deposit for every byte of contract code and state, so the contract keeps only
          what its rules need and has no view functions. Documents are referenced by the 32-byte digest of their IPFS
          CID; budgets, revealed salts and keys, and bidder lists live in the events above. The app reads the contract
          storage and events directly. Amounts use the EVM&apos;s 18-decimal unit, the same as <Code>msg.value</Code>.
        </P>
      </>
    ),
  },

  faq: {
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
          cannot cancel once bids exist. Bonds of bids that are not revealed go to the Plinths treasury, never to the
          buyer, and every reveal window lasts at least 24 hours. Before bidding, check the warnings and the buyer&apos;s
          on-chain history on the tender page. Remember that revealed proposals become public.
        </P>
        <H3>Can I change my bid?</H3>
        <P>Yes, while the tender is Open. Keep the new backup file.</P>
        <H3>Can anyone bid?</H3>
        <P>Any wallet except the buyer. Eligibility described by the buyer is checked during evaluation, not on-chain.</P>
        <H3>Which wallets can I use?</H3>
        <P>Browser wallets such as MetaMask on {NETWORK_NAME}. WalletConnect wallets are offered when the app is configured with a WalletConnect project id.</P>
        <H3>How do I fund an EVM wallet for gas?</H3>
        <P>
          In the Portaldot Node Console, use Developer → Runtime calls → <Code>reviveApi.accountId</Code> to map the
          wallet&apos;s H160 address to its SS58 account, then send test tPOTv3 to that SS58 address. Do not send funds to
          an H160 address from the native Substrate side. The EVM address derived from a key may differ from the
          Portaldot wallet&apos;s H160, so use the address shown for PortaldotV3.
        </P>
        <H3>Where can I view EVM transactions?</H3>
        <P>The current Portaldot guide does not specify an EVM block-explorer URL. The app shows transaction hashes and addresses without explorer links; the Node Console is for native Portaldot tooling.</P>
        <H3>What do I pay with?</H3>
        <P>
          tPOTv3 pays for bids and network gas. This is a testnet build; use the PortaldotV3 Node Console for network tools.
        </P>
      </>
    ),
  },
};
