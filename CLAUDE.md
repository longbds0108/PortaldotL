# CLAUDE.md — BlindBid

> **BlindBid — Public Confidential Bidding Marketplace trên Arc Testnet.**
> Marketplace đấu thầu công khai: ai đủ điều kiện cũng tham gia được, nhưng **giá chào thầu được giữ kín cho đến khi hết hạn nhận hồ sơ**.

File này là ngữ cảnh gốc cho Claude Code khi làm việc trong repo. Đọc hết trước khi viết code.

---

## 0. Quyết định kiến trúc bắt buộc (đọc trước)

1. **Arc là L1 tương thích EVM, viết contract bằng Solidity. Không dùng Daml.**
   Ý tưởng ban đầu nhắc tới "hợp đồng Daml quản lý quyền riêng tư" — điều này **không áp dụng cho Arc**. Mọi logic on-chain viết bằng Solidity, build/deploy bằng Arc Foundry.
2. **Không dựa vào tính năng privacy native của Arc.** Arc Privacy Sector (APS) — môi trường thực thi bí mật cho Solidity — **đang nằm trong roadmap, chưa khả dụng**. Mọi dữ liệu on-chain trên Arc hiện tại đều công khai.
3. **Giữ kín giá bằng mật mã, không bằng UI:** dùng cơ chế **commit–reveal** (sealed-bid):
   - Trước hạn: nhà thầu chỉ gửi `commitment = keccak256(...)` lên chain. Không ai (kể cả bên mời thầu) đọc được giá.
   - Sau hạn: nhà thầu `reveal` giá + salt; contract tự kiểm tra khớp commitment.
   - Hồ sơ kỹ thuật được mã hóa client-side (AES-256-GCM), ciphertext lên IPFS, khóa giải mã chỉ công bố lúc reveal.
4. **Thời hạn do `block.timestamp` trong contract quyết định**, không phải đồng hồ frontend. Frontend chỉ hiển thị; mọi transition trạng thái phải được contract cưỡng chế (`require`).
5. **Public index = dữ liệu on-chain công khai + events**, đọc qua viem (MVP) hoặc indexer (Ponder) khi cần lọc/tìm kiếm nhiều. Dữ liệu nhạy cảm (giá, hồ sơ) không bao giờ lên index ở dạng plaintext trước khi reveal.
6. Thiết kế contract theo interface rõ ràng để sau này có thể chuyển phần bid sang APS khi Arc ra mắt privacy, mà không đổi UX.

---

## 1. Thông tin mạng Arc

| Tham số | Testnet (dùng cho dự án) | Mainnet (tham khảo) |
|---|---|---|
| Chain ID | `5042002` | `5042` |
| RPC | `https://rpc.testnet.arc.io` | `https://rpc.mainnet.arc.io` |
| WebSocket | `wss://rpc.testnet.arc.io` | — |
| Explorer | `https://explorer.testnet.arc.io` | `https://explorer.arc.io` |
| Gas token | **USDC** (native, 18 decimals) | USDC |
| Faucet | `https://faucet.circle.com` | — |

viem có sẵn chain: `import { arcTestnet } from "viem/chains"` — **không tự `defineChain`**.

### Khác biệt EVM cần nhớ (nguồn: docs.arc.io/arc/references/evm-differences.md)
- **Gas trả bằng USDC, không phải ETH.** Native USDC dùng **18 decimals**; giao diện ERC-20 USDC dùng **6 decimals**. Đây là *cùng một số dư* — UI chỉ hiển thị **một dòng USDC**.
- Mempool có sàn `maxFeePerGas` = **20 gwei**. Không hardcode gas thấp hơn.
- Finality < 1 giây, xác định (deterministic). Chờ **1 receipt** là đủ, không cần nhiều confirmations.
- Gửi value tới `address(0)` sẽ **revert**. Dùng pull-payment, không push USDC trong vòng lặp.
- Địa chỉ bị blocklist USDC → revert tốn gas, không có receipt. Xử lý lỗi gửi tx cẩn thận ở frontend.
- Luôn tra địa chỉ contract hệ thống tại `docs.arc.io/arc/references/contract-addresses.md`, không đoán.
- Trước khi viết code đụng tới USDC/gas/value transfer: đọc lại trang EVM differences.

