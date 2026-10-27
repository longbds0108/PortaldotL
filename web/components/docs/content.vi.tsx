import Link from "next/link";
import { AddNetworkButton } from "@/components/add-network-button";
import type { ReactNode } from "react";
import { BLINDBID_ADDRESS, DISPUTES_ADDRESS, NFT_AUCTION_ADDRESS, NODE_CONSOLE_URL, PORTALDOT_RPC_URL, TEST_NFT_ADDRESS } from "@/lib/env";
import { NETWORK_NAME } from "@/lib/network";
import { BASE_SCORE, RULES } from "@/lib/reputation";
import { B, Callout, Cards, Chips, Code, DocCard, H3, P, Pre, Steps, Table, Ul } from "./ui";

/*
 * Vietnamese edition of components/docs/content.tsx (same pages, same facts). Edit both files together when
 * behaviour changes. Identifiers (functions, events, contract names) stay in English.
 */

const COMMITMENT = `commitment = keccak256(abi.encode(
    tenderId,      // uint256
    bidder,        // address — msg.sender, nên không thể dùng lại mã băm sao chép của người khác
    amount,        // uint256, đơn vị gốc tPOTv3 (7,500 tPOTv3 = 7,500 × 10^18)
    salt,          // bytes32, ngẫu nhiên (crypto.getRandomValues)
    keccak256(docKey)  // ràng buộc hồ sơ đã mã hóa với giá
))`;

const addr = (a: string | undefined) => (a ? <Code>{a}</Code> : "chưa triển khai");

const linkCls = "text-[#8fb4ff] hover:underline";

