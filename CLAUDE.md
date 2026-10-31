# CLAUDE.md — BlindBid

> **BlindBid — Public Confidential Bidding Marketplace trên PortaldotV3 Testnet.**
> Marketplace đấu thầu công khai: ai đủ điều kiện cũng tham gia được, nhưng **giá chào thầu được giữ kín cho đến khi hết hạn nhận hồ sơ**.

File này là ngữ cảnh gốc cho Claude Code khi làm việc trong repo. Đọc hết trước khi viết code.

---

## 0. Quyết định kiến trúc bắt buộc (đọc trước)

1. **PortaldotV3 Testnet cung cấp EVM RPC; viết contract bằng Solidity.** Giao dịch contract dùng EVM RPC, không dùng Substrate extrinsics.
2. **Giá thầu được giữ kín bằng mật mã, không bằng UI:** dùng commit–reveal; trước hạn chỉ có commitment trên chain. Hồ sơ kỹ thuật được mã hóa client-side bằng AES-256-GCM, ciphertext lên IPFS.
3. Thời hạn do `block.timestamp` trong contract quyết định.
4. Dữ liệu on-chain là công khai. Không đưa giá, salt hoặc khóa hồ sơ lên chain trước khi reveal.
5. Thiết kế interface rõ ràng để có thể thay lớp lưu trữ/đấu thầu sau này mà không đổi UX.

**Hai phiên bản contract.** V1 (`contracts/src/BlindBidMarket.sol`, `SealedNFTAuction.sol`) đã deploy và đóng băng: không sửa, vì `scripts/verify-deployment.mjs` so khớp từng byte. V2 (`contracts/src/v2/`) sửa các lỗi trong `docs/issues/`, chưa deploy. App chọn phiên bản qua `NEXT_PUBLIC_BLINDBID_VERSION` và `NEXT_PUBLIC_NFT_AUCTION_VERSION` (mặc định V1). Xem `docs/SECURITY_CHANGES.md`.

## 1. Thông tin mạng PortaldotV3 Testnet

| Tham số | Giá trị |
|---|---|
| Substrate RPC | `wss://test-node-v3.portaldot.dev` |
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| Chain ID | `420420777` |
| Native token / gas | `tPOTv3` — 14 decimals phía Substrate; **lớp EVM (balance, `msg.value`) dùng 18 decimals** |
| Node Console | `https://node-console.portaldot.dev/` (native Substrate tools; not an EVM explorer) |

Ngân sách, giá thầu và bond đều dùng bigint theo **18 decimals** (đơn vị EVM, giống `msg.value`; đã kiểm chứng: 10 tPOT phía Substrate = 10×10^18 trên EVM RPC).

**Storage deposit:** PortaldotV3 (pallet-revive) thu ký quỹ ~0,08 tPOT mỗi byte code và mỗi byte state của contract (contract rỗng ~18 tPOT). Vì vậy contract phải gọn: không có view function, tài liệu tham chiếu bằng digest 32 byte của IPFS CID, dữ liệu chỉ để hiển thị nằm trong event; app đọc storage (`eth_getStorageAt`) và log (`eth_getLogs`). Compiler tối ưu kích thước (`via_ir`, `optimizer_runs = 1`, không metadata, EVM `shanghai`).

## 2. Tech stack

| Lớp | Lựa chọn |
|---|---|
| Smart contract | Solidity ^0.8.x, **Foundry** (`forge`, `cast`, `anvil`), OpenZeppelin |
| Frontend | Next.js (App Router) + TypeScript |
| Wallet | **RainbowKit** + wagmi v2 + viem, custom chain `PortaldotV3 Testnet` |
| Data fetching | TanStack Query (đi kèm wagmi) |
| UI | Tailwind CSS + shadcn/ui, icon lucide-react |
| Form/validate | react-hook-form + zod |
| Lưu trữ tài liệu | IPFS (Pinata hoặc tương đương) — chỉ lưu metadata công khai và ciphertext |
| Mã hóa client | WebCrypto API (AES-256-GCM), không tự viết crypto |
| Indexer (tùy chọn) | Ponder, khi Marketplace cần filter/search phía server |
| Test | Foundry tests (unit + fuzz) cho contract; Vitest cho utils frontend; Playwright cho luồng E2E chính |

Công cụ: dùng tài liệu PortaldotV3 và Foundry để xác minh chi tiết mạng hoặc triển khai.

---

## 3. Cấu trúc repo

