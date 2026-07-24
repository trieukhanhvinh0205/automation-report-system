Tôi đang phát triển hệ thống AutoReport gồm backend Node.js/Express, PostgreSQL và frontend React/Vite. Hệ thống hiện đã lấy dữ liệu từ ELK/SIEM, lọc các case theo logic hiện tại và mỗi case đã có trường siem_alert_id tương ứng với Offense ID. Tôi cần triển khai duy nhất Giai đoạn A: cho phép người dùng upload file export từ SIEM PVOIL, dùng Offense ID trong file để merge với siem_alert_id của AutoReport, lấy Detection Time và đưa vào cột “Thời gian phát hiện” của dữ liệu báo cáo.

Không triển khai bất kỳ chức năng nào liên quan đến Viber, keyword “Trong quá trình giám sát”, Wordlist, phân loại An ninh/Vận hành, Collector, Power Automate hoặc Python Agent trong giai đoạn này.

Trước khi chỉnh sửa, hãy kiểm tra toàn bộ cấu trúc source code hiện tại, package.json backend/frontend, cấu trúc database, migration, route/service tạo báo cáo, reportGenerator, templateRenderer, logic Preview Word, vị trí tạo trường siem_alert_id và vị trí truyền dữ liệu vào cột “Thời gian phát hiện”. Hãy triển khai theo convention hiện tại của project, hạn chế refactor ngoài phạm vi và không phá các chức năng đang hoạt động.

File export thực tế từ SIEM PVOIL là file CSV KHÔNG CÓ HEADER. Không được giả định dòng đầu tiên là tên cột. Dòng đầu tiên đã là dữ liệu thực tế.

File mẫu thực tế có các đặc điểm:

- Không có dòng tiêu đề.
- Mỗi dòng có 60 cột.
- Cột thứ 1 trong file là Offense ID.
- Cột thứ 43 trong file là Detection Time.

Cần phân biệt rõ số thứ tự cột mà người dùng nhìn thấy và index trong code:

- Offense ID là cột 1/60, tương ứng row[0].
- Detection Time là cột 43/60, tương ứng row[42].

Không được sử dụng row[4] làm Detection Time. Cột thứ 5 là một trường thời gian khác và không phải Detection Time cần đưa vào báo cáo.

Ví dụ một dòng dữ liệu thực tế có dạng tương tự:

[
  "187932",
  "...",
  "...",
  "...",
  "Jul 1, 2026, 12:35:27 AM",
  "...",
  ...
  "Jul 1, 2026, 12:00:01 AM",
  ...
]

Trong đó:

- row[0] = "187932" là Offense ID.
- row[42] = "Jul 1, 2026, 12:00:01 AM" là Detection Time cần sử dụng.
- row[4] = "Jul 1, 2026, 12:35:27 AM" không phải Detection Time của yêu cầu này và không được dùng để điền cột “Thời gian phát hiện”.

Backend phải hỗ trợ hai chế độ đọc file:

1. File không có header, là định dạng export thực tế từ SIEM PVOIL:
   - Offense ID lấy từ row[0].
   - Detection Time lấy từ row[42].
   - Không được bỏ dòng đầu tiên.
   - Không được coi dòng đầu tiên là header.
   - Mỗi dòng hợp lệ phải có tối thiểu 43 cột.
   - Nếu một dòng có ít hơn 43 cột thì đánh dấu INVALID_COLUMN_COUNT.
   - Nếu file chuẩn có 60 cột nhưng một số dòng không đủ 60 cột thì cần ghi nhận số cột thực tế để kiểm tra, nhưng điều kiện tối thiểu để đọc Detection Time là row.length >= 43.

2. File có header:
   - Tự nhận diện cột Offense ID và Detection Time theo tên cột.
   - Dòng đầu tiên là header.
   - Dữ liệu bắt đầu từ dòng thứ hai.
   - Không hardcode index 42 khi file có header nếu tên cột đã được nhận diện chính xác.

Backend cần tự xác định file có header hay không dựa trên nội dung dòng đầu tiên, không chỉ dựa vào tên file.

Có thể xác định theo logic:

- Nếu ô đầu tiên chứa tên cột như “Offense ID”, “OffenseId”, “siem_alert_id” thì coi là WITH_HEADER.
- Nếu row[0] có dạng Offense ID hợp lệ và row[42] parse được thành thời gian thì coi là WITHOUT_HEADER.
- Nếu không thỏa mãn hai trường hợp trên thì trả lỗi UNKNOWN_FILE_STRUCTURE.
- Không được dùng row[4] để xác định file không header.