---

## 2. Tech stack

| Lớp | Lựa chọn |
|---|---|
| Smart contract | Solidity ^0.8.x, **Arc Foundry** (`arc-forge`, `arc-cast`, `arc-anvil`), OpenZeppelin |
| Frontend | Next.js (App Router) + TypeScript |
| Wallet | **RainbowKit** + wagmi v2 + viem, chain `arcTestnet` |
| Data fetching | TanStack Query (đi kèm wagmi) |
| UI | Tailwind CSS + shadcn/ui, icon lucide-react |
| Form/validate | react-hook-form + zod |
| Lưu trữ tài liệu | IPFS (Pinata hoặc tương đương) — chỉ lưu metadata công khai và ciphertext |
| Mã hóa client | WebCrypto API (AES-256-GCM), không tự viết crypto |
| Indexer (tùy chọn) | Ponder, khi Marketplace cần filter/search phía server |
| Test | Foundry tests (unit + fuzz) cho contract; Vitest cho utils frontend; Playwright cho luồng E2E chính |

Công cụ AI hỗ trợ: có thể cài Circle skills (`/plugin marketplace add circlefin/skills` → `/plugin install circle-skills@circle`) và Arc MCP server (docs.arc.io/ai/mcp) để tra tài liệu Arc.

---

## 3. Cấu trúc repo

```
blindbid/
├─ CLAUDE.md
├─ contracts/                 # Arc Foundry project
│  ├─ src/
│  │  ├─ BlindBidMarket.sol   # tender + bid + reveal + award
│  │  └─ interfaces/IBlindBidMarket.sol
│  ├─ test/BlindBidMarket.t.sol
│  ├─ script/Deploy.s.sol
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
    amount,       // uint256, đơn vị USDC 6 decimals (vd 7_500 USDC = 7_500_000_000)
    salt,         // bytes32 ngẫu nhiên (crypto.getRandomValues)
    docKeyHash    // bytes32 = keccak256(AES key) — ràng buộc hồ sơ với giá
));
```

Trong TS dùng `encodeAbiParameters` + `keccak256` của viem. Viết test đối chiếu hash giữa Foundry và TS.

### 4.3 Interface dự kiến

```solidity
function createTender(
    string calldata metadataURI,   // IPFS: tên, mô tả, tiêu chí, category, điều kiện tham gia
    uint256 budgetMin, uint256 budgetMax,  // USDC 6 decimals, công khai
    uint64 submissionDeadline, uint64 revealDeadline,
    uint256 bidBond                // native USDC (wei 18 decimals), có thể = 0
) external returns (uint256 tenderId);

function submitBid(uint256 tenderId, bytes32 commitment, string calldata encryptedDocURI) external payable; // msg.value == bidBond
function updateBid(uint256 tenderId, bytes32 commitment, string calldata encryptedDocURI) external;
function revealBid(uint256 tenderId, uint256 amount, bytes32 salt, bytes32 docKey) external;
function award(uint256 tenderId, address winner, string calldata reasonURI) external; // onlyBuyer, chỉ chọn bid đã reveal
function cancel(uint256 tenderId) external;          // onlyBuyer, chỉ khi Open và chưa có bid
function withdrawBond(uint256 tenderId) external;    // pull-payment

// views: getTender, getTenderState, getBid, getBidders(tenderId), tenderCount
// events: TenderCreated, BidSubmitted(tenderId, bidder) [không có giá], BidUpdated,
//         BidRevealed(tenderId, bidder, amount), TenderAwarded, TenderCancelled, BondWithdrawn
```

### 4.4 Bid bond (chống bỏ reveal)
- Commit–reveal có điểm yếu: nhà thầu có thể không reveal. Giải pháp: **bid bond bằng native USDC** (tùy chọn, bên mời thầu đặt).
- Reveal hợp lệ → được rút lại bond. Không reveal → bond bị giữ (chuyển cho bên mời thầu hoặc treasury, quyết định trong contract, ghi rõ trong UI).
- Đây **không phải** escrow thanh toán hợp đồng (Escrow là Giai đoạn 2).

