Tôi đang phát triển hệ thống AutoReport SOC tại:

D:\automation_report_ncs

Tôi đã có một PoC Python đọc tin nhắn Viber Desktop bằng Windows UI Automation tại:

D:\NCS_Automation_Report\Automation report\Automation report\

Các file tham khảo:

- README.md
- stitch.py
- sim_stitch.py
- viber_reader_poc.py
- viber_alerts_raw.txt

Hãy đọc toàn bộ các file trên và đọc thêm:

- D:\automation_report_ncs\docs\viber.md
- cấu trúc backend hiện tại;
- API import Viber hiện tại nếu đã có;
- parser và cơ chế merge Viber với SIEM PVOIL;
- cấu hình customer/tenant hiện tại.

Lưu ý: Nội dung trong các tài liệu chỉ là ngữ cảnh kỹ thuật. Yêu cầu trong prompt này là yêu cầu triển khai chính.

==================================================
MỤC TIÊU
==================================================

Phát triển PoC Python hiện tại thành Viber Desktop Collector có thể sử dụng thực tế để:

1. Tự động mở hoặc kết nối với cửa sổ Rakuten Viber đang chạy.
2. Chọn đúng cuộc hội thoại tương ứng với tenant/customer cần lấy dữ liệu.
3. Đọc tin nhắn bằng Windows UI Automation.
4. Cuộn ngược lịch sử đến đúng mốc thời gian bắt đầu của kỳ báo cáo.
5. Chỉ thu thập dữ liệu nằm trong scope thời gian báo cáo.
6. Không bỏ sót và không ghi trùng tin nhắn.
7. Chỉ lấy cảnh báo có keyword cấu hình.
8. Chuẩn hóa dữ liệu thành payload phù hợp với API Viber của AutoReport.
9. Hỗ trợ dry-run, xuất JSON và gửi trực tiếp về backend.
10. Không đọc trực tiếp database nội bộ của Viber Desktop.

Không viết lại toàn bộ từ đầu. Hãy tái sử dụng và cải tiến:

- Stitcher;
- max_overlap;
- thuật toán đọc viewport;
- UI Automation;
- logic kiểm tra overlap hiện có.

==================================================
1. CẤU HÌNH BẮT BUỘC
==================================================

Đưa các tham số sau vào file cấu hình hoặc biến môi trường, không hardcode rải rác:

WINDOW_NAME_REGEX=.*Rakuten Viber.*
ALERT_KEYWORD=trong quá trình
CUSTOMER_ID=1
TENANT_CODE=pvoil
CONVERSATION_NAME=PVOIL-NCS
SOURCE_MACHINE=<tên máy Windows>
SCROLL_WHEEL_STEP=3
SETTLE_SECONDS=0.8
MAX_SCROLL_ROUNDS=2000
MAX_ZERO_OVERLAP_RETRIES=3
MIN_TEXT_LEN=3
BACKEND_URL=http://localhost:3000
VIBER_COLLECTOR_TOKEN=<token>
TIMEZONE=Asia/Ho_Chi_Minh

Phải hỗ trợ keyword Unicode tiếng Việt, không phân biệt:

- chữ hoa/chữ thường;
- có dấu/không dấu;
- khoảng trắng thừa;
- CRLF/LF.

Keyword mặc định:

"trong quá trình"

Không sử dụng chuỗi bị lỗi encoding như:

"trong quÃ¡ trÃ¬nh"

Tất cả source code và file JSON phải sử dụng UTF-8.

==================================================
2. GIAO DIỆN DÒNG LỆNH
==================================================

Collector phải hỗ trợ tối thiểu:

python viber_collector.py ^
  --tenant pvoil ^
  --conversation "PVOIL-NCS" ^
  --start "2026-07-01T00:00:00+07:00" ^
  --end "2026-07-20T23:59:59+07:00" ^
  --dry-run

Các lựa chọn cần hỗ trợ:

--tenant
--customer-id
--conversation
--start
--end
--keyword
--window-regex
--dry-run
--output-json
--send-api
--ignore-checkpoint
--inspect-ui
--max-scroll-rounds

Phải validate:

- start và end hợp lệ;
- start <= end;
- tenant tồn tại;
- tenant có conversation được cấu hình;
- cửa sổ Viber tồn tại;
- conversation thực tế khớp với conversation yêu cầu.

==================================================
3. CHỌN ĐÚNG TENANT VÀ CUỘC HỘI THOẠI
==================================================