Không được sử dụng sheet_to_json theo cách mặc định khiến dòng đầu tiên bị lấy làm header và làm mất bản ghi đầu tiên. Với CSV hoặc workbook không có header, phải đọc dữ liệu dạng array of arrays, ví dụ:

const rows = XLSX.utils.sheet_to_json(worksheet, {
  header: 1,
  defval: null,
  raw: true
});

Sau đó xử lý từng row dưới dạng mảng.

Có thể triển khai logic nhận diện tương tự:

function detectHeaderMode(rows) {
  const firstRow = rows[0];

  if (!Array.isArray(firstRow) || firstRow.length === 0) {
    return "EMPTY";
  }

  const firstCell = normalizeHeader(firstRow[0]);

  const knownOffenseHeaders = [
    "offense id",
    "offenseid",
    "offense_id",
    "siem alert id",
    "siem_alert_id",
    "offense"
  ];

  if (knownOffenseHeaders.includes(firstCell)) {
    return "WITH_HEADER";
  }

  if (firstRow.length < 43) {
    return "UNKNOWN";
  }

  const offenseId = normalizeOffenseId(firstRow[0]);
  const detectedTime = parseSiemDetectedTime(firstRow[42]);

  if (offenseId && detectedTime?.isValid) {
    return "WITHOUT_HEADER";
  }

  return "UNKNOWN";
}

Khi file không có header:

- dataStartIndex = 0.
- rowNumber hiển thị cho người dùng = array index + 1.
- offenseIdRaw = row[0].
- detectedTimeRaw = row[42].
- Không được lấy detectedTimeRaw từ row[4].

Khi file có header:

- dataStartIndex = 1.
- rowNumber hiển thị theo đúng số dòng trong file.
- Tìm index của Offense ID và Detection Time bằng cách normalize tên header.
- Nếu không tìm thấy cột bắt buộc thì trả lỗi cấp file.

Hệ thống AutoReport hiện có dữ liệu case tương tự:

{
  "siem_alert_id": "187932",
  "siem_alert_name": "UC148.001",
  "description": "Đã Confirm KH"
}

Sau khi merge thành công, case phải có dạng:

{
  "siem_alert_id": "187932",
  "siem_alert_name": "UC148.001",
  "detected_time": "2026-07-01T00:00:01+07:00",
  "detected_time_key": "20260701000001",
  "siem_import_status": "MATCHED",
  "description": "Đã Confirm KH"
}

Giá trị detected_time trong ví dụ trên phải được lấy từ cột 43/60, tức row[42].

Điều kiện merge duy nhất là:

normalize(siem_alert_id) === normalize(Offense ID)

Không được merge theo:

- Rule;
- Soar ID;
- tên cảnh báo;
- source IP;
- Detection Time;
- cột thời gian tại row[4];
- hoặc bất kỳ trường nào khác.

Tạo bảng PostgreSQL mới để lưu dữ liệu import SIEM PVOIL. Bảng cần có tối thiểu:

- id;
- customer_id;
- siem_alert_id;
- detected_time;
- detected_time_key;
- source_file_name;
- import_batch_id;
- imported_at;
- updated_at nếu phù hợp convention hiện tại.

Đặt unique constraint theo:

customer_id + siem_alert_id

Khi import lại cùng một Offense ID của cùng customer, phải update:

- detected_time;
- detected_time_key;
- source_file_name;
- import_batch_id;
- updated_at.

Không tạo bản ghi trùng.

Tạo index phù hợp cho:

- customer_id;
- customer_id + siem_alert_id;
- customer_id + detected_time;
- customer_id + detected_time_key.

detected_time_key có định dạng:

yyyyMMddHHmmss

Ví dụ:

Jul 1, 2026, 12:00:01 AM
→ 20260701000001

Jul 23, 2026, 9:46:17 PM
→ 20260723214617

Trường detected_time_key chỉ được chuẩn bị cho giai đoạn sau, chưa sử dụng để tích hợp Viber trong Giai đoạn A.

Backend phải hỗ trợ upload:

- .csv;
- .xlsx;
- .xls.

Tuy nhiên cần ưu tiên xử lý đúng file CSV không header vì đây là định dạng export thực tế từ SIEM PVOIL.

Trước khi cài dependency, kiểm tra package.json để tránh cài trùng và bảo đảm đúng module system CommonJS hoặc ESM của project. Có thể sử dụng:

- multer;
- xlsx;
- luxon;
- crypto.randomUUID hoặc uuid nếu thực sự cần.

Tạo service riêng để xử lý import SIEM, không nhét toàn bộ logic vào route. Service cần thực hiện:

- đọc file;
- đọc dữ liệu thành array of arrays;
- kiểm tra file rỗng;
- kiểm tra số dòng;
- kiểm tra số cột;
- tự xác định file có header hay không;
- xác định index Offense ID và Detection Time;
- normalize Offense ID;
- parse Detection Time;
- validate từng dòng;
- tách validRows và invalidRows;
- xử lý Offense ID trùng trong cùng file;
- upsert vào PostgreSQL;
- trả về kết quả import.

Đối với file có header, hỗ trợ các tên cột Offense ID:

- Offense ID;
- OffenseId;
- Offense Id;
- offense_id;
- siem_alert_id;
- SIEM Alert ID;
- offense.

Hỗ trợ các tên cột Detection Time:

- Detection Time;
- Detected Time;
- Start Time;
- Event Start Time;
- Thời gian phát hiện;
- thoi gian phat hien.

Header phải được normalize:

- trim;
- không phân biệt hoa thường;
- chuẩn hóa khoảng trắng;
- xử lý dấu gạch dưới và dấu gạch ngang;
- hỗ trợ tiếng Việt có dấu và không dấu nếu cần.

Nếu file được xác định là có header nhưng không tìm thấy cột bắt buộc, API phải trả lỗi rõ ràng:

- MISSING_OFFENSE_ID_COLUMN;
- MISSING_DETECTION_TIME_COLUMN.

Nếu file không có header mà dòng có ít hơn 43 cột, không làm fail toàn bộ file. Đánh dấu dòng đó:

{
  "rowNumber": 15,
  "reason": "INVALID_COLUMN_COUNT",
  "expectedMinimumColumns": 43,
  "actualColumnCount": 38
}

Nếu file chuẩn được kỳ vọng có 60 cột, có thể ghi thêm warning nếu số cột khác 60:

{
  "rowNumber": 15,
  "reason": "UNEXPECTED_COLUMN_COUNT",
  "expectedColumnCount": 60,
  "actualColumnCount": 59
}

Tuy nhiên nếu dòng vẫn có đủ row[0] và row[42], có thể tiếp tục xử lý tùy theo chiến lược validation của project. Không được truy cập row[42] khi row.length < 43.

Normalize Offense ID theo nguyên tắc:

- chuyển về string;
- trim;
- loại bỏ hậu tố .0 do Excel;
- xử lý dạng “Offense ID: 187932” nếu có;
- không chuyển sang Number;
- không dùng parseInt;
- không làm mất số 0 đầu nếu có;
- dòng không có Offense ID được đánh dấu MISSING_OFFENSE_ID.

Ví dụ:

187932 → "187932"
187932.0 → "187932"
" Offense ID: 187932 " → "187932"

Parse Detection Time phải hỗ trợ tối thiểu:

- Jul 1, 2026, 12:00:01 AM;
- Jul 23, 2026, 9:46:17 PM;
- Jul 8, 2026, 9:01:37 AM;
- 23/07/2026 21:46:17;
- 23/07/2026 21:46;
- 2026-07-23 21:46:17;
- ISO datetime;
- Excel serial date;
- JavaScript Date.

Không dùng trực tiếp new Date(nonIsoString).

Tất cả thời gian không có timezone trong file phải được hiểu theo:

Asia/Ho_Chi_Minh

Sau khi parse:

- lưu detected_time đúng kiểu TIMESTAMPTZ;
- tạo detected_time_key theo giờ Việt Nam;
- tránh lệch 7 giờ giữa Windows, Ubuntu, Node.js và PostgreSQL.

Ví dụ:

row[42] = "Jul 1, 2026, 12:00:01 AM"

Phải được hiểu là:

2026-07-01T00:00:01+07:00

Khi hiển thị trong báo cáo:

01/07/2026 00:00:01

Không được dùng giá trị row[4] = "Jul 1, 2026, 12:35:27 AM" để thay thế.

Tạo API:

POST /api/siem-imports

Input multipart/form-data:

- file;
- customerId.

API phải validate:

- thiếu file;
- thiếu customerId;
- sai định dạng;
- file rỗng;
- không có dữ liệu;
- không xác định được cấu trúc file;
- file có header nhưng thiếu cột bắt buộc;
- dòng thiếu Offense ID;
- dòng thiếu Detection Time;
- Detection Time không parse được;
- dòng không đủ 43 cột.

Lỗi một dòng không được làm fail toàn bộ batch. Chỉ lỗi cấp file hoặc lỗi database mới làm request thất bại.

Response thành công nên có dạng:

{
  "status": "success",
  "batchId": "uuid",
  "fileName": "2026-07-24-data_export.csv",
  "headerMode": "WITHOUT_HEADER",
  "totalColumnsDetected": 60,
  "offenseIdColumnNumber": 1,
  "offenseIdColumnIndex": 0,
  "detectionTimeColumnNumber": 43,
  "detectionTimeColumnIndex": 42,
  "totalRows": 9080,
  "validRows": 9078,
  "importedRows": 9078,
  "invalidRows": 2,
  "duplicateRowsInFile": 0,
  "errors": [
    {
      "rowNumber": 15,
      "offenseId": "187950",
      "reason": "INVALID_DETECTED_TIME",
      "columnNumber": 43,
      "columnIndex": 42,
      "originalValue": "..."
    }
  ]
}

Response phải thể hiện rõ:

- cột hiển thị thứ 43;
- index code là 42.

Không trả toàn bộ dữ liệu SIEM trong response.

Nếu có nhiều dòng cùng Offense ID trong chính file import, cần xác định chiến lược rõ ràng. Ưu tiên:

- giữ dòng cuối cùng theo thứ tự file;
- ghi nhận duplicateRowsInFile;
- không gửi nhiều bản ghi trùng vào cùng batch upsert.

Không tự động chọn Detection Time lớn nhất nếu chưa có xác nhận nghiệp vụ. Mặc định giữ dòng xuất hiện cuối cùng để hành vi có tính xác định.

Thực hiện database upsert trong transaction. Không query riêng từng dòng nếu có thể batch insert. Với file thực tế có khoảng 9.080 dòng, cần chia batch hợp lý, ví dụ 500 hoặc 1.000 dòng mỗi batch, để tránh vượt giới hạn tham số PostgreSQL.

Không được tạo hơn 9.000 query INSERT riêng lẻ nếu có thể batch insert/upsert.

Sau khi import, tích hợp vào pipeline tạo báo cáo hiện tại. Giữ nguyên hoàn toàn:

- logic lấy case từ ELK/SIEM;
- logic keyword “Đã Confirm KH”;
- logic xác định case nào được đưa vào báo cáo;
- các cột hiện có không liên quan.

Sau khi có danh sách case, lấy toàn bộ siem_alert_id, normalize và query dữ liệu import theo batch:

WHERE customer_id = $1
AND siem_alert_id = ANY($2::varchar[])

Không query riêng cho từng case.

Merge kết quả theo siem_alert_id. Mỗi case cần có:

- detected_time;
- detected_time_key;
- siem_import_status.

Trạng thái tối thiểu:

- MATCHED;
- OFFENSE_NOT_FOUND;
- INVALID_OFFENSE_ID.

Nếu không tìm thấy Offense ID:

{
  "siem_alert_id": "999999",
  "detected_time": null,
  "detected_time_key": null,
  "siem_import_status": "OFFENSE_NOT_FOUND"
}

Không được:

- lấy thời gian gần nhất;
- fallback theo Rule;
- fallback theo Soar ID;
- dùng row[4];
- hoặc tự suy đoán.

Đưa detected_time vào đúng cột “Thời gian phát hiện” trong Preview và Export Word.

Định dạng hiển thị:

dd/MM/yyyy HH:mm:ss

Ví dụ:

2026-07-01T00:00:01+07:00
→ 01/07/2026 00:00:01

Việc format chỉ dùng để hiển thị. Database và xử lý nội bộ giữ kiểu thời gian chuẩn.

Các cột:

- Thời gian tạo case;
- Cảnh báo.

phải giữ nguyên trong Giai đoạn A. Không lấy dữ liệu Viber và không thay đổi nội dung các cột này.

Frontend cần thêm khu vực import file SIEM PVOIL vào vị trí phù hợp trong workflow tạo báo cáo:

- chọn file;
- hiển thị tên file;
- sử dụng customerId hiện tại;
- nút “Import SIEM PVOIL”;
- trạng thái đang xử lý;
- thông báo thành công/thất bại;
- tổng dòng;
- dòng hợp lệ;
- dòng import;
- dòng lỗi;
- chế độ WITH_HEADER hoặc WITHOUT_HEADER;
- hiển thị vị trí cột đã nhận diện:
  - Offense ID: cột 1, index 0;
  - Detection Time: cột 43, index 42;
- hiển thị tối đa một số lỗi đầu tiên với rowNumber và reason.

Không reload toàn bộ trang. Không cho import lặp khi request đang chạy. Sử dụng apiClient và biến môi trường hiện tại, không hardcode backend URL nếu project đã có cấu hình.