```
blindbid/
├─ CLAUDE.md
├─ contracts/                 # Solidity, Foundry local tests, Hardhat deployment
│  ├─ src/
│  │  ├─ BlindBidMarket.sol   # tender + bid + reveal + award
│  │  └─ interfaces/IBlindBidMarket.sol
│  ├─ test/BlindBidMarket.t.sol
│  ├─ scripts/                # Hardhat deploy and testnet seed scripts
│  └─ foundry.toml
├─ web/                       # Next.js app
│  ├─ app/                    # routes (xem mục 5)
│  ├─ components/
│  ├─ lib/
│  │  ├─ wagmi.ts             # RainbowKit/wagmi config
│  │  ├─ contracts.ts         # ABI + address
│  │  ├─ commitment.ts        # build/verify commitment (phải khớp Solidity)
│  │  ├─ crypto.ts            # AES-GCM encrypt/decrypt hồ sơ
│  │  ├─ ipfs.ts
│  │  └─ salt-vault.ts        # lưu/backup salt + doc key của bidder
│  └─ ...
└─ indexer/                   # (tùy chọn) Ponder
```

---

## 4. Mô hình on-chain

### 4.1 Vòng đời gói thầu (state do contract tính từ `block.timestamp`)

```
Open ──(submissionDeadline)──▶ Reveal ──(revealDeadline)──▶ Evaluation ──award()──▶ Awarded
  │                                                              │
  └──cancel() (chỉ khi chưa có bid)──▶ Cancelled                 └── (không có bid hợp lệ) ──▶ Failed
```

| Trạng thái | Ai làm gì |
|---|---|
| **Open** | Nhà thầu `submitBid` / `updateBid` (ghi đè commitment). Không ai thấy giá. |
| **Reveal** | Không nhận bid mới. Nhà thầu `revealBid(amount, salt, docKey)`. |
| **Evaluation** | Bên mời thầu xem các bid đã reveal, chọn nhà thầu. Bid không reveal = bị loại. |
| **Awarded** | Kết quả + lý do (URI) công khai vĩnh viễn on-chain. |

### 4.2 Commitment (định dạng chuẩn — frontend và Solidity PHẢI khớp)

```solidity
commitment = keccak256(abi.encode(
    tenderId,     // uint256
    bidder,       // address (msg.sender) — chống copy commitment của người khác
    amount,       // uint256, EVM units (7_500 tPOTv3 = 7_500 × 10^18)
    salt,         // bytes32 ngẫu nhiên (crypto.getRandomValues)
    docKeyHash    // bytes32 = keccak256(AES key) — ràng buộc hồ sơ với giá
));
```

Trong TS dùng `encodeAbiParameters` + `keccak256` của viem. Viết test đối chiếu hash giữa Foundry và TS.

V2 ràng buộc thêm chain, contract và phiên bản (`contracts/src/v2/CommitReveal.sol`, vector trong `test/fixtures/commitment-v2-vectors.json`):

```solidity
payload    = keccak256(abi.encode(amount, keccak256(docKey)));
commitment = keccak256(abi.encode(keccak256("plinths.tender.commit.v2"), block.chainid, address(this), tenderId, bidder, payload, salt));
```

### 4.3 Interface (đã triển khai — xem `contracts/src/interfaces/IBlindBidMarket.sol`)

```solidity
function createTender(bytes32 metadata, uint128 budgetMin, uint128 budgetMax,
    uint64 submissionDeadline, uint64 revealDeadline, uint96 bidBond) external returns (uint256 tenderId);
function submitBid(uint256 tenderId, bytes32 commitment, bytes32 encryptedDoc) external payable;
    // lần đầu msg.value == bidBond; gọi lại khi còn Open để thay commitment (msg.value == 0)
function revealBid(uint256 tenderId, uint128 amount, bytes32 salt, bytes32 docKey) external;
function award(uint256 tenderId, address winner, bytes32 reason) external;  // onlyBuyer, winner đã reveal
function cancel(uint256 tenderId) external;          // onlyBuyer, chỉ khi Open và chưa có bid
function withdrawBond(uint256 tenderId) external;    // pull-payment
function sweepForfeitedBonds(uint256 tenderId) external; // bond không reveal → treasury cố định

// Không có view (ngoài treasury, MIN_REVEAL_WINDOW): app đọc storage + event.
// metadata / encryptedDoc / reason = digest SHA-256 32 byte của IPFS CIDv1 (web/lib/cid.ts).
// File lý do trao thầu chứa link + hash báo cáo AI (nếu có).
// events: TenderCreated (kèm budget), BidSubmitted(first), BidRevealed(amount, salt, docKey),
//         TenderAwarded(reason), TenderCancelled, BondWithdrawn, ForfeitedBondsSwept
```

