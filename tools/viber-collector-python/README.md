# Viber Desktop Collector

Collector chỉ đọc giao diện Rakuten Viber bằng Windows UI Automation. Nó không đọc `viber.db` và không gửi hay sửa tin nhắn.

## Cài đặt

```powershell
cd tools/viber-collector-python
py -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Điền token do quản trị viên đặt giống `VIBER_COLLECTOR_TOKEN` của backend vào `.env` khi dùng `--send-api`.

## Hiệu chỉnh UI

```powershell
py viber_collector.py --inspect-ui
```

Nếu Viber trên máy không dùng `EditControl`, kết quả inspect cho biết `ControlType`, `AutomationId`, `ClassName` và vùng tọa độ để điều chỉnh selector trong `collect_visible_messages`.

## Dry-run và xuất JSON

```powershell
py viber_collector.py --tenant pvoil --conversation "PVOIL-NCS" --start "2026-07-01T00:00:00+07:00" --end "2026-07-20T23:59:59+07:00" --dry-run --output-json pvoil-viber-20260701-20260720.json
```

Nếu Viber QML không expose ô tìm kiếm/header trong `--inspect-ui`, hãy tự mở đúng nhóm rồi thêm `--use-current-conversation`. Chế độ này không tự chọn nhóm và ghi rõ `USER_CONFIRMED_CURRENT_CONVERSATION` trong metadata.

## Gửi backend

```powershell
py viber_collector.py --tenant pvoil --conversation "PVOIL-NCS" --start "2026-07-01T00:00:00+07:00" --end "2026-07-20T23:59:59+07:00" --send-api
```

Backend phải đang chạy và migration `backend/src/migrations/004_viber_messages.sql` đã được áp dụng.

## Test không cần Viber

```powershell
py -m unittest -v test_collector.py
```