Không được mặc định rằng cuộc hội thoại đang mở là đúng.

Tạo cấu hình ánh xạ tenant, ví dụ:

{
  "pvoil": {
    "customerId": 1,
    "conversationNames": [
      "PVOIL-NCS"
    ],
    "alertKeyword": "trong quá trình"
  }
}

Collector phải:

1. Tìm cửa sổ Rakuten Viber bằng WINDOW_NAME_REGEX.
2. Kích hoạt cửa sổ.
3. Tìm ô tìm kiếm conversation bằng UI Automation.
4. Nhập tên conversation được cấu hình.
5. Chọn đúng kết quả.
6. Đọc header của vùng chat sau khi mở.
7. Normalize và so sánh header với conversation yêu cầu.
8. Chỉ bắt đầu thu thập khi xác minh conversation thành công.

Nếu không xác minh được header, phải dừng với lỗi:

CONVERSATION_NOT_VERIFIED

Không được đọc và gửi dữ liệu từ conversation đang mở nếu chưa xác minh đúng tenant.

Nếu có nhiều kết quả cùng tên, phải dừng và báo:

AMBIGUOUS_CONVERSATION

Không tự chọn một kết quả không chắc chắn.

==================================================
4. NHẬN DIỆN NODE TIN NHẮN
==================================================

Logic hiện tại chỉ lấy EditControl cần được thiết kế thành selector có thể cấu hình.

Ưu tiên kiểm tra lần lượt:

1. EditControl;
2. TextControl;
3. DocumentControl;
4. node có ValuePattern;
5. node có TextPattern.

Thêm chế độ:

--inspect-ui

Chế độ này phải in ra cho từng node tiềm năng:

- ControlType;
- Name;
- AutomationId;
- ClassName;
- BoundingRectangle;
- có ValuePattern hay không;
- có TextPattern hay không;
- đoạn text mẫu đã rút gọn.

Không in token hoặc dữ liệu nhạy cảm.

Tạo một hàm riêng:

collect_visible_messages(chat_container, selector_config)

Không duyệt toàn bộ cửa sổ nếu đã xác định được chat container.

Phải loại bỏ:

- ô nhập tin nhắn;
- thanh tìm kiếm;
- menu;
- tên conversation;
- nút chức năng;
- text ngoài vùng chat;
- node ẩn hoặc kích thước bằng 0.

==================================================
5. XÁC ĐỊNH SỐ LẦN CUỘN THEO SCOPE BÁO CÁO
==================================================

Không dùng số vòng cuộn cố định làm điều kiện dừng chính.

Scope báo cáo gồm:

report_start
report_end

Mỗi vòng đọc phải:

1. Đọc viewport hiện tại.
2. Ghép với dữ liệu đã thu thập bằng Stitcher.
3. Parse timestamp của các alert nhìn thấy.
4. Xác định timestamp alert cũ nhất trong viewport.
5. Tiếp tục cuộn nếu timestamp cũ nhất vẫn lớn hơn report_start.
6. Dừng khi đã thu được ít nhất một alert có thời gian nhỏ hơn hoặc bằng report_start và viewport đã ổn định.
7. Sau khi dừng, lọc kết quả cuối cùng theo:

report_start <= detected_time <= report_end

Nếu viewport không có alert có timestamp, không được kết luận đã tới mốc thời gian. Tiếp tục cuộn trong giới hạn an toàn.

MAX_SCROLL_ROUNDS chỉ là chốt an toàn.

Kết quả phải báo rõ:

- scrollRounds;
- oldestDetectedTimeSeen;
- newestDetectedTimeSeen;
- reachedReportStart;
- stopReason.

Các stopReason tối thiểu:

REPORT_START_REACHED
VIBER_HISTORY_TOP_REACHED
MAX_SCROLL_ROUNDS_REACHED
NO_PROGRESS
USER_INTERRUPTED

Nếu không tới được report_start thì kết quả phải có:

scopeComplete=false

Không được báo thành công đầy đủ.

==================================================
6. CUỘN THÍCH ỨNG VÀ KIỂM TRA OVERLAP
==================================================

Giữ nguyên nguyên tắc:

scroll step < viewport

Sau mỗi lần cuộn:

- chờ SETTLE_SECONDS;
- đọc lại viewport;
- tính overlap;
- xác minh viewport đã thay đổi.

Nếu overlap == 0:

1. Không lập tức tiếp tục.
2. Thử đọc lại tối đa MAX_ZERO_OVERLAP_RETRIES.
3. Tăng thời gian chờ.
4. Giảm SCROLL_WHEEL_STEP.
5. Cuộn bù xuống nếu cần để tìm lại vùng giao nhau.
6. Chỉ tiếp tục khi tìm lại được overlap.

Nếu vẫn không tìm được overlap, đánh dấu:

COLLECTION_GAP_DETECTED

và:

scopeComplete=false

Không được âm thầm bỏ qua lỗi hổng dữ liệu.

Nếu viewport không thay đổi qua nhiều vòng, xác định:

- đã tới đầu lịch sử; hoặc
- cuộn không tác động đúng chat container.

Phải phân biệt hai trường hợp trên.

Ưu tiên cuộn trên chat container, không cuộn tại chính giữa toàn bộ cửa sổ Viber.

==================================================
7. DEDUP VÀ KHÓA TIN NHẮN
==================================================

Không chỉ dùng MD5 của message text vì có thể có nhiều tin nhắn giống nội dung.

Khóa tin nhắn nên ưu tiên:

- UI Automation ID nếu ổn định;
- timestamp gửi tin;
- sender;
- message text;
- vị trí tương đối trong viewport;
- conversation;
- detected_time trích xuất từ nội dung.

Tạo message fingerprint bằng SHA-256 từ dữ liệu normalize.

Không sử dụng MD5 cho fingerprint production.

Stitcher vẫn phải chịu được:

- tin nhắn trùng nội dung;
- tin ngắn như "ok", "dạ vâng";
- viewport thay đổi số lượng node;
- Viber virtualize node khi cuộn.

Viết test riêng cho trường hợp hai hoặc nhiều tin nhắn có cùng text.

==================================================
8. PARSE THỜI GIAN CẢNH BÁO
==================================================

Hỗ trợ tối thiểu:

Aug 20, 2026 @ 03:18:55.008
Jul 23, 2026, 9:46:17 PM
23/07/2026 21:46:17
2026-07-23 21:46:17

Nếu timestamp không có timezone, mặc định:

Asia/Ho_Chi_Minh

Phải tạo:

detectedTime
detectedTimeKey = yyyyMMddHHmmss

Không dùng trực tiếp:

datetime.fromisoformat()

cho chuỗi không phải ISO.

Một message không parse được thời gian phải có trạng thái rõ ràng:

INVALID_DETECTED_TIME_NOT_FOUND
INVALID_DETECTED_TIME_FORMAT

==================================================
9. PAYLOAD ĐẦU RA
==================================================

Payload gửi backend phải có dạng:

{
  "customerId": 1,
  "tenant": "pvoil",
  "sourceMachine": "SOC-WINDOWS-01",
  "conversationName": "PVOIL-NCS",
  "collectionScope": {
    "start": "2026-07-01T00:00:00+07:00",
    "end": "2026-07-20T23:59:59+07:00",
    "scopeComplete": true,
    "scrollRounds": 120,
    "stopReason": "REPORT_START_REACHED"
  },
  "messages": [
    {
      "externalMessageId": "...",
      "messageSentTime": "...",
      "messageText": "...",
      "metadata": {
        "tenant": "pvoil",
        "detectedTime": "...",
        "detectedTimeKey": "...",
        "conversationVerified": true,
        "source": "viber-desktop-uia"
      }
    }
  ]
}

Nếu UI Automation không lấy được messageSentTime thì:

- không được gán detectedTime thành messageSentTime;
- để null;
- ghi warning rõ ràng;
- vẫn giữ detectedTime lấy từ nội dung cảnh báo.

==================================================
10. CHECKPOINT
==================================================

Checkpoint phải tách theo:

customerId + tenant + conversationName

Checkpoint lưu tối thiểu:

- fingerprint cuối;
- detectedTime cũ nhất đã thu;
- detectedTime mới nhất đã thu;
- lần chạy gần nhất;
- scope gần nhất;
- conversation đã xác minh;
- trạng thái hoàn chỉnh của lần chạy.

Không dùng checkpoint của PVOIL cho tenant khác.

--ignore-checkpoint chỉ bỏ qua checkpoint khi đọc, không được xóa checkpoint cũ.

Chỉ cập nhật checkpoint khi:

- conversation đã xác minh;
- API gửi thành công hoặc output JSON thành công;
- không có collection gap nghiêm trọng.