### 4.4 Bid bond (chống bỏ reveal)
- Commit–reveal có điểm yếu: nhà thầu có thể không reveal. Giải pháp: **bid bond bằng native tPOTv3** (tùy chọn, bên mời thầu đặt).
- Reveal hợp lệ → bidder rút lại bond. Không reveal → bond chuyển tới treasury cố định trong contract.
- Đây **không phải** escrow thanh toán hợp đồng (Escrow là Giai đoạn 2).

### 4.5 Quy tắc bảo mật contract
- Mọi check thời gian dùng `block.timestamp`; tất cả hàm có modifier trạng thái rõ ràng.
- Checks-Effects-Interactions + `ReentrancyGuard` cho các hàm chuyển tPOTv3.
- Không event/view nào lộ `amount` trước `revealBid`.
- Buyer không được bid vào gói thầu của chính mình.
- `award` chỉ chấp nhận địa chỉ có bid đã reveal.
- Fuzz test: reveal sai salt/amount/docKey phải revert; reveal ngoài cửa sổ phải revert.

---

## 5. Trang & routes (giữ 10 trang, ưu tiên luồng lõi)

| Trang | Route | Mức hoàn thiện MVP |
|---|---|---|
| Dashboard | `/` | Cơ bản: tóm tắt tender/bid của ví đang kết nối |
| **Marketplace** | `/marketplace` | **Đầy đủ** — lọc All / Technology / Construction / Services, trạng thái, deadline |
| **Create Tender** | `/tenders/new` | **Đầy đủ** |
| **Tender Detail** | `/tenders/[id]` | **Đầy đủ** — thông tin, countdown, số bid (không giá), timeline on-chain |
| **Submit Bid** | `/tenders/[id]/bid` | **Đầy đủ** — gồm backup salt bắt buộc |
| My Tenders | `/my/tenders` | Danh sách cơ bản |
| My Bids | `/my/bids` | Danh sách + nút Reveal khi đến hạn |
| **Evaluation** | `/tenders/[id]/evaluate` | **Đầy đủ** — chỉ buyer, chỉ khi state = Evaluation |
| **Results** | `/tenders/[id]/results` | **Đầy đủ** — kết quả + bằng chứng quy trình |
| Profile & Settings | `/profile` | Cơ bản: tên doanh nghiệp, category, backup/import salt |

Luồng cốt lõi phải chạy end-to-end trên testnet trước khi đụng tới trang khác:
**Create Tender → Marketplace → Submit Bid → (Reveal) → Evaluation → Results**

### Ghi chú UX theo trang
- **Marketplace card:** category, badge trạng thái, tên, ngân sách dự kiến (`5,000–10,000 tPOTv3`), số bid, dòng "Bid amounts remain confidential". Không bao giờ hiển thị giá trước Evaluation.
- **Submit Bid:** nhập giá + upload hồ sơ → app sinh salt + AES key → mã hóa → upload IPFS → gửi commitment. **Bắt buộc người dùng tải file backup (JSON chứa tenderId, amount, salt, docKey) trước khi bấm gửi.** Mất salt = không reveal được = mất bond. Lưu thêm bản trong localStorage (try/catch) nhưng không coi đó là nguồn duy nhất.
- **My Bids / Reveal:** tự đọc salt từ vault; nếu thiếu, cho import file backup.
- **Evaluation:** bảng so sánh các bid đã reveal (giá, giải mã hồ sơ bằng docKey đã công bố), đánh dấu bid không reveal, chọn winner + nhập lý do (upload lên IPFS → `reasonURI`).
- **Results — "Proof of process":** timeline event với block, time, transaction hash, commitment từng nhà thầu và nút **Verify** tính lại hash phía client. Không tạo EVM explorer deep link khi Portaldot chưa cung cấp URL explorer.
- Mọi countdown hiển thị theo thời gian chain (lấy timestamp block mới nhất), có ghi chú múi giờ.
- Hiển thị số tiền: một dòng tPOTv3 duy nhất, format `7,500.00 tPOTv3`.

---

## 6. Phạm vi