Bảo đảm việc merge Detection Time xảy ra trước khi dữ liệu được truyền vào reportGenerator, templateRenderer hoặc service tạo Preview/Word tương ứng. Không chỉ hiển thị trên giao diện frontend mà phải có trong file Word xuất ra.

Thêm logging phù hợp:

- bắt đầu import;
- customerId;
- fileName;
- batchId;
- headerMode;
- totalRows;
- totalColumnsDetected;
- offenseIdColumnIndex;
- detectionTimeColumnIndex;
- validRows;
- invalidRows;
- duplicateRowsInFile;
- số bản ghi upsert;
- lỗi cấp file;
- lỗi parse;
- lỗi database.

Trong log phải thể hiện rõ:

offenseIdColumnIndex = 0
detectionTimeColumnIndex = 42

Không log toàn bộ nội dung từng dòng SIEM.

Thêm test hoặc script kiểm thử cho tối thiểu các trường hợp:

- CSV không header giống file thực tế;
- xác nhận dòng đầu tiên không bị mất;
- xác nhận mỗi dòng có 60 cột;
- xác nhận row[0] là Offense ID;
- xác nhận row[42] là Detection Time;
- xác nhận row[4] không được dùng làm Detection Time;
- dòng có ít hơn 43 cột;
- file có header;
- file xlsx hợp lệ;
- Excel serial date;
- “Jul 1, 2026, 12:00:01 AM”;
- “Jul 23, 2026, 9:46:17 PM”;
- “23/07/2026 21:46:17”;
- Offense ID dạng 187932.0;
- thiếu Offense ID;
- Detection Time tại row[42] rỗng;
- Detection Time tại row[42] sai định dạng;
- row[4] hợp lệ nhưng row[42] sai, kết quả vẫn phải INVALID_DETECTED_TIME;
- thiếu cột khi file có header;
- import lại cùng Offense ID;
- duplicate Offense trong cùng file;
- case AutoReport match thành công;
- case không tìm thấy;
- không lệch timezone;
- Preview Word hiển thị đúng Detection Time lấy từ cột 43.

Tạo một test đặc biệt với dữ liệu:

row[0] = "187932"
row[4] = "Jul 1, 2026, 12:35:27 AM"
row[42] = "Jul 1, 2026, 12:00:01 AM"

Kết quả bắt buộc:

{
  "siem_alert_id": "187932",
  "detected_time": "2026-07-01T00:00:01+07:00",
  "detected_time_key": "20260701000001"
}

Không được trả:

2026-07-01T00:35:27+07:00

Không triển khai các nội dung sau:

- Viber;
- keyword “Trong quá trình giám sát”;
- Viber Collector;
- Power Automate Desktop;
- Python Local Agent;
- match Viber bằng Detection Time;
- Wordlist;
- phân loại Cảnh báo An ninh/Vận hành;
- thay đổi logic “Đã Confirm KH”;
- refactor diện rộng ngoài phạm vi.

Sau khi hoàn thành, cung cấp:

- kế hoạch đã thực hiện;
- danh sách file đã tạo/sửa;
- migration SQL;
- dependency đã thêm;
- API endpoint;
- ví dụ request/response;
- cách chạy migration;
- cách test với file 2026-07-24-data_export.csv;
- cách xác nhận file có 60 cột;
- cách xác nhận Detection Time lấy từ cột 43/index 42;
- cách kiểm tra tổng số dòng import;
- câu SQL kiểm tra Offense ID và Detection Time;
- cách kiểm tra timezone;
- cách xác nhận Preview/Export Word;
- các giả định theo source code thực tế;
- phần chưa hoàn thành nếu thiếu dữ liệu.

Tiêu chí nghiệm thu cuối cùng:

- File CSV không header từ SIEM PVOIL được đọc đúng.
- Dòng đầu tiên không bị bỏ.
- Offense ID lấy từ cột 1/60, row[0].
- Detection Time lấy từ cột 43/60, row[42].
- Tuyệt đối không lấy Detection Time từ row[4].
- File khoảng 9.080 dòng được xử lý ổn định.
- Import lại không tạo trùng.
- Dữ liệu được parse đúng Asia/Ho_Chi_Minh.
- AutoReport giữ nguyên logic lấy case và “Đã Confirm KH”.
- Merge chỉ bằng siem_alert_id = Offense ID.
- Cột “Thời gian phát hiện” xuất hiện đúng trong Preview và Word.
- Offense không tìm thấy được đánh dấu rõ ràng.
- Không có code Viber, Collector, Wordlist hoặc Classification trong Giai đoạn A.