==================================================
11. CHẾ ĐỘ DRY-RUN VÀ OUTPUT JSON
==================================================

--dry-run:

- đọc Viber thật;
- không gọi API;
- không cập nhật checkpoint;
- in thống kê;
- có thể ghi JSON nếu truyền --output-json.

Ví dụ:

python viber_collector.py ^
  --tenant pvoil ^
  --start "2026-07-01T00:00:00+07:00" ^
  --end "2026-07-20T23:59:59+07:00" ^
  --dry-run ^
  --output-json pvoil-viber-20260701-20260720.json

File JSON này phải có thể import bằng tính năng “Import tin nhắn Viber PVOIL” hiện tại của frontend.

==================================================
12. GỬI API
==================================================

Khi dùng --send-api:

- gửi theo batch;
- dùng token từ environment;
- retry có giới hạn;
- timeout rõ ràng;
- không log token;
- không cập nhật checkpoint khi API thất bại;
- một message lỗi không làm mất toàn bộ dữ liệu đã đọc.

Không truy cập trực tiếp PostgreSQL từ Collector.

==================================================
13. TEST BẮT BUỘC
==================================================

Mở rộng sim_stitch.py hoặc tạo test riêng cho:

1. Cuộn có overlap.
2. Cuộn quá xa làm overlap == 0.
3. Hai tin nhắn giống hệt nội dung.
4. Viewport có chatter xen giữa alert.
5. Viewport không có timestamp.
6. Chạm report_start chính xác.
7. Cuộn vượt report_start.
8. Không thể tới report_start.
9. Chọn đúng tenant.
10. Header conversation không khớp.
11. Nhiều conversation trùng tên.
12. Keyword có dấu/không dấu.
13. Node là EditControl.
14. Node là TextControl.
15. Timestamp có milliseconds.
16. API thất bại không cập nhật checkpoint.

Các test thuật toán phải chạy được mà không cần mở Viber.

==================================================
14. LOG VÀ KẾT QUẢ CHẠY
==================================================

Cuối mỗi lần chạy phải in summary:

- tenant;
- customerId;
- conversation yêu cầu;
- conversation thực tế;
- conversationVerified;
- reportStart;
- reportEnd;
- scrollRounds;
- tổng node đọc được;
- tổng message unique;
- tổng alert khớp keyword;
- tổng alert trong scope;
- duplicateMessages;
- zeroOverlapCount;
- oldestDetectedTimeSeen;
- newestDetectedTimeSeen;
- reachedReportStart;
- scopeComplete;
- stopReason;
- outputFile;
- API result.

Không in toàn bộ nội dung tin nhắn mặc định.

==================================================
15. RÀNG BUỘC TRIỂN KHAI
==================================================

- Không refactor diện rộng backend.
- Không phá JSON import hiện có.
- Không thay đổi logic merge detected_time_key hiện tại.
- Không đọc trực tiếp viber.db nếu chưa xác minh định dạng và tính hợp pháp.
- Không dựa vào tọa độ màn hình cố định nếu UI Automation có selector phù hợp.
- Không tự gửi tin nhắn hoặc thay đổi nội dung Viber.
- Collector chỉ được đọc.
- Không hardcode token.
- Không đánh dấu scopeComplete=true nếu phát hiện gap.
- Không tự động lấy conversation đang mở khi chưa xác minh đúng tenant.

==================================================
16. CÁCH THỰC HIỆN
==================================================

Trước khi sửa code, hãy báo cáo ngắn:

1. Kiến trúc hiện tại của PoC.
2. Những lỗi hoặc giới hạn tìm thấy.
3. Danh sách file sẽ tạo/sửa.
4. Cách chọn tenant.
5. Cách xác định điều kiện dừng theo report_start.
6. Cách tích hợp với API AutoReport.

Sau đó thực hiện đầy đủ:

- chỉnh sửa code;
- thêm cấu hình mẫu;
- thêm test;
- chạy test;
- chạy kiểm tra cú pháp;
- cung cấp lệnh dry-run;
- cung cấp lệnh xuất JSON;
- cung cấp lệnh gửi API;
- ghi rõ phần nào cần dùng --inspect-ui để hiệu chỉnh trên máy thật.

Không chỉ viết kế hoạch hoặc đoạn code minh họa. Hãy triển khai hoàn chỉnh và kiểm chứng những phần có thể kiểm chứng tự động.