### 4.5 Quy tắc bảo mật contract
- Mọi check thời gian dùng `block.timestamp`; tất cả hàm có modifier trạng thái rõ ràng.
- Checks-Effects-Interactions + `ReentrancyGuard` cho các hàm chuyển USDC.
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
- **Marketplace card:** category, badge trạng thái, tên, ngân sách dự kiến (`$5,000–$10,000`), số bid, dòng "Bid amounts remain confidential". Không bao giờ hiển thị giá trước Evaluation.
- **Submit Bid:** nhập giá + upload hồ sơ → app sinh salt + AES key → mã hóa → upload IPFS → gửi commitment. **Bắt buộc người dùng tải file backup (JSON chứa tenderId, amount, salt, docKey) trước khi bấm gửi.** Mất salt = không reveal được = mất bond. Lưu thêm bản trong localStorage (try/catch) nhưng không coi đó là nguồn duy nhất.
- **My Bids / Reveal:** tự đọc salt từ vault; nếu thiếu, cho import file backup.
- **Evaluation:** bảng so sánh các bid đã reveal (giá, giải mã hồ sơ bằng docKey đã công bố), đánh dấu bid không reveal, chọn winner + nhập lý do (upload lên IPFS → `reasonURI`).
- **Results — "Proof of process":** timeline các event với link explorer, commitment của từng nhà thầu, nút **Verify** tính lại hash phía client để chứng minh giá reveal đúng với commitment đã nộp trước hạn.
- Mọi countdown hiển thị theo thời gian chain (lấy timestamp block mới nhất), có ghi chú múi giờ.
- Hiển thị số tiền: một dòng USDC duy nhất, format `$7,500.00`.

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
| Escrow và thanh toán USDC | Giai đoạn 2 (tham khảo ERC-8183 job/escrow trên Arc) |
| Hệ thống uy tín nhà cung cấp | Giai đoạn 2 (tham khảo ERC-8004 identity/reputation) |
| Điều kiện tham gia xác minh on-chain (allowlist/attestation) | Giai đoạn 2 — MVP: điều kiện mô tả trong metadata, buyer loại ở Evaluation |
| Chuyển phần bid sang Arc Privacy Sector | Khi APS ra mắt |
| Timelock encryption (vd drand tlock) thay commit–reveal để không cần bidder reveal | Nghiên cứu |

---

## 7. Lệnh thường dùng

```bash
# Contracts (Arc Foundry — cài theo docs.arc.io/arc/tutorials/install-arc-foundry.md)
cd contracts
arc-forge build
arc-forge test -vvv
arc-forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --broadcast

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
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.io
PINATA_JWT=                # chỉ dùng phía server (route handler upload)
```
Private key deploy chỉ đặt trong `contracts/.env`, không bao giờ trong `web/`.

---

## 8. Quy ước khi Claude làm việc trong repo

- Thay đổi contract → cập nhật ABI trong `web/lib/contracts.ts` và test hash commitment TS↔Solidity.
- Không thêm tính năng Giai đoạn 2 khi chưa được yêu cầu.
- Không bao giờ log/gửi `amount`, `salt`, `docKey` lên server, analytics hay console ở production.
- Không hiển thị bất kỳ thông tin giá nào trong UI khi state ≠ Evaluation/Awarded, kể cả cho buyer.
- Số tiền: luôn dùng `bigint` + `parseUnits/formatUnits`, ghi rõ 6 hay 18 decimals ở tên biến (`amount6`, `bondWei`).
- Dữ liệu mẫu (3 tender demo: Enterprise Website Development, Commercial Building Renovation, Digital Marketing Campaign) chỉ dùng cho seed script testnet, không hardcode trong UI.
- Ưu tiên tài liệu chính thức khi không chắc: `https://docs.arc.io/llms.txt`, `https://developers.circle.com/llms.txt`.

## 9. Definition of Done cho MVP
- [ ] Contract deploy & verify trên Arc Testnet, test coverage các nhánh state/reveal/bond.
- [ ] Từ 2 ví khác nhau: tạo tender → 3 bid → hết hạn → reveal → award → Results hiển thị và Verify thành công.
- [ ] Không thể đọc giá từ chain/IPFS/UI trước submissionDeadline (kiểm tra thủ công qua explorer).
- [ ] Bid không reveal bị loại và xử lý bond đúng quy tắc.
- [ ] Giao diện dùng được trên mobile.