| Tính năng | Giai đoạn |
|---|---|
| Kết nối ví EVM (RainbowKit) | MVP |
| Tạo gói thầu công khai | MVP |
| Khám phá và lọc gói thầu | MVP |
| Gửi báo giá riêng tư (commit–reveal + hồ sơ mã hóa) | MVP |
| Đóng thầu theo thời hạn (cưỡng chế on-chain) | MVP |
| Đánh giá và chọn nhà thầu | MVP |
| Lịch sử và kết quả + bằng chứng quy trình | MVP |
| Bid bond chống bỏ reveal | MVP (tùy chọn theo tender) |
| AI đánh giá báo giá | Giai đoạn 2 |
| Escrow và thanh toán tPOTv3 | Giai đoạn 2 |
| Hệ thống uy tín nhà cung cấp | Giai đoạn 2 (tham khảo ERC-8004 identity/reputation) |
| Điều kiện tham gia xác minh on-chain (allowlist/attestation) | Giai đoạn 2 — MVP: điều kiện mô tả trong metadata, buyer loại ở Evaluation |
| Chuyển phần bid sang môi trường thực thi riêng tư | Khi được hỗ trợ |
| Timelock encryption (vd drand tlock) thay commit–reveal để không cần bidder reveal | Nghiên cứu |

---

## 7. Lệnh thường dùng

```bash
# Contracts (Foundry local tests; Hardhat deploy follows PortaldotV3 guide)
cd contracts
forge build
forge test -vvv
npm install
set -a; source .env; set +a
npm run compile
npm run deploy:portaldotv3

# Web
cd web
pnpm install
pnpm dev
pnpm lint && pnpm typecheck && pnpm test
```

Biến môi trường (`web/.env.local`, không commit):
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_BLINDBID_ADDRESS=
NEXT_PUBLIC_PORTALDOT_RPC_URL=https://test-evm-rpc-v3.portaldot.dev
PINATA_JWT=                # chỉ dùng phía server (route handler upload)
```
Private key deploy chỉ đặt trong `contracts/.env`, không bao giờ trong `web/`.

---

## 8. Quy ước khi Claude làm việc trong repo

- Thay đổi contract → cập nhật ABI bằng `pnpm sync-abi` (ABI lấy từ V2, là tập cha của V1) và test hash commitment TS↔Solidity.
- Không sửa `contracts/src/v2/CommitReveal.sol` riêng lẻ: nó phải giống hệt `packages/commit-reveal/src/CommitReveal.sol` (CI chạy `cmp`).
- Sửa logic quỹ hoặc vòng đời → chạy `python3 scripts/mutation-check.py <thư mục trống>`: invariant phải bắt được lỗi cố ý gài vào.
- Không ghi "trustless", "perfectly fair" hay "audited". Không gắn nhãn dữ liệu chain cục bộ là testnet (`/demo` đọc nhãn từ `web/public/demo/lifecycle.json`).
- Không thêm tính năng Giai đoạn 2 khi chưa được yêu cầu.
- Không bao giờ log/gửi `amount`, `salt`, `docKey` lên server, analytics hay console ở production.
- Không hiển thị bất kỳ thông tin giá nào trong UI khi state ≠ Evaluation/Awarded, kể cả cho buyer.
- Số tiền: luôn dùng `bigint` + `parseUnits/formatUnits`, ghi rõ 18 decimals ở tên biến (`amount18`, `bondBaseUnits`).
- Mỗi byte code/state đều tốn ký quỹ: thay đổi contract phải đo kích thước (`forge build --sizes`) và chi phí deploy (`cast estimate --create`) trước khi deploy; đổi thứ tự state/struct phải cập nhật `web/lib/market-storage.ts` (test `test_storageLayoutMatchesApp` sẽ báo).
- Giao diện song ngữ EN | VI (cookie `plinths_lang`, `web/lib/i18n.ts`): mọi chữ hiển thị viết theo cặp `t("English", "Tiếng Việt")` (`useT()` trong client, `getT()` trong server component, `tr()` cho toast/lỗi ngoài React). Docs có bản `components/docs/content.vi.tsx`, trang chủ có `public/home/vi.html` — sửa nội dung thì sửa cả hai bản. Số tiền giữ định dạng `7,500.00 tPOTv3` ở cả hai ngôn ngữ.
- Dữ liệu mẫu (3 tender demo: Enterprise Website Development, Commercial Building Renovation, Digital Marketing Campaign) chỉ dùng cho seed script testnet, không hardcode trong UI.
- Ưu tiên hướng dẫn PortaldotV3 được liên kết trong README và tài liệu Hardhat/Foundry khi cần xác minh triển khai.

## 9. Definition of Done cho MVP
- [ ] Contract deploy trên PortaldotV3 Testnet, test coverage các nhánh state/reveal/bond.
- [ ] Từ 2 ví khác nhau: tạo tender → 3 bid → hết hạn → reveal → award → Results hiển thị và Verify thành công.
- [ ] Không thể đọc giá từ chain/IPFS/UI trước submissionDeadline.
- [ ] Bid không reveal bị loại và xử lý bond đúng quy tắc.
- [ ] Giao diện dùng được trên mobile.