export const DOC_CONTENT_VI: Record<string, { title: string; body: ReactNode }> = {
  "": {
    title: "Plinths là gì?",
    body: (
      <>
        <P>
          Plinths là <B>sàn đấu thầu công khai với giá thầu bảo mật trên {NETWORK_NAME}</B>. Bên mời thầu đăng một gói thầu
          mà ví nào cũng có thể dự thầu, nhưng mọi giá thầu đều được niêm phong cho đến hạn nộp hồ sơ — kể cả bên mời thầu
          cũng không đọc được.
        </P>
        <P>
          Giá được giữ kín bằng mật mã chứ không phải bằng giao diện website: nhà thầu chỉ gửi mã băm của giá chào (commit),
          và mở nó sau hạn nộp (reveal). Hồ sơ được mã hóa ngay trong trình duyệt của nhà thầu trước khi tải lên. Smart
          contract cưỡng chế mọi thời hạn theo thời gian block.
        </P>
        <H3>Bạn có thể làm gì trên Plinths?</H3>
        <Cards>
          <DocCard label="Đăng gói thầu" tone="blue">
            Đăng tiêu đề, phạm vi công việc, danh mục, điều kiện tham gia, tiêu chí đánh giá, khoảng ngân sách công khai,
            các thời hạn và tiền bảo đảm dự thầu (tùy chọn).
          </DocCard>
          <DocCard label="Gửi giá niêm phong" tone="teal">
            Nhập giá và đính kèm hồ sơ. Chỉ mã băm commitment được đưa lên chain; hồ sơ được mã hóa (AES-256-GCM) trước khi
            tải lên.
          </DocCard>
          <DocCard label="Công bố" tone="cream">
            Sau hạn nộp hồ sơ, bạn mở giá của mình. Contract kiểm tra giá có khớp với mã băm đã commit hay không.
          </DocCard>
          <DocCard label="Đánh giá & trao thầu" tone="blue">
            Khi cửa sổ công bố đóng, bên mời thầu so sánh các giá đã công bố, giải mã hồ sơ và trao thầu cho một nhà thầu đã
            công bố, kèm lý do công khai.
          </DocCard>
          <DocCard label="Đánh giá hồ sơ bằng AI" tone="cream">
            Sau hạn công bố, bên mời thầu có thể nhờ Trợ lý Plinths tóm tắt và so sánh các hồ sơ đã công bố. Trợ lý dẫn
            chứng cụ thể và không bao giờ chọn người thắng.
          </DocCard>
          <DocCard label="Kiểm chứng" tone="teal">
            Ai cũng có thể mở trang kết quả và tính lại commitment của từng giá đã công bố ngay trong trình duyệt.
          </DocCard>
          <DocCard label="Đấu giá NFT niêm phong" tone="blue">
            Đăng bán một ERC-721 bạn sở hữu và bán nó bằng giá niêm phong, thanh toán bằng tPOTv3. Xem{" "}
            <Link className={linkCls} href="/docs/nft-auctions">Đấu giá NFT</Link>.
          </DocCard>
          <DocCard label="Bằng chứng công bằng" tone="teal">
            <Link className={linkCls} href="/docs/disputes">Trung tâm khiếu nại</Link>,{" "}
            <Link className={linkCls} href="/docs/analytics">Phân tích</Link> và{" "}
            <Link className={linkCls} href="/docs/reputation">Uy tín</Link> giúp kiểm chứng toàn bộ thị trường từ dữ liệu công khai.
          </DocCard>
        </Cards>
        <H3>Tài sản được hỗ trợ</H3>
        <Chips items={[{ label: "tPOTv3", tone: "blue" }]} />
        <P>Ngân sách, giá thầu và tiền bảo đảm dùng đơn vị gốc tPOTv3 với 18 chữ số thập phân. tPOTv3 cũng là token gas gốc.</P>
        <Callout label="Mới dùng lần đầu?" tone="blue">
          Hãy bắt đầu với <Link className={linkCls} href="/docs/getting-started">Bắt đầu</Link> để thêm mạng vào ví và nạp
          tPOTv3 thử nghiệm.
        </Callout>
      </>
    ),
  },

  "getting-started": {
    title: "Bắt đầu",
    body: (
      <>
        <P>
          Plinths chạy trên <B>phía EVM của {NETWORK_NAME}</B>. Bạn cần một ví EVM trên trình duyệt như MetaMask, thêm mạng
          vào ví, và một ít tPOTv3 thử nghiệm để trả gas và tiền bảo đảm.
        </P>
        <H3>Thông tin mạng</H3>
        <Table
          head={["Thiết lập", "Giá trị"]}
          rows={[
            ["Tên mạng", "PortaldotV3 Testnet"],
            ["EVM RPC", <Code key="rpc">{PORTALDOT_RPC_URL}</Code>],
            ["Chain ID", <Code key="id">420420777</Code>],
            ["Ký hiệu tiền tệ", "tPOTv3 (18 chữ số thập phân)"],
            ["Node Substrate", <Code key="ws">wss://test-node-v3.portaldot.dev</Code>],
            [
              "Node Console",
              <a key="nc" className={linkCls} href={NODE_CONSOLE_URL} target="_blank" rel="noreferrer">
                {NODE_CONSOLE_URL.replace(/^https:\/\//, "")}
              </a>,
            ],
          ]}
        />
        <div className="mt-5">
          <AddNetworkButton variant="default" />
          <p className="mt-2 text-[13px] text-[#979eb8]">
            Một cú nhấp để thêm mạng vào ví. Nếu MetaMask đã có mạng PortaldotV3 dùng RPC cũ, hãy mở phần cài đặt của mạng
            đó và đổi RPC thành địa chỉ ở trên.
          </p>
        </div>
        <H3>Thiết lập trong ba bước</H3>
        <Steps
          items={[
            {
              title: "Thêm mạng vào ví",
              body: (
                <>
                  Dùng EVM RPC và chain ID ở trên, hoặc bấm <B>Launch app</B> rồi kết nối — ứng dụng sẽ yêu cầu ví chuyển sang
                  PortaldotV3 Testnet. Hãy dùng một tài khoản riêng cho testnet, không dùng tài khoản đang giữ tài sản thật.
                </>
              ),
            },
            {
              title: "Nạp tiền qua tài khoản SS58 của ví",
              body: (
                <>
                  Sao chép địa chỉ <Code>0x…</Code> của ví. Trong Node Console, mở Developer → Runtime calls →{" "}
                  <Code>reviveApi.accountId</Code>, dán địa chỉ rồi gửi. Chuyển tPOTv3 thử nghiệm từ ví Portaldot tới{" "}
                  <B>địa chỉ SS58</B> nhận được — đó là nơi lưu số dư EVM của bạn.
                </>
              ),
            },
            {
              title: "Kết nối và bắt đầu",
              body: (
                <>
                  Mở ứng dụng, kết nối ví, rồi xem <Link className={linkCls} href="/marketplace">Sàn thầu</Link> hoặc{" "}
                  <Link className={linkCls} href="/tenders/new">tạo gói thầu</Link>. Đặt tên doanh nghiệp trong Hồ sơ &amp; Cài
                  đặt nếu bạn muốn tên đó hiện trên các gói thầu bạn đăng.
                </>
              ),
            },
          ]}
        />
        <Callout label="Đừng gửi tới địa chỉ 0x" tone="red">
          Chuyển tiền gốc Portaldot tới địa chỉ H160 (<Code>0x…</Code>) sẽ không đến được ví EVM. Luôn gửi tới địa chỉ SS58 mà{" "}
          <Code>reviveApi.accountId</Code> trả về cho ví đó.
        </Callout>
        <Callout label="Trình khám phá" tone="amber">
          Portaldot chưa công bố URL trình khám phá block EVM, nên ứng dụng hiển thị mã giao dịch mà không có liên kết tới
          explorer. Node Console dành cho công cụ gốc của Portaldot.
        </Callout>
      </>
    ),
  },

  "sealed-bidding": {
    title: "Đấu thầu niêm phong hoạt động thế nào",
    body: (
      <>
        <P>
          Dữ liệu on-chain là công khai. Vì vậy Plinths giữ kín giá bằng cơ chế <B>commit–reveal</B>.
        </P>
        <H3>1 · Commit</H3>
        <P>
          Trước hạn nộp hồ sơ, nhà thầu chỉ gửi một commitment 32 byte. Nó được tính trong trình duyệt và giống hệt nhau ở
          ứng dụng lẫn contract:
        </P>
        <Pre>{COMMITMENT}</Pre>
        <P>
          Thiếu salt ngẫu nhiên thì không thể đảo ngược mã băm, nên không thể đọc giá từ chain. Vì địa chỉ nhà thầu nằm trong
          mã băm, sao chép commitment của người khác cũng vô ích: nó sẽ thất bại khi công bố.
        </P>
        <H3>2 · Reveal</H3>
        <P>
          Trong cửa sổ công bố, nhà thầu gọi <Code>revealBid(amount, salt, docKey)</Code>. Contract tính lại mã băm và từ chối
          nếu bất kỳ giá trị nào khác với lúc commit. <Code>docKey</Code> được công bố giúp bên mời thầu giải mã hồ sơ.
        </P>
        <H3>3 · Trao thầu và bằng chứng</H3>
        <P>
          Sau cửa sổ công bố, bên mời thầu chỉ được trao thầu cho nhà thầu đã công bố. Vì giá, salt và khóa giờ đã công khai,
          ai cũng có thể tính lại từng commitment và kiểm tra nó đã được ghi trước hạn.
        </P>
        <Callout label="Đánh đổi" tone="amber">
          Nhà thầu có thể chọn không công bố. Hồ sơ đó bị loại, và nếu gói thầu yêu cầu tiền bảo đảm, khoản đó chuyển về
          treasury của Plinths — không bao giờ về bên mời thầu, nên bên mời thầu không được lợi gì khi nhà thầu lỡ cửa sổ công
          bố. Xem <Link className={linkCls} href="/docs/reveal-bonds">Công bố &amp; tiền bảo đảm</Link>.
        </Callout>
      </>
    ),
  },

  "create-tender": {
    title: "Tạo gói thầu",
    body: (
      <>
        <P>
          Mở <B>Tạo gói thầu</B> bằng ví sẽ sở hữu gói thầu. Thông tin chi tiết được tải lên IPFS dưới dạng metadata công
          khai; ngân sách, thời hạn và tiền bảo đảm được lưu on-chain.
        </P>
        <Table
          head={["Trường", "Lưu ở đâu", "Ghi chú"]}
          rows={[
            ["Tiêu đề, danh mục, phạm vi", "Metadata IPFS", "Danh mục: Công nghệ, Xây dựng, Dịch vụ."],
            ["Điều kiện tham gia", "Metadata IPFS", "Không được xác minh on-chain — bạn loại hồ sơ không đủ điều kiện khi đánh giá."],
            ["Tiêu chí đánh giá", "Metadata IPFS", "Hiển thị cho nhà thầu và trên trang đánh giá."],
            ["Ngân sách tối thiểu / tối đa", "On-chain", "tPOTv3, 18 chữ số thập phân. Công khai. Tối thiểu không được lớn hơn tối đa."],
            ["Hạn nộp hồ sơ", "On-chain", "Phải ở tương lai."],
            ["Hạn công bố", "On-chain", "Sau hạn nộp hồ sơ ít nhất 24 giờ."],
            ["Tiền bảo đảm dự thầu", "On-chain", "Tùy chọn, bằng tPOTv3 gốc. Mỗi nhà thầu phải gửi đúng số tiền này."],
          ]}
        />
        <H3>Quy tắc do contract cưỡng chế</H3>
        <Ul
          items={[
            "Bạn không thể dự thầu vào gói thầu của chính mình.",
            <>
              Bạn chỉ có thể hủy gói thầu khi nó đang mở <B>và chưa có hồ sơ nào</B>.
            </>,
            "Không thể đổi thời hạn sau khi đã đăng.",
          ]}
        />
        <Callout label="Tên doanh nghiệp" tone="blue">
          Nếu bạn đặt tên doanh nghiệp trong Hồ sơ &amp; Cài đặt, tên đó được thêm vào metadata của gói thầu bạn đăng.
        </Callout>
      </>
    ),
  },

  "evaluate-award": {
    title: "Đánh giá & trao thầu",
    body: (
      <>
        <P>
          Trang Đánh giá chỉ mở cho bên mời thầu, và chỉ khi gói thầu ở trạng thái <B>Đánh giá</B>: đã qua hạn công bố và có
          ít nhất một hồ sơ được công bố.
        </P>
        <Steps
          items={[
            {
              title: "So sánh các giá đã công bố",
              body: "Hồ sơ được sắp xếp theo giá, đánh dấu giá thấp nhất và gắn nhãn dưới khoảng, trong ngân sách hoặc vượt ngân sách.",
            },
            {
              title: "Giải mã hồ sơ",
              body: "Mỗi hồ sơ được giải mã trong trình duyệt bằng khóa mà nhà thầu đã công bố khi reveal, rồi tải về.",
            },
            {
              title: "Loại hồ sơ không công bố",
              body: "Hồ sơ không được công bố được liệt kê là bị loại; khóa hồ sơ của chúng chưa bao giờ được công bố.",
            },
            {
              title: "Trao thầu kèm lý do",
              body: "Chọn một nhà thầu đã công bố và viết lý do (ít nhất 10 ký tự). Lý do được tải lên IPFS và liên kết được lưu on-chain cùng người thắng.",
            },
          ]}
        />
        <Callout label="Tùy chọn · So sánh bằng AI" tone="cream">
          Trước khi trao thầu, bạn có thể nhờ Trợ lý Plinths so sánh các hồ sơ đã công bố dựa trên bằng chứng. Nếu dùng, báo
          cáo sẽ được công bố cùng quyết định trao thầu. Xem <Link className={linkCls} href="/docs/ai-review">Đánh giá hồ sơ bằng AI</Link>.
        </Callout>
        <H3>Contract kiểm tra gì</H3>
        <Ul
          items={[
            "Chỉ bên mời thầu được trao thầu.",
            "Chỉ ở trạng thái Đánh giá, và chỉ một lần.",
            "Người thắng phải có hồ sơ đã công bố, và liên kết lý do không được để trống.",
          ]}
        />
        <H3>Nếu không ai công bố</H3>
        <P>
          Khi qua hạn công bố mà không có hồ sơ nào được công bố, gói thầu chuyển sang <B>Thất bại</B> và không thể trao thầu.
        </P>
        <H3>Tiền bảo đảm bị phạt</H3>
        <P>
          Tiền bảo đảm của các hồ sơ không công bố <B>không</B> về bạn. Sau hạn công bố, ai cũng có thể bấm{" "}
          <B>Chuyển tiền bảo đảm bị phạt về treasury</B> trên trang gói thầu, và contract gửi khoản đó tới treasury cố định của
          Plinths.
        </P>
      </>
    ),
  },

  "ai-review": {
    title: "Đánh giá hồ sơ bằng AI",
    body: (
      <>
        <P>
          So sánh những hồ sơ dài tốn nhiều thời gian. Khi các hồ sơ đã mở, bên mời thầu có thể nhờ <B>Trợ lý Plinths</B> tóm
          tắt từng hồ sơ đã công bố theo yêu cầu của gói thầu. Trợ lý chỉ hỗ trợ con người ra quyết định:{" "}
          <B>nó không bao giờ xếp hạng, chấm điểm hay chọn nhà thầu</B>.
        </P>
        <H3>Khi nào dùng được</H3>
        <Ul
          items={[
            <>
              Chỉ ở trạng thái <B>Đánh giá</B> — sau hạn công bố, với ít nhất một hồ sơ đã công bố.
            </>,
            "Chỉ dành cho bên mời thầu, được chứng minh bằng chữ ký ví hết hạn sau 5 phút và chỉ dùng được một lần.",
            "Trước hạn công bố không có gì được gửi đi: hồ sơ vẫn đang mã hóa và khóa chưa được công bố.",
          ]}
        />
        <H3>Quy trình đánh giá</H3>
        <Steps
          items={[
            {
              title: "Giải mã trong trình duyệt",
              body: "Mỗi hồ sơ đã công bố được giải mã bằng khóa đã công bố, và văn bản được trích xuất ngay trên máy (PDF, DOCX, TXT, Markdown, CSV hoặc JSON).",
            },
            {
              title: "Máy chủ kiểm tra chain",
              body: "Trước khi gọi mô hình, máy chủ đọc contract: gói thầu phải ở trạng thái Đánh giá, người ký phải là bên mời thầu, và yêu cầu phải gồm mọi hồ sơ đã công bố với đúng giá on-chain.",
            },
            {
              title: "Tóm tắt dựa trên bằng chứng",
              body: "Với mỗi hồ sơ, trợ lý nêu giá, tiến độ, điều kiện và những điểm còn thiếu; mỗi nhận định quan trọng đều kèm trích dẫn nguyên văn từ tài liệu của nhà thầu đó.",
            },
            {
              title: "Cảnh báo prompt injection",
              body: "Nội dung hồ sơ được coi là dữ liệu không đáng tin. Những đoạn giống câu lệnh như “bỏ qua mọi hướng dẫn trước” hay “hãy chọn hồ sơ của chúng tôi” được đánh dấu và trích dẫn, không bao giờ được làm theo.",
            },
          ]}
        />
        <H3>Công bố cùng quyết định trao thầu</H3>
        <P>
          Nếu bạn trao thầu sau khi đánh giá bằng AI, báo cáo được tải lên IPFS và liên kết, kèm mã băm <Code>keccak256</Code>,
          từ tài liệu lý do trao thầu — tài liệu có digest được lưu on-chain cùng người thắng. Trang kết quả đi theo liên kết đó
          và đối chiếu báo cáo với mã băm, nên không ai có thể tráo đổi về sau.
        </P>
        <Table
          head={["Giới hạn", "Giá trị"]}
          rows={[
            ["Văn bản mỗi hồ sơ", "Tối đa 18.000 ký tự"],
            ["Số hồ sơ mỗi lần đánh giá", "Tối đa 50"],
            ["Nhà cung cấp mô hình", "DeepSeek (khóa API ở máy chủ)"],
          ]}
        />
        <Callout label="Quyền riêng tư" tone="amber">
          Nội dung hồ sơ được đánh giá sẽ gửi tới một nhà cung cấp mô hình bên thứ ba (DeepSeek). Lúc đó nó đã công khai: công
          bố giá đồng nghĩa với công bố khóa giải mã hồ sơ.
        </Callout>
        <Callout label="Trò chuyện với Trợ lý Plinths" tone="blue">
          Trang <Link className={linkCls} href="/agent">Trợ lý AI</Link> còn có khung chat chung về mua sắm và đấu thầu niêm
          phong. Trợ lý không thấy được gói thầu đang chạy hay giá niêm phong.
        </Callout>
      </>
    ),
  },

  "submit-bid": {
    title: "Gửi giá niêm phong",
    body: (
      <>
        <P>Dự thầu gồm ba bước trên trang Gửi hồ sơ của gói thầu, khi gói thầu đang mở.</P>
        <Steps
          items={[
            {
              title: "Niêm phong giá chào",
              body: (
                <>
                  Nhập giá bằng tPOTv3 và đính kèm hồ sơ kỹ thuật (tối đa 20 MB). Ứng dụng sinh salt ngẫu nhiên và khóa
                  AES-256, mã hóa file — kể cả tên và loại file — chỉ tải bản mã lên, rồi tính commitment.
                </>
              ),
            },
            {
              title: "Tải file sao lưu (bắt buộc)",
              body: (
                <>
                  File JSON sao lưu chứa mã gói thầu, địa chỉ của bạn, giá, salt và khóa hồ sơ. Nút gửi bị khóa cho đến khi bạn
                  tải file này. Trình duyệt cũng giữ một bản, nhưng đừng dựa vào bản đó.
                </>
              ),
            },
            {
              title: "Gửi",
              body: <>Xác nhận bạn đã cất file sao lưu, rồi gửi commitment — kèm tiền bảo đảm nếu gói thầu yêu cầu.</>,
            },
          ]}
        />
        <H3>Cập nhật hồ sơ</H3>
        <P>
          Khi gói thầu còn mở, bạn có thể gửi lại để thay commitment. Tiền bảo đảm không bị thu hai lần. Bạn phải giữ file sao
          lưu <B>mới</B> — file cũ sẽ không còn khớp.
        </P>
        <Callout label="Mất file sao lưu" tone="red">
          Thiếu giá, salt và khóa thì bạn không thể công bố. Hồ sơ khi đó bị loại và tiền bảo đảm (nếu có) chuyển về treasury.
        </Callout>
      </>
    ),
  },

  "reveal-bonds": {
    title: "Công bố & tiền bảo đảm",
    body: (
      <>
        <P>
          Cửa sổ công bố kéo dài từ hạn nộp hồ sơ đến hạn công bố. Hãy công bố từ <B>Hồ sơ thầu của tôi</B> hoặc từ trang gói
          thầu.
        </P>
        <Steps
          items={[
            { title: "Nạp bí mật", body: "Ứng dụng đọc bí mật từ trình duyệt này, hoặc bạn nhập file sao lưu." },
            { title: "Kiểm tra cục bộ", body: "Trước khi gửi, ứng dụng tính lại commitment và xác nhận nó khớp với commitment on-chain." },
            { title: "Công bố", body: "Giao dịch công bố giá, salt và khóa; contract đối chiếu chúng với commitment của bạn." },
          ]}
        />
        <H3>Tiền bảo đảm dự thầu</H3>
        <Table
          head={["Kết quả", "Tiền bảo đảm đi đâu"]}
          rows={[
            ["Bạn đã công bố", "Rút bất cứ lúc nào sau khi công bố (Rút tiền bảo đảm)."],
            ["Bạn không công bố đúng hạn", "Bị phạt về treasury của Plinths (không bao giờ về bên mời thầu) sau hạn công bố."],
            ["Gói thầu không yêu cầu", "Không có gì để rút."],
          ]}
        />
        <Callout label="Lưu ý" tone="blue">
          Tiền bảo đảm được trả bằng cách bạn tự rút (pull payment), không bao giờ tự động đẩy về.
        </Callout>
      </>
    ),
  },

  lifecycle: {
    title: "Vòng đời gói thầu",
    body: (
      <>
        <P>
          Trạng thái không được lưu; contract tính nó từ <B>thời gian block</B> ở mỗi lần gọi. Ứng dụng chỉ hiển thị đồng hồ
          đếm ngược dựa trên timestamp của block mới nhất.
        </P>
        <Table
          head={["Trạng thái", "Khi nào", "Thao tác được phép"]}
          rows={[
            ["Đang mở", "Trước hạn nộp hồ sơ", "Gửi hoặc cập nhật hồ sơ. Bên mời thầu được hủy nếu chưa có hồ sơ."],
            ["Công bố", "Từ hạn nộp hồ sơ đến hạn công bố", "Nhà thầu công bố. Không nhận hồ sơ mới."],
            ["Đánh giá", "Sau hạn công bố, có ít nhất một hồ sơ đã công bố", "Bên mời thầu trao thầu cho một nhà thầu đã công bố."],
            ["Thất bại", "Sau hạn công bố, không có hồ sơ nào được công bố", "Không có. Tiền bảo đảm bị phạt có thể chuyển về treasury."],
            ["Đã trao thầu", "Bên mời thầu đã trao thầu", "Kết quả và lý do công khai vĩnh viễn."],
            ["Đã hủy", "Bên mời thầu hủy khi đang mở và chưa có hồ sơ", "Không có."],
          ]}
        />
        <P>Bước đánh giá không có thời hạn: gói thầu ở trạng thái Đánh giá cho đến khi bên mời thầu trao thầu.</P>
      </>
    ),
  },

  "proof-of-process": {
    title: "Bằng chứng quy trình",
    body: (
      <>
        <P>Mỗi gói thầu có một trang kết quả mà ai cũng mở được, dù có ví hay không.</P>
        <H3>Kiểm chứng</H3>
        <P>Với mỗi hồ sơ đã công bố, nút Kiểm chứng chạy hai phép kiểm tra ngay trong trình duyệt:</P>
        <Ul
          items={[
            "Giá, salt và khóa hồ sơ đã công bố băm ra đúng commitment lưu on-chain.",
            "Commitment được ghi lần cuối trước hạn nộp hồ sơ.",
          ]}
        />
        <H3>Dòng thời gian on-chain</H3>
        <P>
          Trang liệt kê các sự kiện đăng, gửi hồ sơ, công bố và trao thầu, kèm block, thời gian và mã giao dịch. Hướng dẫn của
          Portaldot chưa cung cấp URL trình khám phá block EVM, nên mã giao dịch và địa chỉ được hiển thị không kèm liên kết
          explorer.
        </P>
        <Callout label="Hồ sơ đã cập nhật" tone="blue">
          Với hồ sơ từng được cập nhật, dòng thời gian hiển thị commitment mới nhất.
        </Callout>
      </>
    ),
  },

  security: {
    title: "Bảo mật & quyền riêng tư",
    body: (
      <>
        <H3>Cái gì công khai, và khi nào</H3>
        <Table
          head={["Dữ liệu", "Trước hạn nộp hồ sơ", "Sau khi công bố"]}
          rows={[
            ["Thông tin gói thầu, ngân sách, thời hạn", "Công khai", "Công khai"],
            ["Địa chỉ nhà thầu và số hồ sơ", "Công khai", "Công khai"],
            ["Mã băm commitment", "Công khai", "Công khai"],
            ["Giá thầu", "Ẩn", "Công khai (nếu đã công bố)"],
            ["Hồ sơ", "Mã hóa trên IPFS", "Giải mã được (nếu đã công bố)"],
            ["Người thắng và lý do", "—", "Công khai"],
          ]}
        />
        <H3>Những gì không bao giờ rời trình duyệt trước khi công bố</H3>
        <P>
          Giá, salt và khóa hồ sơ của bạn. Chúng không được gửi tới máy chủ của website, công cụ phân tích hay node RPC; chỉ
          commitment và hồ sơ đã mã hóa được gửi đi.
        </P>
        <H3>Cơ chế bảo vệ của contract</H3>
        <Ul
          items={[
            "Mọi chuyển giai đoạn đều được kiểm tra theo thời gian block.",
            "Rút tiền bảo đảm dùng pull payment, checks-effects-interactions và chống reentrancy.",
            "Không event hay view nào để lộ giá trước khi công bố.",
            "Giao dịch được mô phỏng trước khi bạn ký, nên đa số lỗi hiện thông báo rõ ràng mà không tốn gas.",
          ]}
        />
        <Callout label="Giới hạn cần biết" tone="amber">
          Địa chỉ nhà thầu, số hồ sơ và kích thước mỗi hồ sơ mã hóa là nhìn thấy được. Điều kiện tham gia không được xác minh
          on-chain.
        </Callout>
      </>
    ),
  },

  "smart-contract": {
    title: "Smart contract",
    body: (
      <>
        <P>
          Plinths chạy trên ba contract Solidity trên {NETWORK_NAME}, cộng một bộ sưu tập NFT chỉ để thử nghiệm. Tất cả đều tiết
          kiệm lưu trữ và không có khóa quản trị nào có thể thay đổi gói thầu, phiên đấu giá hay khiếu nại sau khi đã diễn ra.
        </P>
        <Table
          head={["Contract", "Địa chỉ", "Vai trò"]}
          rows={[
            ["BlindBidMarket", addr(BLINDBID_ADDRESS), "Gói thầu: giá niêm phong, công bố, trao thầu và tiền bảo đảm."],
            ["SealedNFTAuction", addr(NFT_AUCTION_ADDRESS), "Đấu giá niêm phong cho mọi ERC-721, thanh toán bằng tPOTv3."],
            ["DisputeRegistry", addr(DISPUTES_ADDRESS), "Hồ sơ khiếu nại công khai kèm bằng chứng và quyết định của hội đồng."],
            ["PlinthsTestNFT", addr(TEST_NFT_ADDRESS), "Ba NFT thử để trải nghiệm đấu giá; không có giá trị, không có hàm mint."],
          ]}
        />
        <H3>BlindBidMarket</H3>
        <Table
          head={["Mục", "Giá trị"]}
          rows={[
            ["Ngôn ngữ", "Solidity 0.8.24, OpenZeppelin ReentrancyGuard"],
            ["Cửa sổ công bố tối thiểu", "24 giờ"],
            ["Treasury", "Nhận tiền bảo đảm bị phạt; cố định khi triển khai, không thể đổi"],
          ]}
        />
        <H3>Các hàm</H3>
        <Table
          head={["Hàm", "Ai gọi", "Mục đích"]}
          rows={[
            [<Code key="1">createTender</Code>, "Bên mời thầu", "Đăng gói thầu."],
            [<Code key="2">cancel</Code>, "Bên mời thầu", "Hủy khi đang mở và chưa có hồ sơ."],
            [<Code key="3">submitBid</Code>, "Nhà thầu", "Commit hồ sơ kèm tiền bảo đảm; gọi lại khi còn mở để thay thế (không thu tiền bảo đảm lần hai)."],
            [<Code key="5">revealBid</Code>, "Nhà thầu", "Mở giá trong cửa sổ công bố."],
            [<Code key="6">award</Code>, "Bên mời thầu", "Chọn người thắng đã công bố, kèm digest của tài liệu lý do (liên kết báo cáo AI nếu có)."],
            [<Code key="7">withdrawBond</Code>, "Nhà thầu", "Rút tiền bảo đảm sau khi công bố."],
            [<Code key="8">sweepForfeitedBonds</Code>, "Bất kỳ ai", "Chuyển tiền bảo đảm của hồ sơ không công bố về treasury."],
          ]}
        />
        <H3>Sự kiện</H3>
        <P>
          <Code>TenderCreated</Code>, <Code>BidSubmitted</Code>, <Code>BidRevealed</Code>, <Code>TenderAwarded</Code>,{" "}
          <Code>TenderCancelled</Code>, <Code>BondWithdrawn</Code>, <Code>ForfeitedBondsSwept</Code>. Sự kiện hồ sơ mang
          commitment, không bao giờ mang giá.
        </P>
        <H3>SealedNFTAuction</H3>
        <Table
          head={["Hàm", "Ai gọi", "Mục đích"]}
          rows={[
            [
              <Code key="l">safeTransferFrom → onERC721Received</Code>,
              "Người bán",
              "Đăng bán: NFT chuyển vào contract và phiên đấu giá bắt đầu ngay trong cùng giao dịch.",
            ],
            [<Code key="p">placeBid</Code>, "Người đặt giá", "Niêm phong giá kèm tiền cọc; gọi lại khi còn mở để thay giá và nạp thêm cọc."],
            [<Code key="r">revealBid</Code>, "Người đặt giá", "Mở giá trong cửa sổ công bố."],
            [
              <Code key="s">settle</Code>,
              "Bất kỳ ai",
              "Sau hạn công bố: NFT về người thắng hoặc trả lại người bán. Người bán cũng dùng hàm này để hủy trước khi có giá.",
            ],
            [<Code key="w">withdraw</Code>, "Người được nhận tiền", "Tiền bán của người bán, hoàn cọc, hoặc tiền cọc trừ 10% của người không công bố."],
          ]}
        />
        <H3>DisputeRegistry</H3>
        <Table
          head={["Hàm", "Ai gọi", "Mục đích"]}
          rows={[
            [<Code key="o">openDispute</Code>, "Bất kỳ ai", "Mở khiếu nại về gói thầu hoặc phiên đấu giá kèm tài liệu bằng chứng."],
            [<Code key="re">respond</Code>, "Bất kỳ ai", "Thêm phản hồi kèm bằng chứng khi khiếu nại chưa đóng."],
            [<Code key="st">setStatus</Code>, "Tài khoản hội đồng", "Bắt đầu xem xét, hoặc đóng ở trạng thái Đã giải quyết / Bị bác kèm quyết định công bố."],
          ]}
        />
        <H3>Vì sao lưu trữ ít như vậy</H3>
        <P>
          PortaldotV3 thu ký quỹ lưu trữ cho từng byte code và state của contract, nên mỗi contract chỉ giữ những gì quy tắc cần
          và không có view function. Tài liệu được tham chiếu bằng digest 32 byte của IPFS CID; ngân sách, salt và khóa đã công
          bố, danh sách nhà thầu và nội dung khiếu nại nằm trong event. Ứng dụng đọc trực tiếp storage và event của contract.
          Số tiền dùng đơn vị 18 chữ số thập phân của EVM, giống <Code>msg.value</Code>.
        </P>
      </>
    ),
  },

  "nft-auctions": {
    title: "Đấu giá NFT niêm phong",
    body: (
      <>
        <P>
          Cùng cơ chế commit–reveal chạy các phiên đấu giá NFT ERC-721 trên {NETWORK_NAME}, thanh toán bằng tPOTv3 gốc. Giá
          được niêm phong khi còn nhận giá, nên không ai có thể chen phút chót hay trả hơn đúng một token. Plinths không đúc
          NFT: bạn đăng bán NFT mình đã sở hữu.
        </P>
        <Steps
          items={[
            {
              title: "Đăng bán",
              body: "Mở Đấu giá NFT → Đăng bán NFT, chọn NFT, thời gian nhận giá và công bố (ít nhất 24 giờ) và giá sàn tùy chọn. Một chữ ký sẽ chuyển NFT vào contract đấu giá.",
            },
            {
              title: "Niêm phong giá",
              body: "Nhập giá và tiền cọc. Giá được băm trong trình duyệt; chỉ mã băm và tiền cọc lên chain. Tải file sao lưu trước khi gửi. Khi còn mở, bạn có thể đặt lại để thay giá và nạp thêm cọc.",
            },
            {
              title: "Công bố",
              body: "Sau khi hết hạn đặt giá, công bố từ trang phiên đấu giá. Giá được tính nếu đạt giá sàn và không vượt tiền cọc; giá được tính cao nhất sẽ thắng, và nếu bằng nhau thì ai công bố trước giữ vị trí dẫn đầu.",
            },
            {
              title: "Kết thúc và rút tiền",
              body: "Sau hạn công bố, ai cũng có thể kết thúc: NFT về người thắng, hoặc trả lại người bán nếu không có giá nào được tính. Sau đó mỗi người rút phần của mình.",
            },
          ]}
        />
        <Callout label="Vì sao tiền cọc phải lớn hơn giá" tone="blue">
          Tiền cọc là công khai. Nếu bạn cọc đúng bằng giá, ai cũng đọc được giá. Hãy khóa nhiều hơn (biểu mẫu gợi ý +25%,
          +50% hoặc ×2) để giá được giữ kín đến khi bạn công bố.
        </Callout>
        <H3>Ai nhận được gì</H3>
        <Table
          head={["Vai trò", "Được rút", "Khi nào"]}
          rows={[
            ["Người bán", "Giá thắng", "Sau khi kết thúc"],
            ["Người thắng", "Tiền cọc trừ giá thắng", "Sau hạn công bố"],
            ["Đã công bố nhưng không thắng", "Toàn bộ tiền cọc", "Ngay khi có người khác dẫn đầu"],
            ["Không bao giờ công bố", "Tiền cọc trừ 10% (về treasury, không bao giờ về người bán)", "Sau hạn công bố"],
          ]}
        />
        <P>Người bán chỉ có thể hủy và lấy lại NFT khi còn nhận giá và chưa có ai đặt giá.</P>
        <H3>Contract</H3>
        <Table
          head={["Mục", "Giá trị"]}
          rows={[
            ["Contract đấu giá", NFT_AUCTION_ADDRESS ? <Code key="a">{NFT_AUCTION_ADDRESS}</Code> : "chưa triển khai"],
            ["Bộ sưu tập thử", TEST_NFT_ADDRESS ? <Code key="n">{TEST_NFT_ADDRESS}</Code> : "chưa triển khai"],
            [
              "Các hàm",
              <span key="f">
                <Code>placeBid</Code>, <Code>revealBid</Code>, <Code>settle</Code>, <Code>withdraw</Code>, cùng hook nhận ERC-721
                dùng để tạo phiên đấu giá
              </span>,
            ],
            ["Commitment", <Code key="c">keccak256(abi.encode(auctionId, bidder, amount, salt))</Code>],
          ]}
        />
        <P>
          Bộ sưu tập Plinths Test NFT có ba món (Sealed Orb, Commit Prism, Reveal Key) để thử quy trình trên testnet; chúng
          không có giá trị. Giống contract gói thầu, contract đấu giá không có view function; ứng dụng đọc storage và event của
          nó.
        </P>
      </>
    ),
  },

  disputes: {
    title: "Quy trình khiếu nại",
    body: (
      <>
        <P>
          Trung tâm khiếu nại cho phép bất kỳ ai nêu vấn đề về một gói thầu hoặc phiên đấu giá NFT, kèm bằng chứng, và theo dõi
          đến kết quả được lưu lại. Plinths cung cấp bằng chứng và quy trình minh bạch. Plinths không phải cơ quan pháp lý, và
          khiếu nại không bao giờ đảo ngược quyết định trao thầu hay việc kết thúc đã có on-chain.
        </P>
        <H3>Ai quyết định tùy vào loại vấn đề</H3>
        <Table
          head={["Vấn đề", "Quyết định bởi", "Cách làm"]}
          rows={[
            [
              "Công bố không khớp giá niêm phong",
              "Verification Engine",
              "Tính lại mọi mã băm đã công bố từ dữ liệu công khai. Contract vốn đã từ chối lượt công bố không khớp.",
            ],
            [
              "Gửi giá hoặc công bố sau thời hạn",
              "Verification Engine",
              "So sánh thời gian block của từng giao dịch với các thời hạn. Contract vốn đã từ chối lời gọi trễ hạn.",
            ],
            [
              "Không nhận được NFT hoặc tiền",
              "Verification Engine",
              "Kiểm tra việc kết thúc, chủ sở hữu NFT và mọi khoản cọc hay tiền bảo đảm theo quy tắc của contract.",
            ],
            ["Đánh giá không công bằng", "Hội đồng trọng tài", "Hội đồng được chỉ định cân nhắc bằng chứng và công bố quyết định kèm lý do."],
            ["Nghi ngờ hồ sơ gian lận", "Hội đồng trọng tài", "Như trên: phán xét của con người dựa trên bằng chứng."],
            ["Chất lượng hàng hóa hoặc dịch vụ", "Các bên", "Thương lượng hoặc cơ chế các bên đã thỏa thuận. Plinths lưu giữ bằng chứng và hồ sơ."],
          ]}
        />
        <Callout label="Vì sao không tự động hóa tất cả" tone="blue">
          Smart contract chỉ phân xử được những gì nó kiểm tra được bằng dữ liệu on-chain. Chất lượng, nghĩa vụ ngoài đời thực
          và sự công bằng của việc đánh giá cần đến con người.
        </Callout>
        <Steps
          items={[
            {
              title: "Nộp",
              body: "Chọn gói thầu hoặc phiên đấu giá và loại vấn đề, viết tiêu đề và giải thích, dẫn mã giao dịch và đính kèm ảnh, PDF hoặc văn bản.",
            },
            {
              title: "Kiểm tra bằng chứng",
              body: "Mỗi giao dịch được dẫn sẽ được đối chiếu với các sự kiện on-chain của đối tượng. Verification Engine cho thấy quy tắc của contract nói gì.",
            },
            {
              title: "Thảo luận",
              body: "Bên tổ chức, nhà thầu và bất kỳ ai cũng có thể thêm phản hồi kèm bằng chứng khi khiếu nại còn mở hoặc đang xem xét.",
            },
            {
              title: "Kết quả được ghi nhận",
              body: "Tài khoản hội đồng ghi nhận kết quả — Đã giải quyết hoặc Bị bác — kèm tài liệu quyết định được công bố. Không thể sửa về sau.",
            },
          ]}
        />
        <H3>Trợ lý khiếu nại</H3>
        <P>
          Một trợ lý AI có thể chuẩn bị bản tóm tắt cho hội đồng: tóm tắt trung lập, dòng thời gian, nhận định nào có dữ liệu
          on-chain chứng minh, điều gì còn thiếu, và các câu hỏi nên đặt ra. Trợ lý không bao giờ quyết định, chấm điểm hay đề
          xuất kết quả, và coi mọi nội dung các bên viết là không đáng tin.
        </P>
        <H3>Nên biết</H3>
        <Ul
          items={[
            "Mọi nội dung bạn gửi đều công khai trên IPFS và liên kết on-chain. Đừng đưa dữ liệu riêng tư hay bí mật vào.",
            "Tệp đính kèm được nhúng trong tài liệu bằng chứng (ảnh, PDF, văn bản thuần; tổng tối đa 8 MB).",
            "Tài khoản hội đồng được cố định khi triển khai contract khiếu nại; với hội đồng thật nên dùng multisig.",
            "Khiếu nại đã giải quyết hiển thị trên hồ sơ Uy tín của các bên kèm kết quả.",
          ]}
        />
      </>
    ),
  },

  analytics: {
    title: "Phân tích",
    body: (
      <>
        <P>
          Trang <Link className={linkCls} href="/analytics">Phân tích</Link> biến dữ liệu on-chain công khai của thị trường thành
          số liệu cho bên mời thầu, nhà thầu và người kiểm tra. Mọi thứ được tính trong trình duyệt từ storage và event của
          contract; không có máy chủ hay cơ sở dữ liệu nào ở giữa, và giá niêm phong không bao giờ xuất hiện trước khi được công
          bố.
        </P>
        <Table
          head={["Mục", "Hiển thị gì"]}
          rows={[
            ["Tổng quan", "Số gói thầu đã đăng, phiên đấu giá NFT, ví đã tham gia, giao dịch thành công."],
            ["Phân tích gói thầu", "Tỷ lệ theo giai đoạn, tỷ lệ gói thầu có hồ sơ, tỷ lệ công bố, tỷ lệ trao thầu và số lần hủy."],
            ["Phân tích đấu giá NFT", "Người đặt giá, giá niêm phong, số lần bán, phiên chờ kết thúc và doanh số bằng tPOTv3."],
            ["Phân tích giao dịch", "Giao dịch theo ngày và theo loại, kèm gas đã trả."],
            ["Phân tích người tham gia", "Ví khác nhau, ví mới và ví quay lại, cùng số ví đóng vai bên mời thầu, nhà thầu hay người bán."],
            ["Phân tích kết thúc", "Tỷ lệ hoàn tất, các khoản hoàn và chi trả, và những gì còn chờ trao thầu hoặc kết thúc."],
          ]}
        />
        <H3>Bộ lọc và xuất dữ liệu</H3>
        <P>
          Chọn 7, 30, 90 ngày gần nhất hoặc toàn bộ. <B>CSV</B> xuất mỗi dòng một sự kiện on-chain (block, thời gian, giao dịch,
          thị trường, sự kiện, ví, số tiền); <B>JSON</B> xuất toàn bộ báo cáo cùng các sự kiện đó.
        </P>
        <Callout label="Nên biết" tone="amber">
          RPC chỉ trả dữ liệu block gần đây, nên thời gian của sự kiện cũ được ước tính từ số block, và gas chỉ biết được với
          giao dịch gần đây. Lời gọi thất bại không để lại sự kiện nên không được tính.
        </Callout>
      </>
    ),
  },

  reputation: {
    title: "Uy tín",
    body: (
      <>
        <P>
          <Link className={linkCls} href="/reputation">Uy tín</Link> xây dựng lịch sử hoạt động cho mọi ví từ dữ liệu kiểm chứng
          được trên Plinths. Nó chấm điểm hành vi và các nghĩa vụ đã hoàn thành trên Plinths — <B>không</B> phải đánh giá đạo
          đức hay mức độ tin cậy ngoài đời thực.
        </P>
        <H3>Quy tắc</H3>
        <P>
          Mỗi ví bắt đầu ở mức {BASE_SCORE}; điểm luôn nằm trong khoảng 0 đến 100. Mỗi thay đổi được liệt kê trong lịch sử của
          ví kèm lý do và giao dịch.
        </P>
        <Table head={["Sự kiện", "Điểm"]} rows={Object.values(RULES).map((r) => [r.text[1], `${r.points > 0 ? "+" : ""}${r.points}`])} />
        <H3>Hồ sơ hiển thị gì</H3>
        <Ul
          items={[
            "Vai trò nhà thầu: số gói thầu và phiên đấu giá đã tham gia, giá niêm phong, công bố đúng hạn, bỏ lỡ công bố và số lần thắng.",
            "Vai trò bên mời thầu: số gói thầu đã đăng, đã trao, thất bại, đã hủy, và các lần trao thầu còn chờ hoặc quá hạn.",
            "Vai trò người bán NFT: số phiên đã đăng, đã bán, không bán được, đã hủy và doanh số.",
            "Huy hiệu cho các thành tích kiểm chứng được, như Công bố hoàn hảo, Hoàn tất gói thầu hay Người bán sạch.",
            "Khiếu nại do ví mở hoặc về gói thầu và phiên đấu giá của ví, kèm kết quả.",
          ]}
        />
        <H3>Các mức</H3>
        <P>Mới (dưới ba hoạt động được chấm), Đang xây dựng, Đáng tin (65+), Rất đáng tin (85+), Rủi ro (dưới 40).</P>
        <Callout label="Khiếu nại và điểm số" tone="blue">
          Chỉ khiếu nại đã có quyết định mới được tính: một khiếu nại được chấp nhận về gói thầu hoặc phiên đấu giá của ví sẽ hạ
          điểm của ví đó. Khiếu nại còn mở hoặc bị bác không ảnh hưởng, và tranh chấp về chất lượng hàng hóa được các bên tự
          giải quyết bên ngoài Plinths.
        </Callout>
        <P>
          Tra cứu bất kỳ ví nào bằng địa chỉ trên trang Uy tín, hoặc chia sẻ liên kết hồ sơ; bảng xếp hạng liệt kê các ví có ít
          nhất ba hoạt động được chấm điểm.
        </P>
      </>
    ),
  },

  faq: {
    title: "Câu hỏi thường gặp",
    body: (
      <>
        <H3>Bên mời thầu có xem được giá sớm không?</H3>
        <P>Không. Trước hạn nộp hồ sơ, trên chain chỉ có mã băm commitment, và ứng dụng không hiển thị giá nào cho đến giai đoạn Đánh giá.</P>
        <H3>Tôi làm mất file sao lưu. Giờ sao?</H3>
        <P>
          Nếu trình duyệt này vẫn còn bản sao, bạn có thể công bố từ Hồ sơ thầu của tôi và xuất lại file trong Hồ sơ &amp; Cài
          đặt. Nếu không, hồ sơ không thể công bố: nó bị loại và tiền bảo đảm (nếu có) chuyển về treasury.
        </P>
        <H3>Nếu gói thầu là giả và bên mời thầu muốn chiếm tiền của tôi?</H3>
        <P>
          Bên mời thầu không thể lấy tiền bảo đảm của nhà thầu đã công bố, không thể chặn bạn rút, không thể đổi thời hạn và
          không thể hủy khi đã có hồ sơ. Tiền bảo đảm của hồ sơ không công bố chuyển về treasury của Plinths, không bao giờ về
          bên mời thầu, và mọi cửa sổ công bố đều dài ít nhất 24 giờ. Trước khi dự thầu, hãy xem các cảnh báo và lịch sử on-chain
          của bên mời thầu trên trang gói thầu. Lưu ý rằng hồ sơ đã công bố sẽ trở nên công khai.
        </P>
        <H3>Tôi có đổi giá được không?</H3>
        <P>Được, khi gói thầu còn mở. Hãy giữ file sao lưu mới.</P>
        <H3>Ai cũng dự thầu được chứ?</H3>
        <P>Mọi ví trừ bên mời thầu. Điều kiện tham gia do bên mời thầu mô tả được kiểm tra khi đánh giá, không phải on-chain.</P>
        <H3>Tôi dùng được những ví nào?</H3>
        <P>
          Ví trên trình duyệt như MetaMask trên {NETWORK_NAME}. Ví WalletConnect sẽ có khi ứng dụng được cấu hình project id của
          WalletConnect.
        </P>
        <H3>Làm sao nạp tiền gas cho ví EVM?</H3>
        <P>
          Trong Portaldot Node Console, dùng Developer → Runtime calls → <Code>reviveApi.accountId</Code> để ánh xạ địa chỉ H160
          của ví sang tài khoản SS58, rồi gửi tPOTv3 thử nghiệm tới địa chỉ SS58 đó. Đừng gửi tiền tới địa chỉ H160 từ phía
          Substrate gốc. Địa chỉ EVM suy ra từ một khóa có thể khác H160 của ví Portaldot, nên hãy dùng địa chỉ hiển thị cho
          PortaldotV3.
        </P>
        <H3>Tôi xem giao dịch EVM ở đâu?</H3>
        <P>
          Hướng dẫn Portaldot hiện tại chưa nêu URL trình khám phá block EVM. Ứng dụng hiển thị mã giao dịch và địa chỉ không kèm
          liên kết explorer; Node Console dành cho công cụ gốc của Portaldot.
        </P>
        <H3>Làm sao thử đấu giá NFT khi chưa có NFT?</H3>
        <P>
          Plinths Test NFT có ba món để thử. Biểu mẫu đăng bán gợi ý sẵn bộ sưu tập này; hãy xin nhóm phát triển một món thử,
          hoặc đăng bán bất kỳ ERC-721 nào bạn đã sở hữu trên {NETWORK_NAME}.
        </P>
        <H3>Ai quyết định một khiếu nại?</H3>
        <P>
          Tùy loại vấn đề: quy tắc mà dữ liệu on-chain chứng minh được do Verification Engine phân xử, vấn đề cần phán xét do hội
          đồng trọng tài được chỉ định quyết định, còn chất lượng hàng hóa hay dịch vụ do thỏa thuận riêng của các bên. Xem{" "}
          <Link className={linkCls} href="/docs/disputes">Quy trình khiếu nại</Link>.
        </P>
        <H3>Plinths có sửa được điểm uy tín của tôi không?</H3>
        <P>
          Không. Điểm được tính lại trong trình duyệt từ lịch sử on-chain theo các quy tắc công khai; không có điểm nào được lưu
          để mà sửa. Xem <Link className={linkCls} href="/docs/reputation">Uy tín</Link>.
        </P>
        <H3>Tôi thanh toán bằng gì?</H3>
        <P>tPOTv3 dùng để dự thầu và trả gas. Đây là bản testnet; hãy dùng PortaldotV3 Node Console cho các công cụ mạng.</P>
      </>
    ),
  },
};
